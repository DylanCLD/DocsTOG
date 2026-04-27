# Supabase

1. Crée un projet Supabase.
2. Dans SQL Editor, exécute `supabase/migrations/0001_initial_workspace.sql`.
3. Dans Authentication > Providers, active Google.
4. Dans Authentication > URL Configuration, ajoute:
   - Site URL: `http://localhost:3000` en local, puis ton URL Vercel.
   - Redirect URL: `http://localhost:3000/auth/callback`, puis `https://ton-site.vercel.app/auth/callback`.
5. Renseigne les variables `.env.local` à partir de `.env.example`.

Le premier admin est ajouté automatiquement si son email est présent dans `BOOTSTRAP_ADMIN_EMAILS`.
