create or replace function public.get_course_renewal_settings_with_session(
  p_session_token text,
  p_course_id text
)
returns table (
  course_id text,
  renewal_enabled boolean,
  show_before_days integer,
  support_url text,
  support_label text,
  options jsonb
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
    raise exception using errcode = 'P0001', message = 'admin_session_token_required';
  end if;

  select admin_session.id,
         admin_session.account_id,
         admin_session.expires_at,
         admin_session.revoked_at,
         account.status
    into v_session_id,
         v_account_id,
         v_session_expires_at,
         v_session_revoked_at,
         v_account_status
    from public.admin_sessions as admin_session
    join public.accounts as account on account.id = admin_session.account_id
   where admin_session.token_hash = public.hash_admin_session_token(p_session_token)
   for update of admin_session;

  if not found then
    raise exception using errcode = 'P0001', message = 'admin_session_invalid';
  end if;
  if v_session_revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'admin_session_revoked';
  end if;
  if v_session_expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'admin_session_expired';
  end if;
  if v_account_status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'admin_account_inactive';
  end if;

  select course.account_id
    into v_course_account_id
    from public.courses as course
   where course.course_id = p_course_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'renewal_course_not_found';
  end if;
  if v_course_account_id is distinct from v_account_id then
    raise exception using errcode = 'P0001', message = 'renewal_settings_forbidden';
  end if;

  update public.admin_sessions as admin_session
     set last_used_at = v_now
   where admin_session.id = v_session_id;

  return query
  select course_setting.course_id,
         course_setting.renewal_enabled,
         coalesce(renewal_setting.show_before_days, 7),
         renewal_setting.support_url,
         coalesce(renewal_setting.support_label, 'Связаться с поддержкой'),
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', renewal_option.id,
               'title', renewal_option.title,
               'days_to_add', renewal_option.days_to_add,
               'price_minor', renewal_option.price_minor,
               'currency', renewal_option.currency,
               'description', renewal_option.description,
               'payment_url', renewal_option.payment_url,
               'sort_order', renewal_option.sort_order,
               'is_active', renewal_option.is_active
             ) order by renewal_option.sort_order
           ) filter (where renewal_option.id is not null),
           '[]'::jsonb
         ) as options
    from public.course_settings as course_setting
    left join public.course_renewal_settings as renewal_setting
      on renewal_setting.course_id = course_setting.course_id
    left join public.course_renewal_options as renewal_option
      on renewal_option.course_id = course_setting.course_id
     and renewal_option.is_active = true
   where course_setting.course_id = p_course_id
   group by course_setting.course_id,
            course_setting.renewal_enabled,
            renewal_setting.show_before_days,
            renewal_setting.support_url,
            renewal_setting.support_label;
end;
$function$;

revoke execute on function public.get_course_renewal_settings_with_session(text, text)
  from public, anon, authenticated;
grant execute on function public.get_course_renewal_settings_with_session(text, text)
  to service_role;

