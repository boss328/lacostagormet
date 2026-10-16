begin;

-- A pending PO with a claimed send remains reserved until its email outcome is
-- reconciled. Never clear this automatically after a timeout or failed response.
alter table public.vendor_orders
  add column if not exists email_send_started_at timestamptz;

-- The supplier dispatch RPC must not bypass an unresolved email send claim.
create or replace function public.shipping_mark_vendor_shipped(p_po_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_order_id uuid; v_status text; v_send_started_at timestamptz;
begin
  select order_id into v_order_id from public.vendor_orders where id=p_po_id;
  if v_order_id is null then raise exception 'Supplier PO not found'; end if;
  perform id from public.orders where id=v_order_id for update;
  if not exists(select 1 from public.orders where id=v_order_id and status::text='paid') then raise exception 'Order must be paid'; end if;
  select status::text,email_send_started_at into v_status,v_send_started_at from public.vendor_orders where id=p_po_id and order_id=v_order_id for update;
  if not found then raise exception 'Supplier PO not found'; end if;
  if v_status='cancelled' then raise exception 'Cancelled PO cannot be shipped'; end if;
  if v_status='pending' and v_send_started_at is not null then raise exception 'Verify the supplier email send before marking this PO shipped'; end if;
  if v_status not in ('shipped','delivered') then
    update public.vendor_orders set status='shipped',shipped_at=now() where id=p_po_id;
  end if;
  perform public.shipping_refresh_fulfillment(v_order_id);
end $$;

revoke all on function public.shipping_mark_vendor_shipped(uuid) from public,anon,authenticated;
grant execute on function public.shipping_mark_vendor_shipped(uuid) to service_role;

commit;
