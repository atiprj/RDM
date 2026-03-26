-- RLS baseline for Revit sync via Supabase REST (anon key).
-- ATTENZIONE: applica in ambiente controllato e adatta ai tuoi requisiti security.

-- 1) Enable RLS
alter table if exists public.projects enable row level security;
alter table if exists public.rooms enable row level security;
alter table if exists public.parameter_mappings enable row level security;

-- 2) Read policies for anon role (plugin pull)
drop policy if exists "anon_read_projects" on public.projects;
create policy "anon_read_projects"
on public.projects
for select
to anon
using (true);

drop policy if exists "anon_read_rooms" on public.rooms;
create policy "anon_read_rooms"
on public.rooms
for select
to anon
using (true);

drop policy if exists "anon_read_parameter_mappings" on public.parameter_mappings;
create policy "anon_read_parameter_mappings"
on public.parameter_mappings
for select
to anon
using (true);

-- 3) Update policy for anon role (plugin push area/status handshake)
drop policy if exists "anon_update_rooms_sync_fields" on public.rooms;
create policy "anon_update_rooms_sync_fields"
on public.rooms
for update
to anon
using (true)
with check (true);

-- 4) Unique constraints used by app upsert logic
-- (execute only if missing in your DB)
create unique index if not exists rooms_project_room_number_ux
on public.rooms (project_id, room_number);

create unique index if not exists mappings_project_dbcolumn_ux
on public.parameter_mappings (project_id, db_column_name);

create unique index if not exists items_project_item_code_ux
on public.items (project_id, item_code);

-- 5) Recommended hardening (manual review)
-- - Limit anon update columns using RPC instead of generic UPDATE if stricter control needed.
-- - Replace using(true) with project-level checks when plugin auth evolves.

