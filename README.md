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
MCP_ALLOW_WRITE=
```

`BOOTSTRAP_ADMIN_EMAILS` sert à autoriser le premier admin automatiquement après connexion Google.

`MCP_TOKEN` est facultatif: il active le [serveur MCP](#serveur-mcp). Sans lui, `/api/mcp` reste désactivé. `MCP_ALLOW_WRITE=true` (facultatif aussi) y ajoute les [outils d'écriture](#outils-décriture-facultatifs).

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

## Serveur MCP

Le projet expose un serveur [MCP](https://modelcontextprotocol.io) sur `/api/mcp`, pour que Claude puisse chercher, lire et, si tu l'actives, modifier les pages et documents. Il est **désactivé tant que `MCP_TOKEN` n'est pas défini**, et **en lecture seule tant que `MCP_ALLOW_WRITE` n'est pas `true`**.

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

### Outils d'écriture (facultatifs)

Ils n'existent que si `MCP_ALLOW_WRITE=true` est défini (Vercel, environnement *Production*, puis redéploiement). Sans cette variable, ils ne sont ni listés ni exécutables, et le serveur n'émet que des `SELECT`. Après l'avoir activée ou retirée, le client MCP doit se reconnecter pour rafraîchir sa liste d'outils.

| Outil | Rôle |
| --- | --- |
| `create_page` | Crée une page (à la racine ou sous un parent), avec un contenu Markdown facultatif |
| `create_document` | Crée un document dans un gestionnaire (statut, priorité, responsable, tags, parent, contenu) |
| `update_page` | Titre, icône, catégorie, épinglage |
| `update_document` | Titre, description, statut, priorité, responsable, épinglage, tags (remplacer, ajouter, retirer) |
| `move_page` / `move_document` | Déplace dans l'arbre, avec position; un document peut aussi changer de gestionnaire, avec ses sous-documents |
| `edit_page_content` / `edit_document_content` | `append` (ajoute à la fin ou au début), `replace_text` (remplace un texte en gardant la mise en forme), `rewrite` (remplace tout) |
| `delete_page` / `delete_document` | Supprime **définitivement** |

Garde-fous:

- **Suppression**: il faut passer le titre exact (`expected_title`), et un élément qui a encore des sous-éléments est refusé. Le résultat rappelle qui pointait vers lui et renvoie son texte en Markdown.
- **Contenu**: `append` et `replace_text` ne touchent pas au reste du texte (images, couleurs, tableaux restent intacts). `rewrite` exige le champ `updated` lu juste avant (`expected_updated_at`) et **refuse** de supprimer des images, des vidéos intégrées, des couleurs ou un alignement que le Markdown ne peut pas reproduire, sauf `allow_lossy: true`.
- **Écritures concurrentes**: le contenu n'est écrit que si la ligne n'a pas changé depuis sa lecture (comparaison sur `updated_at`).
- **Éditeur ouvert**: l'éditeur garde sa propre copie et écrase le contenu à la prochaine frappe. Une page modifiée par MCP doit être rechargée par toute personne qui l'a ouverte. Ce point n'est pas géré côté serveur.
- Rien n'est attribué à un utilisateur (`created_by` et `updated_by` restent vides), et les tags ne sont jamais supprimés ni renommés.
- Le Markdown est converti vers le format de l'éditeur (titres 1 à 3, listes, tâches, tableaux, code, citations, liens, images en https). Les liens internes s'écrivent `[texte](/pages/<id>)` ou `[texte](/documents/<id>)`. Les liens `javascript:` et les images `data:` sont refusés.

### Sécurité

- Sans `MCP_ALLOW_WRITE`, le serveur est **en lecture seule**: il n'émet que des `SELECT`.
- Il utilise la clé `service_role`, donc il **contourne les règles RLS** et les contrôles de rôle de l'application (`canWrite`, `canDelete`): le jeton donne accès en lecture à toutes les pages et à tous les documents, et, avec `MCP_ALLOW_WRITE`, le droit de tout modifier et supprimer. Traite-le comme un mot de passe. S'il fuite, change `MCP_TOKEN` dans Vercel et redéploie.
- Dans le client (Claude Desktop, Claude Code), laisse les outils de suppression et de modification de contenu sur « demander » plutôt que « toujours autoriser ».
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
- `/api/mcp`: serveur MCP, en lecture seule sauf `MCP_ALLOW_WRITE` (voir plus haut)

## Rôles

- Admin: créer, modifier, supprimer, gérer les utilisateurs et paramètres.
- Membre: créer et modifier les contenus.
- Lecteur: consulter seulement.

Les permissions sont appliquées dans les Server Actions et dans Supabase RLS.
