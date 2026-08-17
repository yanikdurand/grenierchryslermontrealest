-- Demandes de travaux : le concessionnaire envoie des requêtes numériques au
-- service, dans le sens inverse de l'inspection (qui va du service vers la
-- direction). Un vendeur compose la demande, mais seul un directeur peut la
-- modifier, l'approuver et l'envoyer — l'envoi déplace le véhicule et avise
-- le service par courriel. Le statut du véhicule suit toujours une action ;
-- ici, l'action, c'est l'envoi.

-- 1. Statut opérationnel dédié : un détour comme les autres, il ne touche
--    jamais `disponible_depuis` (comme MÉCANIQUE INTERNE, INSPECTION, etc.).
insert into statut_vehicule (nom, ordre)
values ('DEMANDE DE TRAVAUX', (select max(ordre) + 1 from statut_vehicule));

-- 2. Permissions.
insert into permission (code, libelle, categorie, ordre) values
  ('travaux.demander', 'Créer une demande de travaux', 'Service', 5),
  ('travaux.gerer', 'Modifier, approuver et envoyer une demande de travaux', 'Service', 6),
  ('travaux.completer', 'Marquer un travail demandé comme fait', 'Service', 7);

insert into role_permission (role, permission_code) values
  ('vendeur', 'travaux.demander'),
  ('directeur', 'travaux.demander'),
  ('directeur', 'travaux.gerer'),
  ('admin', 'travaux.demander'),
  ('admin', 'travaux.gerer'),
  ('admin', 'travaux.completer'),
  ('aviseur', 'travaux.completer'),
  ('directeur_service', 'travaux.completer');

-- 3. Événement de notification — le destinataire se configure dans Réglages,
--    comme pour vehicule_pret_inspecter.
insert into notification_evenement (code, libelle) values
  ('demande_travaux_envoyee', 'Demande de travaux envoyée au service');

-- 4. Le dossier. Écriture exclusivement par fonction (comme `vente`) : aucune
--    politique INSERT/UPDATE — un statut ne se force pas par une écriture
--    directe qui contournerait le déplacement du véhicule et l'avis au
--    service.
create table demande_travaux (
  id uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references vehicule(id),
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'envoyee', 'completee', 'annulee')),
  notes text,
  cree_par uuid references utilisateur(id),
  cree_le timestamptz not null default now(),
  envoyee_par uuid references utilisateur(id),
  envoyee_le timestamptz,
  completee_le timestamptz,
  annulee_par uuid references utilisateur(id),
  annulee_le timestamptz,
  motif_annulation text
);
comment on table demande_travaux is
  'Requête du concessionnaire vers le service. Écriture uniquement via '
  'creer_demande_travaux / envoyer_demande_travaux / annuler_demande_travaux.';

alter table demande_travaux enable row level security;

create policy lecture on demande_travaux for select using (true);

-- 5. Les lignes. Contenu libre, donc écriture directe permise et bornée par
--    un trigger de garde — même partage des responsabilités que sur
--    `inspection_ligne` (RLS grossière, trigger pour la règle fine).
create table demande_travaux_ligne (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references demande_travaux(id) on delete cascade,
  no_ligne integer not null,
  categorie text not null
    check (categorie in ('mecanique', 'esthetique', 'preparation_livraison', 'autre')),
  description text not null,
  complete boolean not null default false,
  complete_le timestamptz,
  complete_par uuid references utilisateur(id)
);
comment on table demande_travaux_ligne is
  'Une tâche texte libre + catégorie. Ajout/retrait/modification tant que la '
  'demande est en brouillon ; coche « fait » seulement une fois envoyée.';

alter table demande_travaux_ligne enable row level security;

create policy lecture on demande_travaux_ligne for select using (true);
create policy ecriture on demande_travaux_ligne for insert
  with check (j_ai_permission('travaux.demander') or j_ai_permission('travaux.gerer'));
