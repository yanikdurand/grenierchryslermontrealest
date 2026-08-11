# Déploiement sur Vercel

Le dépôt est prêt : `vercel.json` fixe déjà le cadriciel, la commande de
build, le dossier de sortie, la réécriture des routes et les en-têtes. Il ne
reste que l'import, qui ne peut se faire que depuis l'interface Vercel ou le
CLI authentifié.

## Import (une seule fois, ~2 minutes)

1. Aller sur https://vercel.com/new
2. **Import Git Repository** → choisir `yanikdurand/grenierchryslermontrealest`
3. Ne rien changer aux réglages de build : ils sont lus depuis `vercel.json`
   (Vite, `npm run build`, sortie `dist`).
4. Déplier **Environment Variables** et ajouter les deux suivantes, pour les
   trois environnements (Production, Preview, Development) :

   | Nom | Valeur |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://ebtozlvygwkdoxtibied.supabase.co` |
   | `VITE_SUPABASE_CLE` | la clé publiable `sb_publishable_…` du projet |

   La clé se trouve dans le tableau de bord Supabase, sous
   *Project Settings → API Keys*. C'est bien la clé **publiable**, pas la clé
   service : elle est destinée au navigateur, et le rôle `anon` n'a plus aucun
   accès au schéma depuis la migration `20260811120600`.

5. **Deploy**.

## Branche

Par défaut Vercel déploie la branche par défaut du dépôt. Le travail est
actuellement sur `claude/project-kickoff-xqh8ro` : soit fusionner cette
branche avant l'import, soit changer la *Production Branch* dans
*Settings → Git*.

## Après le premier déploiement

Deux choses à vérifier, parce qu'elles n'ont pas pu l'être depuis
l'environnement de développement — le proxy sortant y refuse `*.supabase.co` :

1. **La connexion fonctionne réellement.** Se connecter avec un des comptes,
   changer le mot de passe, vérifier que la liste des véhicules se remplit.
   C'est la seule étape qui n'a pas été validée bout en bout contre la vraie
   base; tout le reste l'a été, côté interface avec les appels simulés et
   côté base en SQL rôle par rôle.
2. **Le masquage financier.** Se connecter avec un compte vendeur : ni prix
   d'achat, ni profit ne doivent apparaître. Le masquage vient de Postgres, il
   devrait suivre, mais autant le voir de ses yeux une fois.

## URL de rappel Supabase

Supabase Auth n'a pas besoin d'URL de redirection ici : l'application utilise
`signInWithPassword`, sans lien magique ni OAuth. Rien à configurer.

Si une réinitialisation de mot de passe par courriel est ajoutée plus tard, il
faudra alors déclarer l'URL Vercel dans *Authentication → URL Configuration*,
et configurer un SMTP — celui de Supabase par défaut ne suffit pas pour
l'équipe.
