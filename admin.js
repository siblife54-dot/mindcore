(function () {
  "use strict";

  var state = {
    lessons: [],
    selectedLesson: null,
    blocks: []
  };

  function getConfig() {
    return window.APP_CONFIG || {};
  }

  function getClient() {
    return window.getSupabaseClient();
  }

  async function fetchLessons() {
    var client = getClient();
    var config = getConfig();

    if (!client) throw new Error("Supabase client not initialized");

    var result = await client
      .from("lessons")
      .select("*")
      .eq("course_id", config.courseId)
      .order("day_number", { ascending: true });

    if (result.error) {
      console.error(result.error);
      throw new Error("Не удалось загрузить уроки");
    }

    return result.data || [];
  }

  async function fetchLessonBlocks(lessonDbId) {
    var client = getClient();

    if (!client) throw new Error("Supabase client not initialized");

    var result = await client
      .from("lesson_blocks")
      .select("*")
      .eq("lesson_id", lessonDbId)
      .order("sort_order", { ascending: true });

    if (result.error) {
      console.error(result.error);
      throw new Error("Не удалось загрузить блоки урока");
    }

    return result.data || [];
  }

  function renderLessonsList() {
    var lessonsList = document.getElementById("lessonsList");
    var selectedId = state.selectedLesson ? state.selectedLesson.id : null;

    lessonsList.innerHTML = state.lessons.map(function (lesson) {
      var isActive = selectedId === lesson.id;
      return [
        '<button class="admin-lesson-item' + (isActive ? ' active' : '') + '" data-lesson-db-id="' + lesson.id + '" type="button">',
        '<div><strong>' + escapeHtml(lesson.title || "Без названия") + '</strong></div>',
        '<div>lesson_id: ' + escapeHtml(lesson.lesson_id || "") + '</div>',
        '<div>День: ' + escapeHtml(String(lesson.day_number || "")) + '</div>',
        '</button>'
      ].join("");
    }).join("");
  }

  function renderEditor() {
    var empty = document.getElementById("editorEmpty");
    var panel = document.getElementById("editorPanel");

    if (!state.selectedLesson) {
      empty.hidden = false;
      panel.hidden = true;
      return;
    }

    empty.hidden = true;
    panel.hidden = false;

    var lesson = state.selectedLesson;

    document.getElementById("editorLessonTitle").textContent = lesson.title || "Урок";
    document.getElementById("lessonIdInput").value = lesson.lesson_id || "";
    document.getElementById("dayNumberInput").value = lesson.day_number || "";
    document.getElementById("titleInput").value = lesson.title || "";
    document.getElementById("subtitleInput").value = lesson.subtitle || "";

    renderBlocksList();
  }

  function renderBlocksList() {
    var blocksList = document.getElementById("blocksList");

    if (!state.blocks.length) {
      blocksList.innerHTML = '<div class="admin-empty">У этого урока пока нет блоков</div>';
      return;
    }

    blocksList.innerHTML = state.blocks.map(function (block, index) {
      var preview = "";

      if (block.block_type === "html") {
        preview = block.content_html || "";
      } else if (block.content_json) {
        preview = "<pre>" + escapeHtml(JSON.stringify(block.content_json, null, 2)) + "</pre>";
      }

      return [
        '<div class="admin-block-item" data-block-id="' + block.id + '">',
        '<div><strong>Блок #' + (index + 1) + '</strong></div>',
        '<div>Тип: ' + escapeHtml(block.block_type || "") + '</div>',
        '<div>Порядок: ' + escapeHtml(String(block.sort_order || 0)) + '</div>',
        '<div class="admin-block-preview" style="margin-top:12px;">' + preview + '</div>',
        '</div>'
      ].join("");
    }).join("");
  }

  async function selectLessonById(lessonDbId) {
    var lesson = state.lessons.find(function (item) {
      return String(item.id) === String(lessonDbId);
    });

    if (!lesson) return;

    state.selectedLesson = lesson;
    state.blocks = await fetchLessonBlocks(lesson.id);

    renderLessonsList();
    renderEditor();
  }

  async function createBlock() {
    if (!state.selectedLesson) return;

    var client = getClient();

    var nextOrder = 1;

    if (state.blocks.length) {
      nextOrder = Math.max.apply(null, state.blocks.map(function (b) {
        return b.sort_order || 0;
      })) + 1;
    }

    var result = await client
      .from("lesson_blocks")
      .insert({
        lesson_id: state.selectedLesson.id,
        sort_order: nextOrder,
        block_type: "html",
        content_html: `<div class="lesson-block">
<h3>Новый блок</h3>
<p>Напишите текст...</p>
</div>`
      })
      .select();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания блока");
      return;
    }

    state.blocks.push(result.data[0]);
    renderBlocksList();
  }

  function bindEvents() {
    document.getElementById("lessonsList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-lesson-db-id]");
      if (!button) return;

      var lessonDbId = button.getAttribute("data-lesson-db-id");
      void selectLessonById(lessonDbId);
    });

    document.getElementById("addBlockBtn").addEventListener("click", function () {
      void createBlock();
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function init() {
    document.getElementById("adminCourseLabel").textContent = getConfig().courseId || "Без courseId";

    bindEvents();

    state.lessons = await fetchLessons();
    renderLessonsList();

    if (state.lessons.length) {
      await selectLessonById(state.lessons[0].id);
    }
  }

  init().catch(function (error) {
    console.error(error);
    var empty = document.getElementById("editorEmpty");
    empty.hidden = false;
    empty.textContent = error.message || "Ошибка загрузки админки";
  });
})();
