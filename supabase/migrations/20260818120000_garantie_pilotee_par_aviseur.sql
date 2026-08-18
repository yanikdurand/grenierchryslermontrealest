-- La garantie n'est plus une décision du directeur : c'est l'aviseur qui la
-- détermine en bâtissant l'inspection (elle regarde la couverture du
-- véhicule et appelle le concessionnaire de la marque). Le directeur garde
-- la main sur ne_pas_faire / de_base / signature, jamais sur garantie.

alter table inspection add column technicien text;

alter table inspection_ligne
  add column sous_garantie boolean not null default false,
  add column garantie_lieu text,
  add column garantie_rdv timestamptz,
  add column garantie_retour_le timestamptz;

comment on column inspection_ligne.sous_garantie is
  'Déterminé par l''aviseur (inspection.saisir) après appel au concessionnaire '
  'de la marque — jamais par le directeur.';
comment on column inspection_ligne.garantie_lieu is 'Où se fait la réparation, ex. « Audi Brossard ».';
comment on column inspection_ligne.garantie_rdv is 'Planifier ce rendez-vous déplace le véhicule en mécanique externe.';
comment on column inspection_ligne.garantie_retour_le is 'Quand le véhicule est revenu de la réparation sous garantie.';

-- Le trigger d'origine ne portait que sur UPDATE ; sous_garantie doit aussi
-- pouvoir se poser dès la création de la ligne.
drop trigger if exists trg_garde_inspection_ligne on inspection_ligne;

create or replace function fn_garde_inspection_ligne()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid;
begin
  v_moi := utilisateur_courant();

  -- n8n et les scripts (service_role) ne sont pas soumis à la garde
  if v_moi is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.sous_garantie then
      new.decision := 'garantie';
    end if;
    return new;
  end if;

  -- Seule la personne qui bâtit l'inspection désigne une réparation sous garantie.
  if new.sous_garantie is distinct from old.sous_garantie
     and not a_permission(v_moi, 'inspection.saisir') then
    raise exception 'Seule la personne qui bâtit l''inspection peut désigner une réparation sous garantie.'
      using errcode = '42501';
  end if;

  if (new.garantie_lieu is distinct from old.garantie_lieu
      or new.garantie_rdv is distinct from old.garantie_rdv
      or new.garantie_retour_le is distinct from old.garantie_retour_le)
     and not a_permission(v_moi, 'inspection.saisir') then
    raise exception 'Vous n''avez pas le droit de planifier une réparation sous garantie.'
      using errcode = '42501';
  end if;

  -- Le passage sous garantie pilote la décision ; sinon, c'est le directeur —
  -- qui ne peut plus choisir « garantie » lui-même.
  if new.sous_garantie is distinct from old.sous_garantie then
    if new.sous_garantie then
      new.decision := 'garantie';
    else
      if old.decision = 'garantie' then new.decision := 'en_attente'; end if;
      new.garantie_lieu := null;
      new.garantie_rdv := null;
      new.garantie_retour_le := null;
    end if;
  elsif new.decision is distinct from old.decision then
    if new.decision = 'garantie' then
      raise exception 'Seule la case « Sous garantie » peut mettre une réparation en garantie.'
        using errcode = '23514';
    end if;
    if not a_permission(v_moi, 'inspection.approuver') then
      raise exception 'Vous n''avez pas le droit d''approuver les réparations.'
        using errcode = '42501';
    end if;
  end if;

  if new.complete is distinct from old.complete
     and not a_permission(v_moi, 'inspection.completer') then
    raise exception 'Vous n''avez pas le droit de marquer une réparation comme faite.'
      using errcode = '42501';
  end if;

  -- On estampille automatiquement l'auteur : impossible de signer au nom d'un autre
  if new.decision is distinct from old.decision then
    new.decide_par := v_moi;
  end if;
  if new.complete is distinct from old.complete and new.complete then
    new.complete_par := v_moi;
  end if;

  return new;
end;
$$;

create trigger trg_garde_inspection_ligne
  before insert or update on inspection_ligne
  for each row execute function fn_garde_inspection_ligne();

