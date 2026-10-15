begin;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;
create table public.local_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  status text not null default 'draft' check (status in ('draft','purchasing','unknown','label_created','shipped','failed','cancelled')),
  external_id text unique not null,
  parcel jsonb not null default '{}', destination jsonb not null default '{}',
  rates jsonb not null default '[]', quoted_at timestamptz,
  provider_shipment_id text, label_id text unique, label_download_url text,
  label_format text not null default '4x6', carrier text, service text,
  postage numeric(10,2), tracking_number text, tracking_url text,
  last_error text, created_at timestamptz not null default now(), shipped_at timestamptz,
  notification_state text not null default 'idle' check (notification_state in ('idle','sending','sent','failed')),
  notification_attempt_at timestamptz, notification_claimed_at timestamptz, notification_sent_at timestamptz
);
create index local_shipments_order_idx on public.local_shipments(order_id);
create table public.local_shipment_items (
  shipment_id uuid not null references public.local_shipments(id),
  order_item_id uuid not null references public.order_items(id),
  quantity integer not null check (quantity > 0),
  primary key (shipment_id,order_item_id)
);
create index local_shipment_items_item_idx on public.local_shipment_items(order_item_id);
alter table public.local_shipments enable row level security;
alter table public.local_shipment_items enable row level security;
revoke all on public.local_shipments,public.local_shipment_items from public,anon,authenticated;
grant all on public.local_shipments,public.local_shipment_items to service_role;

-- All fulfillment mutations serialize on the order row. No public RPC access.
create function public.shipping_refresh_fulfillment(p_order_id uuid) returns text
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
  if v_complete then v_status:='shipped';
  elsif v_any then v_status:='partially_shipped';
  elsif v_status in ('shipped','delivered','partially_shipped') then v_status:='unfulfilled'; end if;
  update public.orders set fulfillment_status=v_status::public.fulfillment_status where id=p_order_id;
  return v_status;
end $$;

