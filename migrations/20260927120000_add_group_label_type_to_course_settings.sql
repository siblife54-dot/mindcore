alter table public.course_settings
add column if not exists group_label_type text not null default 'auto';

alter table public.course_settings drop constraint if exists course_settings_group_label_type_check;
alter table public.course_settings add constraint course_settings_group_label_type_check
  check (group_label_type in ('auto', 'week', 'module', 'section', 'none'));

comment on column public.course_settings.group_label_type is
  'Course section label style. Supported values: auto, week, module, section, none.';
