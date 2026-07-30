create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id bigint not null
    references public.accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint admin_sessions_expires_after_creation_check
    check (expires_at > created_at)
);

create index admin_sessions_active_account_idx
  on public.admin_sessions (account_id, expires_at)
  where revoked_at is null;

create index admin_sessions_expires_at_idx
  on public.admin_sessions (expires_at);

alter table public.admin_sessions enable row level security;

revoke all privileges on table public.admin_sessions
  from public, anon, authenticated;

grant all privileges on table public.admin_sessions
  to service_role;

create function public.hash_admin_session_token(p_token text)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog, extensions
as $function$
begin
  if p_token is null or p_token = '' then
    raise exception using
      errcode = 'P0001',
      message = 'admin_session_token_required';
  end if;

  return encode(digest(p_token, 'sha256'), 'hex');
end;
$function$;

revoke execute on function public.hash_admin_session_token(text)
  from public, anon, authenticated;

grant execute on function public.hash_admin_session_token(text)
  to service_role;
