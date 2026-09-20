(() => {
  // Prevent duplicate execution if injected multiple times
  if (window.__browserNametagActive) {
    if (typeof window.__browserNametagRefresh === "function") {
      window.__browserNametagRefresh();
    }
    return;
  }
  window.__browserNametagActive = true;

  let isEnabled = false;
  let customTitle = "";
  let mode = "replace"; // "replace" or "prefix"
  let originalTitle = document.title || "";
  let isInternalUpdate = false;
  let observer = null;

  function computeTargetTitle(baseOriginal) {
    if (!isEnabled || !customTitle.trim()) {
      return baseOriginal;
    }
    if (mode === "prefix") {
      const cleanOriginal = (baseOriginal || "").trim();
      return cleanOriginal ? `${customTitle} | ${cleanOriginal}` : customTitle;
    }
    return customTitle;
  }

  function setTitleDom(newTitle) {
    if (!newTitle) return;
    isInternalUpdate = true;
    
    document.title = newTitle;

    let titleTag = document.querySelector("title");
    if (!titleTag && document.head) {
      titleTag = document.createElement("title");
      document.head.appendChild(titleTag);
    }
    if (titleTag && titleTag.textContent !== newTitle) {
      titleTag.textContent = newTitle;
    }

    // Release lock after microtask
    setTimeout(() => {
      isInternalUpdate = false;
    }, 50);
  }

  function applyTitle() {
    if (!isEnabled || !customTitle.trim()) {
      return;
    }
    const target = computeTargetTitle(originalTitle);
    if (document.title !== target) {
      setTitleDom(target);
    }
  }

  function restoreOriginalTitle() {
    if (originalTitle && document.title !== originalTitle) {
      setTitleDom(originalTitle);
    }
  }

  function onDomTitleMutated() {
    if (isInternalUpdate) {
      return;
    }

    const currentTitle = document.title || "";
    if (isEnabled && customTitle.trim()) {
      if (mode === "prefix") {
        const prefixMarker = customTitle + " | ";
        if (currentTitle.startsWith(prefixMarker)) {
          originalTitle = currentTitle.slice(prefixMarker.length);
        } else if (currentTitle !== customTitle) {
          originalTitle = currentTitle;
        }
      } else {
        if (currentTitle !== customTitle) {
          originalTitle = currentTitle;
        }
      }
      applyTitle();
    } else {
      originalTitle = currentTitle;
    }
  }

  function setupObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      onDomTitleMutated();
    });

    const targetNode = document.head || document.documentElement;
    if (targetNode) {
      observer.observe(targetNode, {
        subtree: true,
        childList: true,
        characterData: true
      });
    }
  }

  function syncConfig(newConfig) {
    isEnabled = Boolean(newConfig.enabled);
    customTitle = (newConfig.customTitle || "").trim();
    mode = newConfig.mode || "replace";

    if (isEnabled && customTitle) {
      applyTitle();
    } else {
      restoreOriginalTitle();
    }
  }

  function loadInitialSettings() {
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
        syncConfig(items);
      }
    );
  }

  window.__browserNametagRefresh = loadInitialSettings;

  // Listen for storage changes directly
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" || areaName === "local") {
      chrome.storage.sync.get(
        {
          enabled: false,
          customTitle: "",
          mode: "replace"
        },
        (items) => {
          syncConfig(items);
        }
      );
    }
  });

  // Listen for runtime messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "UPDATE_CONFIG") {
      syncConfig(message);
      sendResponse({ status: "applied" });
    }
  });

  // Handle page lifecycle events
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!originalTitle && document.title) {
        originalTitle = document.title;
      }
      setupObserver();
      if (isEnabled && customTitle) {
        applyTitle();
      }
    });
  } else {
    setupObserver();
  }

  // Periodic heartbeat / focus check to guarantee title is locked
  window.addEventListener("focus", () => {
    if (isEnabled && customTitle) {
      applyTitle();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (isEnabled && customTitle) {
      applyTitle();
    }
  });

  setInterval(() => {
    if (isEnabled && customTitle) {
      const target = computeTargetTitle(originalTitle);
      if (document.title !== target) {
        applyTitle();
      }
    }
  }, 1000);

  loadInitialSettings();
})();
