create or replace function public.confirm_access_renewal_request(
  p_request_id uuid,
  p_performed_by_id text,
  p_performed_by_label text default null,
  p_internal_comment text default null
)
returns table (
  request_id uuid,
  request_status text,
  product_user_id uuid,
  previous_access_expires_at timestamptz,
  new_access_expires_at timestamptz,
  previous_status text,
  new_status text,
  confirmed_at timestamptz,
  already_confirmed boolean
)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_request public.access_renewal_requests%rowtype;
  v_product_user public.product_users%rowtype;
  v_now timestamptz := now();
  v_new_access_expires_at timestamptz;
  v_history public.user_access_history%rowtype;
begin
  select renewal_request.*
    into v_request
    from public.access_renewal_requests as renewal_request
   where renewal_request.id = p_request_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_not_found';
  end if;

  if v_request.status = 'confirmed' then
    select access_history.*
      into v_history
      from public.user_access_history as access_history
     where access_history.renewal_request_id = v_request.id;

    return query
    select
      v_request.id,
      v_request.status,
      v_request.product_user_id,
      coalesce(v_history.previous_access_expires_at, v_request.access_expires_at_before),
      v_request.access_expires_at_after,
      v_history.previous_status,
      coalesce(v_history.new_status, 'active'::text),
      v_request.confirmed_at,
      true;
    return;
  elsif v_request.status = 'cancelled' then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_cancelled';
  elsif v_request.status not in ('pending_payment', 'payment_not_found') then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_invalid_status';
  end if;

  if v_request.days_to_add_snapshot is null
     or v_request.days_to_add_snapshot <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_invalid_days';
  end if;

  select product_user.*
    into v_product_user
    from public.product_users as product_user
   where product_user.id = v_request.product_user_id
     and product_user.course_id = v_request.course_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_product_user_not_found';
  end if;

  v_new_access_expires_at :=
    case
      when v_product_user.access_expires_at is not null
       and v_product_user.access_expires_at > v_now
        then v_product_user.access_expires_at
      else v_now
    end
    + make_interval(days => v_request.days_to_add_snapshot);

  update public.product_users as product_user
     set access_expires_at = v_new_access_expires_at,
         status = 'active',
         updated_at = v_now
   where product_user.id = v_product_user.id
     and product_user.course_id = v_product_user.course_id;

  update public.access_renewal_requests as renewal_request
     set status = 'confirmed',
         confirmed_at = v_now,
         access_expires_at_after = v_new_access_expires_at,
         internal_comment = case
           when p_internal_comment is not null then p_internal_comment
           else renewal_request.internal_comment
         end,
         updated_at = v_now
   where renewal_request.id = v_request.id;

  insert into public.user_access_history (
    course_id,
    product_user_id,
    renewal_request_id,
    operation_type,
    previous_access_expires_at,
    new_access_expires_at,
    previous_status,
    new_status,
    days_change,
    reason,
    internal_comment,
    performed_by_type,
    performed_by_id,
    performed_by_label
  ) values (
    v_request.course_id,
    v_request.product_user_id,
    v_request.id,
    'paid_renewal',
    v_product_user.access_expires_at,
    v_new_access_expires_at,
    v_product_user.status,
    'active',
    v_request.days_to_add_snapshot,
    'Подтверждено платное продление доступа',
    p_internal_comment,
    'account',
    p_performed_by_id,
    p_performed_by_label
  );

  return query
  select
    v_request.id,
    'confirmed'::text,
    v_request.product_user_id,
    v_product_user.access_expires_at,
    v_new_access_expires_at,
    v_product_user.status,
    'active'::text,
    v_now,
    false;
end;
$function$;

revoke execute on function public.confirm_access_renewal_request(uuid, text, text, text)
  from public, anon, authenticated;

grant execute on function public.confirm_access_renewal_request(uuid, text, text, text)
  to service_role;
