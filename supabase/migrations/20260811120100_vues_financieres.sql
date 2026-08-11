-- Phase 0 (2/3) — Vues financières : accès verrouillé
--
-- Constat
-- -------
-- `v_vehicule_app` lit `v_inspection_statut` (LEFT JOIN LATERAL) pour récupérer
-- le statut d'autorisation et les 5 montants de recon. Test à l'appui, une vue
-- imbriquée en `security_invoker = true` réapplique les droits de l'appelant
-- même lorsqu'elle est lue depuis une vue en `security_invoker = false` :
-- `v_vehicule_app` restait donc en échec 42501 après la migration précédente.
--
-- `v_inspection_statut` doit donc passer elle aussi en `security_invoker =
-- false`. Mais elle expose les coûts SANS masquage — la laisser lisible
-- directement donnerait les montants de recon à tout le monde, vendeurs
-- inclus. On révoque donc l'accès direct : `v_vehicule_app`, qui s'exécute
-- avec les droits du propriétaire, continue de la lire et applique son propre
-- masquage via `j_ai_permission('vehicule.voir_couts')`.
--
-- Même traitement pour les autres vues qui exposent des montants en clair.
-- Elles étaient déjà inaccessibles de fait (erreur 42501); la révocation rend
-- l'intention explicite et la rend robuste aux modifications futures.
-- `service_role` conserve l'accès : c'est lui qu'utilisent n8n et les outils de
-- rapport (Metabase, étape 8).
--
-- À reprendre plus tard
-- ---------------------
-- `v_file_service` (file de Catherine, étape 2) et `v_inspection_statut`
-- (écran d'approbation, étape 3) seront nécessaires côté application. Il
-- faudra alors leur donner un accès masqué par `vehicule.voir_couts`, sur le
-- modèle de `v_vehicule_app`, plutôt que de les rouvrir telles quelles.

begin;

-- Dépendance de v_vehicule_app : doit s'exécuter avec les droits du propriétaire…
alter view public.v_inspection_statut set (security_invoker = false);

-- …mais rester hors de portée d'un accès direct.
revoke all on public.v_inspection_statut  from anon, authenticated;
revoke all on public.v_vehicule_complet   from anon, authenticated;
revoke all on public.v_ventes             from anon, authenticated;
revoke all on public.v_kpi_stock          from anon, authenticated;
revoke all on public.v_stock_actuel       from anon, authenticated;
revoke all on public.v_file_service       from anon, authenticated;

-- Les outils internes (n8n, rapports) passent par la clé service.
grant select on public.v_inspection_statut,
                public.v_vehicule_complet,
                public.v_ventes,
                public.v_kpi_stock,
                public.v_stock_actuel,
                public.v_file_service
  to service_role;

commit;
