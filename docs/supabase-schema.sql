-- 我们的回忆 Supabase setup
-- Run this in Supabase SQL Editor before deploying with Supabase env vars.

create table if not exists public.map_of_us_store (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.map_of_us_store disable row level security;

insert into storage.buckets (id, name, public)
values ('our-memories', 'our-memories', true)
on conflict (id) do update set public = excluded.public;

create policy "Our Memories public read"
on storage.objects for select
using (bucket_id = 'our-memories');
