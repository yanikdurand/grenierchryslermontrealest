-- Planifier un rendez-vous ne déplace plus le véhicule tout de suite : lundi
-- prochain 10h, le véhicule reste où il est jusqu'à lundi 10h. Une tâche
-- planifiée (pg_cron) constate l'heure venue et le fait vraiment partir — le
-- statut suit toujours une action, ici « l'heure est arrivée », pas une
-- saisie. Le retour du véhicule redevient alors le seul moyen de sortir de
-- MÉCANIQUE EXTERNE : il complète la ligne et remet le véhicule où il était.

drop trigger if exists trg_planifier_reparation_garantie on inspection_ligne;
drop function if exists fn_planifier_reparation_garantie();

alter table inspection_ligne
  add column garantie_parti_le timestamptz,
  add column garantie_statut_avant_id integer references statut_vehicule(id);

comment on column inspection_ligne.garantie_parti_le is
  'Quand le véhicule est réellement parti — posé par la tâche planifiée à l''heure du rendez-vous, jamais par un appel client.';
comment on column inspection_ligne.garantie_statut_avant_id is
  'Statut du véhicule juste avant le départ, pour l''y remettre à son retour.';

create index idx_inspection_ligne_garantie_due on inspection_ligne (garantie_rdv)
  where sous_garantie and garantie_parti_le is null and garantie_retour_le is null;

create or replace function fn_garde_inspection_ligne()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_moi uuid;
  v_vehicule uuid;
  v_statut_meca_ext int;
  v_retour_declenche boolean := false;
begin
  v_moi := utilisateur_courant();

  if tg_op = 'INSERT' then
    if v_moi is not null and new.sous_garantie and not a_permission(v_moi, 'inspection.garantie') then
      raise exception 'Seule l''équipe du service peut désigner une réparation sous garantie.'
        using errcode = '42501';
    end if;
    if new.sous_garantie then
      new.decision := 'garantie';
    end if;
    return new;
  end if;

  -- UPDATE au-delà d'ici. On ne saute plus la garde entière pour v_moi null
  -- (service_role/cron) : seules les vérifications de permission le sont,
  -- la logique de déplacement doit s'appliquer même sans session.

  if v_moi is not null and new.sous_garantie is distinct from old.sous_garantie
     and not a_permission(v_moi, 'inspection.garantie') then
    raise exception 'Seule l''équipe du service peut désigner une réparation sous garantie.'
      using errcode = '42501';
  end if;

  if v_moi is not null
     and (new.garantie_lieu is distinct from old.garantie_lieu
          or new.garantie_rdv is distinct from old.garantie_rdv
          or new.garantie_retour_le is distinct from old.garantie_retour_le)
     and not a_permission(v_moi, 'inspection.garantie') then
    raise exception 'Vous n''avez pas le droit de planifier une réparation sous garantie.'
      using errcode = '42501';
  end if;

  -- Ces deux champs ne se posent jamais par un appel client, même détenteur
  -- de inspection.garantie — seule la logique ci-dessous (et la tâche
  -- planifiée qui l'invoque) les pose.
  if v_moi is not null
     and (new.garantie_parti_le is distinct from old.garantie_parti_le
          or new.garantie_statut_avant_id is distinct from old.garantie_statut_avant_id) then
    raise exception 'Ces champs sont gérés automatiquement, à l''heure du rendez-vous.'
      using errcode = '42501';
  end if;

  if new.sous_garantie is distinct from old.sous_garantie then
    if new.sous_garantie then
      new.decision := 'garantie';
    else
      if old.decision = 'garantie' then new.decision := 'en_attente'; end if;
      new.garantie_lieu := null;
      new.garantie_rdv := null;
      new.garantie_retour_le := null;
      new.garantie_parti_le := null;
      new.garantie_statut_avant_id := null;
    end if;
  elsif new.decision is distinct from old.decision then
    if old.sous_garantie then
      raise exception 'Cette ligne est sous garantie — seule la case « Sous garantie » peut changer son statut.'
        using errcode = '23514';
    end if;
    if new.decision = 'garantie' then
      raise exception 'Seule la case « Sous garantie » peut mettre une réparation en garantie.'
        using errcode = '23514';
    end if;
    if v_moi is not null and not a_permission(v_moi, 'inspection.approuver') then
      raise exception 'Vous n''avez pas le droit d''approuver les réparations.'
        using errcode = '42501';
    end if;
  end if;

  -- L'heure du rendez-vous est arrivée (constaté par la tâche planifiée) :
  -- le véhicule part pour de vrai. On retient d'où il partait pour l'y
  -- remettre à son retour.
  if new.garantie_parti_le is distinct from old.garantie_parti_le and new.garantie_parti_le is not null then
    select i.vehicule_id, v.statut_id into v_vehicule, new.garantie_statut_avant_id
    from inspection i join vehicule v on v.id = i.vehicule_id
    where i.id = new.inspection_id;

    select id into v_statut_meca_ext from statut_vehicule where nom = 'MÉCANIQUE EXTERNE';
    update vehicule set statut_id = v_statut_meca_ext where id = v_vehicule;
  end if;

  -- Le véhicule est revenu : la ligne se complète (les travaux ont été
  -- faits) et le véhicule reprend le statut qu'il avait avant de partir —
  -- seulement s'il est toujours en mécanique externe, pour ne pas écraser
  -- un déplacement fait entretemps pour une autre raison.
  if new.garantie_retour_le is distinct from old.garantie_retour_le and new.garantie_retour_le is not null then
    new.complete := true;
    v_retour_declenche := true;

    select i.vehicule_id into v_vehicule from inspection i where i.id = new.inspection_id;
    select id into v_statut_meca_ext from statut_vehicule where nom = 'MÉCANIQUE EXTERNE';
    update vehicule
    set statut_id = coalesce(new.garantie_statut_avant_id, statut_id)
    where id = v_vehicule and statut_id = v_statut_meca_ext;
  end if;

  if new.complete is distinct from old.complete and not v_retour_declenche
     and v_moi is not null and not a_permission(v_moi, 'inspection.completer') then
    raise exception 'Vous n''avez pas le droit de marquer une réparation comme faite.'
      using errcode = '42501';
  end if;

  if new.decision is distinct from old.decision then
    new.decide_par := v_moi;
  end if;
  if new.complete is distinct from old.complete and new.complete then
    new.complete_par := v_moi;
  end if;

  return new;
end;
$$;

-- La tâche planifiée : constate les rendez-vous dus et les fait partir
-- réellement. `fn_garde_inspection_ligne` s'occupe du déplacement du
-- véhicule ci-dessus dès que `garantie_parti_le` change.
create extension if not exists pg_cron;

select cron.schedule(
  'reparations_garantie_dues',
  '*/5 * * * *',
  $$
    update inspection_ligne
    set garantie_parti_le = now()
    where sous_garantie
      and garantie_rdv is not null
      and garantie_rdv <= now()
      and garantie_parti_le is null
      and garantie_retour_le is null;
  $$
);
