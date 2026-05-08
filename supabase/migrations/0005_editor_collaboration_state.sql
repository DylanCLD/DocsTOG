create table if not exists public.editor_collaboration_states (
  room text primary key,
  target_type text not null check (target_type in ('page', 'document')),
  target_id uuid not null,
  state_update_base64 text,
  content_snapshot jsonb,
  image_srcs text[] not null default array[]::text[],
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_type, target_id)
);

create index if not exists editor_collaboration_states_target_idx on public.editor_collaboration_states(target_type, target_id);

drop trigger if exists editor_collaboration_states_set_updated_at on public.editor_collaboration_states;
create trigger editor_collaboration_states_set_updated_at
before update on public.editor_collaboration_states
for each row execute function public.set_updated_at();

alter table public.editor_collaboration_states enable row level security;

drop policy if exists "editor_collaboration_states_read_auth" on public.editor_collaboration_states;
create policy "editor_collaboration_states_read_auth"
on public.editor_collaboration_states
for select to authenticated
using (true);

drop policy if exists "editor_collaboration_states_insert_writer" on public.editor_collaboration_states;
create policy "editor_collaboration_states_insert_writer"
on public.editor_collaboration_states
for insert to authenticated
with check (public.is_writer());

drop policy if exists "editor_collaboration_states_update_writer" on public.editor_collaboration_states;
create policy "editor_collaboration_states_update_writer"
on public.editor_collaboration_states
for update to authenticated
using (public.is_writer())
with check (public.is_writer());

drop policy if exists "editor_collaboration_states_delete_admin" on public.editor_collaboration_states;
create policy "editor_collaboration_states_delete_admin"
on public.editor_collaboration_states
for delete to authenticated
using (public.is_admin());
