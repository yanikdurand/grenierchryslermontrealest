-- Accès masqué aux vues du service (étapes 2 et 3)
--
-- Contexte
-- --------
-- `v_file_service` et `v_inspection_statut` exposent les montants de recon
-- sans masquage. La migration 20260811120100 leur avait donc retiré l'accès
-- direct : les ouvrir telles quelles aurait montré les coûts à tout le monde,
-- vendeurs compris.
--
-- Catherine (file de travail) et les directeurs (approbation) en ont besoin.
-- Plutôt que de modifier ces vues — `v_vehicule_app` dépend de
-- `v_inspection_statut`, et le brief §6.7 rappelle qu'y toucher casse les
-- dépendances — on ajoute deux vues par-dessus. Rien d'existant n'est modifié.
--
-- Le masquage suit le modèle de `v_vehicule_app` : les montants passent par
-- `j_ai_permission('vehicule.voir_couts')`, évalué dans Postgres. Les
-- décomptes (combien de lignes, combien en attente) restent visibles de tous —
-- ce sont des indicateurs d'avancement, pas des données financières.
--
-- `security_invoker = false` : le corps s'exécute avec les droits du
-- propriétaire, seul capable de lire `vehicule`. C'est ce qui permet le
-- masquage sélectif plutôt qu'un refus global.

begin;

-- ---------------------------------------------------------------------------
-- File de travail du service — l'écran de Catherine
-- ---------------------------------------------------------------------------
-- `v_file_service` ne porte pas `vehicule_id`; on le rétablit par jointure sur
-- `no_stock`, qui est la clé métier unique de `vehicule`.
create or replace view public.v_file_service_app as
select
  v.id as vehicule_id,
  f.no_stock,
  f.vehicule,
  f.statut_vehicule,
  f.statut_autorisation,
  f.nb_lignes,
  f.nb_en_attente,
  f.base_a_faire,
  f.garantie_a_faire,
  f.signature_en_attente_vente,
  case
    when j_ai_permission('vehicule.voir_couts') then f.cout_base_a_venir
    else null::numeric
  end as cout_base_a_venir,
  f.requiert_inspection_saaq,
  f.saaq_rdv_le,
  f.saaq_complete_le,
  f.jours_inventaire
from v_file_service f
join vehicule v on upper(btrim(v.no_stock)) = upper(btrim(f.no_stock));

alter view public.v_file_service_app set (security_invoker = false);

-- ---------------------------------------------------------------------------
-- Statut d'autorisation et montants — l'écran d'approbation
-- ---------------------------------------------------------------------------
create or replace view public.v_inspection_statut_app as
select
  i.inspection_id,
  i.vehicule_id,
  i.no_stock,
  i.nb_lignes,
  i.nb_en_attente,
  i.nb_refusees,
  i.nb_de_base,
  i.nb_signature,
  i.nb_garantie,
  i.base_a_faire,
  i.garantie_a_faire,
  i.signature_en_attente_vente,
  i.statut_autorisation,
  case when j_ai_permission('vehicule.voir_couts') then i.cout_base_engage        else null::numeric end as cout_base_engage,
  case when j_ai_permission('vehicule.voir_couts') then i.cout_signature_engage   else null::numeric end as cout_signature_engage,
  case when j_ai_permission('vehicule.voir_couts') then i.cout_base_a_venir       else null::numeric end as cout_base_a_venir,
  case when j_ai_permission('vehicule.voir_couts') then i.cout_signature_potentiel else null::numeric end as cout_signature_potentiel,
  case when j_ai_permission('vehicule.voir_couts') then i.valeur_garantie         else null::numeric end as valeur_garantie,
  case when j_ai_permission('vehicule.voir_couts') then i.cout_evite              else null::numeric end as cout_evite,
  i.cree_le
from v_inspection_statut i;

alter view public.v_inspection_statut_app set (security_invoker = false);

-- ---------------------------------------------------------------------------
-- Accès : lecture pour les personnes connectées, jamais pour `anon`
-- ---------------------------------------------------------------------------
revoke all on public.v_file_service_app, public.v_inspection_statut_app
  from public, anon;

grant select on public.v_file_service_app, public.v_inspection_statut_app
  to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Complément appliqué après vérification
-- ---------------------------------------------------------------------------
-- Premier essai : `v_file_service_app` restait en 42501 pour tout le monde.
-- Même piège que lors de la phase 0 — une vue imbriquée en
-- `security_invoker = true` réapplique les droits de l'appelant, même lue
-- depuis une vue qui ne l'est pas. `v_file_service` est donc basculée elle
-- aussi. Son accès direct reste révoqué pour `anon` et `authenticated` :
-- seule la vue masquée est lisible.
alter view public.v_file_service set (security_invoker = false);
