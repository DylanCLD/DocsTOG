create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'member', 'reader');
  end if;

  if not exists (select 1 from pg_type where typname = 'document_status') then
    create type public.document_status as enum ('todo', 'in_progress', 'review', 'done');
  end if;

  if not exists (select 1 from pg_type where typname = 'document_priority') then
    create type public.document_priority as enum ('low', 'medium', 'high', 'critical');
  end if;

  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type public.session_status as enum ('planned', 'in_progress', 'done', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'media_type') then
    create type public.media_type as enum ('image', 'youtube', 'video', 'document', 'link');
  end if;

  if not exists (select 1 from pg_type where typname = 'theme_mode') then
    create type public.theme_mode as enum ('dark', 'light');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  role public.user_role not null default 'reader',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.allowed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role public.user_role not null default 'member',
  is_active boolean not null default true,
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_settings (
  id boolean primary key default true check (id),
  project_name text not null default 'Workspace Projet',
  logo_url text,
  theme public.theme_mode not null default 'dark',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.workspace_settings (id, project_name, theme)
values (true, 'Workspace Projet', 'dark')
on conflict (id) do nothing;

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  icon text not null default '📄',
  category text not null default 'Général',
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_managers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default '📁',
  description text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.document_managers(id) on delete cascade,
  title text not null,
  short_description text,
  status public.document_status not null default 'todo',
  priority public.document_priority not null default 'medium',
  responsible_id uuid references public.users(id) on delete set null,
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#3dd6b3',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.page_tags (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (page_id, tag_id)
);

create table if not exists public.document_tags (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (document_id, tag_id)
);

create table if not exists public.planning_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  description text,
  objective text,
  voice_url text,
  status public.session_status not null default 'planned',
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planning_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.planning_sessions(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  participant_email text,
  participant_name text,
  created_at timestamptz not null default now(),
  check (user_id is not null or participant_email is not null or participant_name is not null)
);

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type public.media_type not null default 'link',
  url text not null,
  description text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_item_tags (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.media_items(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (media_item_id, tag_id)
);

create index if not exists pages_title_category_idx on public.pages using gin (to_tsvector('simple', title || ' ' || category));
create index if not exists documents_manager_idx on public.documents(manager_id);
create index if not exists documents_status_priority_idx on public.documents(status, priority);
create index if not exists planning_sessions_date_idx on public.planning_sessions(session_date, start_time);
create index if not exists media_items_type_idx on public.media_items(type);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();

drop trigger if exists allowed_emails_set_updated_at on public.allowed_emails;
create trigger allowed_emails_set_updated_at before update on public.allowed_emails for each row execute function public.set_updated_at();

drop trigger if exists workspace_settings_set_updated_at on public.workspace_settings;
create trigger workspace_settings_set_updated_at before update on public.workspace_settings for each row execute function public.set_updated_at();

drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at before update on public.pages for each row execute function public.set_updated_at();

drop trigger if exists document_managers_set_updated_at on public.document_managers;
create trigger document_managers_set_updated_at before update on public.document_managers for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();

drop trigger if exists tags_set_updated_at on public.tags;
create trigger tags_set_updated_at before update on public.tags for each row execute function public.set_updated_at();

drop trigger if exists planning_sessions_set_updated_at on public.planning_sessions;
create trigger planning_sessions_set_updated_at before update on public.planning_sessions for each row execute function public.set_updated_at();

drop trigger if exists media_items_set_updated_at on public.media_items;
create trigger media_items_set_updated_at before update on public.media_items for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_writer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'member'), false);
$$;

insert into public.document_managers (name, icon, description)
values
  ('Système', '⚙️', 'Inventaire, combat, quêtes, progression, économie et compétences.'),
  ('Lore', '📜', 'Univers, factions, personnages, chronologie et contexte narratif.'),
  ('Game Design', '🎮', 'Boucles de gameplay, mécaniques, progression et expérience joueur.'),
  ('Équilibrage', '⚖️', 'Valeurs, difficultés, récompenses, coûts et calibrage.'),
  ('Quêtes', '🧭', 'Quêtes principales, secondaires, objectifs et récompenses.'),
  ('Boss', '👑', 'Boss, patterns, phases, arènes et loot.'),
  ('Items', '🎒', 'Objets, équipements, rareté, craft et économie.'),
  ('Maps', '🗺️', 'Zones, biomes, donjons, points d’intérêt et progression spatiale.'),
  ('UI/UX', '🧩', 'Interfaces, flux, accessibilité et expérience utilisateur.'),
  ('Bugs', '🐞', 'Suivi des bugs, régressions et corrections.'),
  ('Idées', '💡', 'Idées rapides, inspirations et pistes à explorer.')
on conflict (name) do nothing;

alter table public.users enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.pages enable row level security;
alter table public.document_managers enable row level security;
alter table public.documents enable row level security;
alter table public.tags enable row level security;
alter table public.page_tags enable row level security;
alter table public.document_tags enable row level security;
alter table public.planning_sessions enable row level security;
alter table public.planning_session_participants enable row level security;
alter table public.media_items enable row level security;
alter table public.media_item_tags enable row level security;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin" on public.users for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists "users_update_self_limited_or_admin" on public.users;
create policy "users_update_self_limited_or_admin" on public.users for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists "allowed_emails_admin_all" on public.allowed_emails;
create policy "allowed_emails_admin_all" on public.allowed_emails for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "workspace_settings_read_auth" on public.workspace_settings;
create policy "workspace_settings_read_auth" on public.workspace_settings for select to authenticated using (true);

