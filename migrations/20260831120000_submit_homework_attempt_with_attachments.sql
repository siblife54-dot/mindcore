create or replace function public.submit_homework_attempt_with_attachments(
  p_homework_id uuid,
  p_product_user_id uuid,
  p_student_text text,
  p_attachments jsonb
)
returns table (
  submission_id uuid,
  attempt_id uuid,
  attempt_number integer,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_homework public.lesson_homeworks%rowtype;
  v_homework_json jsonb;
  v_lesson public.lessons%rowtype;
  v_submission public.homework_submissions%rowtype;
  v_attempt public.homework_attempts%rowtype;
  v_attachment jsonb;
  v_student_text text := nullif(pg_catalog.btrim(p_student_text), '');
  v_next_attempt_number integer;
  v_allowed jsonb;
begin
  if pg_catalog.jsonb_typeof(p_attachments) <> 'array'
     or pg_catalog.jsonb_array_length(p_attachments) not between 1 and 10 then
    raise exception using errcode = 'P0001', message = 'invalid_attachments';
  end if;

  select homework.* into v_homework
    from public.lesson_homeworks as homework
   where homework.id = p_homework_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'homework_not_found';
  end if;
  if v_homework.is_enabled is distinct from true then
    raise exception using errcode = 'P0001', message = 'homework_disabled';
  end if;

  select lesson.* into v_lesson
    from public.lessons as lesson where lesson.id = v_homework.lesson_id;
  if not found or v_lesson.course_id is null then
    raise exception using errcode = 'P0001', message = 'homework_invariant_error';
  end if;
  if not exists (
    select 1 from public.product_users as product_user
     where product_user.id = p_product_user_id
       and product_user.course_id = v_lesson.course_id
  ) then
    raise exception using errcode = 'P0001', message = 'homework_course_mismatch';
  end if;

  v_homework_json := pg_catalog.to_jsonb(v_homework);
  v_allowed := v_homework_json -> 'allowed_response_types';
  if pg_catalog.jsonb_typeof(v_allowed) <> 'array' then
    raise exception using errcode = 'P0001', message = 'homework_invariant_error';
  end if;
  if v_student_text is not null and not (v_allowed ? 'text') then
    raise exception using errcode = 'P0001', message = 'text_response_not_allowed';
  end if;

  for v_attachment in select value from pg_catalog.jsonb_array_elements(p_attachments)
  loop
    if pg_catalog.jsonb_typeof(v_attachment) <> 'object'
       or pg_catalog.coalesce(pg_catalog.btrim(v_attachment ->> 'storage_path'), '') = ''
       or pg_catalog.coalesce(pg_catalog.btrim(v_attachment ->> 'original_name'), '') = ''
       or pg_catalog.char_length(pg_catalog.btrim(v_attachment ->> 'original_name')) > 255
       or (v_attachment ->> 'attachment_type') not in ('image', 'video', 'file')
       or pg_catalog.coalesce(pg_catalog.btrim(v_attachment ->> 'mime_type'), '') = ''
       or not ((v_attachment ->> 'size_bytes') ~ '^[0-9]+$')
       or (v_attachment ->> 'size_bytes')::numeric <= 0
       or (v_attachment ->> 'size_bytes')::numeric > 9223372036854775807 then
      raise exception using errcode = 'P0001', message = 'invalid_attachments';
    end if;
    if not (v_allowed ? (v_attachment ->> 'attachment_type')) then
      raise exception using errcode = 'P0001', message = 'attachment_response_not_allowed';
    end if;
  end loop;

  if (select pg_catalog.count(distinct value ->> 'storage_path')
        from pg_catalog.jsonb_array_elements(p_attachments))
     <> pg_catalog.jsonb_array_length(p_attachments) then
    raise exception using errcode = 'P0001', message = 'invalid_attachments';
  end if;
  if exists (
    select 1 from public.homework_attachments as existing
    join pg_catalog.jsonb_array_elements(p_attachments) as supplied
      on existing.storage_path = supplied.value ->> 'storage_path'
  ) then
    raise exception using errcode = 'P0001', message = 'attachment_already_used';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_homework_id::text || ':' || p_product_user_id::text, 0)
  );
  select submission.* into v_submission
    from public.homework_submissions as submission
   where submission.homework_id = p_homework_id
     and submission.product_user_id = p_product_user_id
   for update;
  if not found then
    insert into public.homework_submissions (homework_id, product_user_id, status)
    values (p_homework_id, p_product_user_id, 'pending_review')
    returning * into v_submission;
    v_next_attempt_number := 1;
  else
    if v_submission.status = 'pending_review' then
      raise exception using errcode = 'P0001', message = 'submission_pending_review';
    elsif v_submission.status = 'accepted' then
      raise exception using errcode = 'P0001', message = 'submission_already_accepted';
    elsif v_submission.status <> 'revision_requested' then
      raise exception using errcode = 'P0001', message = 'homework_invariant_error';
    end if;
    select pg_catalog.coalesce(pg_catalog.max(attempt.attempt_number), 0) + 1
      into v_next_attempt_number
      from public.homework_attempts as attempt
     where attempt.submission_id = v_submission.id;
    if v_next_attempt_number <= 1 then
      raise exception using errcode = 'P0001', message = 'homework_invariant_error';
    end if;
  end if;

  insert into public.homework_attempts (submission_id, attempt_number, student_text, status)
  values (v_submission.id, v_next_attempt_number, v_student_text, 'pending_review')
  returning * into v_attempt;

  begin
    insert into public.homework_attachments (
      attempt_id, attachment_type, storage_path, original_name, mime_type, size_bytes
    )
    select v_attempt.id, item.attachment_type, item.storage_path,
           item.original_name, item.mime_type, item.size_bytes
      from pg_catalog.jsonb_to_recordset(p_attachments) as item(
        storage_path text, attachment_type text, original_name text,
        mime_type text, size_bytes bigint
      );
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'attachment_already_used';
  end;

  if v_submission.status <> 'pending_review' then
    update public.homework_submissions as submission set status = 'pending_review'
     where submission.id = v_submission.id;
  end if;
  return query select v_submission.id, v_attempt.id, v_attempt.attempt_number, v_attempt.status::text;
end;
$function$;

revoke execute on function public.submit_homework_attempt_with_attachments(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_homework_attempt_with_attachments(uuid, uuid, text, jsonb)
  to service_role;