create policy modification on demande_travaux_ligne for update using (true);
create policy suppression on demande_travaux_ligne for delete
  using (j_ai_permission('travaux.demander') or j_ai_permission('travaux.gerer'));

create or replace function fn_garde_demande_travaux_ligne()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid; v_statut text;
begin
  v_moi := utilisateur_courant();

  -- n8n et les scripts (service_role) ne sont pas soumis à la garde
  if v_moi is null then return coalesce(new, old); end if;

  select statut into v_statut from demande_travaux
  where id = coalesce(new.demande_id, old.demande_id);

  if tg_op = 'INSERT' then
    if v_statut <> 'brouillon' then
      raise exception 'On ne peut ajouter une ligne qu''à une demande encore en brouillon.'
        using errcode = '23514';
    end if;
    if not (a_permission(v_moi, 'travaux.demander') or a_permission(v_moi, 'travaux.gerer')) then
      raise exception 'Vous n''avez pas le droit d''ajouter une ligne à une demande de travaux.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_statut <> 'brouillon' then
      raise exception 'On ne peut retirer une ligne que d''une demande encore en brouillon.'
        using errcode = '23514';
    end if;
    if not (a_permission(v_moi, 'travaux.demander') or a_permission(v_moi, 'travaux.gerer')) then
      raise exception 'Vous n''avez pas le droit de retirer une ligne d''une demande de travaux.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE : cocher « fait » et corriger le contenu sont deux droits distincts.
  -- `completee` reste permis ici : décocher une ligne doit pouvoir rouvrir la
  -- demande (trigger fn_completer_demande_travaux), sinon la demande resterait
  -- coincée « complétée » dès la première coche retirée par erreur.
  if new.complete is distinct from old.complete then
    if v_statut not in ('envoyee', 'completee') then
      raise exception 'On ne peut cocher une ligne que sur une demande déjà envoyée.'
        using errcode = '23514';
    end if;
    if not a_permission(v_moi, 'travaux.completer') then
      raise exception 'Vous n''avez pas le droit de marquer un travail comme fait.'
        using errcode = '42501';
    end if;
    new.complete_par := v_moi;
    new.complete_le := case when new.complete then now() else null end;
  end if;

  if new.description is distinct from old.description or new.categorie is distinct from old.categorie then
    if v_statut <> 'brouillon' then
      raise exception 'On ne peut modifier une ligne que d''une demande encore en brouillon.'
        using errcode = '23514';
    end if;
    if not (a_permission(v_moi, 'travaux.demander') or a_permission(v_moi, 'travaux.gerer')) then
      raise exception 'Vous n''avez pas le droit de modifier une ligne de demande de travaux.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_garde_demande_travaux_ligne
  before insert or update or delete on demande_travaux_ligne
  for each row execute function fn_garde_demande_travaux_ligne();

-- 6. Complétion : une conséquence des cases cochées, jamais un bouton.
create or replace function fn_completer_demande_travaux()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.complete and not exists (
    select 1 from demande_travaux_ligne
    where demande_id = new.demande_id and not complete
  ) then
    update demande_travaux set statut = 'completee', completee_le = now()
    where id = new.demande_id and statut = 'envoyee';
  elsif not new.complete then
    -- une tâche redevient à faire : une demande close par erreur se rouvre
    update demande_travaux set statut = 'envoyee', completee_le = null
    where id = new.demande_id and statut = 'completee';
  end if;
  return new;
end;
$$;

create trigger trg_completer_demande_travaux
  after update of complete on demande_travaux_ligne
  for each row
  when (new.complete is distinct from old.complete)
  execute function fn_completer_demande_travaux();

