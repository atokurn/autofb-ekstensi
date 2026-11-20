"use strict";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "STATE_UPDATED" && sender && sender.tab && sender.tab.id) {
    const snap = message.snapshot || {};
    const tabId = sender.tab.id;

    let text = "";
    let color = "#1877F2";

    if (snap.status === "running") {
      text = snap.deletedCount > 0 ? String(snap.deletedCount) : "RUN";
      color = "#DC2626";
    } else if (snap.status === "paused") {
      text = "II";
      color = "#D97706";
    } else if (snap.status === "completed") {
      text = snap.deletedCount > 0 ? String(snap.deletedCount) : "OK";
      color = "#16A34A";
    } else if (snap.status === "error") {
      text = "ERR";
      color = "#DC2626";
    }

    chrome.action.setBadgeText({ tabId, text }).catch(() => {});
    if (text) {
      chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
    }
    sendResponse({ ok: true });
  }
});
