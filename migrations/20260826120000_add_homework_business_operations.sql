create or replace function public.submit_homework_attempt(
  p_homework_id uuid,
  p_product_user_id uuid,
  p_student_text text
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
  v_student_text text;
  v_next_attempt_number integer;
  v_text_allowed boolean := false;
begin
  v_student_text := pg_catalog.btrim(p_student_text);
  if v_student_text is null or v_student_text = '' then
    raise exception using errcode = 'P0001', message = 'student_text_required';
  end if;

  select homework.*
    into v_homework
    from public.lesson_homeworks as homework
   where homework.id = p_homework_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'homework_not_found';
  end if;
  if v_homework.is_enabled is distinct from true then
    raise exception using errcode = 'P0001', message = 'homework_disabled';
  end if;

  select lesson.*
    into v_lesson
    from public.lessons as lesson
   where lesson.id = v_homework.lesson_id;
  if not found or v_lesson.course_id is null then
    raise exception using errcode = 'P0001', message = 'homework_invariant_error';
  end if;

  if not exists (
    select 1
      from public.product_users as product_user
     where product_user.id = p_product_user_id
       and product_user.course_id = v_lesson.course_id
  ) then
    raise exception using errcode = 'P0001', message = 'homework_course_mismatch';
  end if;

  -- Keep the operation compatible with the response-mode representation already
  -- present in lesson_homeworks while accepting only the literal mode "text".
  v_homework_json := pg_catalog.to_jsonb(v_homework);
  v_text_allowed :=
    case
      when pg_catalog.jsonb_typeof(v_homework_json -> 'allowed_response_types') = 'array'
        then (v_homework_json -> 'allowed_response_types') ? 'text'
      when pg_catalog.jsonb_typeof(v_homework_json -> 'response_types') = 'array'
        then (v_homework_json -> 'response_types') ? 'text'
      else coalesce(
        v_homework_json ->> 'response_type',
        v_homework_json ->> 'submission_type',
        v_homework_json ->> 'answer_type'
      ) = 'text'
    end;
  if v_text_allowed is distinct from true then
    raise exception using errcode = 'P0001', message = 'text_response_not_allowed';
  end if;

  -- Serialize the initial insert as well as resubmissions. The row lock below
  -- then protects an existing submission; the unique attempt constraint is a
  -- final database-level guard.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_homework_id::text || ':' || p_product_user_id::text, 0)
  );

  select submission.*
    into v_submission
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

    select coalesce(pg_catalog.max(attempt.attempt_number), 0) + 1
      into v_next_attempt_number
      from public.homework_attempts as attempt
     where attempt.submission_id = v_submission.id;

    if v_next_attempt_number <= 1 then
      raise exception using errcode = 'P0001', message = 'homework_invariant_error';
    end if;
  end if;

  insert into public.homework_attempts (
    submission_id,
    attempt_number,
    student_text,
    status
  ) values (
    v_submission.id,
    v_next_attempt_number,
    v_student_text,
    'pending_review'
  ) returning * into v_attempt;

  if v_submission.status <> 'pending_review' then
    update public.homework_submissions as submission
       set status = 'pending_review'
     where submission.id = v_submission.id;
  end if;

  return query select
    v_submission.id,
    v_attempt.id,
    v_attempt.attempt_number,
    v_attempt.status::text;
end;
$function$;

create or replace function public.review_homework_submission(
  p_submission_id uuid,
  p_action text,
  p_review_comment text,
  p_account_id bigint
)
returns table (
  submission_id uuid,
  attempt_id uuid,
  status text,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_submission public.homework_submissions%rowtype;
  v_attempt public.homework_attempts%rowtype;
  v_review_comment text;
  v_new_status text;
  v_reviewed_at timestamptz := pg_catalog.now();
  v_course_id text;
begin
  if p_action is null or p_action not in ('accept', 'request_revision') then
    raise exception using errcode = 'P0001', message = 'invalid_review_action';
  end if;

  v_review_comment := nullif(pg_catalog.btrim(p_review_comment), '');
  if p_action = 'request_revision' and v_review_comment is null then
    raise exception using errcode = 'P0001', message = 'review_comment_required';
  end if;

  select submission.*
    into v_submission
    from public.homework_submissions as submission
   where submission.id = p_submission_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'submission_not_found';
  end if;

  select lesson.course_id
    into v_course_id
    from public.lesson_homeworks as homework
    join public.lessons as lesson on lesson.id = homework.lesson_id
   where homework.id = v_submission.homework_id;
  if not found or v_course_id is null then
    raise exception using errcode = 'P0001', message = 'homework_invariant_error';
  end if;

  if p_account_id is null or not exists (
    select 1
      from public.courses as course
     where course.course_id = v_course_id
       and course.account_id = p_account_id
  ) then
    raise exception using errcode = 'P0001', message = 'course_forbidden';
  end if;

  if v_submission.status <> 'pending_review' then
    raise exception using errcode = 'P0001', message = 'submission_not_pending';
  end if;

  select attempt.*
    into v_attempt
    from public.homework_attempts as attempt
   where attempt.submission_id = v_submission.id
   order by attempt.attempt_number desc
   limit 1
   for update;
  if not found or v_attempt.status <> 'pending_review' then
    raise exception using errcode = 'P0001', message = 'homework_invariant_error';
  end if;

  v_new_status := case p_action
    when 'accept' then 'accepted'
    else 'revision_requested'
  end;

  update public.homework_attempts as attempt
     set status = v_new_status,
         review_comment = v_review_comment,
         reviewed_at = v_reviewed_at
   where attempt.id = v_attempt.id;

  update public.homework_submissions as submission
     set status = v_new_status
   where submission.id = v_submission.id;

  return query select
    v_submission.id,
    v_attempt.id,
    v_new_status,
    v_reviewed_at;
end;
$function$;

revoke execute on function public.submit_homework_attempt(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.review_homework_submission(uuid, text, text, bigint)
  from public, anon, authenticated;

grant execute on function public.submit_homework_attempt(uuid, uuid, text)
  to service_role;
grant execute on function public.review_homework_submission(uuid, text, text, bigint)
  to service_role;