-- Planifier le rendez-vous déplace le véhicule — la conséquence, pas un
-- bouton « déplacer » distinct. `disponible_depuis` n'est pas touché : c'est
-- un détour au même titre que MÉCANIQUE INTERNE.
create or replace function fn_planifier_reparation_garantie()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_vehicule uuid; v_statut int;
begin
  select vehicule_id into v_vehicule from inspection where id = new.inspection_id;
  select id into v_statut from statut_vehicule where nom = 'MÉCANIQUE EXTERNE';
  update vehicule set statut_id = v_statut where id = v_vehicule;
  return new;
end;
$$;

create trigger trg_planifier_reparation_garantie
  after update of garantie_rdv on inspection_ligne
  for each row
  when (new.garantie_rdv is distinct from old.garantie_rdv and new.garantie_rdv is not null)
  execute function fn_planifier_reparation_garantie();

-- `technicien` ajouté à la fin des deux vues (CREATE OR REPLACE VIEW n'accepte
-- de nouvelles colonnes qu'en dernière position).
create or replace view v_inspection_statut as
 SELECT i.id AS inspection_id,
    i.vehicule_id,
    v.no_stock,
    count(l.id) AS nb_lignes,
    count(l.id) FILTER (WHERE l.decision = 'en_attente'::text) AS nb_en_attente,
    count(l.id) FILTER (WHERE l.decision = 'ne_pas_faire'::text) AS nb_refusees,
    count(l.id) FILTER (WHERE l.decision = 'de_base'::text) AS nb_de_base,
    count(l.id) FILTER (WHERE l.decision = 'signature'::text) AS nb_signature,
    count(l.id) FILTER (WHERE l.decision = 'garantie'::text) AS nb_garantie,
    count(l.id) FILTER (WHERE l.decision = 'de_base'::text AND NOT l.complete) AS base_a_faire,
    count(l.id) FILTER (WHERE l.decision = 'garantie'::text AND NOT l.complete) AS garantie_a_faire,
    count(l.id) FILTER (WHERE l.decision = 'signature'::text AND NOT l.complete) AS signature_en_attente_vente,
        CASE
            WHEN count(l.id) = 0 THEN 'Aucune ligne'::text
            WHEN count(l.id) FILTER (WHERE l.decision = 'en_attente'::text) > 0 THEN 'En attente d''autorisation'::text
            ELSE 'Autorisation complétée'::text
        END AS statut_autorisation,
    COALESCE(sum(l.cout) FILTER (WHERE l.decision = 'de_base'::text AND l.complete), 0::numeric) AS cout_base_engage,
    COALESCE(sum(l.cout) FILTER (WHERE l.decision = 'signature'::text AND l.complete), 0::numeric) AS cout_signature_engage,
    COALESCE(sum(l.cout) FILTER (WHERE l.decision = 'de_base'::text AND NOT l.complete), 0::numeric) AS cout_base_a_venir,
    COALESCE(sum(l.cout) FILTER (WHERE l.decision = 'signature'::text AND NOT l.complete), 0::numeric) AS cout_signature_potentiel,
    COALESCE(sum(l.cout) FILTER (WHERE l.decision = 'garantie'::text AND l.complete), 0::numeric) AS valeur_garantie,
    COALESCE(sum(l.cout) FILTER (WHERE l.decision = 'ne_pas_faire'::text), 0::numeric) AS cout_evite,
    i.cree_le,
    i.technicien
   FROM inspection i
     JOIN vehicule v ON v.id = i.vehicule_id
     LEFT JOIN inspection_ligne l ON l.inspection_id = i.id
  GROUP BY i.id, i.vehicule_id, v.no_stock, i.cree_le, i.technicien;

create or replace view v_inspection_statut_app as
 SELECT inspection_id,
    vehicule_id,
    no_stock,
    nb_lignes,
    nb_en_attente,
    nb_refusees,
    nb_de_base,
    nb_signature,
    nb_garantie,
    base_a_faire,
    garantie_a_faire,
    signature_en_attente_vente,
    statut_autorisation,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN cout_base_engage
            ELSE NULL::numeric
        END AS cout_base_engage,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN cout_signature_engage
            ELSE NULL::numeric
        END AS cout_signature_engage,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN cout_base_a_venir
            ELSE NULL::numeric
        END AS cout_base_a_venir,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN cout_signature_potentiel
            ELSE NULL::numeric
        END AS cout_signature_potentiel,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN valeur_garantie
            ELSE NULL::numeric
        END AS valeur_garantie,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN cout_evite
            ELSE NULL::numeric
        END AS cout_evite,
    cree_le,
    technicien
   FROM v_inspection_statut i;
