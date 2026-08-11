-- Phase 0 (3/3e) — Le rôle `anon` n'a plus aucun accès au schéma `public`
--
-- Seconde régression de la même famille, également détectée par vérification
-- puis reproduite : après le passage des vues en `security_invoker = false`,
-- `anon` lisait les 195 véhicules via `v_vehicule_app`. Auparavant, il était
-- bloqué par accident — la vue réclamait le SELECT sur `vehicule`, qu'il
-- n'avait pas. En retirant cette dépendance, le garde-fou implicite a sauté.
--
-- Les tables portaient un `grant all` à `anon` hérité de la configuration
-- Supabase par défaut. RLS le neutralisait pour les tables (aucune politique
-- ne vise `anon`), mais **les vues ne sont pas soumises à RLS** : le privilège
-- SQL suffisait.
--
-- Cette plateforme est strictement interne : ni site public, ni formulaire
-- anonyme, ni page de partage. Le rôle `anon` ne sert qu'à joindre l'endpoint
-- d'authentification (schéma `auth`), jamais à lire des données métier. On lui
-- retire donc tout accès au schéma `public`, plutôt que de corriger vue par
-- vue et de risquer d'en oublier une à la prochaine.

begin;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Et pour les objets créés plus tard.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

commit;
