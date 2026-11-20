"use strict";

(function () {
  const statusBadge = document.getElementById("statusBadge");
  const wrongPageBox = document.getElementById("wrongPageBox");
  const composerInfoBox = document.getElementById("composerInfoBox");
  const compRowCountText = document.getElementById("compRowCountText");
  const compDoneText = document.getElementById("compDoneText");
  const compTogglePanelBtn = document.getElementById("compTogglePanelBtn");
  const mainBox = document.getElementById("mainBox");
  const openMetaBtn = document.getElementById("openMetaBtn");
  const rowCountText = document.getElementById("rowCountText");
  const deletedText = document.getElementById("deletedText");
  const modeSelect = document.getElementById("modeSelect");
  const delayInput = document.getElementById("delayInput");
  const maxInput = document.getElementById("maxInput");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const stopBtn = document.getElementById("stopBtn");
  const togglePanelBtn = document.getElementById("togglePanelBtn");

  let activeTabId = null;

  function statusLabel(status) {
    const map = {
      idle: "Siap",
      running: "Berjalan",
      paused: "Dijeda",
      stopping: "Berhenti",
      completed: "Selesai",
      error: "Error"
    };
    return map[status] || "Siap";
  }

  function render(res) {
    if (!res) return;

    if (res.activeTab === "composer" && res.composerSnapshot) {
      composerInfoBox.classList.remove("hidden");
      mainBox.classList.add("hidden");
      const cSnap = res.composerSnapshot;
      const cDiag = res.composerDiagnostics || {};
      statusBadge.textContent = statusLabel(cSnap.status);
      statusBadge.className = "badge " + cSnap.status;
      compRowCountText.textContent = (cDiag.rowCount ?? 0) + " baris";
      compDoneText.textContent = `${cSnap.processedCount ?? 0} / ${cSnap.totalTarget ?? 0}`;
      return;
    }

    composerInfoBox.classList.add("hidden");
    mainBox.classList.remove("hidden");
    if (!res.snapshot) return;

    const snap = res.snapshot;
    const diag = res.diagnostics || {};

    statusBadge.textContent = statusLabel(snap.status);
    statusBadge.className = "badge " + snap.status;

    rowCountText.textContent = (diag.rowCount ?? 0) + " baris";
    deletedText.textContent = String(snap.deletedCount ?? 0);

    const cfg = snap.config || {};
    if (document.activeElement !== modeSelect) {
      modeSelect.value = cfg.mode || "bulk";
    }
    if (document.activeElement !== delayInput) {
      delayInput.value = String(((cfg.delayMs || 2500) / 1000).toFixed(1).replace(/\.0$/, ""));
    }
    if (document.activeElement !== maxInput) {
      maxInput.value = String(cfg.maxCount ?? 0);
    }

    const isRunning = snap.status === "running";
    const isPaused = snap.status === "paused";
    const isActive = isRunning || isPaused;

    startBtn.classList.toggle("hidden", isActive);
    pauseBtn.classList.toggle("hidden", !isRunning);
    resumeBtn.classList.toggle("hidden", !isPaused);
    stopBtn.classList.toggle("hidden", !isActive);

    modeSelect.disabled = isActive;
    delayInput.disabled = isActive;
    maxInput.disabled = isActive;
  }

  function sendToTab(payload, cb) {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, payload, (res) => {
      if (chrome.runtime.lastError) {
        wrongPageBox.classList.remove("hidden");
        mainBox.classList.add("hidden");
        composerInfoBox.classList.add("hidden");
        return;
      }
      if (cb) cb(res);
    });
  }

  function getFormConfig() {
    const delaySec = Math.max(0.5, parseFloat(delayInput.value) || 2.5);
    const maxCount = Math.max(0, parseInt(maxInput.value, 10) || 0);
    return {
      mode: modeSelect.value || "bulk",
      delayMs: Math.round(delaySec * 1000),
      maxCount
    };
  }

  function refresh() {
    sendToTab({ type: "GET_STATE" }, (res) => {
      if (res && res.snapshot) {
        wrongPageBox.classList.add("hidden");
        render(res);
      }
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url || !tab.url.startsWith("https://business.facebook.com/")) {
      wrongPageBox.classList.remove("hidden");
      mainBox.classList.add("hidden");
      composerInfoBox.classList.add("hidden");
      return;
    }
    activeTabId = tab.id;
    refresh();
    setInterval(refresh, 1000);
  });

  openMetaBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://business.facebook.com/latest/posts/published_posts" });
  });

  [modeSelect, delayInput, maxInput].forEach((el) => {
    el.addEventListener("change", () => {
      sendToTab({ type: "SET_CONFIG", config: getFormConfig() }, (res) => {
        if (res) render(res);
      });
    });
  });

  startBtn.addEventListener("click", () => {
    sendToTab({ type: "START", config: getFormConfig() }, refresh);
  });
  pauseBtn.addEventListener("click", () => sendToTab({ type: "PAUSE" }, refresh));
  resumeBtn.addEventListener("click", () => sendToTab({ type: "RESUME" }, refresh));
  stopBtn.addEventListener("click", () => sendToTab({ type: "STOP" }, refresh));
  togglePanelBtn.addEventListener("click", () => sendToTab({ type: "TOGGLE_PANEL" }));
  compTogglePanelBtn.addEventListener("click", () => sendToTab({ type: "TOGGLE_PANEL" }));
})();
