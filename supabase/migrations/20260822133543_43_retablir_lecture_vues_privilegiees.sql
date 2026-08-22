-- La migration 42 a appliqué security_invoker=true à toutes les vues sans
-- distinction. Or ce projet ne fait pas reposer le contrôle d'accès sur la
-- RLS : il le fait reposer sur la vue elle-même.
--
--   1. `vehicule` et la couche interne (v_inspection_statut, v_ventes...) sont
--      RÉVOQUÉES pour `authenticated` — elles portent les montants bruts.
--   2. Les vues `_app` sont la façade : elles seules sont accordées, et elles
--      masquent les montants via j_ai_permission() ligne par ligne.
--
-- Avec security_invoker=true, la façade lit la couche interne AU NOM DE
-- L'APPELANT, qui n'y a pas droit — d'où 25 vues sur 30 en 42501.
--
-- Règle rétablie, et désormais explicite :
--   • une vue qui lit `vehicule` ou la couche interne → security_invoker=false
--     (elle tourne comme propriétaire et fait son masquage elle-même)
--   • une vue qui ne lit que des tables déjà lisibles → security_invoker=true
--
-- Le masquage reste correct : j_ai_permission() lit la session de l'appelant,
-- pas celle du propriétaire. Vérifié : un vendeur obtient NULL sur prix_achat,
-- profit et cout_base_engage; un directeur obtient les montants.
--
-- CONSÉQUENCE ASSUMÉE : les advisors Supabase signaleront ces vues en
-- « Security Definer View » (ERROR). C'est un faux positif POUR CETTE
-- ARCHITECTURE — le linter suppose que la RLS porte le contrôle d'accès.
-- Ne pas « corriger » en repassant à true : ça recasse tout (c'est
-- exactement ce qui s'est produit le 21 août).
--
-- LIMITE RÉELLE À CONNAÎTRE : toute politique RLS de filtrage par ligne
-- ajoutée plus tard sur ces tables sera contournée à travers ces vues.
-- Si un tel besoin apparaît, il faudra basculer vers l'autre modèle
-- (inliner la couche interne + droits colonne par colonne sur `vehicule`).
--
-- Les 5 vues qui n'ont pas besoin d'élévation (v_funnel_quotidien,
-- v_leads_par_source, v_notifications_a_envoyer, v_permissions_effectives,
-- v_tache_briefing) restent volontairement en security_invoker=true.

alter view v_affichage_alertes      set (security_invoker = false);
alter view v_alertes_ouvertes       set (security_invoker = false);
alter view v_delai_mise_en_ligne    set (security_invoker = false);
alter view v_delai_mise_en_marche   set (security_invoker = false);
alter view v_demande_travaux_app    set (security_invoker = false);
alter view v_feuille_equipements    set (security_invoker = false);
alter view v_file_inventaire        set (security_invoker = false);
alter view v_file_service           set (security_invoker = false);
alter view v_file_service_app       set (security_invoker = false);
alter view v_goulots                set (security_invoker = false);
alter view v_inspection_statut      set (security_invoker = false);
alter view v_inspection_statut_app  set (security_invoker = false);
alter view v_kpi_affichage          set (security_invoker = false);
alter view v_kpi_stock              set (security_invoker = false);
alter view v_kpi_stock_app          set (security_invoker = false);
alter view v_leads_par_vehicule     set (security_invoker = false);
alter view v_stock_actuel           set (security_invoker = false);
alter view v_stock_actuel_app       set (security_invoker = false);
alter view v_stock_sans_lead        set (security_invoker = false);
alter view v_vehicule_app           set (security_invoker = false);
alter view v_vehicule_complet       set (security_invoker = false);
alter view v_vente_app              set (security_invoker = false);
alter view v_ventes                 set (security_invoker = false);
alter view v_ventes_app             set (security_invoker = false);
alter view v_visite_app             set (security_invoker = false);
