-- La table editor_collaboration_states n'est plus utilisee :
-- pages.content et documents.content sont la seule source de verite.
-- Yjs ne sert plus qu'a la collaboration temps reel via Supabase Realtime broadcast.
-- Cette table creait une race condition au refresh : le snapshot Y.doc binaire
-- pouvait etre perime et ecraser le contenu correct (avec image) chargee depuis pages.content.

drop table if exists public.editor_collaboration_states cascade;
