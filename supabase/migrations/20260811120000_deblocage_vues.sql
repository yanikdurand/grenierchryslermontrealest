-- Phase 0 (1/3) — Déblocage des vues opérationnelles
--
-- Problème corrigé
-- ----------------
-- Le SELECT sur `vehicule` est révoqué pour `authenticated` (choix voulu : le
-- masquage financier doit passer par `v_vehicule_app`). Or les vues étaient en
-- `security_invoker = true`, donc elles s'exécutaient avec les droits de
-- l'utilisateur connecté — qui n'a justement pas le droit de lire `vehicule`.
-- Résultat : 17 vues sur 21 renvoyaient « 42501 permission denied for table
-- vehicule » pour tout utilisateur connecté.
--
-- Correctif
-- ---------
-- Les vues repassent en `security_invoker = false` : le corps de la vue
-- s'exécute avec les droits du propriétaire (postgres), qui peut lire
-- `vehicule`. Le masquage financier n'est pas affecté : il repose sur
-- `j_ai_permission()`, fonction SECURITY DEFINER qui lit le JWT de la session
-- et continue donc de renvoyer le résultat propre à l'utilisateur connecté.
--
-- Périmètre volontairement limité
-- -------------------------------
-- Seules les vues sans donnée financière en clair sont débloquées ici, plus
-- `v_vehicule_app` qui masque déjà `prix_achat`, `cout_carfax`, les coûts de
-- recon, le profit et les leads.
-- Les vues qui exposent des montants SANS masquage ne sont volontairement pas
-- débloquées (voir migration 20260811120200) : les ouvrir telles quelles
-- rendrait le profit et le prix d'achat visibles à tous, vendeurs inclus.

begin;

-- Vue principale de l'application : masquage financier intégré.
alter view public.v_vehicule_app         set (security_invoker = false);

-- Vues opérationnelles sans donnée financière en clair.
alter view public.v_affichage_alertes    set (security_invoker = false);
alter view public.v_alertes_ouvertes     set (security_invoker = false);
alter view public.v_delai_mise_en_ligne  set (security_invoker = false);
alter view public.v_delai_mise_en_marche set (security_invoker = false);
alter view public.v_feuille_equipements  set (security_invoker = false);
alter view public.v_file_inventaire      set (security_invoker = false);
alter view public.v_goulots              set (security_invoker = false);
alter view public.v_kpi_affichage        set (security_invoker = false);
alter view public.v_leads_par_vehicule   set (security_invoker = false);
alter view public.v_stock_sans_lead      set (security_invoker = false);

commit;
