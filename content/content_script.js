(() => {
  let isEnabled = false;
  let customTitle = "";
  let mode = "replace"; // "replace" or "prefix"
  let originalTitle = document.title || "";
  let isInternalUpdate = false;
  let observer = null;

  function computeTitle(baseOriginal) {
    if (!isEnabled || !customTitle.trim()) {
      return baseOriginal;
    }
    if (mode === "prefix") {
      const cleanOriginal = baseOriginal ? baseOriginal.trim() : "";
      return cleanOriginal ? `${customTitle} | ${cleanOriginal}` : customTitle;
    }
    return customTitle;
  }

  function applyTitle() {
    if (!isEnabled || !customTitle.trim()) {
      return;
    }

    const targetTitle = computeTitle(originalTitle);
    if (document.title !== targetTitle) {
      isInternalUpdate = true;
      document.title = targetTitle;
      setTimeout(() => {
        isInternalUpdate = false;
      }, 0);
    }
  }

  function restoreOriginalTitle() {
    if (originalTitle && document.title !== originalTitle) {
      isInternalUpdate = true;
      document.title = originalTitle;
      setTimeout(() => {
        isInternalUpdate = false;
      }, 0);
    }
  }

  function handleExternalTitleChange() {
    if (isInternalUpdate) {
      return;
    }

    const currentDomTitle = document.title || "";
    if (isEnabled && customTitle.trim()) {
      // If in prefix mode, extract real title if it already contains prefix or save fresh
      if (mode === "prefix" && currentDomTitle.startsWith(customTitle + " | ")) {
        originalTitle = currentDomTitle.slice((customTitle + " | ").length);
      } else if (currentDomTitle !== customTitle) {
        originalTitle = currentDomTitle;
      }
      applyTitle();
    } else {
      originalTitle = currentDomTitle;
    }
  }

  function setupObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      handleExternalTitleChange();
    });

    const target = document.querySelector("head") || document.documentElement;
    if (target) {
      observer.observe(target, {
        subtree: true,
        childList: true,
        characterData: true
      });
    }
  }

  function initSettings() {
    if (document.title && !originalTitle) {
      originalTitle = document.title;
    }

    chrome.storage.sync.get(
      {
        enabled: false,
        customTitle: "",
        mode: "replace"
      },
      (items) => {
        isEnabled = Boolean(items.enabled);
        customTitle = items.customTitle || "";
        mode = items.mode || "replace";

        if (isEnabled && customTitle.trim()) {
          applyTitle();
        }
      }
    );
  }

  // Listen for real-time updates from background / popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "UPDATE_CONFIG") {
      isEnabled = Boolean(message.enabled);
      customTitle = message.customTitle || "";
      mode = message.mode || "replace";

      if (isEnabled && customTitle.trim()) {
        applyTitle();
      } else {
        restoreOriginalTitle();
      }
      sendResponse({ status: "ok" });
    }
  });

  // Observe DOM ready states
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!originalTitle && document.title) {
        originalTitle = document.title;
      }
      setupObserver();
      if (isEnabled && customTitle.trim()) {
        applyTitle();
      }
    });
  } else {
    setupObserver();
  }

  initSettings();
})();
