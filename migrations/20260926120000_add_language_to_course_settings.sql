alter table public.course_settings
add column if not exists language text not null default 'ru';

update public.course_settings set language = 'ru'
where language is null or language not in ('ru', 'tr');

alter table public.course_settings drop constraint if exists course_settings_language_check;
alter table public.course_settings add constraint course_settings_language_check check (language in ('ru', 'tr'));

comment on column public.course_settings.language is
  'WebApp interface language for this course. Supported values: ru, tr.';
