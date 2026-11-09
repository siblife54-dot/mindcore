-- Schema only: no course is enabled and no production configuration is seeded.
alter table public.course_settings
  add column if not exists telegram_plan_detection_enabled boolean not null default false;

alter table public.course_integrations
  add column if not exists telegram_plan_channels jsonb not null default '[]'::jsonb;

alter table public.course_integrations
  add constraint course_integrations_telegram_plan_channels_array_check
  check (jsonb_typeof(telegram_plan_channels) = 'array');

comment on column public.course_integrations.telegram_plan_channels is
  'Per-course array of {code, label, chat_id}; never store bot tokens here. Empty disables configuration.';
