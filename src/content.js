(function () {
  "use strict";

  if (window.__META_AUTO_DELETER_INITIALIZED__) return;
  window.__META_AUTO_DELETER_INITIALIZED__ = true;

  const dom = globalThis.MetaDeleterDOM;
  const engineFactory = globalThis.MetaDeleterEngine;

  if (!dom || !engineFactory) {
    console.error("[Meta Auto Deleter] Dependencies not loaded.");
    return;
  }

  const STORAGE_KEY = "meta_auto_deleter_settings_v1";

  let uiPrefs = {
    panelOpen: true
  };

  const engine = engineFactory.createEngine({
    document,
    dom,
    onUpdate: (snapshot) => {
      renderSnapshot(snapshot);
      try {
        chrome.runtime.sendMessage({ type: "STATE_UPDATED", snapshot }).catch(() => {});
      } catch (_err) {
        // ignore if extension context invalidated
      }
    }
  });

  // Shadow DOM references
  let hostEl = null;
  let shadow = null;
  let els = {};

  function getSavedState(cb) {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      cb({});
      return;
    }
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      cb((res && res[STORAGE_KEY]) || {});
    });
  }

  function saveState(partial) {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;
    getSavedState((curr) => {
      const next = Object.assign({}, curr, partial);
      chrome.storage.local.set({ [STORAGE_KEY]: next });
    });
  }

  function buildStyles() {
    return `
      :host {
        all: initial;
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #111827;
      }

      * {
        box-sizing: border-box;
      }

      .pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        background: linear-gradient(135deg, #1877F2 0%, #0F5CD6 100%);
        color: #ffffff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.28);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .pill-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.34);
      }

      .pill-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #93C5FD;
      }
      .pill-dot.running { background: #FCA5A5; animation: pulse 1.1s infinite; }
      .pill-dot.paused { background: #FCD34D; }
      .pill-dot.completed { background: #86EFAC; }
      .pill-dot.error { background: #EF4444; }

      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.45; transform: scale(1.25); }
      }

      .panel {
        width: 348px;
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 36px);
        display: flex;
        flex-direction: column;
        background: #FFFFFF;
        border: 1px solid #E5E7EB;
        border-radius: 14px;
        box-shadow: 0 18px 42px rgba(15, 23, 42, 0.22);
        overflow: hidden;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 11px 14px;
        background: linear-gradient(135deg, #1877F2 0%, #125AC4 100%);
        color: #FFFFFF;
        cursor: grab;
        user-select: none;
      }
      .header:active { cursor: grabbing; }

      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .title {
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
      }

      .badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
        color: #FFFFFF;
        letter-spacing: 0.3px;
      }
      .badge.running { background: #EF4444; }
      .badge.paused { background: #F59E0B; color: #111827; }
      .badge.completed { background: #16A34A; }
      .badge.error { background: #B91C1C; }

      .icon-btn {
        background: rgba(255, 255, 255, 0.16);
        border: none;
        color: #FFFFFF;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn:hover { background: rgba(255, 255, 255, 0.28); }

      .body {
        padding: 12px 14px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .section-label {
        font-size: 11px;
        font-weight: 700;
        color: #4B5563;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-bottom: 4px;
      }

      .mode-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }

      .mode-card {
        border: 1.5px solid #E5E7EB;
        background: #F9FAFB;
        border-radius: 9px;
        padding: 8px 9px;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.15s, background 0.15s;
      }
      .mode-card:hover { border-color: #93C5FD; }
      .mode-card.active {
        border-color: #1877F2;
        background: #EFF6FF;
      }
      .mode-card-title {
        font-size: 12px;
        font-weight: 700;
        color: #111827;
        margin-bottom: 2px;
      }
      .mode-card-desc {
        font-size: 10.5px;
        color: #6B7280;
        line-height: 1.25;
      }

      .row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .field label {
        font-size: 11px;
        font-weight: 600;
        color: #374151;
      }
      .field input, .field select {
        width: 100%;
        padding: 6px 8px;
        font-size: 12px;
        border: 1px solid #D1D5DB;
        border-radius: 7px;
        background: #FFFFFF;
        color: #111827;
        outline: none;
      }
      .field input:focus, .field select:focus {
        border-color: #1877F2;
        box-shadow: 0 0 0 2px rgba(24, 119, 242, 0.15);
      }

      .check-row {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 12px;
        color: #374151;
        cursor: pointer;
      }
      .check-row input {
        margin: 0;
        cursor: pointer;
      }

      .advanced-toggle {
        background: none;
        border: none;
        padding: 0;
        font-size: 11px;
        font-weight: 600;
        color: #1877F2;
        cursor: pointer;
        text-align: left;
      }

      .actions {
        display: flex;
        gap: 7px;
      }

      .btn {
        flex: 1;
        border: none;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.15s, background 0.15s;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-danger {
        background: #DC2626;
        color: #FFFFFF;
      }
      .btn-danger:hover:not(:disabled) { background: #B91C1C; }

      .btn-warn {
        background: #F59E0B;
        color: #111827;
      }
      .btn-warn:hover:not(:disabled) { background: #D97706; }

      .btn-primary {
        background: #1877F2;
        color: #FFFFFF;
      }
      .btn-primary:hover:not(:disabled) { background: #125AC4; }

      .btn-secondary {
        background: #F3F4F6;
        color: #1F2937;
        border: 1px solid #D1D5DB;
        flex: 0 0 auto;
      }
      .btn-secondary:hover:not(:disabled) { background: #E5E7EB; }

      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 9px;
        padding: 7px 8px;
        text-align: center;
      }
      .stat-val {
        font-size: 15px;
        font-weight: 800;
        color: #111827;
      }
      .stat-lbl {
        font-size: 10px;
        color: #6B7280;
      }

      .current-box {
        font-size: 11px;
        color: #374151;
        background: #EFF6FF;
        border: 1px solid #BFDBFE;
        border-radius: 7px;
        padding: 6px 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .diag-box {
        font-size: 11px;
        color: #1F2937;
        background: #F8FAFC;
        border: 1px solid #CBD5E1;
        border-radius: 7px;
        padding: 7px 9px;
        line-height: 1.45;
      }

      .log-box {
        max-height: 130px;
        overflow-y: auto;
        background: #0F172A;
        color: #E2E8F0;
        border-radius: 8px;
        padding: 7px 9px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10.5px;
        line-height: 1.4;
      }
      .log-entry { margin-bottom: 3px; word-break: break-word; }
      .log-time { color: #64748B; margin-right: 4px; }
      .log-success { color: #4ADE80; }
      .log-warn { color: #FBBF24; }
      .log-error { color: #F87171; }
      .log-info { color: #E2E8F0; }

      .hidden { display: none !important; }
    `;
  }

  function createPanelDOM() {
    if (hostEl && hostEl.isConnected) return;

    hostEl = document.createElement("div");
    hostEl.id = dom.EXTENSION_HOST_ID;
    shadow = hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = buildStyles();
    shadow.appendChild(style);

    const container = document.createElement("div");
    container.innerHTML = `
      <button type="button" class="pill-btn hidden" id="pillBtn" title="Buka Meta Content Auto Deleter">
        <span class="pill-dot" id="pillDot"></span>
        <span>Auto Deleter (<span id="pillCount">0</span>)</span>
      </button>

      <div class="panel" id="panel">
        <div class="header" id="dragHandle">
          <div class="header-left">
            <span class="title">Meta Auto Deleter</span>
            <span class="badge" id="statusBadge">Siap</span>
          </div>
          <button type="button" class="icon-btn" id="minimizeBtn" title="Kecilkan panel">—</button>
        </div>

        <div class="body">
          <div>
            <div class="section-label">Mode Penghapusan</div>
            <div class="mode-grid">
              <button type="button" class="mode-card active" id="modeBulkBtn">
                <div class="mode-card-title">Bulk Delete</div>
                <div class="mode-card-desc">Centang semua &amp; klik Hapus</div>
              </button>
              <button type="button" class="mode-card" id="modeSingleBtn">
                <div class="mode-card-title">1 per 1 (Teratas)</div>
                <div class="mode-card-desc">Hapus satu per satu dari atas</div>
              </button>
            </div>
          </div>

          <div id="bulkOptions">
            <div class="field">
              <label for="bulkBatchInput">Jumlah per batch (0 = Pilih Semua)</label>
              <input id="bulkBatchInput" type="number" min="0" step="1" value="0" />
            </div>
          </div>

          <div id="singleOptions" class="hidden">
            <div class="field" style="margin-bottom: 6px;">
              <label for="singleMethodSelect">Metode hapus 1 per 1</label>
              <select id="singleMethodSelect">
                <option value="auto">Otomatis (Menu ... lalu Checkbox)</option>
                <option value="menu">Hanya Menu (...) baris teratas</option>
                <option value="checkbox">Hanya Checkbox baris teratas</option>
              </select>
            </div>
            <label class="check-row">
              <input type="checkbox" id="skipOnErrorCheck" checked />
              <span>Lewati konten jika gagal dihapus</span>
            </label>
          </div>

          <div class="row-2">
            <div class="field">
              <label for="delaySecInput">Jeda antar hapus (dtk)</label>
              <input id="delaySecInput" type="number" min="0.5" step="0.5" value="2.5" />
            </div>
            <div class="field">
              <label for="maxCountInput">Maks hapus (0 = semua)</label>
              <input id="maxCountInput" type="number" min="0" step="1" value="0" />
            </div>
          </div>

          <div>
            <button type="button" class="advanced-toggle" id="advToggleBtn">+ Pengaturan lanjutan</button>
            <div id="advBox" class="field hidden" style="margin-top: 6px;">
              <label for="customKwInput">Kata kunci hapus tambahan (pisah koma)</label>
              <input id="customKwInput" type="text" placeholder="misal: buang, remove, arsipkan" />
            </div>
          </div>

          <div class="actions">
            <button type="button" class="btn btn-danger" id="startBtn">Mulai Hapus</button>
            <button type="button" class="btn btn-warn hidden" id="pauseBtn">Jeda</button>
            <button type="button" class="btn btn-primary hidden" id="resumeBtn">Lanjut</button>
            <button type="button" class="btn btn-secondary hidden" id="stopBtn">Stop</button>
            <button type="button" class="btn btn-secondary" id="diagBtn" title="Periksa elemen tabel tanpa menghapus">Cek</button>
          </div>

          <div class="stats">
            <div>
              <div class="stat-val" id="deletedVal">0</div>
              <div class="stat-lbl">Terhapus</div>
            </div>
            <div>
              <div class="stat-val" id="batchVal">0</div>
              <div class="stat-lbl" id="secondaryStatLbl">Batch</div>
            </div>
            <div>
              <div class="stat-val" id="failedVal">0</div>
              <div class="stat-lbl">Gagal</div>
            </div>
          </div>

          <div class="current-box hidden" id="currentBox"></div>
          <div class="diag-box hidden" id="diagBox"></div>

          <div class="log-box" id="logBox">
            <div class="log-entry log-info">Siap dijalankan di halaman Konten Meta Business Suite.</div>
          </div>
        </div>
      </div>
    `;
    shadow.appendChild(container);
    (document.body || document.documentElement).appendChild(hostEl);

    els = {
      pillBtn: shadow.getElementById("pillBtn"),
      pillDot: shadow.getElementById("pillDot"),
      pillCount: shadow.getElementById("pillCount"),
      panel: shadow.getElementById("panel"),
      dragHandle: shadow.getElementById("dragHandle"),
      minimizeBtn: shadow.getElementById("minimizeBtn"),
      statusBadge: shadow.getElementById("statusBadge"),
      modeBulkBtn: shadow.getElementById("modeBulkBtn"),
      modeSingleBtn: shadow.getElementById("modeSingleBtn"),
      bulkOptions: shadow.getElementById("bulkOptions"),
      singleOptions: shadow.getElementById("singleOptions"),
      bulkBatchInput: shadow.getElementById("bulkBatchInput"),
      singleMethodSelect: shadow.getElementById("singleMethodSelect"),
      skipOnErrorCheck: shadow.getElementById("skipOnErrorCheck"),
      delaySecInput: shadow.getElementById("delaySecInput"),
      maxCountInput: shadow.getElementById("maxCountInput"),
      advToggleBtn: shadow.getElementById("advToggleBtn"),
      advBox: shadow.getElementById("advBox"),
      customKwInput: shadow.getElementById("customKwInput"),
      startBtn: shadow.getElementById("startBtn"),
      pauseBtn: shadow.getElementById("pauseBtn"),
      resumeBtn: shadow.getElementById("resumeBtn"),
      stopBtn: shadow.getElementById("stopBtn"),
      diagBtn: shadow.getElementById("diagBtn"),
      deletedVal: shadow.getElementById("deletedVal"),
      batchVal: shadow.getElementById("batchVal"),
      secondaryStatLbl: shadow.getElementById("secondaryStatLbl"),
      failedVal: shadow.getElementById("failedVal"),
      currentBox: shadow.getElementById("currentBox"),
      diagBox: shadow.getElementById("diagBox"),
      logBox: shadow.getElementById("logBox")
    };

    bindEvents();
    setupDragging();
    applyPanelVisibility();
  }

  function applyPanelVisibility() {
    if (!els.panel || !els.pillBtn) return;
    if (uiPrefs.panelOpen) {
      els.panel.classList.remove("hidden");
      els.pillBtn.classList.add("hidden");
    } else {
      els.panel.classList.add("hidden");
      els.pillBtn.classList.remove("hidden");
    }
  }

  function readConfigFromInputs() {
    const mode = els.modeSingleBtn.classList.contains("active") ? "single" : "bulk";
    const delaySec = Math.max(0.5, parseFloat(els.delaySecInput.value) || 2.5);
    const maxCount = Math.max(0, parseInt(els.maxCountInput.value, 10) || 0);
    const bulkBatchSize = Math.max(0, parseInt(els.bulkBatchInput.value, 10) || 0);
    const singleMethod = els.singleMethodSelect.value || "auto";
    const skipOnError = Boolean(els.skipOnErrorCheck.checked);
    const customDeleteKeywords = (els.customKwInput.value || "").trim();

    return {
      mode,
      delayMs: Math.round(delaySec * 1000),
      maxCount,
      bulkBatchSize,
      singleMethod,
      skipOnError,
      customDeleteKeywords
    };
  }

  function syncInputsFromConfig(cfg) {
    if (!els.modeBulkBtn) return;
    const isSingle = cfg.mode === "single";
    els.modeBulkBtn.classList.toggle("active", !isSingle);
    els.modeSingleBtn.classList.toggle("active", isSingle);
    els.bulkOptions.classList.toggle("hidden", isSingle);
    els.singleOptions.classList.toggle("hidden", !isSingle);
    els.secondaryStatLbl.textContent = isSingle ? "Dilewati" : "Batch";

    els.bulkBatchInput.value = String(cfg.bulkBatchSize ?? 0);
    els.singleMethodSelect.value = cfg.singleMethod || "auto";
    els.skipOnErrorCheck.checked = cfg.skipOnError !== false;
    els.delaySecInput.value = String(((cfg.delayMs || 2500) / 1000).toFixed(1).replace(/\.0$/, ""));
    els.maxCountInput.value = String(cfg.maxCount ?? 0);
    els.customKwInput.value = cfg.customDeleteKeywords || "";
  }

  function handleConfigChange() {
    const cfg = readConfigFromInputs();
    engine.setConfig(cfg);
    saveState(cfg);
  }

  function runDiagnostics() {
    const cfg = readConfigFromInputs();
    const customKws = dom.parseCustomKeywords(cfg.customDeleteKeywords);
    const info = dom.inspectPageDiagnostics(document, customKws);

    els.diagBox.classList.remove("hidden");
    els.diagBox.textContent = "";

    const lines = [
      `• Checkbox Pilih Semua: ${info.hasMasterCheckbox ? "Terdeteksi (" + info.masterState + ")" : "Tidak ditemukan"}`,
      `• Jumlah baris konten terlihat: ${info.rowCount}`,
      `• Konten teratas: ${info.topRowTitle || "-"}`,
      `• Tombol (...) baris teratas: ${info.hasTopRowMoreButton ? "Ada" : "Tidak ada"}`,
      `• Tombol bulk Hapus: ${info.hasBulkDeleteButton ? "Aktif" : "Belum muncul (pilih konten dulu)"}`
    ];
    for (let i = 0; i < lines.length; i++) {
      const div = document.createElement("div");
      div.textContent = lines[i];
      els.diagBox.appendChild(div);
    }

    engine.addLog(`Cek elemen: ${info.rowCount} baris konten terdeteksi.`, info.rowCount > 0 ? "info" : "warn");
  }

  function bindEvents() {
    els.minimizeBtn.addEventListener("click", () => {
      uiPrefs.panelOpen = false;
      applyPanelVisibility();
      saveState({ panelOpen: false });
    });

    els.pillBtn.addEventListener("click", () => {
      uiPrefs.panelOpen = true;
      applyPanelVisibility();
      saveState({ panelOpen: true });
    });

    els.modeBulkBtn.addEventListener("click", () => {
      if (engine.getSnapshot().status === "running") return;
      els.modeBulkBtn.classList.add("active");
      els.modeSingleBtn.classList.remove("active");
      els.bulkOptions.classList.remove("hidden");
      els.singleOptions.classList.add("hidden");
      els.secondaryStatLbl.textContent = "Batch";
      handleConfigChange();
    });

    els.modeSingleBtn.addEventListener("click", () => {
      if (engine.getSnapshot().status === "running") return;
      els.modeSingleBtn.classList.add("active");
      els.modeBulkBtn.classList.remove("active");
      els.singleOptions.classList.remove("hidden");
      els.bulkOptions.classList.add("hidden");
      els.secondaryStatLbl.textContent = "Dilewati";
      handleConfigChange();
    });

    [
      els.bulkBatchInput,
      els.singleMethodSelect,
      els.skipOnErrorCheck,
      els.delaySecInput,
      els.maxCountInput,
      els.customKwInput
    ].forEach((input) => {
      input.addEventListener("change", handleConfigChange);
    });

    els.advToggleBtn.addEventListener("click", () => {
      const isHidden = els.advBox.classList.toggle("hidden");
      els.advToggleBtn.textContent = isHidden ? "+ Pengaturan lanjutan" : "- Tutup pengaturan lanjutan";
    });

    els.startBtn.addEventListener("click", () => {
      const cfg = readConfigFromInputs();
      saveState(cfg);
      els.diagBox.classList.add("hidden");
      engine.start(cfg);
    });

    els.pauseBtn.addEventListener("click", () => engine.pause());
    els.resumeBtn.addEventListener("click", () => engine.resume());
    els.stopBtn.addEventListener("click", () => engine.stop());
    els.diagBtn.addEventListener("click", runDiagnostics);
  }

  function setupDragging() {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startRight = 18;
    let startBottom = 18;

    els.dragHandle.addEventListener("mousedown", (e) => {
      if (e.target === els.minimizeBtn) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const computed = window.getComputedStyle(hostEl);
      startRight = parseFloat(computed.right) || 18;
      startBottom = parseFloat(computed.bottom) || 18;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newRight = Math.max(8, Math.min(window.innerWidth - 100, startRight - dx));
      const newBottom = Math.max(8, Math.min(window.innerHeight - 60, startBottom - dy));
      hostEl.style.right = newRight + "px";
      hostEl.style.bottom = newBottom + "px";
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

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

  function renderSnapshot(snap) {
    if (!els.statusBadge) return;

    const isRunning = snap.status === "running";
    const isPaused = snap.status === "paused";
    const isActive = isRunning || isPaused;

    els.statusBadge.textContent = statusLabel(snap.status);
    els.statusBadge.className = "badge " + snap.status;
    els.pillDot.className = "pill-dot " + snap.status;
    els.pillCount.textContent = String(snap.deletedCount);

    els.deletedVal.textContent = String(snap.deletedCount);
    els.batchVal.textContent = snap.mode === "single" ? String(snap.skippedCount) : String(snap.batchCount);
    els.secondaryStatLbl.textContent = snap.mode === "single" ? "Dilewati" : "Batch";
    els.failedVal.textContent = String(snap.failedCount);

    els.startBtn.classList.toggle("hidden", isActive);
    els.pauseBtn.classList.toggle("hidden", !isRunning);
    els.resumeBtn.classList.toggle("hidden", !isPaused);
    els.stopBtn.classList.toggle("hidden", !isActive);

    // Disable config editing while active
    [
      els.bulkBatchInput,
      els.singleMethodSelect,
      els.skipOnErrorCheck,
      els.delaySecInput,
      els.maxCountInput,
      els.customKwInput
    ].forEach((input) => {
      input.disabled = isActive;
    });

    if (snap.currentItem) {
      els.currentBox.classList.remove("hidden");
      els.currentBox.textContent = "Memproses: " + snap.currentItem;
    } else {
      els.currentBox.classList.add("hidden");
    }

    if (snap.logs && snap.logs.length > 0) {
      els.logBox.textContent = "";
      for (const item of snap.logs) {
        const row = document.createElement("div");
        row.className = "log-entry log-" + (item.level || "info");
        const timeSpan = document.createElement("span");
        timeSpan.className = "log-time";
        timeSpan.textContent = "[" + item.time + "]";
        row.appendChild(timeSpan);
        row.appendChild(document.createTextNode(" " + item.message));
        els.logBox.appendChild(row);
      }
    }
  }

  // Message bridge with popup.js
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === "GET_STATE") {
      const customKws = dom.parseCustomKeywords(engine.getSnapshot().config.customDeleteKeywords);
      sendResponse({
        snapshot: engine.getSnapshot(),
        panelOpen: uiPrefs.panelOpen,
        diagnostics: dom.inspectPageDiagnostics(document, customKws)
      });
      return;
    }

    if (message.type === "DIAGNOSE") {
      runDiagnostics();
      const customKws = dom.parseCustomKeywords(engine.getSnapshot().config.customDeleteKeywords);
      sendResponse({
        ok: true,
        diagnostics: dom.inspectPageDiagnostics(document, customKws)
      });
      return;
    }

    if (message.type === "SET_CONFIG") {
      engine.setConfig(message.config);
      syncInputsFromConfig(engine.getSnapshot().config);
      saveState(engine.getSnapshot().config);
      sendResponse({ ok: true, snapshot: engine.getSnapshot() });
      return;
    }

    if (message.type === "START") {
      if (message.config) {
        engine.setConfig(message.config);
        syncInputsFromConfig(engine.getSnapshot().config);
        saveState(engine.getSnapshot().config);
      }
      engine.start(message.config || readConfigFromInputs());
      sendResponse({ ok: true, snapshot: engine.getSnapshot() });
      return;
    }

    if (message.type === "PAUSE") {
      engine.pause();
      sendResponse({ ok: true, snapshot: engine.getSnapshot() });
      return;
    }

    if (message.type === "RESUME") {
      engine.resume();
      sendResponse({ ok: true, snapshot: engine.getSnapshot() });
      return;
    }

    if (message.type === "STOP") {
      engine.stop();
      sendResponse({ ok: true, snapshot: engine.getSnapshot() });
      return;
    }

    if (message.type === "TOGGLE_PANEL") {
      uiPrefs.panelOpen = typeof message.open === "boolean" ? message.open : !uiPrefs.panelOpen;
      applyPanelVisibility();
      saveState({ panelOpen: uiPrefs.panelOpen });
      sendResponse({ ok: true, panelOpen: uiPrefs.panelOpen });
    }
  });

  // Initialize UI and restore saved settings
  function init() {
    createPanelDOM();
    getSavedState((saved) => {
      if (typeof saved.panelOpen === "boolean") {
        uiPrefs.panelOpen = saved.panelOpen;
        applyPanelVisibility();
      }
      const restoredCfg = Object.assign({}, engineFactory.DEFAULT_CONFIG, saved);
      engine.setConfig(restoredCfg);
      syncInputsFromConfig(engine.getSnapshot().config);
      renderSnapshot(engine.getSnapshot());
    });

    // Keep widget mounted if Meta Business Suite SPA replaces body
    const observer = new MutationObserver(() => {
      if (!hostEl || !hostEl.isConnected) {
        createPanelDOM();
        renderSnapshot(engine.getSnapshot());
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: false });
  }

  init();
})();
