alter table public.pages
  add column if not exists sort_order integer not null default 0;

alter table public.documents
  add column if not exists sort_order integer not null default 0;

with ranked_pages as (
  select
    id,
    row_number() over (
      partition by parent_page_id
      order by updated_at desc, created_at asc, id asc
    ) - 1 as next_sort_order
  from public.pages
)
update public.pages
set sort_order = ranked_pages.next_sort_order
from ranked_pages
where public.pages.id = ranked_pages.id
  and public.pages.sort_order = 0;

with ranked_documents as (
  select
    id,
    row_number() over (
      partition by manager_id, parent_document_id
      order by updated_at desc, created_at asc, id asc
    ) - 1 as next_sort_order
  from public.documents
)
update public.documents
set sort_order = ranked_documents.next_sort_order
from ranked_documents
where public.documents.id = ranked_documents.id
  and public.documents.sort_order = 0;

create index if not exists pages_parent_sort_order_idx on public.pages(parent_page_id, sort_order);
create index if not exists documents_manager_parent_sort_order_idx on public.documents(manager_id, parent_document_id, sort_order);
