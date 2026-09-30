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

Le site sera disponible sur `https://docs-tog.vercel.app`.

## Variables d’environnement

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-server-only
BOOTSTRAP_ADMIN_EMAILS=you@example.com,teammate@example.com
MCP_TOKEN=
```

`BOOTSTRAP_ADMIN_EMAILS` sert à autoriser le premier admin automatiquement après connexion Google.

`MCP_TOKEN` est facultatif: il active le [serveur MCP](#serveur-mcp-lecture-seule). Sans lui, `/api/mcp` reste désactivé.

## Configuration Supabase

1. Crée un projet Supabase.
2. Ouvre SQL Editor et exécute les fichiers `supabase/migrations/*.sql` dans l'ordre.
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

## Serveur MCP (lecture seule)

Le projet expose un serveur [MCP](https://modelcontextprotocol.io) sur `/api/mcp`, pour que Claude puisse chercher et lire les pages et documents. Il est **désactivé tant que `MCP_TOKEN` n'est pas défini**.

### Activer

1. Génère un jeton: `openssl rand -hex 32` (32 caractères minimum, sinon le serveur reste désactivé).
2. Ajoute `MCP_TOKEN` aux variables d'environnement de Vercel (environnement *Production*) et redéploie. `SUPABASE_SERVICE_ROLE_KEY` doit aussi être défini.
3. Connecte Claude Code:

```bash
claude mcp add --transport http docstog https://docs-tog.vercel.app/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

Le transport est Streamable HTTP en JSON, sans session. L'authentification se fait par jeton statique (pas d'OAuth): elle convient aux clients qui permettent d'ajouter un en-tête `Authorization`.

### Outils

| Outil | Rôle |
| --- | --- |
| `search` | Cherche dans les titres (par défaut) ou dans le texte des pages et documents, sans tenir compte des accents ni de la casse |
| `list_pages` | Liste les pages, ou les enfants d'une page |
| `get_page` | Lit une page: métadonnées, chemin, sous-pages, contenu en Markdown |
| `list_managers` | Liste les gestionnaires avec leur nombre de documents |
| `list_documents` | Liste les documents (filtres: gestionnaire, parent, statut, priorité, tag) |
| `get_document` | Lit un document: métadonnées, chemin, sous-documents, contenu en Markdown |
| `get_backlinks` | Liste les pages et documents qui pointent vers un élément |

### Sécurité

- Le serveur est **en lecture seule**: il n'émet que des `SELECT`, et aucun outil n'écrit dans la base ni dans le contenu de l'éditeur.
- Il utilise la clé `service_role`, donc il **contourne les règles RLS**: le jeton donne accès en lecture à toutes les pages et à tous les documents. Traite-le comme un mot de passe. S'il fuite, change `MCP_TOKEN` dans Vercel et redéploie.
- Le jeton est comparé en temps constant. En cas d'erreur, seuls le nom de l'outil et le message d'erreur sont journalisés: jamais le jeton ni les arguments des requêtes.
- Les textes renvoyés sont écrits par l'équipe: Claude doit les traiter comme des données, pas comme des instructions.
- Les réponses sont plafonnées (`max_chars`, 50 000 caractères par défaut) et les images collées en base64 ne sont jamais renvoyées.

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
- `/api/mcp`: serveur MCP en lecture seule (voir plus haut)

## Rôles

- Admin: créer, modifier, supprimer, gérer les utilisateurs et paramètres.
- Membre: créer et modifier les contenus.
- Lecteur: consulter seulement.

Les permissions sont appliquées dans les Server Actions et dans Supabase RLS.
