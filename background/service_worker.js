// Background Service Worker for Browser Nametag

async function broadcastConfigToAllTabs(config) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://") && !tab.url.startsWith("edge://") && !tab.url.startsWith("about:")) {
        chrome.tabs.sendMessage(tab.id, {
          type: "UPDATE_CONFIG",
          enabled: config.enabled,
          customTitle: config.customTitle,
          mode: config.mode
        }).catch(() => {
          // Tab might not have content script ready or is restricted, safe to ignore
        });
      }
    }
  } catch (err) {
    console.error("Error broadcasting config:", err);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "BROADCAST_CONFIG") {
    broadcastConfigToAllTabs(message.config);
    sendResponse({ status: "broadcast_started" });
  }
});

// Apply to newly navigated or created tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://") && !tab.url.startsWith("about:")) {
    chrome.storage.sync.get(
      {
        enabled: false,
        customTitle: "",
        mode: "replace"
      },
      (config) => {
        if (config.enabled && config.customTitle) {
          chrome.tabs.sendMessage(tabId, {
            type: "UPDATE_CONFIG",
            enabled: config.enabled,
            customTitle: config.customTitle,
            mode: config.mode
          }).catch(() => {
            // Ignore if script hasn't injected yet
          });
        }
      }
    );
  }
});

// Set default values on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["enabled", "customTitle", "mode"], (items) => {
    if (items.enabled === undefined) {
      chrome.storage.sync.set({
        enabled: false,
        customTitle: "",
        mode: "replace"
      });
    }
  });
});