create or replace function public.save_course_renewal_settings_with_session(
  p_session_token text,
  p_course_id text,
  p_renewal_enabled boolean,
  p_show_before_days integer,
  p_support_url text,
  p_support_label text,
  p_options jsonb
)
returns table (
  course_id text,
  renewal_enabled boolean,
  show_before_days integer,
  support_url text,
  support_label text,
  options jsonb
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
  v_support_url text;
  v_support_label text;
  v_option jsonb;
  v_option_count integer;
  v_title text;
  v_days_to_add integer;
  v_price_minor bigint;
  v_currency text;
  v_description text;
  v_payment_url text;
  v_sort_order smallint;
  v_seen_sort_orders smallint[] := '{}'::smallint[];
begin
  if p_session_token is null
     or btrim(p_session_token) = ''
     or char_length(p_session_token) > 500 then
    raise exception using errcode = 'P0001', message = 'admin_session_token_required';
  end if;

  select admin_session.id,
         admin_session.account_id,
         admin_session.expires_at,
         admin_session.revoked_at,
         account.status
    into v_session_id,
         v_account_id,
         v_session_expires_at,
         v_session_revoked_at,
         v_account_status
    from public.admin_sessions as admin_session
    join public.accounts as account on account.id = admin_session.account_id
   where admin_session.token_hash = public.hash_admin_session_token(p_session_token)
   for update of admin_session;

  if not found then
    raise exception using errcode = 'P0001', message = 'admin_session_invalid';
  end if;
  if v_session_revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'admin_session_revoked';
  end if;
  if v_session_expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'admin_session_expired';
  end if;
  if v_account_status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'admin_account_inactive';
  end if;

  select course.account_id
    into v_course_account_id
    from public.courses as course
   where course.course_id = p_course_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'renewal_course_not_found';
  end if;
  if v_course_account_id is distinct from v_account_id then
    raise exception using errcode = 'P0001', message = 'renewal_settings_forbidden';
  end if;

  if p_renewal_enabled is null
     or p_show_before_days is null
     or p_show_before_days < 0
     or p_show_before_days > 365 then
    raise exception using errcode = 'P0001', message = 'renewal_settings_invalid';
  end if;

  v_support_url := nullif(btrim(p_support_url), '');
  if v_support_url is not null and char_length(v_support_url) > 2000 then
    raise exception using errcode = 'P0001', message = 'renewal_settings_support_url_invalid';
  end if;

  if p_support_label is null then
    raise exception using errcode = 'P0001', message = 'renewal_settings_support_label_invalid';
  end if;
  v_support_label := btrim(p_support_label);
  if char_length(v_support_label) < 1 or char_length(v_support_label) > 120 then
    raise exception using errcode = 'P0001', message = 'renewal_settings_support_label_invalid';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception using errcode = 'P0001', message = 'renewal_options_invalid';
  end if;
  v_option_count := jsonb_array_length(p_options);
  if v_option_count > 2 or (p_renewal_enabled and v_option_count = 0) then
    raise exception using errcode = 'P0001', message = 'renewal_options_invalid';
  end if;

  for v_option in select value from jsonb_array_elements(p_options)
  loop
    if jsonb_typeof(v_option) <> 'object'
       or v_option ?| array['course_id', 'is_active', 'created_at', 'updated_at', 'account_id'] then
      raise exception using errcode = 'P0001', message = 'renewal_options_invalid';
    end if;

    if jsonb_typeof(v_option -> 'title') is distinct from 'string' then
      raise exception using errcode = 'P0001', message = 'renewal_option_title_invalid';
    end if;
    v_title := btrim(v_option ->> 'title');
    if char_length(v_title) < 1 or char_length(v_title) > 120 then
      raise exception using errcode = 'P0001', message = 'renewal_option_title_invalid';
    end if;

    if jsonb_typeof(v_option -> 'days_to_add') is distinct from 'number'
       or (v_option ->> 'days_to_add') !~ '^-?[0-9]+$'
       or (v_option ->> 'days_to_add')::numeric <= 0
       or (v_option ->> 'days_to_add')::numeric > 3650 then
      raise exception using errcode = 'P0001', message = 'renewal_option_days_invalid';
    end if;
    v_days_to_add := (v_option ->> 'days_to_add')::integer;

    if jsonb_typeof(v_option -> 'price_minor') is distinct from 'number'
       or (v_option ->> 'price_minor') !~ '^-?[0-9]+$'
       or (v_option ->> 'price_minor')::numeric < 0
       or (v_option ->> 'price_minor')::numeric > 1000000000000 then
      raise exception using errcode = 'P0001', message = 'renewal_option_price_invalid';
    end if;
    v_price_minor := (v_option ->> 'price_minor')::bigint;

    if jsonb_typeof(v_option -> 'currency') is distinct from 'string' then
      raise exception using errcode = 'P0001', message = 'renewal_option_currency_invalid';
    end if;
    v_currency := upper(btrim(v_option ->> 'currency'));
    if char_length(v_currency) <> 3 then
      raise exception using errcode = 'P0001', message = 'renewal_option_currency_invalid';
    end if;

    if v_option ? 'description'
       and jsonb_typeof(v_option -> 'description') not in ('string', 'null') then
      raise exception using errcode = 'P0001', message = 'renewal_option_description_invalid';
    end if;
    v_description := nullif(btrim(v_option ->> 'description'), '');
    if v_description is not null and char_length(v_description) > 2000 then
      raise exception using errcode = 'P0001', message = 'renewal_option_description_invalid';
    end if;

    if jsonb_typeof(v_option -> 'payment_url') is distinct from 'string' then
      raise exception using errcode = 'P0001', message = 'renewal_option_payment_url_invalid';
    end if;
    v_payment_url := btrim(v_option ->> 'payment_url');
    if char_length(v_payment_url) < 1 or char_length(v_payment_url) > 2000 then
      raise exception using errcode = 'P0001', message = 'renewal_option_payment_url_invalid';
    end if;

    if jsonb_typeof(v_option -> 'sort_order') is distinct from 'number'
       or (v_option ->> 'sort_order') !~ '^[0-9]+$'
       or (v_option ->> 'sort_order')::numeric not in (1, 2) then
      raise exception using errcode = 'P0001', message = 'renewal_option_sort_order_invalid';
    end if;
    v_sort_order := (v_option ->> 'sort_order')::smallint;
    if v_sort_order = any(v_seen_sort_orders) then
      raise exception using errcode = 'P0001', message = 'renewal_option_sort_order_duplicate';
    end if;
    v_seen_sort_orders := array_append(v_seen_sort_orders, v_sort_order);
  end loop;

  update public.admin_sessions as admin_session
     set last_used_at = v_now
   where admin_session.id = v_session_id;

  update public.course_settings as course_setting
     set renewal_enabled = p_renewal_enabled
   where course_setting.course_id = p_course_id;

  insert into public.course_renewal_settings (
    course_id, show_before_days, support_url, support_label, updated_at
  ) values (
    p_course_id, p_show_before_days, v_support_url, v_support_label, v_now
  )
  on conflict (course_id) do update
    set show_before_days = excluded.show_before_days,
        support_url = excluded.support_url,
        support_label = excluded.support_label,
        updated_at = excluded.updated_at;

  for v_sort_order in 1..2
  loop
    select value
      into v_option
      from jsonb_array_elements(p_options)
     where (value ->> 'sort_order')::smallint = v_sort_order;

    if found then
      v_title := btrim(v_option ->> 'title');
      v_days_to_add := (v_option ->> 'days_to_add')::integer;
      v_price_minor := (v_option ->> 'price_minor')::bigint;
      v_currency := upper(btrim(v_option ->> 'currency'));
      v_description := nullif(btrim(v_option ->> 'description'), '');
      v_payment_url := btrim(v_option ->> 'payment_url');

      update public.course_renewal_options as renewal_option
         set title = v_title,
             days_to_add = v_days_to_add,
             price_minor = v_price_minor,
             currency = v_currency,
             description = v_description,
             payment_url = v_payment_url,
             is_active = true,
             updated_at = v_now
       where renewal_option.course_id = p_course_id
         and renewal_option.sort_order = v_sort_order
         and renewal_option.is_active = true;

      if not found then
        insert into public.course_renewal_options (
          course_id, title, days_to_add, price_minor, currency, description,
          payment_url, sort_order, is_active, updated_at
        ) values (
          p_course_id, v_title, v_days_to_add, v_price_minor, v_currency,
          v_description, v_payment_url, v_sort_order, true, v_now
        );
      end if;
    else
      update public.course_renewal_options as renewal_option
         set is_active = false,
             updated_at = v_now
       where renewal_option.course_id = p_course_id
         and renewal_option.sort_order = v_sort_order
         and renewal_option.is_active = true;
    end if;
  end loop;

  return query
  select course_setting.course_id,
         course_setting.renewal_enabled,
         renewal_setting.show_before_days,
         renewal_setting.support_url,
         renewal_setting.support_label,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', renewal_option.id,
               'title', renewal_option.title,
               'days_to_add', renewal_option.days_to_add,
               'price_minor', renewal_option.price_minor,
               'currency', renewal_option.currency,
               'description', renewal_option.description,
               'payment_url', renewal_option.payment_url,
               'sort_order', renewal_option.sort_order,
               'is_active', renewal_option.is_active
             ) order by renewal_option.sort_order
           ) filter (where renewal_option.id is not null),
           '[]'::jsonb
         ) as options
    from public.course_settings as course_setting
    join public.course_renewal_settings as renewal_setting
      on renewal_setting.course_id = course_setting.course_id
    left join public.course_renewal_options as renewal_option
      on renewal_option.course_id = course_setting.course_id
     and renewal_option.is_active = true
   where course_setting.course_id = p_course_id
   group by course_setting.course_id,
            course_setting.renewal_enabled,
            renewal_setting.show_before_days,
            renewal_setting.support_url,
            renewal_setting.support_label;
end;
$function$;

revoke execute on function public.save_course_renewal_settings_with_session(
  text, text, boolean, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.save_course_renewal_settings_with_session(
  text, text, boolean, integer, text, text, jsonb
) to service_role;
