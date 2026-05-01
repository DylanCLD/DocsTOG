alter table public.pages
  add column if not exists parent_page_id uuid references public.pages(id) on delete set null;

alter table public.documents
  add column if not exists parent_document_id uuid references public.documents(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pages_parent_not_self'
      and conrelid = 'public.pages'::regclass
  ) then
    alter table public.pages
      add constraint pages_parent_not_self check (parent_page_id is null or parent_page_id <> id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_parent_not_self'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_parent_not_self check (parent_document_id is null or parent_document_id <> id);
  end if;
end $$;

create index if not exists pages_parent_page_idx on public.pages(parent_page_id);
create index if not exists documents_parent_document_idx on public.documents(parent_document_id);
create index if not exists documents_manager_parent_idx on public.documents(manager_id, parent_document_id);