create function public.shipping_mutate(p_order_id uuid,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype; s public.local_shipments%rowtype; i public.order_items%rowtype;
  item jsonb; q integer; used integer; rate jsonb; new_id uuid; remaining integer;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_action in ('reserve','manual') then
    if o.status::text <> 'paid' or o.fulfillment_status::text in ('shipped','delivered') then raise exception 'Only paid, unshipped items can be shipped'; end if;
    if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Select items to ship'; end if;
    if jsonb_array_length(p_payload->'items') not between 1 and 200 then raise exception 'Select items to ship'; end if;
    if p_action='manual' then
      if length(trim(coalesce(p_payload->>'tracking_number',''))) not between 3 and 100 then raise exception 'Valid tracking number required'; end if;
      if exists(select 1 from public.local_shipments where order_id=p_order_id and tracking_number=p_payload->>'tracking_number' and status<>'cancelled') then raise exception 'This tracking number is already recorded'; end if;
    end if;
    new_id:=gen_random_uuid();
    insert into public.local_shipments(id,order_id,external_id,parcel,destination,carrier,tracking_number,tracking_url)
      values(new_id,p_order_id,new_id::text,coalesce(p_payload->'parcel','{}'),o.shipping_address,
      case when p_action='manual' then p_payload->>'carrier' end,case when p_action='manual' then p_payload->>'tracking_number' end,case when p_action='manual' then p_payload->>'tracking_url' end) returning * into s;
    for item in select * from jsonb_array_elements(p_payload->'items') loop
      if jsonb_typeof(item->'quantity')<>'number' or (item->>'quantity') !~ '^[1-9][0-9]*$' then raise exception 'Positive whole quantities required'; end if;
      q:=(item->>'quantity')::integer;
      select * into i from public.order_items where id=(item->>'orderItemId')::uuid and order_id=p_order_id;
      if not found then raise exception 'Item does not belong to this order'; end if;
      if exists(select 1 from public.vendor_orders v where v.order_id=p_order_id and (i.assigned_vendor_id is null or v.vendor_id=i.assigned_vendor_id) and v.status::text<>'cancelled') then raise exception 'Resolve the supplier PO and item assignment before shipping this item locally'; end if;
      select coalesce(sum(si.quantity),0) into used from public.local_shipment_items si join public.local_shipments ls on ls.id=si.shipment_id where si.order_item_id=i.id and ls.status<>'cancelled';
      if q+used > i.quantity then raise exception 'Quantity exceeds the unshipped, unreserved balance'; end if;
      insert into public.local_shipment_items(shipment_id,order_item_id,quantity) values(s.id,i.id,q);
    end loop;
    if p_action='manual' then
      update public.local_shipments set status='shipped',shipped_at=now() where id=s.id returning * into s;
      perform public.shipping_refresh_fulfillment(p_order_id);
    end if;
    return to_jsonb(s);
  end if;
  select * into s from public.local_shipments where id=(p_payload->>'shipmentId')::uuid and order_id=p_order_id for update;
  if not found then raise exception 'Shipment not found'; end if;
  if p_action='save_rates' then
    if s.status<>'draft' then raise exception 'Shipment is no longer editable'; end if;
    update public.local_shipments set rates=p_payload->'rates',quoted_at=now(),provider_shipment_id=p_payload->>'providerShipmentId' where id=s.id returning * into s;
  elsif p_action='claim_purchase' then
    if s.status<>'draft' then return to_jsonb(s)||jsonb_build_object('claimed',false); end if;
    if o.status::text<>'paid' then raise exception 'Order is no longer paid'; end if;
    if s.quoted_at is null or s.quoted_at < now()-interval '20 minutes' then raise exception 'Rates expired. Cancel this draft and request fresh rates'; end if;
    select value into rate from jsonb_array_elements(s.rates) where value->>'rateId'=p_payload->>'rateId';
    if rate is null then raise exception 'Choose a rate quoted for this shipment'; end if;
    update public.local_shipments set status='purchasing',carrier=rate->>'carrier',service=rate->>'service',postage=(rate->>'amount')::numeric,last_error=null where id=s.id returning * into s;
    return to_jsonb(s)||jsonb_build_object('claimed',true);
  elsif p_action='store_label' then
    if s.status not in ('purchasing','unknown','label_created') then raise exception 'Shipment is not awaiting a label'; end if;
    if nullif(p_payload->>'label_id','') is null or nullif(p_payload->>'tracking_number','') is null then raise exception 'Incomplete label result'; end if;
    update public.local_shipments set status='label_created',label_id=p_payload->>'label_id',label_download_url=p_payload->>'label_download_url',tracking_number=p_payload->>'tracking_number',tracking_url=p_payload->>'tracking_url',provider_shipment_id=coalesce(p_payload->>'provider_shipment_id',provider_shipment_id),last_error=null where id=s.id returning * into s;
  elsif p_action='purchase_unknown' then
    update public.local_shipments set status='unknown',last_error='Purchase status is uncertain. Recover status; do not buy another label.' where id=s.id and status='purchasing' returning * into s;
  elsif p_action='rate_failed' then
    update public.local_shipments set status='failed',last_error='Rates were unavailable. Cancel this draft and check the address, package and account.' where id=s.id and status='draft' returning * into s;
  elsif p_action='cancel' then
    if s.status not in ('draft','failed') then raise exception 'Only unpurchased drafts may be cancelled here'; end if;
    update public.local_shipments set status='cancelled' where id=s.id returning * into s;
  elsif p_action='mark_shipped' then
    if s.status='shipped' then return to_jsonb(s); end if;
    if s.status<>'label_created' or o.status::text<>'paid' then raise exception 'A paid order and purchased label are required'; end if;
    update public.local_shipments set status='shipped',shipped_at=now() where id=s.id returning * into s;
    perform public.shipping_refresh_fulfillment(p_order_id);
  elsif p_action='claim_notification' then
    if s.status<>'shipped' or s.notification_state='sent' then return to_jsonb(s)||jsonb_build_object('claimed',false); end if;
    if s.notification_state='sending' and s.notification_claimed_at > now()-interval '2 minutes' then return to_jsonb(s)||jsonb_build_object('claimed',false); end if;
    -- Provider idempotency lasts 24h. Never automatically resend after that window.
    if s.notification_attempt_at < now()-interval '23 hours' then return to_jsonb(s)||jsonb_build_object('claimed',false); end if;
    update public.local_shipments set notification_state='sending',notification_attempt_at=coalesce(notification_attempt_at,now()),notification_claimed_at=now() where id=s.id returning * into s;
    return to_jsonb(s)||jsonb_build_object('claimed',true);
  elsif p_action='finish_notification' then
    update public.local_shipments set notification_state=case when (p_payload->>'ok')::boolean then 'sent' else 'failed' end,notification_sent_at=case when (p_payload->>'ok')::boolean then now() end where id=s.id and notification_state='sending' returning * into s;
  else raise exception 'Unknown shipment action'; end if;
  return to_jsonb(s);
end $$;

-- Supplier transitions share the order lock and account for local item balances.
create function public.shipping_mark_vendor_shipped(p_po_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_order_id uuid;
begin
  select order_id into v_order_id from public.vendor_orders where id=p_po_id;
  if v_order_id is null then raise exception 'Supplier PO not found'; end if;
  perform id from public.orders where id=v_order_id for update;
  if not exists(select 1 from public.orders where id=v_order_id and status::text='paid') then raise exception 'Order must be paid'; end if;
  update public.vendor_orders set status='shipped',shipped_at=now() where id=p_po_id and status::text<>'cancelled';
  if not found then raise exception 'Cancelled PO cannot be shipped'; end if;
  perform public.shipping_refresh_fulfillment(v_order_id);
end $$;

create function public.shipping_mark_order_manual(p_order_id uuid,p_tracking text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if length(trim(coalesce(p_tracking,''))) not between 3 and 100 then raise exception 'Valid tracking number required'; end if;
  if o.status::text<>'paid' then raise exception 'Order must be paid'; end if;
  if o.fulfillment_status::text in ('shipped','delivered') then return false; end if;
  if exists(select 1 from public.local_shipments where order_id=p_order_id and status<>'cancelled')
    or exists(select 1 from public.vendor_orders where order_id=p_order_id and status::text<>'cancelled') then
    raise exception 'Use the shipment or supplier controls to ship selected items on this order';
  end if;
  update public.orders set fulfillment_status='shipped',tracking_number=p_tracking,shipped_at=now(),admin_notes=concat_ws(E'\n',admin_notes,'['||now()||'] Shipped · tracking '||p_tracking) where id=p_order_id;
  return true;
end $$;

-- A supplier assignment must not overlap quantities reserved/shipped locally.
create function public.shipping_guard_vendor_assignment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform id from public.orders where id=new.order_id for update;
  if TG_TABLE_NAME='vendor_orders' then
    if new.status::text<>'cancelled' and exists(select 1 from public.order_items i join public.local_shipment_items si on si.order_item_id=i.id join public.local_shipments s on s.id=si.shipment_id where i.order_id=new.order_id and (i.assigned_vendor_id is null or i.assigned_vendor_id=new.vendor_id) and s.status<>'cancelled') then raise exception 'Items are reserved for local shipping'; end if;
  else
    if new.assigned_vendor_id is distinct from old.assigned_vendor_id and exists(select 1 from public.local_shipment_items si join public.local_shipments s on s.id=si.shipment_id where si.order_item_id=new.id and s.status<>'cancelled') then raise exception 'Cannot reassign an item reserved for local shipping'; end if;
  end if;
  return new;
end $$;
create trigger shipping_guard_po before insert or update of status,vendor_id on public.vendor_orders for each row execute function public.shipping_guard_vendor_assignment();
create trigger shipping_guard_assignment before update of assigned_vendor_id on public.order_items for each row execute function public.shipping_guard_vendor_assignment();

revoke all on function public.shipping_refresh_fulfillment(uuid),public.shipping_mutate(uuid,text,jsonb),public.shipping_mark_vendor_shipped(uuid),public.shipping_mark_order_manual(uuid,text),public.shipping_guard_vendor_assignment() from public,anon,authenticated;
grant execute on function public.shipping_refresh_fulfillment(uuid),public.shipping_mutate(uuid,text,jsonb),public.shipping_mark_vendor_shipped(uuid),public.shipping_mark_order_manual(uuid,text),public.shipping_guard_vendor_assignment() to service_role;
commit;
