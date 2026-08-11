-- Phase 0 (3/3d) — Retirer l'exécution des fonctions métier au rôle `anon`
--
-- Régression introduite par la migration 20260811120200, détectée par
-- l'analyseur Supabase puis reproduite.
--
-- Postgres accorde EXECUTE à PUBLIC par défaut. Tant que les fonctions étaient
-- en SECURITY INVOKER, `anon` échouait de toute façon sur les privilèges de
-- table. En SECURITY DEFINER, elles s'exécutent avec les droits du
-- propriétaire — et la garde interne est :
--
--     if v_moi is not null and not a_permission(v_moi, '...') then refus
--
-- Pour un appelant non connecté, `utilisateur_courant()` renvoie NULL, donc
-- `v_moi is not null` est faux et **la garde ne se déclenche pas**. La clé
-- publique étant embarquée dans le JavaScript du navigateur, n'importe qui
-- pouvait appeler /rest/v1/rpc/creer_vehicule sans compte.
--
-- Vérifié avant correctif : `anon` a bien créé un véhicule (insertion annulée).
--
-- Le NULL permissif reste voulu pour n8n (brief §8, étape 1), mais n8n utilise
-- la clé service — pas `anon`. On retire donc EXECUTE à `anon` et à PUBLIC,
-- et on le laisse à `authenticated` (où la garde s'applique réellement) et à
-- `service_role`.

begin;

do $$
declare f text;
begin
  foreach f in array array[
    'creer_vehicule(text, text, text, text, integer, numeric, text, text, text, boolean, text, boolean, integer, text, text, text, text, text, date, text)',
    'recevoir_vehicule(uuid)',
    'demarrer_feuille(uuid)',
    'completer_feuille(uuid)',
    'envoyer_au_service(uuid)',
    'basculer_equipement(uuid, integer, boolean)',
    'enregistrer_pneu(uuid, text, integer, integer, integer, text, text)',
    'a_permission(uuid, text)',
    'j_ai_permission(text)',
    'utilisateur_courant()'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant  execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

commit;