-- 7. Fonctions d'écriture du dossier.
create or replace function creer_demande_travaux(p_vehicule uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid := utilisateur_courant(); v_id uuid;
begin
  if v_moi is not null and not (a_permission(v_moi, 'travaux.demander') or a_permission(v_moi, 'travaux.gerer')) then
    raise exception 'Vous n''avez pas le droit de créer une demande de travaux.' using errcode = '42501';
  end if;

  insert into demande_travaux (vehicule_id, notes, cree_par)
  values (p_vehicule, nullif(btrim(p_notes), ''), v_moi)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function envoyer_demande_travaux(p_demande uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_moi uuid := utilisateur_courant();
  v_vehicule uuid;
  v_statut text;
  v_no_stock text;
  v_titre text;
  v_corps text;
begin
  if v_moi is not null and not a_permission(v_moi, 'travaux.gerer') then
    raise exception 'Vous n''avez pas le droit d''envoyer une demande de travaux.' using errcode = '42501';
  end if;

  select vehicule_id, statut into v_vehicule, v_statut from demande_travaux where id = p_demande;
  if v_statut is null then
    raise exception 'Demande de travaux introuvable.' using errcode = '23514';
  end if;
  if v_statut <> 'brouillon' then
    raise exception 'Cette demande a déjà été envoyée ou annulée.' using errcode = '23514';
  end if;
  if not exists (select 1 from demande_travaux_ligne where demande_id = p_demande) then
    raise exception 'Ajoutez au moins une ligne avant d''envoyer la demande.' using errcode = '23514';
  end if;

  update demande_travaux
  set statut = 'envoyee', envoyee_par = v_moi, envoyee_le = now()
  where id = p_demande;

  update vehicule
  set statut_id = (select id from statut_vehicule where nom = 'DEMANDE DE TRAVAUX')
  where id = v_vehicule;

  select v.no_stock, concat_ws(' ', v.annee::text, v.marque, v.modele, v.trim)
    into v_no_stock, v_titre
  from vehicule v where v.id = v_vehicule;

  select string_agg('• ' || d.categorie || ' — ' || d.description, E'\n' order by d.no_ligne)
    into v_corps
  from demande_travaux_ligne d where d.demande_id = p_demande;

  insert into notification_file (evenement_code, vehicule_id, sujet, corps)
  values (
    'demande_travaux_envoyee',
    v_vehicule,
    'Demande de travaux — ' || v_no_stock,
    'Le concessionnaire a envoyé une demande de travaux pour ' || v_titre || ' (' || v_no_stock || ').' ||
    E'\n\n' || coalesce(v_corps, '')
  );
end;
$$;

create or replace function annuler_demande_travaux(p_demande uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid := utilisateur_courant();
begin
  if v_moi is not null and not a_permission(v_moi, 'travaux.gerer') then
    raise exception 'Vous n''avez pas le droit d''annuler une demande de travaux.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire.' using errcode = '23514';
  end if;

  update demande_travaux
  set statut = 'annulee', annulee_par = v_moi, annulee_le = now(), motif_annulation = btrim(p_motif)
  where id = p_demande and statut in ('brouillon', 'envoyee');
end;
$$;

-- 8. Vue de lecture pour le frontend.
create view v_demande_travaux_app as
select
  d.id,
  d.vehicule_id,
  ve.no_stock,
  concat_ws(' ', ve.annee::text, ve.marque, ve.modele) as vehicule_titre,
  s.nom as statut_vehicule,
  d.statut,
  d.notes,
  c.nom as cree_par_nom,
  d.cree_le,
  e.nom as envoyee_par_nom,
  d.envoyee_le,
  d.completee_le,
  d.annulee_le,
  d.motif_annulation,
  (select count(*) from demande_travaux_ligne l where l.demande_id = d.id) as nb_lignes,
  (select count(*) from demande_travaux_ligne l where l.demande_id = d.id and l.complete) as nb_completees
from demande_travaux d
join vehicule ve on ve.id = d.vehicule_id
left join statut_vehicule s on s.id = ve.statut_id
left join utilisateur c on c.id = d.cree_par
left join utilisateur e on e.id = d.envoyee_par;
