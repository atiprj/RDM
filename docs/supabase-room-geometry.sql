-- Geometrie 3D dei locali (export pyRevit) e token personali per il plugin Revit.
-- Eseguire una volta nel SQL Editor di Supabase (idempotente).

-- 1) Token personali per il plugin Revit.
--    Il token in chiaro viene mostrato una sola volta; qui si salva solo l'hash SHA-256.
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  label text not null default '',
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_tokens_email_idx on public.api_tokens (lower(email));

-- 2) Geometria esportata per locale.
create table if not exists public.room_geometries (
  id bigint generated always as identity primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  room_id bigint not null references public.rooms(id) on delete cascade,
  sr_code text,
  is_main boolean not null default false,
  glb_path text not null,
  glb_bytes integer,
  element_count integer,
  area numeric,
  exported_by text,
  exported_at timestamptz not null default now(),
  revit_file text,
  unique (room_id)
);
create index if not exists room_geometries_project_sr_idx
  on public.room_geometries (project_id, sr_code);

-- Al massimo una Main per tipo SR in ogni progetto.
create unique index if not exists room_geometries_one_main_ux
  on public.room_geometries (project_id, sr_code)
  where is_main;

-- 3) RLS attiva senza policy: le tabelle sono accessibili solo dalla chiave
--    server-side (API Route della web app), mai dalla anon key del plugin.
alter table public.api_tokens enable row level security;
alter table public.room_geometries enable row level security;

-- 4) Bucket privato per i file .glb (letti con signed URL, caricati con signed upload URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-geometry', 'room-geometry', false, 52428800, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