drop policy if exists "workspace_settings_admin_write" on public.workspace_settings;
create policy "workspace_settings_admin_write" on public.workspace_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pages_read_auth" on public.pages;
create policy "pages_read_auth" on public.pages for select to authenticated using (true);

drop policy if exists "pages_insert_writer" on public.pages;
create policy "pages_insert_writer" on public.pages for insert to authenticated with check (public.is_writer());

drop policy if exists "pages_update_writer" on public.pages;
create policy "pages_update_writer" on public.pages for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "pages_delete_admin" on public.pages;
create policy "pages_delete_admin" on public.pages for delete to authenticated using (public.is_admin());

drop policy if exists "document_managers_read_auth" on public.document_managers;
create policy "document_managers_read_auth" on public.document_managers for select to authenticated using (true);

drop policy if exists "document_managers_insert_writer" on public.document_managers;
create policy "document_managers_insert_writer" on public.document_managers for insert to authenticated with check (public.is_writer());

drop policy if exists "document_managers_update_writer" on public.document_managers;
create policy "document_managers_update_writer" on public.document_managers for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "document_managers_delete_admin" on public.document_managers;
create policy "document_managers_delete_admin" on public.document_managers for delete to authenticated using (public.is_admin());

drop policy if exists "documents_read_auth" on public.documents;
create policy "documents_read_auth" on public.documents for select to authenticated using (true);

drop policy if exists "documents_insert_writer" on public.documents;
create policy "documents_insert_writer" on public.documents for insert to authenticated with check (public.is_writer());

drop policy if exists "documents_update_writer" on public.documents;
create policy "documents_update_writer" on public.documents for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "documents_delete_admin" on public.documents;
create policy "documents_delete_admin" on public.documents for delete to authenticated using (public.is_admin());

drop policy if exists "tags_read_auth" on public.tags;
create policy "tags_read_auth" on public.tags for select to authenticated using (true);

drop policy if exists "tags_insert_writer" on public.tags;
create policy "tags_insert_writer" on public.tags for insert to authenticated with check (public.is_writer());

drop policy if exists "tags_update_writer" on public.tags;
create policy "tags_update_writer" on public.tags for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "tags_delete_admin" on public.tags;
create policy "tags_delete_admin" on public.tags for delete to authenticated using (public.is_admin());

drop policy if exists "page_tags_read_auth" on public.page_tags;
create policy "page_tags_read_auth" on public.page_tags for select to authenticated using (true);

drop policy if exists "page_tags_write_writer" on public.page_tags;
create policy "page_tags_write_writer" on public.page_tags for all to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "document_tags_read_auth" on public.document_tags;
create policy "document_tags_read_auth" on public.document_tags for select to authenticated using (true);

drop policy if exists "document_tags_write_writer" on public.document_tags;
create policy "document_tags_write_writer" on public.document_tags for all to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "planning_sessions_read_auth" on public.planning_sessions;
create policy "planning_sessions_read_auth" on public.planning_sessions for select to authenticated using (true);

drop policy if exists "planning_sessions_insert_writer" on public.planning_sessions;
create policy "planning_sessions_insert_writer" on public.planning_sessions for insert to authenticated with check (public.is_writer());

drop policy if exists "planning_sessions_update_writer" on public.planning_sessions;
create policy "planning_sessions_update_writer" on public.planning_sessions for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "planning_sessions_delete_admin" on public.planning_sessions;
create policy "planning_sessions_delete_admin" on public.planning_sessions for delete to authenticated using (public.is_admin());

drop policy if exists "planning_participants_read_auth" on public.planning_session_participants;
create policy "planning_participants_read_auth" on public.planning_session_participants for select to authenticated using (true);

drop policy if exists "planning_participants_write_writer" on public.planning_session_participants;
create policy "planning_participants_write_writer" on public.planning_session_participants for all to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "media_items_read_auth" on public.media_items;
create policy "media_items_read_auth" on public.media_items for select to authenticated using (true);

drop policy if exists "media_items_insert_writer" on public.media_items;
create policy "media_items_insert_writer" on public.media_items for insert to authenticated with check (public.is_writer());

drop policy if exists "media_items_update_writer" on public.media_items;
create policy "media_items_update_writer" on public.media_items for update to authenticated using (public.is_writer()) with check (public.is_writer());

drop policy if exists "media_items_delete_admin" on public.media_items;
create policy "media_items_delete_admin" on public.media_items for delete to authenticated using (public.is_admin());

drop policy if exists "media_item_tags_read_auth" on public.media_item_tags;
create policy "media_item_tags_read_auth" on public.media_item_tags for select to authenticated using (true);

drop policy if exists "media_item_tags_write_writer" on public.media_item_tags;
create policy "media_item_tags_write_writer" on public.media_item_tags for all to authenticated using (public.is_writer()) with check (public.is_writer());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  true,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4', 'application/pdf']
)
on conflict (id) do update set public = excluded.public;

drop policy if exists "project_media_public_read" on storage.objects;
create policy "project_media_public_read" on storage.objects for select using (bucket_id = 'project-media');

drop policy if exists "project_media_authenticated_insert" on storage.objects;
create policy "project_media_authenticated_insert" on storage.objects for insert to authenticated with check (bucket_id = 'project-media' and public.is_writer());

drop policy if exists "project_media_authenticated_update" on storage.objects;
create policy "project_media_authenticated_update" on storage.objects for update to authenticated using (bucket_id = 'project-media' and public.is_writer()) with check (bucket_id = 'project-media' and public.is_writer());

drop policy if exists "project_media_admin_delete" on storage.objects;
create policy "project_media_admin_delete" on storage.objects for delete to authenticated using (bucket_id = 'project-media' and public.is_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pages'
  ) then
    alter publication supabase_realtime add table public.pages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;
