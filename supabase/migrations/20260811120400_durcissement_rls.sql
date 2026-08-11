-- Phase 0 (3/3c) — Durcissement RLS
--
-- Contexte
-- --------
-- Plusieurs tables portaient une politique unique `acces_authentifie` en
-- `FOR ALL ... USING (true) WITH CHECK (true)`. Tant qu'aucun compte n'était
-- lié à Supabase Auth, l'effet était nul. Mais l'étape 1 lie justement les 11
-- comptes : la faille s'ouvre au moment précis où la sécurité est censée
-- s'activer.
--
-- Vérifié par simulation d'un utilisateur connecté, avant correctif :
--   update utilisateur set role='admin' where role='vendeur'  -> 4 lignes
--   update vehicule set prix_vente = 1                        -> 195 lignes
--   delete from vehicule                                      -> refusé par
--     une clé étrangère seulement, pas par la sécurité
--
-- Le premier cas vide de son sens tout le système de permissions : un vendeur
-- se donne `admin` et hérite des 19 droits. Le second permet d'écraser
-- l'inventaire complet en une requête, sans même pouvoir le lire.
--
-- Principe retenu
-- ---------------
-- La lecture reste largement ouverte (équipe interne de 11 personnes, le
-- masquage financier est déjà assuré par `v_vehicule_app`). C'est l'ÉCRITURE
-- qui est ramenée aux droits déjà définis dans `role_permission` — donc rien
-- n'est codé en dur, et l'écran de réglages (étape 7) reste maître du jeu.
--
-- Les fonctions métier sont en SECURITY DEFINER : elles continuent de passer,
-- avec leur propre garde. n8n utilise la clé service et n'est pas affecté.

begin;

-- ---------------------------------------------------------------------------
-- utilisateur : lecture ouverte, écriture réservée à `admin.utilisateurs`
-- ---------------------------------------------------------------------------
drop policy if exists "acces_authentifie" on public.utilisateur;

create policy "lecture" on public.utilisateur
  for select to authenticated using (true);

create policy "admin_ajout" on public.utilisateur
  for insert to authenticated
  with check (j_ai_permission('admin.utilisateurs'));

create policy "admin_modification" on public.utilisateur
  for update to authenticated
  using (j_ai_permission('admin.utilisateurs'))
  with check (j_ai_permission('admin.utilisateurs'));

-- Aucune politique DELETE : « on désactive, on ne supprime jamais » (brief §4).
-- La règle est ainsi tenue par la base, pas seulement par l'interface.

-- ---------------------------------------------------------------------------
-- permission : le catalogue des 19 droits n'est pas modifiable par tous
-- ---------------------------------------------------------------------------
drop policy if exists "acces_authentifie" on public.permission;

create policy "lecture" on public.permission
  for select to authenticated using (true);

create policy "admin_gestion" on public.permission
  for all to authenticated
  using (j_ai_permission('admin.permissions'))
  with check (j_ai_permission('admin.permissions'));

-- ---------------------------------------------------------------------------
-- alerte : générée et résolue par trigger (brief §6.4)
-- ---------------------------------------------------------------------------
drop policy if exists "acces_authentifie" on public.alerte;

create policy "lecture" on public.alerte
  for select to authenticated using (true);

-- Seule la résolution manuelle reste possible, pour qui a le droit.
create policy "resolution" on public.alerte
  for update to authenticated
  using (j_ai_permission('alerte.resoudre'))
  with check (j_ai_permission('alerte.resoudre'));

-- Ni INSERT ni DELETE : les alertes naissent et meurent par trigger. Les
-- fonctions `fn_alerte` / `fn_maj_alertes` sont SECURITY DEFINER et passent.

-- ---------------------------------------------------------------------------
-- vehicule : écriture alignée sur les droits métier
-- ---------------------------------------------------------------------------
drop policy if exists "acces_authentifie" on public.vehicule;

-- Sans effet en pratique (le SELECT est révoqué pour `authenticated`), mais
-- conservée pour que la lecture ne dépende que du privilège SQL.
create policy "lecture" on public.vehicule
  for select to authenticated using (true);

create policy "creation" on public.vehicule
  for insert to authenticated
  with check (j_ai_permission('vehicule.creer'));

create policy "modification" on public.vehicule
  for update to authenticated
  using (j_ai_permission('vehicule.modifier'))
  with check (j_ai_permission('vehicule.modifier'));

-- Aucune politique DELETE : la suppression d'un véhicule passe par la clé
-- service, jamais par l'application.

-- TRUNCATE n'est pas soumis à RLS : on retire le privilège.
revoke truncate on public.vehicule, public.utilisateur, public.permission, public.alerte
  from anon, authenticated;

commit;
