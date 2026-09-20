document.addEventListener("DOMContentLoaded", () => {
  const enableToggle = document.getElementById("enableToggle");
  const titleInput = document.getElementById("titleInput");
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const applyBtn = document.getElementById("applyBtn");
  const resetBtn = document.getElementById("resetBtn");
  const notificationMsg = document.getElementById("notificationMsg");
  const modeRadios = document.getElementsByName("renameMode");

  let timeoutHandle = null;

  function showNotification(text, isError = false) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    notificationMsg.textContent = text;
    notificationMsg.className = isError ? "notification-text error" : "notification-text";
    notificationMsg.style.opacity = "1";

    timeoutHandle = setTimeout(() => {
      notificationMsg.style.opacity = "0";
      setTimeout(() => {
        notificationMsg.textContent = "";
      }, 300);
    }, 2200);
  }

  function getSelectedMode() {
    for (const radio of modeRadios) {
      if (radio.checked) {
        return radio.value;
      }
    }
    return "replace";
  }

  function setSelectedMode(mode) {
    for (const radio of modeRadios) {
      radio.checked = radio.value === mode;
    }
  }

  function updateStatusUI(isEnabled) {
    if (isEnabled) {
      statusBadge.classList.add("active");
      statusText.textContent = "Вкл";
    } else {
      statusBadge.classList.remove("active");
      statusText.textContent = "Выкл";
    }
  }

  // Load existing configuration
  chrome.storage.sync.get(
    {
      enabled: false,
      customTitle: "",
      mode: "replace"
    },
    (items) => {
      enableToggle.checked = Boolean(items.enabled);
      titleInput.value = items.customTitle || "";
      setSelectedMode(items.mode || "replace");
      updateStatusUI(enableToggle.checked);
    }
  );

  async function saveAndApply(customEnabledState = null) {
    const isEnabled = customEnabledState !== null ? customEnabledState : enableToggle.checked;
    const titleVal = titleInput.value.trim();
    const currentMode = getSelectedMode();

    if (isEnabled && !titleVal) {
      showNotification("Введите текст заголовка!", true);
      titleInput.focus();
      return;
    }

    const newConfig = {
      enabled: isEnabled,
      customTitle: titleVal,
      mode: currentMode
    };

    chrome.storage.sync.set(newConfig, () => {
      updateStatusUI(isEnabled);
      // Notify background worker to broadcast to all tabs
      chrome.runtime.sendMessage({
        type: "BROADCAST_CONFIG",
        config: newConfig
      });

      // Also directly attempt instant message to active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "UPDATE_CONFIG",
            ...newConfig
          }).catch(() => {});
        }
      });

      showNotification(isEnabled ? "Заголовок успешно применен!" : "Подмена отключена");
    });
  }

  // Toggle switch handler
  enableToggle.addEventListener("change", () => {
    saveAndApply(enableToggle.checked);
  });

  // Apply button
  applyBtn.addEventListener("click", () => {
    enableToggle.checked = true;
    saveAndApply(true);
  });

  // Enter key inside input
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      enableToggle.checked = true;
      saveAndApply(true);
    }
  });

  // Mode radio change
  for (const radio of modeRadios) {
    radio.addEventListener("change", () => {
      if (enableToggle.checked && titleInput.value.trim()) {
        saveAndApply(true);
      }
    });
  }

  // Reset button handler
  resetBtn.addEventListener("click", () => {
    enableToggle.checked = false;
    titleInput.value = "";
    setSelectedMode("replace");

    const resetConfig = {
      enabled: false,
      customTitle: "",
      mode: "replace"
    };

    chrome.storage.sync.set(resetConfig, () => {
      updateStatusUI(false);
      chrome.runtime.sendMessage({
        type: "BROADCAST_CONFIG",
        config: resetConfig
      });
      showNotification("Настройки сброшены!");
    });
  });
});
