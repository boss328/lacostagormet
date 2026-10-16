begin;

create table public.shipping_box_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  length_in double precision not null check (length_in > 0 and length_in <= 108),
  width_in double precision not null check (width_in > 0 and width_in <= 108),
  height_in double precision not null check (height_in > 0 and height_in <= 108),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index shipping_box_templates_name_key
  on public.shipping_box_templates (lower(btrim(name)));

alter table public.shipping_box_templates enable row level security;
revoke all on public.shipping_box_templates from public,anon,authenticated;
grant select,insert,update,delete on public.shipping_box_templates to service_role;

-- A timestamp is the edit token. Advance it even for two writes in one instant,
-- and ignore client-provided replacement timestamps.
create function public.shipping_touch_box_template() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;

create trigger shipping_box_template_updated
  before update on public.shipping_box_templates
  for each row execute function public.shipping_touch_box_template();

revoke all on function public.shipping_touch_box_template() from public,anon,authenticated;
grant execute on function public.shipping_touch_box_template() to service_role;

commit;
