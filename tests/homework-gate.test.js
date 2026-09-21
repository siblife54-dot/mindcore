const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const js = fs.readFileSync("app.js", "utf8");
const helpersStart = js.indexOf("  function getHomeworkGateState(homework)");
const helpersEnd = js.indexOf("  async function fetchStudentHomeworks()", helpersStart);
assert(helpersStart >= 0 && helpersEnd > helpersStart, "Homework gate helpers must be defined before the Homework API client");

const helperSource = js.slice(helpersStart, helpersEnd);
const context = {};
vm.runInNewContext(
  `${helperSource}\nthis.gate = { getHomeworkGateState, buildHomeworkByLesson, getLessonHomeworkGateState, getLessonCompletionControlState };`,
  context
);
const { getHomeworkGateState, buildHomeworkByLesson, getLessonHomeworkGateState, getLessonCompletionControlState } = context.gate;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepStrictEqual(plain(getHomeworkGateState(null)), {
  satisfied: true, rule: "none", reason: "no_homework"
});
for (const malformedHomework of [undefined, "homework", 101, []]) {
  assert.deepStrictEqual(plain(getHomeworkGateState(malformedHomework)), {
    satisfied: false, rule: "unknown", reason: "invalid_homework"
  });
}
assert.deepStrictEqual(plain(getHomeworkGateState({ unlock_rule: " independent ", submission: null })), {
  satisfied: true, rule: "independent", reason: "independent"
});

function homework(rule, status) {
  return { unlock_rule: rule, submission: status === null ? null : { status } };
}

assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_submission", null))), {
  satisfied: false, rule: "after_submission", reason: "needs_submission"
});
for (const status of ["pending_review", "revision_requested", "accepted"]) {
  assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_submission", status))), {
    satisfied: true, rule: "after_submission", reason: "submitted"
  });
}
assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_approval", null))), {
  satisfied: false, rule: "after_approval", reason: "needs_submission"
});
for (const status of ["pending_review", "revision_requested"]) {
  assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_approval", status))), {
    satisfied: false, rule: "after_approval", reason: status
  });
}
assert.deepStrictEqual(plain(getHomeworkGateState(homework("after_approval", "accepted"))), {
  satisfied: true, rule: "after_approval", reason: "accepted"
});
assert.deepStrictEqual(plain(getHomeworkGateState({ unlock_rule: " future_rule ", submission: {} })), {
  satisfied: false, rule: "future_rule", reason: "unknown_rule"
});

const input = [
  { lesson_id: 101, unlock_rule: "independent", submission: null },
  { lesson_id: "102", unlock_rule: "after_approval", submission: { status: "accepted" } }
];
const inputSnapshot = JSON.stringify(input);
const byLesson = buildHomeworkByLesson(input);
assert.deepStrictEqual(Object.keys(byLesson), ["101", "102"]);
assert.strictEqual(byLesson["101"], input[0]);
assert.deepStrictEqual(plain(getLessonHomeworkGateState({ id: 102 }, byLesson)), {
  satisfied: true, rule: "after_approval", reason: "accepted"
});
assert.strictEqual(JSON.stringify(input), inputSnapshot, "helpers must not mutate Homework input");
assert.deepStrictEqual(plain(getLessonHomeworkGateState({ id: 999 }, byLesson)), {
  satisfied: true, rule: "none", reason: "no_homework"
});

const completionState = (completed, gate) => plain(getLessonCompletionControlState(completed, gate));
assert.deepStrictEqual(completionState(true, null), {
  disabled: true, text: "Пройдено ✓", reason: "completed"
});
for (const gate of [
  getHomeworkGateState(null),
  getHomeworkGateState(homework("independent", null)),
  getHomeworkGateState(homework("after_submission", "pending_review")),
  getHomeworkGateState(homework("after_submission", "revision_requested")),
  getHomeworkGateState(homework("after_approval", "accepted"))
]) {
  assert.strictEqual(completionState(false, gate).disabled, false);
  assert.strictEqual(completionState(false, gate).text, "Отметить как пройдено");
}
assert.deepStrictEqual(completionState(false, getHomeworkGateState(homework("after_submission", null))), {
  disabled: true, text: "Сначала отправьте домашнее задание", reason: "needs_submission"
});
assert.strictEqual(completionState(false, getHomeworkGateState(homework("after_approval", null))).disabled, true);
assert.deepStrictEqual(completionState(false, getHomeworkGateState(homework("after_approval", "pending_review"))), {
  disabled: true, text: "Домашнее задание на проверке", reason: "pending_review"
});
assert.deepStrictEqual(completionState(false, getHomeworkGateState(homework("after_approval", "revision_requested"))), {
  disabled: true, text: "Требуется доработка", reason: "revision_requested"
});
for (const gate of [
  null,
  getHomeworkGateState(undefined),
  getHomeworkGateState({ unlock_rule: "future_rule", submission: null }),
  getHomeworkGateState(homework("after_approval", "future_status"))
]) {
  assert.strictEqual(completionState(false, gate).disabled, true);
  assert.strictEqual(completionState(false, gate).text, "Не удалось проверить домашнее задание");
}
assert.deepStrictEqual(completionState(false, { satisfied: false, reason: "loading" }), {
  disabled: true, text: "Проверяем домашнее задание...", reason: "loading"
});

// Gate helpers must not touch I/O or existing accessibility flows.
for (const forbidden of ["document", "fetch(", "localStorage", "APP_STORAGE", "completedLessons"]) {
  assert(!helperSource.includes(forbidden), `pure helpers must not reference ${forbidden}`);
}
const accessibilityStart = js.indexOf("  function getMaxCompletedDayNumber(");
const accessibilityEnd = js.indexOf("  function isDebugMode()", accessibilityStart);
const accessibilitySource = js.slice(accessibilityStart, accessibilityEnd);
assert(!/Homework|homework/.test(accessibilitySource), "accessibility behavior must not use Homework yet");

const renderLessonStart = js.indexOf("  async function renderLesson(lessons)");
const renderLessonEnd = js.indexOf("  function pluralizeRu", renderLessonStart);
const completionSource = js.slice(renderLessonStart, renderLessonEnd);
assert(completionSource.includes('reason: "loading"'));
assert(completionSource.includes("resolvedHomeworkGate.satisfied !== true"));
assert(completionSource.includes("updateCompletionControl(null)"), "Homework errors must fail closed");
assert.strictEqual((completionSource.match(/fetchStudentHomeworks\(\)/g) || []).length, 1);
assert(completionSource.includes("!isPreviewMode() && Boolean(getTelegramInitData())"));
assert(completionSource.includes("resolvedHomeworkGate = getHomeworkGateState(updatedHomework)"));
assert(js.includes("await saveCompleted(completed)"), "completedLessons persistence must remain present");

for (const table of ["lesson_homeworks", "homework_submissions", "homework_attempts", "homework_attachments"]) {
  assert(!js.includes(`.from("${table}")`), `app.js must not directly access ${table}`);
}
assert(!helperSource.includes("supabase"), "gate helpers must not introduce backend access");

console.log("Homework gate regression assertions passed");
