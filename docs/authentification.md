# Étape 1 — Authentification

## Comptes

Les 11 comptes actifs ont été créés dans Supabase Auth et liés à
`utilisateur.auth_user_id`. Le compte inactif (SAM, ancien vendeur) n'a
volontairement pas de compte : on désactive, on ne supprime pas.

Chaque compte a reçu un **mot de passe temporaire unique**, transmis hors du
dépôt. Aucun mot de passe n'est versionné ici. Le SMTP par défaut de Supabase
ne permettait pas d'envoyer 11 invitations (plafonné à quelques courriels par
heure, et restreint aux membres de l'organisation Supabase), et deux adresses
sont sur un autre domaine (`@grenierauto.com`).

Chaque compte porte `raw_user_meta_data.doit_changer_mdp = true`. L'application
doit forcer le changement de mot de passe à la première connexion et remettre
ce drapeau à `false` ensuite.

## Ce que la liaison déclenche

Tant que `auth_user_id` était vide, `utilisateur_courant()` renvoyait `null` et
les gardes des fonctions métier laissaient tout passer — comportement voulu
pour n8n, qui utilise la clé service. Depuis la liaison, la sécurité est
réellement active.

Vérifié compte par compte, avec un vrai jeton :

| Personne | Rôle | Prix achat | Profit | Coûts | Leads | Crée | Approuve |
|---|---|---|---|---|---|---|---|
| Yanik Durand | admin | visible | visible | visible | visible | ✓ | ✓ |
| Steve Costa | directeur | visible | visible | visible | visible | ✓ | ✓ |
| Jonathan Dauphinais | gestionnaire_inventaire | visible | masqué | visible | visible | ✓ | — |
| Philippe Gemme | directeur_service | masqué | masqué | visible | masqué | — | — |
| Catherine Généreux | aviseur | masqué | masqué | visible | masqué | — | — |
| Emily Dupont | receptionniste | visible | masqué | masqué | masqué | ✓ | — |
| Gabriel Grenier | proprietaire | visible | visible | visible | visible | — | — |
| Julien Grenier | proprietaire | visible | visible | visible | visible | — | — |
| Ludovick Borris | vendeur | masqué | masqué | masqué | masqué | — | — |
| Alexis Charlebois | vendeur | masqué | masqué | masqué | masqué | — | — |
| William St-Jacques | vendeur | masqué | masqué | masqué | masqué | — | — |

Conforme à la grille du brief (§4). Le masquage est appliqué par Postgres dans
`v_vehicule_app`, pas par l'interface : un utilisateur qui interrogerait l'API
directement obtiendrait les mêmes `null`.

Contrôles d'intrusion rejoués avec le jeton réel d'un vendeur :

```
Vendeur se promeut admin      -> BLOQUE (0 ligne, filtré par RLS)
Vendeur écrase tous les prix  -> BLOQUE (0 ligne, filtré par RLS)
Vendeur crée un véhicule      -> BLOQUE (42501 : « Vous n'avez pas le droit
                                 d'ajouter un véhicule. »)
```

## À faire côté interface

- Écran de connexion en français (courriel + mot de passe)
- Changement de mot de passe forcé si `doit_changer_mdp` est vrai
- Contexte `useMoi()` : utilisateur, rôle, permissions effectives
- Masquer les actions en amont plutôt que de laisser l'erreur 42501 remonter
  (le brief §6.3 le demande explicitement)
