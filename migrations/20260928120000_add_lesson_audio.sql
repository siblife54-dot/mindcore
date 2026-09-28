-- Apply manually in the Supabase SQL editor. This migration is not applied by the app.
alter table public.lesson_block_items
  add column if not exists audio_url text,
  add column if not exists audio_title text;

-- Replace item_type CHECK constraints in place, preserving the existing allowed values
-- and adding `audio`. This is resilient to project-specific constraint names.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.lesson_block_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%item_type%'
  loop
    execute format('alter table public.lesson_block_items drop constraint %I', constraint_record.conname);
  end loop;
end $$;

alter table public.lesson_block_items
  add constraint lesson_block_items_item_type_check
  check (item_type in ('text', 'video', 'image', 'file', 'audio'));

-- Public bucket shared by every course. Supabase may enforce a lower project-wide
-- upload limit; raise that limit before applying if 50 MB is not currently allowed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-audio',
  'lesson-audio',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp4', 'audio/x-m4a']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage authorization must remain identical to lesson-images. Copy the existing
-- lesson-images INSERT/UPDATE/DELETE policies in the Dashboard and change only the
-- bucket_id condition to: bucket_id = 'lesson-audio'. Do not add broader policies.
