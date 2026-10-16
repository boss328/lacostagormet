begin;

-- Warehouse records are used only by authenticated server-side admin routes.
-- Remove inherited table grants as RLS does not restrict operations like TRUNCATE.
alter table public.vendor_warehouses enable row level security;
revoke all on public.vendor_warehouses from public,anon,authenticated;
grant select,insert,update,delete on public.vendor_warehouses to service_role;

commit;
