"use strict";

(function () {
  const el = (id) => document.getElementById(id);

  const statusBadge = el("statusBadge");
  const wrongPageBox = el("wrongPageBox");
  const mainContent = el("mainContent");
  const openMetaBtn = el("openMetaBtn");
  const tabComposerBtn = el("tabComposerBtn");
  const tabDeleteBtn = el("tabDeleteBtn");
  const composerPane = el("composerPane");
  const deletePane = el("deletePane");

  let activeTabId = null;
  let currentUiTab = "composer";

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

  function renderLogs(box, logs) {
    if (!box) return;
    box.textContent = "";
    (logs || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "log-" + (item.level || "info");
      const ts = document.createElement("span");
      ts.className = "log-time";
      ts.textContent = "[" + item.time + "]";
      row.appendChild(ts);
      row.appendChild(document.createTextNode(" " + item.message));
      box.appendChild(row);
    });
  }

  function applyTabUi(tabName) {
    currentUiTab = tabName === "composer" ? "composer" : "delete";
    const isComp = currentUiTab === "composer";
    tabComposerBtn.classList.toggle("active", isComp);
    tabDeleteBtn.classList.toggle("active", !isComp);
    composerPane.classList.toggle("hidden", !isComp);
    deletePane.classList.toggle("hidden", isComp);
  }

  function syncComposerForm(cfg) {
    if (!cfg) return;
    const active = document.activeElement;
    if (active !== el("cEnableDesc")) el("cEnableDesc").checked = cfg.enableDescription !== false;
    if (active !== el("cCustomTitle")) el("cCustomTitle").value = cfg.customTitle || "";
    if (active !== el("cDescTemplate")) el("cDescTemplate").value = cfg.descriptionTemplate || "";
    if (active !== el("cEpMode")) el("cEpMode").value = cfg.episodeMode || "sequence";
    if (active !== el("cStartEp")) el("cStartEp").value = String(cfg.startEpisode ?? 1);
    if (active !== el("cEpStep")) el("cEpStep").value = String(cfg.episodeStep ?? 1);

    if (active !== el("cEnableSched")) el("cEnableSched").checked = cfg.enableSchedule !== false;
    if (active !== el("cUseLastSched")) el("cUseLastSched").checked = Boolean(cfg.useLastScheduled);
    if (active !== el("cStartDate") && cfg.scheduleStartDate) el("cStartDate").value = cfg.scheduleStartDate;
    if (active !== el("cStartTime") && cfg.scheduleStartTime) el("cStartTime").value = cfg.scheduleStartTime;
    if (active !== el("cIntervalVal")) el("cIntervalVal").value = String(cfg.intervalValue ?? 1);
    if (active !== el("cIntervalUnit")) el("cIntervalUnit").value = cfg.intervalUnit || "hour";

    if (active !== el("cWindowEnabled")) el("cWindowEnabled").checked = Boolean(cfg.activeWindowEnabled);
    if (active !== el("cWindowStart")) el("cWindowStart").value = cfg.windowStart || "08:00";
    if (active !== el("cWindowEnd")) el("cWindowEnd").value = cfg.windowEnd || "22:00";
    if (active !== el("cMaxPerDay")) el("cMaxPerDay").value = String(cfg.maxPerDay ?? 0);
    if (active !== el("cJitterMin")) el("cJitterMin").value = String(cfg.jitterMinutes ?? 0);

    if (active !== el("cEnableCover")) el("cEnableCover").checked = Boolean(cfg.enableCover);
    if (active !== el("cCoverMode")) el("cCoverMode").value = cfg.coverMatchMode || "sequential";
  }

  function readComposerForm() {
    const windowEnabled = Boolean(el("cWindowEnabled").checked);
    const maxPerDay = Math.max(0, parseInt(el("cMaxPerDay").value, 10) || 0);
    const jitterMinutes = Math.max(0, parseInt(el("cJitterMin").value, 10) || 0);
    return {
      enableDescription: Boolean(el("cEnableDesc").checked),
      customTitle: el("cCustomTitle").value || "",
      descriptionTemplate: el("cDescTemplate").value || "",
      episodeMode: el("cEpMode").value || "sequence",
      startEpisode: Math.max(0, parseInt(el("cStartEp").value, 10) || 0),
      episodeStep: Math.max(1, parseInt(el("cEpStep").value, 10) || 1),
      enableSchedule: Boolean(el("cEnableSched").checked),
      useLastScheduled: Boolean(el("cUseLastSched").checked),
      scheduleStartDate: el("cStartDate").value || "",
      scheduleStartTime: el("cStartTime").value || "",
      intervalValue: Math.max(1, parseInt(el("cIntervalVal").value, 10) || 1),
      intervalUnit: el("cIntervalUnit").value || "hour",
      advancedScheduleEnabled: windowEnabled || maxPerDay > 0 || jitterMinutes > 0,
      activeWindowEnabled: windowEnabled,
      windowStart: el("cWindowStart").value || "08:00",
      windowEnd: el("cWindowEnd").value || "22:00",
      maxPerDay,
      jitterMinutes,
      enableCover: Boolean(el("cEnableCover").checked),
      coverMatchMode: el("cCoverMode").value || "sequential"
    };
  }

  function syncDeleteForm(cfg) {
    if (!cfg) return;
    const active = document.activeElement;
    if (active !== el("dModeSelect")) el("dModeSelect").value = cfg.mode || "bulk";
    if (active !== el("dSingleMethod")) el("dSingleMethod").value = cfg.singleMethod || "auto";
    if (active !== el("dDelayInput")) el("dDelayInput").value = String(((cfg.delayMs || 2500) / 1000).toFixed(1).replace(/\.0$/, ""));
    if (active !== el("dMaxInput")) el("dMaxInput").value = String(cfg.maxCount ?? 0);
  }

  function readDeleteForm() {
    const delaySec = Math.max(0.5, parseFloat(el("dDelayInput").value) || 2.5);
    return {
      mode: el("dModeSelect").value || "bulk",
      singleMethod: el("dSingleMethod").value || "auto",
      delayMs: Math.round(delaySec * 1000),
      maxCount: Math.max(0, parseInt(el("dMaxInput").value, 10) || 0)
    };
  }

  function renderState(res) {
    if (!res) return;
    wrongPageBox.classList.add("hidden");
    mainContent.classList.remove("hidden");
    applyTabUi(res.activeTab || "composer");

    const cSnap = res.composerSnapshot || {};
    const dSnap = res.snapshot || {};
    const activeSnap = currentUiTab === "composer" ? cSnap : dSnap;

    statusBadge.textContent = statusLabel(activeSnap.status);
    statusBadge.className = "badge " + (activeSnap.status || "idle");

    // Composer UI
    el("cDoneVal").textContent = String(cSnap.processedCount ?? 0);
    el("cTotalVal").textContent = String(cSnap.totalTarget ?? 0);
    el("cFailVal").textContent = String(cSnap.failedCount ?? 0);
    const cRun = cSnap.status === "running";
    const cPause = cSnap.status === "paused";
    const cAct = cRun || cPause;
    el("cStartBtn").classList.toggle("hidden", cAct);
    el("cPauseBtn").classList.toggle("hidden", !cRun);
    el("cResumeBtn").classList.toggle("hidden", !cPause);
    el("cStopBtn").classList.toggle("hidden", !cAct);
    syncComposerForm(cSnap.config);
    renderLogs(el("cLogBox"), cSnap.logs);

    // Delete UI
    el("dDoneVal").textContent = String(dSnap.deletedCount ?? 0);
    el("dSecVal").textContent = dSnap.mode === "single" ? String(dSnap.skippedCount ?? 0) : String(dSnap.batchCount ?? 0);
    el("dSecLbl").textContent = dSnap.mode === "single" ? "Dilewati" : "Batch";
    el("dFailVal").textContent = String(dSnap.failedCount ?? 0);
    const dRun = dSnap.status === "running";
    const dPause = dSnap.status === "paused";
    const dAct = dRun || dPause;
    el("dStartBtn").classList.toggle("hidden", dAct);
    el("dPauseBtn").classList.toggle("hidden", !dRun);
    el("dResumeBtn").classList.toggle("hidden", !dPause);
    el("dStopBtn").classList.toggle("hidden", !dAct);
    syncDeleteForm(dSnap.config);
    renderLogs(el("dLogBox"), dSnap.logs);
  }

  function sendToTab(payload, cb) {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, payload, (res) => {
      if (chrome.runtime.lastError) {
        wrongPageBox.classList.remove("hidden");
        mainContent.classList.add("hidden");
        return;
      }
      if (cb) cb(res);
    });
  }

  function pollActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.url || !tab.url.startsWith("https://business.facebook.com/")) {
        activeTabId = null;
        wrongPageBox.classList.remove("hidden");
        mainContent.classList.add("hidden");
        return;
      }
      activeTabId = tab.id;
      sendToTab({ type: "GET_STATE" }, renderState);
    });
  }

  openMetaBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://business.facebook.com/latest/posts/published_posts" });
  });

  tabComposerBtn.addEventListener("click", () => {
    sendToTab({ type: "SET_ACTIVE_TAB", activeTab: "composer" }, pollActiveTab);
  });
  tabDeleteBtn.addEventListener("click", () => {
    sendToTab({ type: "SET_ACTIVE_TAB", activeTab: "delete" }, pollActiveTab);
  });

  [
    "cEnableDesc", "cCustomTitle", "cDescTemplate", "cEpMode", "cStartEp", "cEpStep",
    "cEnableSched", "cUseLastSched", "cStartDate", "cStartTime", "cIntervalVal", "cIntervalUnit",
    "cWindowEnabled", "cWindowStart", "cWindowEnd", "cMaxPerDay", "cJitterMin",
    "cEnableCover", "cCoverMode"
  ].forEach((id) => {
    el(id).addEventListener("change", () => {
      sendToTab({ type: "SET_COMPOSER_CONFIG", config: readComposerForm() }, pollActiveTab);
    });
  });

  el("cCoverFiles").addEventListener("change", async () => {
    const fileList = Array.from(el("cCoverFiles").files || []);
    el("cCoverInfo").textContent = fileList.length > 0
      ? `${fileList.length} gambar dipilih (${fileList[0].name}${fileList.length > 1 ? ", ..." : ""})`
      : "Belum ada gambar dipilih.";

    const serialized = [];
    for (const f of fileList) {
      const buf = await f.arrayBuffer();
      serialized.push({
        name: f.name,
        mime: f.type || "image/jpeg",
        bytes: Array.from(new Uint8Array(buf))
      });
    }
    sendToTab({ type: "SET_COVER_FILES", files: serialized });
  });

  el("cStartBtn").addEventListener("click", () => {
    sendToTab({ type: "START_COMPOSER", config: readComposerForm() }, pollActiveTab);
  });
  el("cPauseBtn").addEventListener("click", () => sendToTab({ type: "PAUSE", tab: "composer" }, pollActiveTab));
  el("cResumeBtn").addEventListener("click", () => sendToTab({ type: "RESUME", tab: "composer" }, pollActiveTab));
  el("cStopBtn").addEventListener("click", () => sendToTab({ type: "STOP", tab: "composer" }, pollActiveTab));
  el("cDiagBtn").addEventListener("click", () => sendToTab({ type: "DIAGNOSE", tab: "composer" }, pollActiveTab));

  ["dModeSelect", "dSingleMethod", "dDelayInput", "dMaxInput"].forEach((id) => {
    el(id).addEventListener("change", () => {
      sendToTab({ type: "SET_CONFIG", config: readDeleteForm() }, pollActiveTab);
    });
  });
  el("dStartBtn").addEventListener("click", () => {
    sendToTab({ type: "START", config: readDeleteForm() }, pollActiveTab);
  });
  el("dPauseBtn").addEventListener("click", () => sendToTab({ type: "PAUSE", tab: "delete" }, pollActiveTab));
  el("dResumeBtn").addEventListener("click", () => sendToTab({ type: "RESUME", tab: "delete" }, pollActiveTab));
  el("dStopBtn").addEventListener("click", () => sendToTab({ type: "STOP", tab: "delete" }, pollActiveTab));
  el("dDiagBtn").addEventListener("click", () => sendToTab({ type: "DIAGNOSE", tab: "delete" }, pollActiveTab));

  pollActiveTab();
  setInterval(pollActiveTab, 1000);
})();
