const assert = require("assert");
const fs = require("fs");

const admin = fs.readFileSync("admin.js", "utf8");
const adminHtml = fs.readFileSync("admin.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const migration = fs.readFileSync("migrations/20260928120000_add_lesson_audio.sql", "utf8");
const ru = fs.readFileSync("locales/ru.js", "utf8");
const tr = fs.readFileSync("locales/tr.js", "utf8");

assert(adminHtml.includes('data-material-type="audio"'));
assert(admin.includes('.from("lesson-audio")'));
assert(admin.includes('.getPublicUrl(path)'));
assert(admin.includes('ALLOWED_AUDIO_EXTENSIONS = ["mp3", "m4a"]'));
assert(admin.includes('"audio/m4a"'));
assert(admin.includes("MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024"));
assert(admin.includes('.eq("audio_url", audioUrl).limit(1)'));
assert(admin.includes('async function updateAudioTitle(blockId, audioTitle)'));
assert(admin.includes('if (!audioFile && existingAudio)'));
assert(admin.includes('return removeUnreferencedAudio(uploadedAudioUrl)'));
assert(admin.includes('var lessonAudioUrls = []'));
assert(admin.includes('var blockAudioUrls = Array.from(new Set'));
assert(admin.includes('await removeUnreferencedAudio(lessonAudioUrls[audioIndex])'));
assert(admin.includes('await removeUnreferencedAudio(blockAudioUrls[audioIndex])'));
assert(app.includes('item.item_type === "audio"'));
assert(app.includes("audio.playbackRate"));
assert(app.includes('class="lesson-audio-player__seek"'));
assert(css.includes("var(--accent)"));
assert(ru.includes('"lesson.audioPlay"'));
assert(tr.includes('"lesson.audioPlay"'));
assert(migration.includes("add column if not exists audio_url text"));
assert(migration.includes("'lesson-audio'"));
assert(migration.includes("52428800"));
assert(migration.includes("'audio/m4a'"));

console.log("lesson audio checks passed");
