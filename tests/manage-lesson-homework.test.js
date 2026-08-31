const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(
  __dirname, "..", "supabase", "functions", "manage-lesson-homework", "index.ts",
), "utf8");
const lessonRead = source.indexOf('.from("lessons")');
const ownership = source.indexOf("String(courseResult.data.account_id) !== String(context.accountId)");
const homeworkRead = source.indexOf('.from("lesson_homeworks")');

assert(source.indexOf("resolveAdminContext(supabase, sessionToken)") < lessonRead);
assert(lessonRead < ownership && ownership < homeworkRead);
assert(source.includes('.from("courses").select("course_id, account_id")'));
assert(!source.includes("input.account_id") && !source.includes("input.course_id"));
const getBranch = source.indexOf('if (input.action === "get")');
const getDefault = source.indexOf("exists: false", getBranch);
const upsert = source.indexOf(".upsert(", getBranch);
assert(getBranch > ownership && getDefault > getBranch && getDefault < upsert);
assert(source.includes('.upsert({ lesson_id: input.lesson_id, ...homeworkInput }, { onConflict: "lesson_id" })'));
for (const value of ["text", "image", "file", "video"]) assert(source.includes(`"${value}"`));
for (const value of ["independent", "after_submission", "after_approval"]) assert(source.includes(`"${value}"`));
assert(!source.includes("../_shared"));

console.log("Manage lesson homework Edge Function static checks passed");
