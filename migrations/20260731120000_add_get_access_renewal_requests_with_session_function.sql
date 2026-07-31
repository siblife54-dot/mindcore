create or replace function public.get_access_renewal_requests_with_session(
  p_session_token text,
  p_course_id text,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  request_number bigint,
  course_id text,
  product_user_id uuid,
  renewal_option_id uuid,
  status text,
  days_to_add_snapshot integer,
  price_minor_snapshot bigint,
  currency_snapshot text,
  access_expires_at_before timestamptz,
  estimated_access_expires_at timestamptz,
  created_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  internal_comment text,
  user_display_name text,
  product_user_status text,
  product_user_access_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_session_id public.admin_sessions.id%type;
  v_account_id public.admin_sessions.account_id%type;
  v_session_expires_at public.admin_sessions.expires_at%type;
  v_session_revoked_at public.admin_sessions.revoked_at%type;
  v_account_status public.accounts.status%type;
  v_course_account_id public.courses.account_id%type;
  v_now timestamptz := now();
begin
  if p_session_token is null
     or btrim(p_session_token) = ''
     or char_length(p_session_token) > 500 then
    raise exception using
      errcode = 'P0001',
      message = 'admin_session_token_required';
  end if;

  select
    admin_session.id,
    admin_session.account_id,
    admin_session.expires_at,
    admin_session.revoked_at,
    account.status
  into
    v_session_id,
    v_account_id,
    v_session_expires_at,
    v_session_revoked_at,
    v_account_status
  from public.admin_sessions as admin_session
  join public.accounts as account
    on account.id = admin_session.account_id
  where admin_session.token_hash = public.hash_admin_session_token(p_session_token)
  for update of admin_session;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'admin_session_invalid';
  end if;

  if v_session_revoked_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'admin_session_revoked';
  end if;

  if v_session_expires_at <= v_now then
    raise exception using
      errcode = 'P0001',
      message = 'admin_session_expired';
  end if;

  if v_account_status is distinct from 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'admin_account_inactive';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_limit_invalid';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_offset_invalid';
  end if;

  if p_status is not null
     and btrim(p_status) <> ''
     and p_status not in (
       'pending_payment',
       'confirmed',
       'payment_not_found',
       'cancelled'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_status_invalid';
  end if;

  select course.account_id
    into v_course_account_id
    from public.courses as course
   where course.course_id = p_course_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_course_not_found';
  end if;

  if v_course_account_id is distinct from v_account_id then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_forbidden';
  end if;

  update public.admin_sessions as admin_session
     set last_used_at = v_now
   where admin_session.id = v_session_id;

  return query
  select
    renewal_request.id,
    renewal_request.request_number,
    renewal_request.course_id,
    renewal_request.product_user_id,
    renewal_request.renewal_option_id,
    renewal_request.status,
    renewal_request.days_to_add_snapshot,
    renewal_request.price_minor_snapshot,
    renewal_request.currency_snapshot,
    renewal_request.access_expires_at_before,
    renewal_request.estimated_access_expires_at,
    renewal_request.created_at,
    renewal_request.confirmed_at,
    renewal_request.cancelled_at,
    renewal_request.internal_comment,
    product_user.user_display_name,
    product_user.status,
    product_user.access_expires_at
  from public.access_renewal_requests as renewal_request
  join public.product_users as product_user
    on product_user.id = renewal_request.product_user_id
   and product_user.course_id = renewal_request.course_id
  where renewal_request.course_id = p_course_id
    and (
      p_status is null
      or btrim(p_status) = ''
      or renewal_request.status = p_status
    )
  order by
    renewal_request.created_at desc,
    renewal_request.request_number desc
  limit p_limit
  offset p_offset;
end;
$function$;

revoke execute on function public.get_access_renewal_requests_with_session(
  text,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.get_access_renewal_requests_with_session(
  text,
  text,
  text,
  integer,
  integer
) to service_role;
