# Plateforme d'inventaire — Grenier Chrysler Montréal-Est

Application interne de gestion d'inventaire de véhicules d'occasion, en
remplacement d'Airtable. Onze utilisateurs à l'interne, rien de public.

La base Supabase (`ebtozlvygwkdoxtibied`) était déjà bâtie et remplie avant
l'ouverture de ce dépôt : 31 tables, 21 vues, triggers, RLS, 195 véhicules.
Ce dépôt contient l'interface, plus les migrations correctives nécessaires
pour que cette base soit utilisable depuis un navigateur (voir
`supabase/migrations/README.md`).

## Démarrer

Node.js 22 ou plus récent est requis (`.nvmrc`).

```bash
npm install
cp .env.example .env     # renseigner VITE_SUPABASE_CLE
npm run dev
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run lint` | Vérification ESLint |
| `npm run build` | Vérification TypeScript puis build de production |
| `npm run verifier` | Vérification TypeScript seule |
| `npm run test:e2e:install` | Installation de Chromium pour le test d'interface |
| `npm run test:e2e` | Test de bout en bout de l'interface (serveur de dev requis) |

## Règles à respecter

Elles viennent du brief et de la base; les contourner casse le modèle.

- **Lire les véhicules par `v_vehicule_app`**, jamais par la table `vehicule`,
  dont le `SELECT` est révoqué. C'est la vue qui masque `prix_achat`,
  `profit`, les coûts de recon et les leads selon les droits.
- **Écrire par les fonctions métier** (`creer_vehicule`, `recevoir_vehicule`,
  `demarrer_feuille`, `completer_feuille`, …), jamais par un `insert` ou un
  `update` direct : ce sont elles qui portent les règles.
- **Le statut d'un véhicule ne se saisit jamais.** Il découle d'un fait noté —
  une vente, une livraison, une entrée au garage, un transfert — par trigger ou
  par `deplacer_vehicule`. `changer_statut` n'est plus exécutable depuis
  l'application, seulement par la clé service pour les corrections.
- **Ne pas envoyer les champs d'auteur** (`cree_par`, `decide_par`,
  `derniere_modif_par`) : ils sont estampillés par trigger.
- **Ne jamais créer ni résoudre une alerte à la main.** Modifier la donnée
  source, l'alerte suit.
- **Ne pas envoyer de courriel depuis l'application.** Écrire dans
  `notification_file`; n8n la vide aux 5 minutes.
- **Masquer les actions en amont** avec `aLeDroit('code')` plutôt que de
  laisser remonter une erreur 42501.

## Organisation

```
src/
  auth/        connexion, changement de mot de passe forcé, contexte useMoi()
  composants/  ossature de l'application
  lib/         client Supabase, types, traduction des erreurs Postgres
  pages/       écrans métier (acquisition, inventaire, fiche, feuille,
               file du service, inspection, réglages)
supabase/
  migrations/  correctifs appliqués à la base de production
tests/
  interface.test.mjs
docs/
  authentification.md
```

## État

| Étape | État |
|---|---|
| Correctifs et sécurisation de la base | fait |
| 1 — Authentification et comptes | fait |
| 4 — Formulaire d'acquisition | fait |
| 6 — Gestionnaire d'inventaire | fait |
| 5 — Feuille d'équipements | fait |
| 2 — Écran inspection (Catherine) | fait |
| 3 — Écran approbation | fait |
| 7 — Réglages admin | fait |
| Accueil par rôle et files nommées | fait |
| Pipeline de vente (statut = conséquence) | fait |
| Visites du jour (phone-up / walk-in) | fait |
| Parcours et goulots | fait |
| 8 — Tableaux de bord | fait |

Prochaine étape : la passe UI/UX, avec les références de l'équipe. La fiche
véhicule sur téléphone y sera reprise — elle fait 3683 px de haut, un champ
par ligne. Seul Jonathan travaille sur mobile pour l'instant.
