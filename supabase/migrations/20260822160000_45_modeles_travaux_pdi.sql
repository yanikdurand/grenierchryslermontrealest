-- Correction de modélisation : le PDI (Pre-Delivery Inspection) n'est pas une
-- ORIGINE de demande de travaux, c'est son CONTENU — retirer les plastiques,
-- poser les barrures de roues, sortir le véhicule du mode transport.
--
-- L'origine dit pourquoi la demande existe (une réception, une vente, une
-- requête du plancher). Le contenu vient d'un MODÈLE : une liste de tâches
-- standard, réutilisable, que le service gère lui-même.
--
-- C'est ce que demandent §3.1 (rien n'est codé en dur) et §5.4 (« Catherine
-- ET Philippe doivent pouvoir gérer cette liste eux-mêmes »).

alter table demande_travaux drop constraint demande_travaux_origine_check;
alter table demande_travaux add constraint demande_travaux_origine_check
  check (origine in ('manuelle', 'livraison', 'reception_neuf'));

comment on column demande_travaux.origine is
  'Ce qui a déclenché la demande. manuelle : quelqu''un du plancher l''a demandée. '
  'livraison : une vente s''est conclue. reception_neuf : un véhicule neuf est arrivé. '
  'Le CONTENU vient d''un modèle (voir modele_travaux), pas de l''origine.';

-- Le droit de gérer les listes appartient au service, pas à l'administration :
-- Catherine et Philippe les tiennent à jour sans passer par personne.
insert into permission (code, libelle, categorie, ordre) values
  ('travaux.modeles', 'Gérer les listes de travaux standards', 'Service', 8)
on conflict (code) do nothing;

insert into role_permission (role, permission_code) values
  ('admin', 'travaux.modeles'),
  ('aviseur', 'travaux.modeles'),
  ('directeur_service', 'travaux.modeles')
on conflict do nothing;

-- Un modèle : une liste nommée, réutilisable.
create table modele_travaux (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  nom text not null,
  description text,
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);
comment on table modele_travaux is
  'Listes de travaux standards (PDI, préparation de livraison...). Gérées par '
  'le service via la permission travaux.modeles.';

create table modele_travaux_ligne (
  id uuid primary key default gen_random_uuid(),
  modele_id uuid not null references modele_travaux(id) on delete cascade,
  no_ligne integer not null,
  categorie text not null
    check (categorie in ('mecanique', 'esthetique', 'preparation_livraison', 'autre')),
  description text not null
);
create index idx_modele_travaux_ligne on modele_travaux_ligne(modele_id, no_ligne);

alter table modele_travaux enable row level security;
alter table modele_travaux_ligne enable row level security;

create policy lecture on modele_travaux for select using (true);
create policy ecriture on modele_travaux for insert
  with check (j_ai_permission('travaux.modeles'));
create policy modification on modele_travaux for update
  using (j_ai_permission('travaux.modeles'));
create policy suppression on modele_travaux for delete
  using (j_ai_permission('travaux.modeles'));

create policy lecture on modele_travaux_ligne for select using (true);
create policy ecriture on modele_travaux_ligne for insert
  with check (j_ai_permission('travaux.modeles'));
create policy modification on modele_travaux_ligne for update
  using (j_ai_permission('travaux.modeles'));
create policy suppression on modele_travaux_ligne for delete
  using (j_ai_permission('travaux.modeles'));

-- Amorce du modèle de réception d'un véhicule neuf.
-- ⚠️ Liste de DÉPART, volontairement incomplète : elle vient de ce que Yanik
-- a décrit. Catherine et Philippe la complètent eux-mêmes dans les Réglages.
insert into modele_travaux (code, nom, description) values
  ('reception_neuf', 'Réception d''un véhicule neuf',
   'PDI, lavage et photos professionnelles. À compléter par le service.');

insert into modele_travaux_ligne (modele_id, no_ligne, categorie, description)
select m.id, l.no_ligne, l.categorie, l.description
from modele_travaux m,
  (values
    (1, 'mecanique',  'PDI — sortir le véhicule du mode transport'),
    (2, 'mecanique',  'PDI — installer les barrures de roues'),
    (3, 'esthetique', 'PDI — retirer les plastiques de protection'),
    (4, 'esthetique', 'Lavage complet'),
    (5, 'autre',      'Photos professionnelles')
  ) as l(no_ligne, categorie, description)
where m.code = 'reception_neuf';

-- Créer une demande à partir d'un modèle : les lignes se posent d'un coup.
-- L'ancienne signature doit disparaître — ajouter un paramètre crée une
-- surcharge, et deux fonctions homonymes rendent l'appel ambigu.
drop function if exists public.creer_demande_travaux(uuid, text);

create or replace function creer_demande_travaux(
  p_vehicule uuid,
  p_notes text default null,
  p_origine text default 'manuelle',
  p_modele text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid := utilisateur_courant(); v_id uuid; v_modele uuid;
begin
  if v_moi is not null and not (a_permission(v_moi, 'travaux.demander')
                                or a_permission(v_moi, 'travaux.gerer')) then
    raise exception 'Vous n''avez pas le droit de créer une demande de travaux.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_origine), '') not in ('manuelle', 'livraison', 'reception_neuf') then
    raise exception 'Origine de demande inconnue : %.', p_origine using errcode = '23514';
  end if;

  insert into demande_travaux (vehicule_id, notes, cree_par, origine)
  values (p_vehicule, nullif(btrim(p_notes), ''), v_moi, coalesce(btrim(p_origine), 'manuelle'))
  returning id into v_id;

  -- Les lignes du modèle deviennent les lignes de la demande. Elles restent
  -- modifiables ensuite : un modèle propose, il n'impose pas.
  if p_modele is not null then
    select id into v_modele from modele_travaux where code = btrim(p_modele) and actif;
    if v_modele is null then
      raise exception 'Modèle de travaux inconnu ou inactif : %.', p_modele using errcode = '23514';
    end if;
    insert into demande_travaux_ligne (demande_id, no_ligne, categorie, description)
    select v_id, l.no_ligne, l.categorie, l.description
    from modele_travaux_ligne l where l.modele_id = v_modele order by l.no_ligne;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.creer_demande_travaux(uuid, text, text, text) from anon, public;
grant execute on function public.creer_demande_travaux(uuid, text, text, text) to authenticated;
