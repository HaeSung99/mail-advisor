chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
    } catch (e) {
      // content script가 아직 안 뜬 경우를 대비해 한번 더 시도
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
    }
  });
  