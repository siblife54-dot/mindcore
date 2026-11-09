# Telegram plan detection (administrative API)

This is an informational membership lookup, not proof of purchase or an access
control mechanism. It does not change student authorization, Homework operations,
`access_mode`, `access_config`, payments, or the frontend. No course is enabled by
the migration. No Telegram or database requests are made when the flag is off,
apart from administrative authorization and reading that course's flag.

## Deploy and configure manually

1. Review and apply `migrations/20261110090000_add_telegram_plan_detection.sql`.
   It adds `course_settings.telegram_plan_detection_enabled` (false by default)
   and `course_integrations.telegram_plan_channels` (empty JSON array by default).
   It does not seed channels, enable courses, or change existing RLS/GRANT.
2. Before enabling, verify the deployed `get_course_telegram_bot_token` RPC and its
   backing storage are restricted to trusted server callers. The repository
   contains its callers, but not its definition or deployed permissions. Also
   verify public clients cannot rewrite another student's Telegram identity or
   `product_users.webapp_user_id`, and cannot modify another course's settings.
   This endpoint reads the existing server-side identity relationship; it does
   not newly authenticate historical profiles or fix pre-existing database ACLs.
   Do not enable if these checks fail. Do not broaden permissions to deploy it.
3. Deploy `get-homework-student-plans` with the shared helper bundled from
   `supabase/functions/_shared/homework-auth.ts` (the Supabase CLI bundles relative
   imports). The runtime needs existing `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` bindings. It reads the bot token only through the
   existing per-course RPC. Preserve the project's existing gateway settings and
   verify an authorized call reaches the handler; do not globally disable JWT
   verification as a workaround. Use the same supported gateway arrangement as
   the existing administrative Homework Edge Functions.
4. On the existing `course_integrations` row for the verified NAULI `course_id`,
   set **only** `telegram_plan_channels` to the following JSON. Do not overwrite
   existing integration fields or replace the course's bot token:

   ```json
   [
     {"code":"TEMEL","label":"TEMEL","chat_id":"-1004456869611"},
     {"code":"YAKIN","label":"YAKIN","chat_id":"-1004450087197"},
     {"code":"OZEL","label":"ÖZEL","chat_id":"-1003814009713"}
   ]
   ```

   The configuration accepts one to three entries, unique codes and channel IDs,
   and only the three documented fields. `chat_id` is a string. No credentials
   belong in this JSON. The channel IDs and tariff labels above are deployment
   data, not hardcoded business logic.
5. Confirm the existing course bot is an administrator in each channel, then
   explicitly set the flag to true **only for the verified NAULI row**. No toggle
   is added. Rollback: set that row's flag to false; no stored results need removal.
6. Test with an actual course owner and students representing each channel, no
   channel, and multiple channels. Verify another course remains disabled and an
   unrelated account cannot query NAULI. No production deployment or live check
   was performed as part of implementation.

## Request

POST to `/functions/v1/get-homework-student-plans`, using the same gateway headers
as existing administrative Homework requests, plus `X-Admin-Session`. JSON body:

```json
{"course_id":"actual-course-id","product_user_id":"student-product-user-uuid"}
```

Only these two body fields are accepted. Telegram IDs, bot tokens, channel IDs,
account IDs and URLs are never accepted from the caller. The handler verifies
the session and course owner before reading settings or students. For enabled
courses it resolves the student within that course, then reads the linked
Telegram profile. Guest IDs, non-Telegram profiles and inconsistent IDs are
rejected as unavailable identities. It never writes data.

## Results

Successful responses use `ok: true`, echo the course/student IDs, and include
`status`, `plans: [{code, label}]` and `ambiguous`. Telegram/channel IDs and tokens
are not returned. All JSON responses specify `Cache-Control: no-store`.

| Status | Meaning |
| --- | --- |
| `disabled` | No explicit true flag; no profile, token or Telegram lookup |
| `identity_unavailable` | No usable, consistent Telegram profile |
| `detected` | All channels checked; exactly one membership |
| `ambiguous` | All channels checked; multiple memberships; all found plans returned |
| `no_membership` | All channels checked successfully; no membership |
| `telegram_error` | At least one check failed; found plans are partial observations |

Completed Telegram checks additionally return `complete` and `checked_at`.
For `telegram_error`, `complete` is false. `ambiguous` means at least two
memberships were positively found; false with `complete: false` does not prove a
unique result. Never present a partial result as a definitive purchased plan.

Membership includes `creator`, `administrator`, `member`, and `restricted` with
`is_member: true`. `left`, `kicked`, and `restricted` with `is_member: false` mean
absence. Unknown/malformed results, non-success HTTP responses (including 429),
Telegram API errors and timeouts are technical errors, never absence. Each of
at most three concurrent checks has a five-second timeout. There are no retries
or persistent caches. Never log upstream errors containing token-bearing URLs.

Request-level failures use `ok: false` and an error code: 400 `invalid_request`,
401 `invalid_admin_session`, 403 `course_access_denied`, 404 `student_not_found`
(including a student from another course), 409 `configuration_error`, or 500
`server_error`. Disabled courses return no student existence information.

## Validation and next stage

Use Node.js 24 and run `npm test` and `npm run test:telegram-plans`. The latter
executes the TypeScript handler and actual shared admin-auth helpers using
Node's built-in TypeScript transform, with DB and Telegram transport replaced
by fixtures. It does not verify deployed RLS, real bot rights or live membership.

Next stage: request plans separately from the Homework queue, cache briefly by
`course_id + product_user_id`, and display labels next to the student in list and
detail. Deduplicate students and bound frontend concurrency. Clear the cache
when changing courses/accounts; ignore stale responses. Lookup failures must
not block viewing or reviewing Homework. This stage adds no such UI changes.
