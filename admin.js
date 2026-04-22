(function () {
  "use strict";

  var state = {
    lessons: [],
    selectedLesson: null,
    blocks: [],
    blockItemsByBlockId: {},
    quills: {},
    activeSectionId: null,
    activeSectionTab: "text"
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
      throw new Error("Не удалось загрузить секции урока");
    }

    return result.data || [];
  }

  async function fetchItemsForBlocks(blockIds) {
    var client = getClient();
    if (!client || !blockIds.length) return [];

    var result = await client
      .from("lesson_block_items")
      .select("*")
      .in("block_id", blockIds)
      .order("sort_order", { ascending: true });

    if (result.error) {
      console.error(result.error);
      alert("Ошибка загрузки данных секции");
      return [];
    }

    return result.data || [];
  }

  function setItemsByBlock(items) {
    state.blockItemsByBlockId = {};
    state.blocks.forEach(function (block) {
      state.blockItemsByBlockId[String(block.id)] = [];
    });

    items.forEach(function (item) {
      var key = String(item.block_id);
      if (!state.blockItemsByBlockId[key]) {
        state.blockItemsByBlockId[key] = [];
      }
      state.blockItemsByBlockId[key].push(item);
    });
  }

  function getItems(blockId) {
    return state.blockItemsByBlockId[String(blockId)] || [];
  }

  function getTextItem(blockId) {
    return getItems(blockId).find(function (item) {
      return item.item_type === "text";
    }) || null;
  }

  function getVideoItems(blockId) {
    return getItems(blockId).filter(function (item) {
      return item.item_type === "video";
    });
  }

  function getFileItems(blockId) {
    return getItems(blockId).filter(function (item) {
      return item.item_type === "file";
    });
  }

  function getNextBlockItemOrder(blockId) {
    var items = getItems(blockId);
    if (!items.length) return 1;

    return Math.max.apply(null, items.map(function (item) {
      return item.sort_order || 0;
    })) + 1;
  }

  function getActiveBlock() {
    if (!state.activeSectionId) return null;
    return state.blocks.find(function (block) {
      return String(block.id) === String(state.activeSectionId);
    }) || null;
  }

  function renderLessonsList() {
    var lessonsList = document.getElementById("lessonsList");
    var selectedId = state.selectedLesson ? state.selectedLesson.id : null;

    lessonsList.innerHTML = state.lessons.map(function (lesson) {
      var isActive = selectedId === lesson.id;
      return [
        '<button class="admin-lesson-item' + (isActive ? ' active' : '') + '" data-lesson-db-id="' + lesson.id + '" type="button">',
        '<strong>' + escapeHtml(lesson.title || "Без названия") + '</strong>',
        '<span>День ' + escapeHtml(String(lesson.day_number || "—")) + '</span>',
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
    renderSectionEditor();
  }

  function renderBlocksList() {
    var blocksList = document.getElementById("blocksList");

    if (!state.blocks.length) {
      blocksList.innerHTML = '<div class="admin-empty">У этого урока пока нет секций</div>';
      return;
    }

    blocksList.innerHTML = state.blocks.map(function (block, index) {
      var textItem = getTextItem(block.id);
      var videos = getVideoItems(block.id);
      var files = getFileItems(block.id);
      var isActive = String(state.activeSectionId) === String(block.id);

      return [
        '<article class="admin-block-item' + (isActive ? ' active' : '') + '" data-block-id="' + block.id + '">',
        '<div class="admin-block-head">',
        '<div>',
        '<h4>Секция ' + (index + 1) + '</h4>',
        '<p class="admin-section-subtitle">Часть урока</p>',
        '<div class="admin-statuses">',
        '<span>Текст: ' + (textItem && (textItem.text_html || "").trim() !== "" && textItem.text_html !== "<p></p>" ? "заполнен" : "пусто") + '</span>',
        '<span>Видео: ' + videos.length + '</span>',
        '<span>Файлы: ' + files.length + '</span>',
        '</div>',
        '</div>',
        '<div class="admin-inline-actions">',
        '<button class="admin-btn-ghost edit-block-btn" data-block-id="' + block.id + '" type="button">Редактировать</button>',
        '<button class="admin-btn-ghost move-block-btn" data-dir="up" data-block-id="' + block.id + '" type="button">↑</button>',
        '<button class="admin-btn-ghost move-block-btn" data-dir="down" data-block-id="' + block.id + '" type="button">↓</button>',
        '<button class="admin-btn-ghost delete-block-btn" data-block-id="' + block.id + '" type="button">Удалить</button>',
        '</div>',
        '</div>',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderSectionEditor() {
    var panel = document.getElementById("sectionEditorPanel");
    var content = document.getElementById("sectionEditorContent");
    var activeBlock = getActiveBlock();

    if (!activeBlock) {
      panel.hidden = true;
      content.innerHTML = "";
      return;
    }

    panel.hidden = false;

    document.querySelectorAll(".admin-tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-section-tab") === state.activeSectionTab);
    });

    if (state.activeSectionTab === "video") {
      content.innerHTML = renderVideoTab(activeBlock.id);
      return;
    }

    if (state.activeSectionTab === "file") {
      content.innerHTML = renderFileTab(activeBlock.id);
      return;
    }

    content.innerHTML = renderTextTab(activeBlock.id);
    initQuillForActiveSection(activeBlock.id);
  }

  function renderTextTab(blockId) {
    var textItem = getTextItem(blockId);
    return [
      '<section class="admin-tab-panel">',
      '<h5>Текст</h5>',
      '<div id="quillEditor-' + blockId + '" class="admin-quill" data-quill-block-id="' + blockId + '" data-initial-html="' + escapeAttr(textItem ? textItem.text_html || '<p></p>' : '<p></p>') + '"></div>',
      '<div class="admin-form" style="margin-top:12px;">',
      '<button class="btn btn-primary save-text-btn" data-block-id="' + blockId + '" type="button">Сохранить текст</button>',
      '</div>',
      '</section>'
    ].join("");
  }

  function renderVideoTab(blockId) {
    var videos = getVideoItems(blockId);
    return [
      '<section class="admin-tab-panel">',
      '<h5>Видео</h5>',
      '<button class="btn btn-primary toggle-video-form-btn" data-block-id="' + blockId + '" type="button">+ Добавить видео</button>',
      '<div class="admin-section-form" id="videoForm-' + blockId + '" hidden>',
      '<label>ID видео Kinescope',
      '<input class="video-id-input" data-block-id="' + blockId + '" type="text" placeholder="Например: 5qYpGTvDTbrLMBeBL6hpN1" />',
      '</label>',
      '<p class="admin-hint">Полная ссылка соберётся автоматически: https://kinescope.io/embed/{ID}</p>',
      '<button class="btn btn-primary save-video-btn" data-block-id="' + blockId + '" type="button">Сохранить видео</button>',
      '</div>',
      '<div class="admin-mini-cards">',
      renderVideoCards(videos),
      '</div>',
      '</section>'
    ].join("");
  }

  function renderFileTab(blockId) {
    var files = getFileItems(blockId);
    return [
      '<section class="admin-tab-panel">',
      '<h5>Файлы</h5>',
      '<button class="btn btn-primary toggle-file-form-btn" data-block-id="' + blockId + '" type="button">+ Добавить файл</button>',
      '<div class="admin-section-form" id="fileForm-' + blockId + '" hidden>',
      '<label>Название файла',
      '<input class="file-label-input" data-block-id="' + blockId + '" type="text" placeholder="Например: Чеклист.pdf" />',
      '</label>',
      '<label>Google Drive file_id',
      '<input class="file-id-input" data-block-id="' + blockId + '" type="text" placeholder="Например: 1abcDEF..." />',
      '</label>',
      '<button class="btn btn-primary save-file-btn" data-block-id="' + blockId + '" type="button">Сохранить файл</button>',
      '</div>',
      '<div class="admin-mini-cards">',
      renderFileCards(files),
      '</div>',
      '</section>'
    ].join("");
  }

  function renderVideoCards(videos) {
    if (!videos.length) {
      return '<div class="admin-empty">Видео не добавлено</div>';
    }

    return videos.map(function (video) {
      return [
        '<div class="admin-mini-card">',
        '<p><strong>Видео</strong></p>',
        '<p>ID: ' + escapeHtml(video.video_id || "") + '</p>',
        '<button class="admin-btn-ghost delete-item-btn" data-item-id="' + video.id + '" type="button">Удалить</button>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderFileCards(files) {
    if (!files.length) {
      return '<div class="admin-empty">Файлы не добавлены</div>';
    }

    return files.map(function (file) {
      return [
        '<div class="admin-mini-card">',
        '<p><strong>' + escapeHtml(file.file_label || "Без названия") + '</strong></p>',
        '<p>ID: ' + escapeHtml(file.file_id || "") + '</p>',
        '<button class="admin-btn-ghost delete-item-btn" data-item-id="' + file.id + '" type="button">Удалить</button>',
        '</div>'
      ].join("");
    }).join("");
  }

  function initQuillForActiveSection(blockId) {
    if (!window.Quill) return;

    var container = document.querySelector('[data-quill-block-id="' + blockId + '"]');
    if (!container || state.quills[String(blockId)]) return;

    var quill = new window.Quill("#" + container.id, {
      theme: "snow",
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "blockquote"],
          ["clean"]
        ]
      }
    });

    quill.root.innerHTML = container.getAttribute("data-initial-html") || "<p></p>";
    state.quills[String(blockId)] = quill;
  }

  async function selectLessonById(lessonDbId) {
    var lesson = state.lessons.find(function (item) {
      return String(item.id) === String(lessonDbId);
    });

    if (!lesson) return;

    state.selectedLesson = lesson;
    state.quills = {};
    state.activeSectionId = null;
    state.activeSectionTab = "text";

    state.blocks = await fetchLessonBlocks(lesson.id);
    var blockIds = state.blocks.map(function (block) { return block.id; });
    var allItems = await fetchItemsForBlocks(blockIds);
    setItemsByBlock(allItems);

    renderLessonsList();
    renderEditor();
  }

  async function createLesson() {
    var client = getClient();
    var config = getConfig();
    if (!client) return;

    var nextDay = state.lessons.length
      ? Math.max.apply(null, state.lessons.map(function (lesson) { return lesson.day_number || 0; })) + 1
      : 1;

    var result = await client
      .from("lessons")
      .insert({
        course_id: config.courseId,
        lesson_id: "lesson-" + Date.now(),
        day_number: nextDay,
        title: "Новый урок",
        subtitle: ""
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания урока");
      return;
    }

    state.lessons.push(result.data);
    state.lessons.sort(function (a, b) {
      return (a.day_number || 0) - (b.day_number || 0);
    });

    renderLessonsList();
    await selectLessonById(result.data.id);
  }

  async function saveLesson() {
    if (!state.selectedLesson) return;

    var client = getClient();
    if (!client) return;

    var payload = {
      title: document.getElementById("titleInput").value.trim(),
      subtitle: document.getElementById("subtitleInput").value.trim(),
      day_number: Number(document.getElementById("dayNumberInput").value) || null,
      lesson_id: document.getElementById("lessonIdInput").value.trim()
    };

    var result = await client
      .from("lessons")
      .update(payload)
      .eq("id", state.selectedLesson.id)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка сохранения урока");
      return;
    }

    state.selectedLesson = result.data;
    state.lessons = state.lessons.map(function (lesson) {
      return String(lesson.id) === String(result.data.id) ? result.data : lesson;
    }).sort(function (a, b) {
      return (a.day_number || 0) - (b.day_number || 0);
    });

    renderLessonsList();
    renderEditor();
    alert("Урок сохранён");
  }

  async function createBlock() {
    if (!state.selectedLesson) return;

    var client = getClient();
    if (!client) return;

    var nextOrder = state.blocks.length
      ? Math.max.apply(null, state.blocks.map(function (block) { return block.sort_order || 0; })) + 1
      : 1;

    var newBlockPayload = {
      lesson_id: state.selectedLesson.id,
      sort_order: nextOrder
    };

    // Совместимость со схемой, где block_type может оставаться обязательным.
    newBlockPayload.block_type = "section";

    var result = await client
      .from("lesson_blocks")
      .insert(newBlockPayload)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания секции: " + result.error.message);
      return;
    }

    state.blocks.push(result.data);
    state.blocks.sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    state.blockItemsByBlockId[String(result.data.id)] = [];
    state.activeSectionId = result.data.id;
    state.activeSectionTab = "text";

    renderEditor();
  }

  async function swapBlocks(blockId, direction) {
    var currentIndex = state.blocks.findIndex(function (block) {
      return String(block.id) === String(blockId);
    });
    if (currentIndex < 0) return;

    var swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= state.blocks.length) return;

    var currentBlock = state.blocks[currentIndex];
    var targetBlock = state.blocks[swapIndex];

    var client = getClient();
    if (!client) return;

    var currentOrder = currentBlock.sort_order || currentIndex + 1;
    var targetOrder = targetBlock.sort_order || swapIndex + 1;

    var firstUpdate = await client
      .from("lesson_blocks")
      .update({ sort_order: targetOrder })
      .eq("id", currentBlock.id);

    if (firstUpdate.error) {
      console.error(firstUpdate.error);
      alert("Ошибка перемещения секции");
      return;
    }

    var secondUpdate = await client
      .from("lesson_blocks")
      .update({ sort_order: currentOrder })
      .eq("id", targetBlock.id);

    if (secondUpdate.error) {
      console.error(secondUpdate.error);
      alert("Ошибка перемещения секции");
      return;
    }

    currentBlock.sort_order = targetOrder;
    targetBlock.sort_order = currentOrder;
    state.blocks.sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    renderEditor();
  }

  async function deleteBlock(blockId) {
    var client = getClient();
    if (!client) return;

    var confirmDelete = window.confirm("Удалить секцию и все её материалы?");
    if (!confirmDelete) return;

    var deleteItemsResult = await client
      .from("lesson_block_items")
      .delete()
      .eq("block_id", blockId);

    if (deleteItemsResult.error) {
      console.error(deleteItemsResult.error);
      alert("Ошибка удаления материалов секции");
      return;
    }

    var deleteBlockResult = await client
      .from("lesson_blocks")
      .delete()
      .eq("id", blockId);

    if (deleteBlockResult.error) {
      console.error(deleteBlockResult.error);
      alert("Ошибка удаления секции");
      return;
    }

    state.blocks = state.blocks.filter(function (block) {
      return String(block.id) !== String(blockId);
    });
    delete state.blockItemsByBlockId[String(blockId)];
    delete state.quills[String(blockId)];

    if (String(state.activeSectionId) === String(blockId)) {
      state.activeSectionId = null;
      state.activeSectionTab = "text";
    }

    renderEditor();
  }

  async function ensureTextItem(blockId) {
    var existing = getTextItem(blockId);
    if (existing) return existing;

    var client = getClient();
    if (!client) return null;

    var result = await client
      .from("lesson_block_items")
      .insert({
        block_id: blockId,
        sort_order: 1,
        item_type: "text",
        text_html: "<p></p>"
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания текстового содержимого");
      return null;
    }

    var key = String(blockId);
    if (!state.blockItemsByBlockId[key]) {
      state.blockItemsByBlockId[key] = [];
    }
    state.blockItemsByBlockId[key].push(result.data);
    return result.data;
  }

  async function saveTextItem(blockId) {
    var quill = state.quills[String(blockId)];
    if (!quill) return;

    var textItem = await ensureTextItem(blockId);
    if (!textItem) return;

    var client = getClient();
    if (!client) return;

    var result = await client
      .from("lesson_block_items")
      .update({ text_html: quill.root.innerHTML })
      .eq("id", textItem.id)
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка сохранения текста секции");
      return;
    }

    var key = String(blockId);
    state.blockItemsByBlockId[key] = getItems(blockId).map(function (item) {
      return String(item.id) === String(result.data.id) ? result.data : item;
    });

    alert("Текст секции сохранён");
    renderBlocksList();
  }

  async function createVideoItem(blockId, videoId) {
    if (!videoId) return;

    var client = getClient();
    if (!client) return;

    var result = await client
      .from("lesson_block_items")
      .insert({
        block_id: blockId,
        sort_order: getNextBlockItemOrder(blockId),
        item_type: "video",
        video_id: videoId
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания видео");
      return;
    }

    getItems(blockId).push(result.data);
    renderBlocksList();
    renderSectionEditor();
  }

  async function createFileItem(blockId, fileLabel, fileId) {
    if (!fileLabel || !fileId) return;

    var client = getClient();
    if (!client) return;

    var result = await client
      .from("lesson_block_items")
      .insert({
        block_id: blockId,
        sort_order: getNextBlockItemOrder(blockId),
        item_type: "file",
        file_label: fileLabel,
        file_id: fileId
      })
      .select()
      .single();

    if (result.error) {
      console.error(result.error);
      alert("Ошибка создания файла");
      return;
    }

    getItems(blockId).push(result.data);
    renderBlocksList();
    renderSectionEditor();
  }

  async function deleteItem(itemId) {
    var client = getClient();
    if (!client) return;

    var result = await client
      .from("lesson_block_items")
      .delete()
      .eq("id", itemId);

    if (result.error) {
      console.error(result.error);
      alert("Ошибка удаления");
      return;
    }

    Object.keys(state.blockItemsByBlockId).forEach(function (key) {
      state.blockItemsByBlockId[key] = state.blockItemsByBlockId[key].filter(function (item) {
        return String(item.id) !== String(itemId);
      });
    });

    renderBlocksList();
    renderSectionEditor();
  }

  function bindEvents() {
    document.getElementById("lessonsList").addEventListener("click", function (event) {
      var lessonButton = event.target.closest("[data-lesson-db-id]");
      if (!lessonButton) return;

      var lessonDbId = lessonButton.getAttribute("data-lesson-db-id");
      void selectLessonById(lessonDbId);
    });

    document.getElementById("addLessonBtn").addEventListener("click", function () {
      void createLesson();
    });

    document.getElementById("saveLessonBtn").addEventListener("click", function () {
      void saveLesson();
    });

    document.getElementById("addBlockBtn").addEventListener("click", function () {
      void createBlock();
    });

    document.getElementById("closeSectionEditorBtn").addEventListener("click", function () {
      state.activeSectionId = null;
      state.activeSectionTab = "text";
      renderEditor();
    });

    document.querySelectorAll(".admin-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.activeSectionTab = btn.getAttribute("data-section-tab") || "text";
        renderSectionEditor();
      });
    });

    document.getElementById("blocksList").addEventListener("click", function (event) {
      var editBlockBtn = event.target.closest(".edit-block-btn");
      if (editBlockBtn) {
        state.activeSectionId = editBlockBtn.getAttribute("data-block-id");
        state.activeSectionTab = "text";
        state.quills = {};
        renderEditor();
        return;
      }

      var moveBtn = event.target.closest(".move-block-btn");
      if (moveBtn) {
        void swapBlocks(moveBtn.getAttribute("data-block-id"), moveBtn.getAttribute("data-dir"));
        return;
      }

      var deleteBlockBtn = event.target.closest(".delete-block-btn");
      if (deleteBlockBtn) {
        void deleteBlock(deleteBlockBtn.getAttribute("data-block-id"));
      }
    });

    document.getElementById("sectionEditorContent").addEventListener("click", function (event) {
      var saveTextBtn = event.target.closest(".save-text-btn");
      if (saveTextBtn) {
        void saveTextItem(saveTextBtn.getAttribute("data-block-id"));
        return;
      }

      var toggleVideoFormBtn = event.target.closest(".toggle-video-form-btn");
      if (toggleVideoFormBtn) {
        var videoForm = document.getElementById("videoForm-" + toggleVideoFormBtn.getAttribute("data-block-id"));
        if (videoForm) {
          videoForm.hidden = !videoForm.hidden;
        }
        return;
      }

      var saveVideoBtn = event.target.closest(".save-video-btn");
      if (saveVideoBtn) {
        var videoBlockId = saveVideoBtn.getAttribute("data-block-id");
        var videoInput = document.querySelector('.video-id-input[data-block-id="' + videoBlockId + '"]');
        if (!videoInput) return;

        var videoId = videoInput.value.trim();
        if (!videoId) {
          alert("Введите ID видео Kinescope");
          return;
        }

        videoInput.value = "";
        var vf = document.getElementById("videoForm-" + videoBlockId);
        if (vf) {
          vf.hidden = true;
        }

        void createVideoItem(videoBlockId, videoId);
        return;
      }

      var toggleFileFormBtn = event.target.closest(".toggle-file-form-btn");
      if (toggleFileFormBtn) {
        var fileForm = document.getElementById("fileForm-" + toggleFileFormBtn.getAttribute("data-block-id"));
        if (fileForm) {
          fileForm.hidden = !fileForm.hidden;
        }
        return;
      }

      var saveFileBtn = event.target.closest(".save-file-btn");
      if (saveFileBtn) {
        var fileBlockId = saveFileBtn.getAttribute("data-block-id");
        var fileLabelInput = document.querySelector('.file-label-input[data-block-id="' + fileBlockId + '"]');
        var fileIdInput = document.querySelector('.file-id-input[data-block-id="' + fileBlockId + '"]');

        if (!fileLabelInput || !fileIdInput) return;

        var fileLabel = fileLabelInput.value.trim();
        var fileId = fileIdInput.value.trim();

        if (!fileLabel || !fileId) {
          alert("Заполните название файла и file_id");
          return;
        }

        fileLabelInput.value = "";
        fileIdInput.value = "";
        var ff = document.getElementById("fileForm-" + fileBlockId);
        if (ff) {
          ff.hidden = true;
        }

        void createFileItem(fileBlockId, fileLabel, fileId);
        return;
      }

      var deleteItemBtn = event.target.closest(".delete-item-btn");
      if (deleteItemBtn) {
        void deleteItem(deleteItemBtn.getAttribute("data-item-id"));
      }
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  async function init() {
    document.getElementById("adminCourseLabel").textContent = getConfig().courseId || "Без course_id";

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
