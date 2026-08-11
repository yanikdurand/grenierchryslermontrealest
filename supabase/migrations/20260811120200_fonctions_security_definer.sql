-- Phase 0 (3/3a) — Fonctions métier en SECURITY DEFINER
--
-- Problème corrigé
-- ----------------
-- Les fonctions métier étaient en SECURITY INVOKER : elles s'exécutaient avec
-- les droits de l'appelant, qui n'a pas le SELECT sur `vehicule`. Or Postgres
-- exige le SELECT dès qu'une colonne est lue — y compris dans un simple
-- `where id = ...` d'un UPDATE, ou dans un contrôle de doublon.
--
-- Constaté en simulant un utilisateur connecté, avant correctif :
--   creer_vehicule     -> 42501 permission denied for table vehicule
--   recevoir_vehicule  -> 42501 permission denied for table vehicule
--   completer_feuille  -> 42501 permission denied for table vehicule
--   envoyer_au_service -> écrit dans `vehicule`, même impasse
--   demarrer_feuille / basculer_equipement -> passaient, par chance
--
-- Autrement dit, le formulaire d'acquisition et le bouton « Reçu » ne
-- pouvaient pas fonctionner du tout depuis le navigateur.
--
-- Pourquoi c'est sûr
-- ------------------
-- Les 7 fonctions portent déjà leur propre garde `a_permission(v_moi, ...)` :
-- c'est elle qui autorise ou refuse, pas le privilège SQL. Elles épinglent
-- toutes `search_path = public`, condition nécessaire pour un SECURITY
-- DEFINER sain. Et `utilisateur_courant()` continue de lire `auth.uid()` : le
-- véhicule reste estampillé au nom de la bonne personne.
--
-- Les 7 sont converties, y compris les deux qui fonctionnaient déjà, pour que
-- toutes les écritures métier suivent le même modèle.

begin;

alter function public.creer_vehicule(
  text, text, text, text, integer, numeric, text, text, text, boolean, text,
  boolean, integer, text, text, text, text, text, date, text
) security definer;

alter function public.recevoir_vehicule(uuid)   security definer;
alter function public.demarrer_feuille(uuid)    security definer;
alter function public.completer_feuille(uuid)   security definer;
alter function public.envoyer_au_service(uuid)  security definer;

alter function public.basculer_equipement(uuid, integer, boolean) security definer;
alter function public.enregistrer_pneu(uuid, text, integer, integer, integer, text, text)
  security definer;

commit;
