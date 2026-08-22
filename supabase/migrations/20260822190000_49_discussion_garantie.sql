-- Q1 : Catherine détermine la garantie, mais Steve doit pouvoir lui demander
-- de revérifier une ligne avant de trancher (de base / signature / ne pas
-- faire). Pas un chat libre — un fil par ligne d'inspection, avec un type de
-- message actionnable qui atterrit directement dans la file du service
-- (§3.2 : chaque liste doit être actionnable) plutôt que de se perdre dans
-- une conversation que personne ne pense à rouvrir.

create table inspection_ligne_message (
  id uuid primary key default gen_random_uuid(),
  inspection_ligne_id uuid not null references inspection_ligne(id) on delete cascade,
  type text not null default 'note'
    check (type in ('note', 'demande_verification_garantie')),
  contenu text not null,
  auteur uuid references utilisateur(id),
  cree_le timestamptz not null default now(),
  -- Résolu par une réponse de l'aviseur, jamais par une case à cocher :
  -- répondre EST la résolution (fn_resoudre_demande_garantie, plus bas).
  resolu_le timestamptz,
  resolu_par uuid references utilisateur(id)
);
create index idx_inspection_ligne_message on inspection_ligne_message(inspection_ligne_id, cree_le);

comment on table inspection_ligne_message is
  'Fil de discussion par ligne d''inspection. Le type demande_verification_garantie '
  'est ce qui rend le fil actionnable : il apparaît dans la file du service tant '
  'qu''il n''a pas de réponse.';

alter table inspection_ligne_message enable row level security;

create policy lecture on inspection_ligne_message for select using (true);
create policy ecriture on inspection_ligne_message for insert
  with check (j_ai_permission('inspection.approuver') or j_ai_permission('inspection.garantie'));

-- L'auteur vient de la session, jamais du client (brief §6.2) ; seul le
-- directeur peut ouvrir une demande de vérification — l'aviseur répond,
-- elle ne s'auto-interroge pas.
create or replace function fn_garde_inspection_ligne_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.auteur := utilisateur_courant();
  if new.auteur is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if coalesce(btrim(new.contenu), '') = '' then
    raise exception 'Le message ne peut pas être vide.' using errcode = '23514';
  end if;
  if new.type = 'demande_verification_garantie' and not j_ai_permission('inspection.approuver') then
    raise exception 'Seul le directeur peut demander une vérification de garantie.'
      using errcode = '42501';
  end if;
  new.resolu_le := null;
  new.resolu_par := null;
  return new;
end;
$$;

create trigger trg_garde_inspection_ligne_message
  before insert on inspection_ligne_message
  for each row execute function fn_garde_inspection_ligne_message();

-- La réponse de l'aviseur résout toutes les demandes ouvertes sur la même
-- ligne : c'est le fait de répondre qui referme la tâche, jamais une action
-- séparée qu'on pourrait oublier de poser.
create or replace function fn_resoudre_demande_garantie()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.type = 'note' and j_ai_permission('inspection.garantie') then
    update inspection_ligne_message
    set resolu_le = now(), resolu_par = new.auteur
    where inspection_ligne_id = new.inspection_ligne_id
      and type = 'demande_verification_garantie'
      and resolu_le is null;
  end if;
  return new;
end;
$$;

create trigger trg_resoudre_demande_garantie
  after insert on inspection_ligne_message
  for each row execute function fn_resoudre_demande_garantie();

-- Vue de lecture : les noms plutôt que les uuid, rien à masquer ici (aucune
-- donnée financière dans un message).
create view v_inspection_ligne_message as
select
  m.id, m.inspection_ligne_id, m.type, m.contenu, m.cree_le,
  u.nom as auteur_nom,
  m.resolu_le,
  ur.nom as resolu_par_nom
from inspection_ligne_message m
left join utilisateur u on u.id = m.auteur
left join utilisateur ur on ur.id = m.resolu_par
order by m.cree_le;

grant select on v_inspection_ligne_message to authenticated;
-- Ne lit que des tables déjà ouvertes à authenticated (inspection_ligne_message,
-- utilisateur) : pas besoin des privilèges du propriétaire, contrairement aux
-- vues qui suivent.
alter view v_inspection_ligne_message set (security_invoker = true);

-- v_file_service_app joignait vehicule sur no_stock — cassé pour tout
-- véhicule sans numéro depuis la migration 48. On y ajoute au passage le
-- compte de demandes de vérification ouvertes, pour que la file de Catherine
-- les affiche sans qu'elle ait à ouvrir chaque inspection une à une.
create or replace view v_file_service as
 SELECT v.no_stock,
    concat_ws(' '::text, v.annee::text, v.marque, v.modele, v."trim") AS vehicule,
    sv.nom AS statut_vehicule,
    s.statut_autorisation,
    s.nb_lignes,
    s.nb_en_attente,
    s.base_a_faire,
    s.garantie_a_faire,
    s.signature_en_attente_vente,
    s.cout_base_a_venir,
    v.requiert_inspection_saaq,
    v.saaq_rdv_le,
    v.saaq_complete_le,
    CURRENT_DATE - v.date_recu AS jours_inventaire,
    i.vehicule_id,
    (select count(*) from inspection_ligne_message m
       join inspection_ligne l on l.id = m.inspection_ligne_id
      where l.inspection_id = i.id
        and m.type = 'demande_verification_garantie'
        and m.resolu_le is null) as nb_demandes_garantie_ouvertes
   FROM inspection i
     JOIN v_inspection_statut s ON s.inspection_id = i.id
     JOIN vehicule v ON v.id = i.vehicule_id
     JOIN statut_vehicule sv ON sv.id = v.statut_id
  ORDER BY (
        CASE s.statut_autorisation
            WHEN 'En attente d''autorisation'::text THEN 0
            ELSE 1
        END), v.date_recu;
alter view v_file_service set (security_invoker = false);

create or replace view v_file_service_app as
 SELECT f.vehicule_id,
    f.no_stock,
    f.vehicule,
    f.statut_vehicule,
    f.statut_autorisation,
    f.nb_lignes,
    f.nb_en_attente,
    f.base_a_faire,
    f.garantie_a_faire,
    f.signature_en_attente_vente,
        CASE
            WHEN j_ai_permission('vehicule.voir_couts'::text) THEN f.cout_base_a_venir
            ELSE NULL::numeric
        END AS cout_base_a_venir,
    f.requiert_inspection_saaq,
    f.saaq_rdv_le,
    f.saaq_complete_le,
    f.jours_inventaire,
    f.nb_demandes_garantie_ouvertes
   FROM v_file_service f;
alter view v_file_service_app set (security_invoker = false);
