# Workspace Projet Notion-like

Site web Next.js pour organiser un projet de jeu/serveur avec une équipe: pages riches, gestionnaires de documents, planning vocal, médias, recherche globale, rôles et accès Google contrôlés.

## Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4
- Supabase Auth Google, Postgres, Storage et Row Level Security
- Tiptap 3 pour l’éditeur riche
- Déploiement Vercel

## Installation locale

```bash
npm install
cp .env.example .env.local
npm run dev
```

Le site sera disponible sur `http://localhost:3000`.

## Variables d’environnement

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-server-only
BOOTSTRAP_ADMIN_EMAILS=you@example.com,teammate@example.com
```

`BOOTSTRAP_ADMIN_EMAILS` sert à autoriser le premier admin automatiquement après connexion Google.

## Configuration Supabase

1. Crée un projet Supabase.
2. Ouvre SQL Editor et exécute `supabase/migrations/0001_initial_workspace.sql`.
3. Dans Authentication > Providers, active Google.
4. Crée tes identifiants OAuth dans Google Cloud Console.
5. Dans Google Cloud, ajoute les URI de redirection Supabase indiquées dans le provider Google Supabase.
6. Dans Supabase > Authentication > URL Configuration, ajoute:
   - Site URL local: `http://localhost:3000`
   - Redirect local: `http://localhost:3000/auth/callback`
   - Site URL Vercel: `https://ton-site.vercel.app`
   - Redirect Vercel: `https://ton-site.vercel.app/auth/callback`
7. Renseigne `.env.local`.

La migration crée les tables, les enums, les triggers `updated_at`, les policies RLS, le bucket public `project-media` et les gestionnaires de départ.

## Déploiement Vercel

1. Pousse le projet sur GitHub.
2. Importe le repo dans Vercel.
3. Ajoute les mêmes variables d’environnement dans Vercel.
4. Mets à jour Supabase et Google avec l’URL Vercel finale.
5. Déploie.

Commandes de vérification:

```bash
npm run typecheck
npm run lint
npm run build
```

## Routes principales

- `/login`: connexion Google
- `/dashboard`: vue globale
- `/pages` et `/pages/[id]`: pages riches
- `/managers` et `/managers/[id]`: gestionnaires et documents
- `/documents/[id]`: document riche
- `/planning`: sessions vocales
- `/media`: médiathèque
- `/settings`: administration
- `/access-denied`: email non autorisé

## Rôles

- Admin: créer, modifier, supprimer, gérer les utilisateurs et paramètres.
- Membre: créer et modifier les contenus.
- Lecteur: consulter seulement.

Les permissions sont appliquées dans les Server Actions et dans Supabase RLS.
