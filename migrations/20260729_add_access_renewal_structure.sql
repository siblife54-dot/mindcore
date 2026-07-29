alter table public.course_settings
add column if not exists renewal_enabled boolean not null default false;

comment on column public.course_settings.renewal_enabled is
  'Включает или отключает функцию платного продления доступа для конкретного курса';

create table if not exists public.course_renewal_settings (
  course_id text primary key
    references public.course_settings(course_id) on delete cascade,
  show_before_days integer not null default 7,
  support_url text,
  support_label text not null default 'Связаться с поддержкой',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_renewal_settings_show_before_days_check
    check (show_before_days between 0 and 365),
  constraint course_renewal_settings_support_label_check
    check (char_length(btrim(support_label)) between 1 and 120)
);

comment on table public.course_renewal_settings is
  'Общие настройки продления конкретного курса';

create table if not exists public.course_renewal_options (
  id uuid primary key default gen_random_uuid(),
  course_id text not null
    references public.course_settings(course_id) on delete cascade,
  title text not null,
  days_to_add integer not null,
  price_minor bigint not null,
  currency text not null default 'RUB',
  description text,
  payment_url text not null,
  sort_order smallint not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_renewal_options_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint course_renewal_options_days_to_add_check check (days_to_add > 0),
  constraint course_renewal_options_price_minor_check check (price_minor >= 0),
  constraint course_renewal_options_currency_check check (char_length(currency) = 3),
  constraint course_renewal_options_payment_url_check check (btrim(payment_url) <> ''),
  constraint course_renewal_options_sort_order_check check (sort_order in (1, 2))
);

comment on column public.course_renewal_options.price_minor is
  'Стоимость в минимальных денежных единицах: для RUB — в копейках';

create unique index if not exists course_renewal_options_active_course_sort_order_idx
  on public.course_renewal_options (course_id, sort_order)
  where is_active = true;

create index if not exists course_renewal_options_course_active_sort_order_idx
  on public.course_renewal_options (course_id, is_active, sort_order);

create table if not exists public.access_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint generated always as identity unique,
  course_id text not null
    references public.course_settings(course_id) on delete restrict,
  product_user_id uuid not null
    references public.product_users(id) on delete restrict,
  renewal_option_id uuid
    references public.course_renewal_options(id) on delete set null,
  status text not null default 'pending_payment',
  user_display_name_snapshot text,
  user_first_name_snapshot text,
  user_last_name_snapshot text,
  platform_snapshot text,
  platform_user_id_snapshot text,
  telegram_id_snapshot text,
  username_snapshot text,
  contact_phone_snapshot text,
  contact_email_snapshot text,
  course_title_snapshot text not null,
  option_title_snapshot text not null,
  days_to_add_snapshot integer not null,
  price_minor_snapshot bigint not null,
  currency_snapshot text not null default 'RUB',
  option_description_snapshot text,
  payment_url_snapshot text not null,
  access_expires_at_before timestamptz,
  estimated_access_expires_at timestamptz not null,
  access_expires_at_after timestamptz,
  internal_comment text,
  confirmed_at timestamptz,
  payment_not_found_at timestamptz,
  cancelled_at timestamptz,
  success_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_renewal_requests_status_check
    check (status in ('pending_payment', 'confirmed', 'payment_not_found', 'cancelled')),
  constraint access_renewal_requests_days_to_add_snapshot_check
    check (days_to_add_snapshot > 0),
  constraint access_renewal_requests_price_minor_snapshot_check
    check (price_minor_snapshot >= 0),
  constraint access_renewal_requests_currency_snapshot_check
    check (char_length(currency_snapshot) = 3),
  constraint access_renewal_requests_payment_url_snapshot_check
    check (btrim(payment_url_snapshot) <> '')
);

create unique index if not exists access_renewal_requests_open_user_idx
  on public.access_renewal_requests (course_id, product_user_id)
  where status in ('pending_payment', 'payment_not_found');

create index if not exists access_renewal_requests_course_status_created_idx
  on public.access_renewal_requests (course_id, status, created_at desc);

create index if not exists access_renewal_requests_user_created_idx
  on public.access_renewal_requests (product_user_id, created_at desc);

create index if not exists access_renewal_requests_pending_course_created_idx
  on public.access_renewal_requests (course_id, created_at desc)
  where status = 'pending_payment';

create table if not exists public.user_access_history (
  id uuid primary key default gen_random_uuid(),
  course_id text not null
    references public.course_settings(course_id) on delete restrict,
  product_user_id uuid not null
    references public.product_users(id) on delete restrict,
  renewal_request_id uuid
    references public.access_renewal_requests(id) on delete set null,
  operation_type text not null,
  previous_access_expires_at timestamptz,
  new_access_expires_at timestamptz,
  previous_status text,
  new_status text,
  days_change integer,
  reason text,
  internal_comment text,
  performed_by_type text,
  performed_by_id text,
  performed_by_label text,
  created_at timestamptz not null default now(),
  constraint user_access_history_operation_type_check
    check (operation_type in (
      'initial_access',
      'paid_renewal',
      'manual_extension',
      'bonus_extension',
      'manual_date_change',
      'status_change'
    )),
  constraint user_access_history_performed_by_type_check
    check (performed_by_type in ('system', 'account', 'user') or performed_by_type is null)
);

create index if not exists user_access_history_user_created_idx
  on public.user_access_history (product_user_id, created_at desc);

create index if not exists user_access_history_course_created_idx
  on public.user_access_history (course_id, created_at desc);

create unique index if not exists user_access_history_renewal_request_idx
  on public.user_access_history (renewal_request_id)
  where renewal_request_id is not null;

alter table public.course_renewal_settings enable row level security;
alter table public.course_renewal_options enable row level security;
alter table public.access_renewal_requests enable row level security;
alter table public.user_access_history enable row level security;

revoke all privileges on table
  public.course_renewal_settings,
  public.course_renewal_options,
  public.access_renewal_requests,
  public.user_access_history
from anon, authenticated;

grant select, insert, update, delete on table
  public.course_renewal_settings,
  public.course_renewal_options,
  public.access_renewal_requests,
  public.user_access_history
to service_role;
