create function public.confirm_access_renewal_request_with_session(
  p_request_id uuid,
  p_session_token text,
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
set search_path = pg_catalog, public
as $function$
declare
  v_session_id public.admin_sessions.id%type;
  v_account_id public.admin_sessions.account_id%type;
  v_session_expires_at public.admin_sessions.expires_at%type;
  v_session_revoked_at public.admin_sessions.revoked_at%type;
  v_account_status public.accounts.status%type;
  v_account_login public.accounts.login%type;
  v_account_full_name public.accounts.full_name%type;
  v_account_company_name public.accounts.company_name%type;
  v_course_id public.access_renewal_requests.course_id%type;
  v_performed_by_label text;
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
    account.status,
    account.login,
    account.full_name,
    account.company_name
  into
    v_session_id,
    v_account_id,
    v_session_expires_at,
    v_session_revoked_at,
    v_account_status,
    v_account_login,
    v_account_full_name,
    v_account_company_name
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

  select renewal_request.course_id
    into v_course_id
    from public.access_renewal_requests as renewal_request
   where renewal_request.id = p_request_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_not_found';
  end if;

  perform 1
    from public.courses as course
   where course.course_id = v_course_id
     and course.account_id = v_account_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'renewal_request_forbidden';
  end if;

  v_performed_by_label := case
    when nullif(btrim(v_account_full_name), '') is not null
      then btrim(v_account_full_name)
    when nullif(btrim(v_account_company_name), '') is not null
      then btrim(v_account_company_name)
    when nullif(btrim(v_account_login), '') is not null
      then btrim(v_account_login)
    else 'Аккаунт #' || v_account_id::text
  end;

  update public.admin_sessions as admin_session
     set last_used_at = v_now
   where admin_session.id = v_session_id;

  return query
  select confirmation.*
    from public.confirm_access_renewal_request(
      p_request_id,
      v_account_id::text,
      v_performed_by_label,
      p_internal_comment
    ) as confirmation;
end;
$function$;

revoke execute on function public.confirm_access_renewal_request_with_session(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.confirm_access_renewal_request_with_session(uuid, text, text)
  to service_role;
