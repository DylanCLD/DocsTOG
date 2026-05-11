-- Add is_favorite column to pages and documents for pinning feature
alter table public.pages add column if not exists is_favorite boolean not null default false;
alter table public.documents add column if not exists is_favorite boolean not null default false;
