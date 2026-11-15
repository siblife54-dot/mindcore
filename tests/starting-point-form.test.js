"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const courseId = "course_1781255103582";
const formId = "94739b9b-fa30-4feb-83f2-6170ea460a9c";
const plain = value => JSON.parse(JSON.stringify(value));

function extract(source, name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert(match, `Missing function ${name}`);
  let depth = 0;
  for (let i = source.indexOf("{", match.index); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(match.index, i + 1);
  }
  throw new Error(`Incomplete function ${name}`);
}

const context = vm.createContext({ URLSearchParams, console: { log() {}, warn() {} }, location: { search: "?course=" + courseId } });
context.window = context;
for (const file of ["config.js", "locales/ru.js", "locales/tr.js", "localization.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}
context.MindCoreI18n.setLanguage("tr");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
for (const name of ["t", "getConfig", "getActiveCourseId", "applyCourseFormOverrides", "renderCourseFormIntro", "normalizeFormSchema", "normalizeFormSettings", "normalizeMultipleChoiceAnswer", "getAnswerSummaryItems", "getFormAnswerSummaryItems", "buildFormSummary", "escapeHtml", "isUuid", "getFormFieldSelector", "getCourseFormDataSelector", "saveCourseFormAnswer"]) {
  vm.runInContext(extract(source, name), context);
}

const original = {
  id: formId, course_id: courseId, title: "Başlangıç Noktanız", description: "Old introduction",
  form_schema: { questions: [{ id: "problems", type: "multiple_choice", options: ["Goal A", "Goal B"], allow_other: true, required: true }] },
  settings: { allow_edit: false, submission_mode: "once", show_on_home: true }
};
const before = plain(original);
const form = context.applyCourseFormOverrides(original);
assert.deepEqual(original, before, "Presentation overrides must not mutate the database row");
assert.equal(form.id, original.id);
assert.equal(form.course_id, original.course_id);
assert.equal(form.settings.allow_edit, false);
assert.equal(form.settings.submission_mode, "once");
assert.equal(form.settings.show_on_home, true);
assert.equal(form.title, "BAŞLANGIÇ NOKTANIZ | A NOKTASI");
const questions = context.normalizeFormSchema(form.form_schema);
assert.equal(questions.length, 1);
assert.equal(questions[0].id, "problems");
assert.equal(questions[0].type, "multiple_choice", "The persisted answer structure must remain compatible");
assert.equal(questions[0].textOnly, true);
assert.equal(questions[0].allowOther, true);
assert.equal(questions[0].labelHidden, true);
assert.equal(questions[0].options.length, 0);
assert.equal(context.normalizeFormSchema(original.form_schema)[0].textOnly, false);

context.location.search = "?c=1781255103582";
assert.equal(context.applyCourseFormOverrides(original).title, form.title);
context.location.search = "?course=another&c=1781255103582";
assert.equal(context.applyCourseFormOverrides(original), original);
context.location.search = "?course=" + courseId;
const other = { ...original, id: "different-form" };
assert.equal(context.applyCourseFormOverrides(other), other);
const foreign = { ...original, course_id: "another" };
assert.equal(context.applyCourseFormOverrides(foreign), foreign);

const intro = context.renderCourseFormIntro(form);
assert.equal((intro.match(/<li>/g) || []).length, 3);
assert(intro.includes("<strong>Bugün bu eğitime hangi noktadan başlıyorsunuz?</strong>"));
assert(intro.includes("<strong>Unutmayın,"));
assert(!intro.includes("<input"));
const escaped = context.renderCourseFormIntro({ intro_blocks: [{ text: '<img src=x onerror="bad()">', bold: true }, { items: ["<script>bad()</script>"] }] });
assert(!escaped.includes("<img") && !escaped.includes("<script>"));
assert(escaped.includes("&lt;img") && escaped.includes("&lt;script&gt;"));

const text = "Şişkinlik ve nefes kontrolü.\n\nBeklentilerim: daha rahat hissetmek. <test>";
const answers = { problems: { selected: [], other: text } };
assert.deepEqual(plain(context.buildFormSummary(form, answers)), [text]);
const legacy = { problems: { selected: ["Goal A", "Goal B"], other: "Previous free answer" } };
assert.deepEqual(plain(context.getFormAnswerSummaryItems(form, { answers_json: legacy })), ["Goal A", "Goal B", "Previous free answer"]);
assert.deepEqual(plain(context.getFormAnswerSummaryItems(form, { answers_json: JSON.stringify(answers) })), [text]);

async function save(value, { fail = false, existing = null } = {}) {
  const input = { value, focused: false, focus() { this.focused = true; } };
  const error = { hidden: true, textContent: "" };
  let payload, writes = 0, reads = 0, view;
  const editor = {
    querySelectorAll(selector) {
      if (selector === "[data-course-form-error]") return [error];
      throw new Error("Text-only mode must not read selected checkboxes: " + selector);
    },
    querySelector(selector) {
      if (selector.startsWith("[data-course-form-other-input=")) return input;
      if (selector.startsWith("[data-course-form-error=")) return error;
      if (selector.startsWith("[data-course-form-other-toggle=")) return null;
      throw new Error("Unexpected selector " + selector);
    }
  };
  context.document = { getElementById: () => editor };
  context.PRODUCT_USER = { id: "00000000-0000-4000-8000-000000000001", webapp_user_id: "00000000-0000-4000-8000-000000000002" };
  context.COURSE_FORM_ANSWERS = {};
  context.renderCourseForms = async () => {};
  context.renderCourseFormView = (selectedForm, answer) => { view = answer; };
  context.getSupabaseClient = () => ({ from(table) {
    assert.equal(table, "course_form_answers");
    const chain = {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { reads++; return { data: existing, error: null }; },
      insert(value) { writes++; payload = plain(value); return this; },
      update() { throw new Error("Read-only historical answers must not be overwritten"); },
      async single() { return fail ? { data: null, error: { code: "fixture_failure" } } : { data: { ...payload, id: "00000000-0000-4000-8000-000000000003" }, error: null }; }
    };
    return chain;
  } });
  const result = await context.saveCourseFormAnswer(form, questions, null);
  return { result, payload, writes, reads, error, input, view };
}

(async () => {
  const empty = await save(" \n ");
  assert.equal(empty.result, false);
  assert.equal(empty.writes, 0);
  assert.equal(empty.reads, 0);
  assert.equal(empty.error.hidden, false);
  assert.equal(empty.error.textContent, "Lütfen yanıtınızı yazın.");
  assert.equal(empty.input.focused, true);

  const saved = await save("  " + text + "  ");
  assert.equal(saved.result, true);
  assert.equal(saved.writes, 1);
  assert.equal(saved.payload.form_id, formId);
  assert.equal(saved.payload.course_id, courseId);
  assert.deepEqual(saved.payload.answers_json, answers);
  assert.deepEqual(saved.payload.summary, [text]);
  assert.equal(saved.payload.status, "submitted");

  const failed = await save(text, { fail: true });
  assert.equal(failed.result, false);
  assert.equal(failed.input.value, text);
  assert.equal(failed.view, undefined);

  const existing = { id: "old-answer", answers_json: legacy, summary: ["Goal A", "Goal B", "Previous free answer"] };
  const duplicate = await save(text, { existing });
  assert.equal(duplicate.writes, 0);
  assert.equal(duplicate.view, existing, "Existing once-only records must retain their original answers");

  const admin = vm.createContext({ console, getStudentFormsState: () => ({ loaded: true, loading: false, forms: [original], answersByFormId: { [formId]: saved.view } }), formatStudentDate: () => "date" });
  const adminSource = fs.readFileSync(path.join(root, "admin.js"), "utf8");
  for (const name of ["flattenFormAnswerValue", "getAnswerSummaryItems", "escapeHtml", "StudentFormsSections"]) vm.runInContext(extract(adminSource, name), admin);
  assert.deepEqual(plain(admin.getAnswerSummaryItems(saved.view)), [text]);
  const teacherView = admin.StudentFormsSections({});
  assert(teacherView.includes("Şişkinlik ve nefes kontrolü."));
  assert(teacherView.includes("&lt;test&gt;") && !teacherView.includes("<test>"));
  assert(!teacherView.includes("Goal A"), "New submissions must send only the student's own text");
  console.log("Starting-point form tests passed: scoped copy, unchanged answer JSON, legacy records, validation, save errors and teacher display");
})().catch(error => { console.error(error); process.exitCode = 1; });
