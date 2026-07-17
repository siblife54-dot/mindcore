(function () {
  "use strict";

  var ROOT_ID = "mindcoreStartupScreen";
  var DEFAULT_MESSAGE = "Проверяем доступ…";
  var ERROR_MESSAGE = "Не удалось проверить доступ";

  function ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "mindcore-startup-screen";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = [
      '<div class="mindcore-startup-screen__content">',
      '<div class="mindcore-startup-screen__spinner" aria-hidden="true"></div>',
      '<p class="mindcore-startup-screen__text">' + DEFAULT_MESSAGE + '</p>',
      '</div>'
    ].join("");
    document.body.appendChild(root);
    return root;
  }

  function setText(root, text) {
    var textNode = root.querySelector(".mindcore-startup-screen__text");
    if (textNode) textNode.textContent = text;
  }

  window.StartupScreen = {
    show: function () {
      var root = ensureRoot();
      root.classList.remove("is-error");
      setText(root, DEFAULT_MESSAGE);
      root.classList.add("is-visible");
      root.removeAttribute("hidden");
      document.body.classList.add("mindcore-startup-open");
    },
    hide: function () {
      var root = document.getElementById(ROOT_ID);
      if (root) {
        root.classList.remove("is-visible", "is-error");
        root.setAttribute("hidden", "");
      }
      document.body.classList.remove("mindcore-startup-open");
    },
    showError: function () {
      var root = ensureRoot();
      root.classList.add("is-visible", "is-error");
      root.removeAttribute("hidden");
      setText(root, ERROR_MESSAGE);
      document.body.classList.add("mindcore-startup-open");
    }
  };
})();
