# Migrations — plateforme Grenier Chrysler

La base Supabase (`ebtozlvygwkdoxtibied`, `grenier-production`) était déjà bâtie et
remplie avant l'ouverture de ce dépôt. Les migrations qui suivent ne créent donc
aucune structure : elles corrigent des problèmes d'accès qui empêchaient
l'application de fonctionner, et referment des brèches de sécurité.

Aucune donnée n'a été touchée. Après application : 195 véhicules, 12
utilisateurs, 248 alertes, 252 lignes d'historique de prix — compteurs
identiques à l'état d'origine.

## Phase 0 — 11 août 2026

| Migration | Objet |
|---|---|
| `20260811120000_deblocage_vues` | 11 vues repassées en `security_invoker = false` |
| `20260811120100_vues_financieres` | `v_inspection_statut` débloquée mais fermée à l'accès direct; 5 autres vues financières verrouillées |
| `20260811120200_fonctions_security_definer` | Les 7 fonctions métier passent en `SECURITY DEFINER` |
| `20260811120300_correctif_completer_feuille` | Bogue `malformed array literal` corrigé |
| `20260811120400_durcissement_rls` | Fin de l'auto-promotion en `admin` et de l'écrasement massif de l'inventaire |
| `20260811120500_revoquer_execute_anon` | `anon` ne peut plus appeler les fonctions métier |
| `20260811120600_anon_sans_acces` | `anon` perd tout accès au schéma `public` |

### Le problème de fond

Le `SELECT` sur `vehicule` est révoqué pour `authenticated` — c'est voulu, le
masquage financier doit passer par `v_vehicule_app`. Mais rien n'avait été mis
en place pour que les vues et les fonctions puissent, elles, lire la table.
Étant toutes en mode « droits de l'appelant », elles héritaient de cette
révocation.

Mesuré en simulant un utilisateur connecté, avant correctif :

- **17 vues sur 21** renvoyaient `42501 permission denied for table vehicule`,
  dont `v_vehicule_app`, la vue principale de l'application;
- **`creer_vehicule`, `recevoir_vehicule`, `completer_feuille` et
  `envoyer_au_service`** échouaient sur la même erreur. Postgres exige le
  `SELECT` dès qu'une colonne est lue, y compris dans le `where id = ...` d'un
  `UPDATE`.

Autrement dit, ni le formulaire d'acquisition ni la liste d'inventaire ne
pouvaient fonctionner depuis un navigateur.

### Ce qui a été trouvé en chemin

**Escalade de privilèges.** Les tables `utilisateur`, `permission`, `alerte` et
`vehicule` portaient une politique `FOR ALL USING (true)`. Reproduit avant
correctif : un utilisateur connecté pouvait exécuter
`update utilisateur set role='admin'` (4 vendeurs promus) et
`update vehicule set prix_vente = 1` (195 véhicules écrasés). Sans effet tant
qu'aucun compte n'était lié à Supabase Auth — mais l'étape 1 consiste
précisément à les lier.

**Bogue dans `completer_feuille`.** `manquants || 'kilométrage'` sur un `text[]`
sans cast : Postgres résolvait vers `array || array` et plantait avec
`22P02 malformed array literal`. La fonction ne pouvait donc jamais afficher
son message de validation. Le chemin nominal fonctionnait, d'où un bogue resté
invisible.

**Deux régressions introduites puis corrigées.** Passer les fonctions en
`SECURITY DEFINER` et les vues en `security_invoker = false` a retiré deux
garde-fous implicites : `anon` pouvait alors appeler `creer_vehicule` (la garde
`if v_moi is not null` ne se déclenche pas pour un appelant non connecté) et
lire les 195 véhicules via `v_vehicule_app`. Les deux ont été reproduites, puis
fermées par les migrations `120500` et `120600`.

### Points d'attention

`security_invoker = false` fait remonter un avertissement « Security Definer
View » dans l'analyseur Supabase. C'est attendu ici : le masquage financier est
assuré dans le corps de la vue par `j_ai_permission()`, fonction
`SECURITY DEFINER` qui lit le JWT et reste donc propre à l'utilisateur
connecté. Les vues concernées ne contiennent aucun montant en clair, sauf
`v_vehicule_app` qui masque déjà tout ce qui est sensible.

De même, `authenticated` conserve le droit d'appeler les fonctions métier :
c'est le chemin normal de l'application, et la garde `a_permission()` interne
fait le tri une fois les comptes liés.

### Reste à faire

`v_file_service` (étape 2) et `v_inspection_statut` (étape 3) sont fermées à
l'accès direct parce qu'elles exposent les coûts sans masquage. Quand ces
écrans seront construits, il faudra leur donner un accès masqué par
`vehicule.voir_couts`, sur le modèle de `v_vehicule_app` — et non les rouvrir
telles quelles.
