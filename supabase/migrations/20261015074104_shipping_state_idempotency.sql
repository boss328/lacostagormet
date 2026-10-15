begin;

-- Recompute item balances before preserving delivery. An order with newly
-- outstanding quantities must return to partial/unfulfilled even if its old
-- aggregate status was delivered.
create or replace function public.shipping_refresh_fulfillment(p_order_id uuid) returns text
language plpgsql security invoker set search_path = '' as $$
declare v_complete boolean; v_any boolean; v_status text;
begin
  perform id from public.orders where id=p_order_id for update;
  select bool_and(done >= quantity),bool_or(done > 0) into v_complete,v_any from (
    select i.quantity,
      case when exists(select 1 from public.vendor_orders v where v.order_id=i.order_id and v.vendor_id=i.assigned_vendor_id and v.status::text in ('shipped','delivered')) then i.quantity
      else coalesce((select sum(si.quantity) from public.local_shipment_items si join public.local_shipments s on s.id=si.shipment_id where si.order_item_id=i.id and s.status='shipped'),0) end done
    from public.order_items i where i.order_id=p_order_id
  ) quantities;
  select fulfillment_status::text into v_status from public.orders where id=p_order_id;
  if v_complete then
    if v_status <> 'delivered' then v_status:='shipped'; end if;
  elsif v_any then v_status:='partially_shipped';
  elsif v_status in ('shipped','delivered','partially_shipped') then v_status:='unfulfilled'; end if;
  update public.orders set fulfillment_status=v_status::public.fulfillment_status where id=p_order_id;
  return v_status;
end $$;

-- Retries must not change an existing dispatch time or regress a delivered PO.
-- Still refresh the order aggregate to account for outstanding local items.
create or replace function public.shipping_mark_vendor_shipped(p_po_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_order_id uuid; v_status text;
begin
  select order_id into v_order_id from public.vendor_orders where id=p_po_id;
  if v_order_id is null then raise exception 'Supplier PO not found'; end if;
  perform id from public.orders where id=v_order_id for update;
  if not exists(select 1 from public.orders where id=v_order_id and status::text='paid') then raise exception 'Order must be paid'; end if;
  select status::text into v_status from public.vendor_orders where id=p_po_id and order_id=v_order_id for update;
  if not found then raise exception 'Supplier PO not found'; end if;
  if v_status='cancelled' then raise exception 'Cancelled PO cannot be shipped'; end if;
  if v_status not in ('shipped','delivered') then
    update public.vendor_orders set status='shipped',shipped_at=now() where id=p_po_id;
  end if;
  perform public.shipping_refresh_fulfillment(v_order_id);
end $$;

revoke all on function public.shipping_refresh_fulfillment(uuid),public.shipping_mark_vendor_shipped(uuid) from public,anon,authenticated;
grant execute on function public.shipping_refresh_fulfillment(uuid),public.shipping_mark_vendor_shipped(uuid) to service_role;

commit;
