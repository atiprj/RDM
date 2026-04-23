-- User role model for RoomDataManagementVercel
-- Goal:
-- - super_admin: full control
-- - project_admin: can manage users/projects assignments, except super_admin users
-- - user: regular access by allowed_projects

alter table if exists public.user_permissions
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists is_project_admin boolean not null default false;

-- Keep backward compatibility with legacy is_admin flag used by old app code.
update public.user_permissions
set
  is_super_admin = coalesce(is_super_admin, false) or coalesce(is_admin, false),
  is_project_admin = coalesce(is_project_admin, false) or coalesce(is_admin, false)
where coalesce(is_admin, false) = true;

-- Keep is_admin always aligned with new role columns.
create or replace function public.sync_user_permissions_is_admin()
returns trigger
language plpgsql
as $$
begin
  new.is_admin := coalesce(new.is_super_admin, false) or coalesce(new.is_project_admin, false);
  return new;
end;
$$;

drop trigger if exists trg_sync_user_permissions_is_admin on public.user_permissions;
create trigger trg_sync_user_permissions_is_admin
before insert or update on public.user_permissions
for each row
execute function public.sync_user_permissions_is_admin();

-- Normalize existing rows before adding check.
update public.user_permissions
set is_admin = coalesce(is_super_admin, false) or coalesce(is_project_admin, false)
where is_admin is distinct from (coalesce(is_super_admin, false) or coalesce(is_project_admin, false));

-- Consistency rule: is_admin must match role expression exactly.
alter table if exists public.user_permissions
  drop constraint if exists user_permissions_admin_consistency_ck;

alter table if exists public.user_permissions
  add constraint user_permissions_admin_consistency_ck
  check (
    is_admin = (coalesce(is_super_admin, false) or coalesce(is_project_admin, false))
  );

create index if not exists user_permissions_super_admin_idx
  on public.user_permissions (is_super_admin)
  where is_super_admin = true;

create index if not exists user_permissions_project_admin_idx
  on public.user_permissions (is_project_admin)
  where is_project_admin = true;
