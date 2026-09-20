// Background Service Worker for Browser Nametag

const IGNORED_PROTOCOLS = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "moz-extension://",
  "devtools://"
];

function isInjectableUrl(url) {
  if (!url) return false;
  return !IGNORED_PROTOCOLS.some(proto => url.startsWith(proto));
}

async function injectAndSyncAllTabs(config) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && isInjectableUrl(tab.url)) {
        // Try sending direct message
        chrome.tabs.sendMessage(tab.id, {
          type: "UPDATE_CONFIG",
          enabled: config.enabled,
          customTitle: config.customTitle,
          mode: config.mode
        }).catch(async () => {
          // If content script is not yet injected on this tab, inject programmatically
          try {
            if (chrome.scripting && chrome.scripting.executeScript) {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["content/content_script.js"]
              });
              // Then send config
              chrome.tabs.sendMessage(tab.id, {
                type: "UPDATE_CONFIG",
                enabled: config.enabled,
                customTitle: config.customTitle,
                mode: config.mode
              }).catch(() => {});
            }
          } catch (injectErr) {
            // Some tabs cannot be scripted (e.g. Chrome Web Store), safe to ignore
          }
        });
      }
    }
  } catch (err) {
    console.error("Error synchronizing tabs:", err);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "BROADCAST_CONFIG") {
    injectAndSyncAllTabs(message.config);
    sendResponse({ status: "broadcast_complete" });
  }
});

// Apply to newly navigated tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && isInjectableUrl(tab.url)) {
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
          }).catch(() => {});
        }
      }
    );
  }
});

// On install or update: inject into all currently open tabs
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    {
      enabled: false,
      customTitle: "",
      mode: "replace"
    },
    (items) => {
      injectAndSyncAllTabs(items);
    }
  );
});
