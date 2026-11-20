(function () {
  "use strict";

  if (window.__META_AUTO_DELETER_INITIALIZED__) return;
  window.__META_AUTO_DELETER_INITIALIZED__ = true;

  const dom = globalThis.MetaDeleterDOM;
  const engineFactory = globalThis.MetaDeleterEngine;
  const cdom = globalThis.MetaComposerDOM;
  const cengineFactory = globalThis.MetaComposerEngine;

  if (!dom || !engineFactory || !cdom || !cengineFactory) {
    console.error("[Meta Auto Manager] Dependencies not loaded.");
    return;
  }

  const STORAGE_KEY_DEL = "meta_auto_deleter_settings_v1";
  const STORAGE_KEY_COMP = "meta_auto_composer_settings_v1";

  function detectDefaultTab() {
    const href = String(location.href || "").toLowerCase();
    if (href.includes("composer") || href.includes("bulk_upload")) {
      return "composer";
    }
    return "delete";
  }

  let uiPrefs = {
    panelOpen: true,
    activeTab: detectDefaultTab(), // "composer" | "delete"
    displayMode: "floating", // "floating" | "sidebar"
    pushPage: true,
    settingsOpen: false,
    floatingRight: 18,
    floatingBottom: 18
  };

  function getSavedState(key, cb) {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      cb({});
      return;
    }
    chrome.storage.local.get([key], (res) => {
      cb((res && res[key]) || {});
    });
  }

  function saveState(key, partial) {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;
    getSavedState(key, (curr) => {
      chrome.storage.local.set({ [key]: Object.assign({}, curr, partial) });
    });
  }

  const deleteEngine = engineFactory.createEngine({
    document,
    dom,
    onUpdate: (snapshot) => {
      renderDeleteSnapshot(snapshot);
      notifyBadge(snapshot, "delete");
    }
  });

  const composerEngine = cengineFactory.createComposerEngine({
    document,
    composerDom: cdom,
    domBase: dom,
    onSaveLastSchedule: (iso) => {
      saveState(STORAGE_KEY_COMP, { lastScheduledIso: iso });
      updateLastScheduleHint(iso);
    },
    onUpdate: (snapshot) => {
      renderComposerSnapshot(snapshot);
      notifyBadge(snapshot, "composer");
    }
  });

  function notifyBadge(snapshot, kind) {
    try {
      const payload = kind === "composer"
        ? {
            status: snapshot.status,
            deletedCount: snapshot.processedCount
          }
        : snapshot;
      chrome.runtime.sendMessage({ type: "STATE_UPDATED", snapshot: payload }).catch(() => {});
    } catch (_err) {
      // ignore
    }
  }

  let hostEl = null;
  let shadow = null;
  let els = {};

  const SIDEBAR_WIDTH = 376;

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

      :host(.sidebar-mode) {
        top: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        left: auto !important;
        height: 100vh;
      }

      :host(.sidebar-mode.collapsed) {
        top: 50% !important;
        bottom: auto !important;
        height: auto;
        transform: translateY(-50%);
      }

      * { box-sizing: border-box; }

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
      }

      .pill-btn.sidebar-mode {
        border-radius: 12px 0 0 12px;
        padding: 12px 10px;
        border-right: none;
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
        width: 376px;
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 30px);
        display: flex;
        flex-direction: column;
        background: #FFFFFF;
        border: 1px solid #E5E7EB;
        border-radius: 14px;
        box-shadow: 0 18px 42px rgba(15, 23, 42, 0.24);
        overflow: hidden;
      }

      .panel.sidebar-mode {
        width: ${SIDEBAR_WIDTH}px;
        max-width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
        border-top: none;
        border-bottom: none;
        border-right: none;
        border-left: 1px solid #CBD5E1;
        box-shadow: -8px 0 28px rgba(15, 23, 42, 0.14);
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: linear-gradient(135deg, #1877F2 0%, #125AC4 100%);
        color: #FFFFFF;
        cursor: grab;
        user-select: none;
      }
      .panel.sidebar-mode .header { cursor: default; }
      .header:active { cursor: grabbing; }
      .panel.sidebar-mode .header:active { cursor: default; }

      .header-left {
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .title { font-size: 13px; font-weight: 700; }

      .badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
        color: #FFFFFF;
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
        font-size: 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn:hover { background: rgba(255, 255, 255, 0.28); }
      .icon-btn.active { background: rgba(255, 255, 255, 0.36); }

      .settings-drawer {
        background: #F8FAFC;
        border-bottom: 1px solid #E2E8F0;
        padding: 9px 12px;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .seg-group {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px;
      }
      .seg-btn {
        border: 1.5px solid #CBD5E1;
        background: #FFFFFF;
        border-radius: 7px;
        padding: 6px 8px;
        font-size: 11.5px;
        font-weight: 700;
        color: #334155;
        cursor: pointer;
      }
      .seg-btn.active {
        border-color: #1877F2;
        background: #EFF6FF;
        color: #1D4ED8;
      }
      .btn-mini {
        border: 1px solid #BFDBFE;
        background: #EFF6FF;
        color: #1D4ED8;
        border-radius: 6px;
        padding: 5px 8px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }
      .btn-mini:hover { background: #DBEAFE; }

      .top-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        background: #F1F5F9;
        border-bottom: 1px solid #E2E8F0;
        padding: 4px;
        gap: 4px;
      }
      .top-tab {
        border: none;
        background: transparent;
        padding: 7px 8px;
        border-radius: 7px;
        font-size: 12px;
        font-weight: 700;
        color: #475569;
        cursor: pointer;
      }
      .top-tab.active {
        background: #FFFFFF;
        color: #1877F2;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
      }

      .body {
        padding: 11px 13px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }

      .card {
        border: 1px solid #E5E7EB;
        border-radius: 9px;
        padding: 9px 10px;
        background: #FAFAFA;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .card-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .section-label {
        font-size: 11px;
        font-weight: 700;
        color: #374151;
        text-transform: uppercase;
        letter-spacing: 0.3px;
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
      }
      .mode-card.active {
        border-color: #1877F2;
        background: #EFF6FF;
      }
      .mode-card-title { font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 2px; }
      .mode-card-desc { font-size: 10.5px; color: #6B7280; line-height: 1.25; }

      .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }

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
      .field input, .field select, .field textarea {
        width: 100%;
        padding: 5px 7px;
        font-size: 12px;
        font-family: inherit;
        border: 1px solid #D1D5DB;
        border-radius: 6px;
        background: #FFFFFF;
        color: #111827;
        outline: none;
      }
      .field textarea {
        resize: vertical;
        min-height: 48px;
      }
      .field input:focus, .field select:focus, .field textarea:focus {
        border-color: #1877F2;
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .chip {
        border: 1px solid #BFDBFE;
        background: #EFF6FF;
        color: #1D4ED8;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 999px;
        cursor: pointer;
      }
      .chip:hover { background: #DBEAFE; }

      .hint {
        font-size: 10.5px;
        color: #6B7280;
        line-height: 1.35;
      }

      .check-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        font-weight: 600;
        color: #1F2937;
        cursor: pointer;
      }
      .check-row input { margin: 0; cursor: pointer; }

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

      .preview-box {
        background: #F0FDF4;
        border: 1px solid #BBF7D0;
        border-radius: 7px;
        padding: 6px 8px;
        font-size: 10.5px;
        color: #166534;
        line-height: 1.4;
      }

      .actions { display: flex; gap: 7px; }
      .btn {
        flex: 1;
        border: none;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-danger { background: #DC2626; color: #FFFFFF; }
      .btn-warn { background: #F59E0B; color: #111827; }
      .btn-primary { background: #1877F2; color: #FFFFFF; }
      .btn-secondary {
        background: #F3F4F6;
        color: #1F2937;
        border: 1px solid #D1D5DB;
        flex: 0 0 auto;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 9px;
        padding: 6px 8px;
        text-align: center;
      }
      .stat-val { font-size: 14px; font-weight: 800; color: #111827; }
      .stat-lbl { font-size: 10px; color: #6B7280; }

      .current-box {
        font-size: 11px;
        color: #374151;
        background: #EFF6FF;
        border: 1px solid #BFDBFE;
        border-radius: 7px;
        padding: 5px 8px;
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
        padding: 6px 8px;
        line-height: 1.4;
      }

      .log-box {
        max-height: 120px;
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

  function defaultDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function defaultTimeStr() {
    const d = new Date(Date.now() + 20 * 60000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
      <button type="button" class="pill-btn hidden" id="pillBtn" title="Buka Meta Auto Manager">
        <span class="pill-dot" id="pillDot"></span>
        <span id="pillLabel">Auto Manager (0)</span>
      </button>

      <div class="panel" id="panel">
        <div class="header" id="dragHandle">
          <div class="header-left">
            <span class="title">Meta Auto Manager</span>
            <span class="badge" id="statusBadge">Siap</span>
          </div>
          <div class="header-actions">
            <button type="button" class="icon-btn" id="toggleLayoutBtn" title="Pindah ke Sidebar / Mengambang">&#9707;</button>
            <button type="button" class="icon-btn" id="settingsBtn" title="Pengaturan tampilan">&#9881;</button>
            <button type="button" class="icon-btn" id="minimizeBtn" title="Kecilkan panel">&#8212;</button>
          </div>
        </div>

        <div class="settings-drawer hidden" id="settingsDrawer">
          <div class="section-label">Mode Tampilan</div>
          <div class="seg-group">
            <button type="button" class="seg-btn active" id="viewFloatingBtn">Mengambang</button>
            <button type="button" class="seg-btn" id="viewSidebarBtn">Sidebar Kanan</button>
          </div>
          <label class="check-row hidden" id="pushPageRow" style="font-weight:500;">
            <input type="checkbox" id="pushPageCheck" checked />
            <span>Geser halaman agar tidak tertutup</span>
          </label>
          <button type="button" class="btn-mini" id="openBrowserSidePanelBtn">Buka di Side Panel Browser</button>
          <div class="hint hidden" id="sidePanelNotice"></div>
        </div>

        <div class="top-tabs">
          <button type="button" class="top-tab" id="tabComposerBtn">Isi &amp; Jadwal</button>
          <button type="button" class="top-tab" id="tabDeleteBtn">Hapus Konten</button>
        </div>

        <!-- TAB 1: COMPOSER (DESKRIPSI, JADWAL, COVER) -->
        <div class="body" id="composerPane">
          <div class="card">
            <div class="card-hdr">
              <label class="check-row">
                <input type="checkbox" id="cEnableDesc" checked />
                <span>Isi Deskripsi Otomatis</span>
              </label>
            </div>
            <div id="cDescBody">
              <div class="field" style="margin-bottom:6px;">
                <label for="cCustomTitle">Judul utama (kosongkan = pakai nama video)</label>
                <input id="cCustomTitle" type="text" placeholder="misal: My Online Girlfriend" />
              </div>
              <div class="field" style="margin-bottom:5px;">
                <label for="cDescTemplate">Template deskripsi</label>
                <textarea id="cDescTemplate">{judul} Episode {episode}</textarea>
              </div>
              <div class="chip-row" style="margin-bottom:5px;">
                <button type="button" class="chip" data-tpl="{judul} Episode {episode}">Judul + Ep</button>
                <button type="button" class="chip" data-tpl="{nama_video}">Nama Video</button>
                <button type="button" class="chip" data-tpl="{judul} Ep {episode_02} #reels #fyp">Judul + Ep02 + Tag</button>
                <button type="button" class="chip" data-tpl="{nama_video} - Episode {episode}">Video + Ep</button>
              </div>
              <div class="hint" style="margin-bottom:6px;">
                Variabel: <code>{judul}</code>, <code>{nama_video}</code>, <code>{episode}</code>, <code>{episode_02}</code>, <code>{no}</code>, <code>{tanggal}</code>, <code>{jam}</code>
              </div>
              <div class="row-3" style="margin-bottom:5px;">
                <div class="field">
                  <label for="cEpMode">Episode</label>
                  <select id="cEpMode">
                    <option value="sequence">Urut</option>
                    <option value="filename">Dari nama</option>
                  </select>
                </div>
                <div class="field">
                  <label for="cStartEp">Mulai Ep</label>
                  <input id="cStartEp" type="number" min="0" value="1" />
                </div>
                <div class="field">
                  <label for="cEpStep">Tambah (+)</label>
                  <input id="cEpStep" type="number" min="1" value="1" />
                </div>
              </div>
              <label class="check-row" style="font-weight:500;">
                <input type="checkbox" id="cCleanUnderscore" checked />
                <span>Rapikan tanda "_" pada nama video</span>
              </label>
            </div>
          </div>

          <div class="card">
            <div class="card-hdr">
              <label class="check-row">
                <input type="checkbox" id="cEnableSched" checked />
                <span>Jadwal Otomatis</span>
              </label>
            </div>
            <div id="cSchedBody">
              <label class="check-row" style="font-weight:500; margin-bottom:5px;">
                <input type="checkbox" id="cUseLastSched" />
                <span>Lanjutkan dari jadwal terakhir (+1 interval)</span>
              </label>
              <div class="hint hidden" id="cLastSchedHint" style="margin-bottom:5px;"></div>

              <div class="row-2" style="margin-bottom:6px;">
                <div class="field">
                  <label for="cStartDate">Tanggal mulai</label>
                  <input id="cStartDate" type="date" />
                </div>
                <div class="field">
                  <label for="cStartTime">Jam mulai</label>
                  <input id="cStartTime" type="time" />
                </div>
              </div>

              <div class="row-2" style="margin-bottom:6px;">
                <div class="field">
                  <label for="cIntervalVal">Setiap</label>
                  <input id="cIntervalVal" type="number" min="1" value="1" />
                </div>
                <div class="field">
                  <label for="cIntervalUnit">Satuan waktu</label>
                  <select id="cIntervalUnit">
                    <option value="minute">Menit</option>
                    <option value="hour" selected>Jam</option>
                    <option value="day">Hari</option>
                  </select>
                </div>
              </div>

              <button type="button" class="advanced-toggle" id="cAdvSchedBtn">+ Pengaturan jadwal lanjutan</button>
              <div id="cAdvSchedBox" class="hidden" style="margin-top:6px; display:flex; flex-direction:column; gap:6px;">
                <label class="check-row" style="font-weight:500;">
                  <input type="checkbox" id="cWindowEnabled" />
                  <span>Batasi jam aktif harian</span>
                </label>
                <div class="row-2">
                  <div class="field">
                    <label for="cWindowStart">Jam mulai aktif</label>
                    <input id="cWindowStart" type="time" value="08:00" />
                  </div>
                  <div class="field">
                    <label for="cWindowEnd">Jam selesai aktif</label>
                    <input id="cWindowEnd" type="time" value="22:00" />
                  </div>
                </div>
                <div class="row-2">
                  <div class="field">
                    <label for="cMaxPerDay">Maks/hari (0=bebas)</label>
                    <input id="cMaxPerDay" type="number" min="0" value="0" />
                  </div>
                  <div class="field">
                    <label for="cJitterMin">Acak (± menit)</label>
                    <input id="cJitterMin" type="number" min="0" value="0" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-hdr">
              <label class="check-row">
                <input type="checkbox" id="cEnableCover" />
                <span>Unggah Cover Otomatis</span>
              </label>
            </div>
            <div id="cCoverBody" class="hidden">
              <div class="field" style="margin-bottom:5px;">
                <label for="cCoverFiles">Pilih 1 atau banyak gambar cover</label>
                <input id="cCoverFiles" type="file" accept="image/*" multiple />
                <div class="hint" id="cCoverCountText">Belum ada gambar dipilih.</div>
              </div>
              <div class="field" style="margin-bottom:5px;">
                <label for="cCoverMode">Pencocokan cover ke video</label>
                <select id="cCoverMode">
                  <option value="sequential">Urutan file (Gambar 1 -> Video 1, dst)</option>
                  <option value="filename">Cocokkan nama file / nomor episode</option>
                  <option value="single">1 gambar pertama untuk semua video</option>
                </select>
              </div>
              <label class="check-row" style="font-weight:500;">
                <input type="checkbox" id="cLoopCovers" />
                <span>Ulangi gambar jika video lebih banyak</span>
              </label>
            </div>
          </div>

          <div class="row-3">
            <div class="field">
              <label for="cStartRow">Mulai baris</label>
              <input id="cStartRow" type="number" min="1" value="1" />
            </div>
            <div class="field">
              <label for="cMaxRows">Maks (0=all)</label>
              <input id="cMaxRows" type="number" min="0" value="0" />
            </div>
            <div class="field">
              <label for="cDelaySec">Jeda (dtk)</label>
              <input id="cDelaySec" type="number" min="0.3" step="0.3" value="1.2" />
            </div>
          </div>

          <label class="check-row" style="font-weight:500;">
            <input type="checkbox" id="cOnlyChecked" />
            <span>Hanya proses baris yang dicentang</span>
          </label>

          <div class="preview-box" id="cPreviewBox">Preview akan tampil di sini...</div>

          <div class="actions">
            <button type="button" class="btn btn-primary" id="cStartBtn">Mulai Isi &amp; Jadwal</button>
            <button type="button" class="btn btn-warn hidden" id="cPauseBtn">Jeda</button>
            <button type="button" class="btn btn-primary hidden" id="cResumeBtn">Lanjut</button>
            <button type="button" class="btn btn-secondary hidden" id="cStopBtn">Stop</button>
            <button type="button" class="btn btn-secondary" id="cDiagBtn" title="Periksa kolom Bulk Upload">Cek</button>
          </div>

          <div class="stats">
            <div>
              <div class="stat-val" id="cDoneVal">0</div>
              <div class="stat-lbl">Selesai</div>
            </div>
            <div>
              <div class="stat-val" id="cTotalVal">0</div>
              <div class="stat-lbl">Target</div>
            </div>
            <div>
              <div class="stat-val" id="cFailVal">0</div>
              <div class="stat-lbl">Catatan</div>
            </div>
          </div>

          <div class="current-box hidden" id="cCurrentBox"></div>
          <div class="diag-box hidden" id="cDiagBox"></div>
          <div class="log-box" id="cLogBox">
            <div class="log-entry log-info">Siap digunakan di halaman Bulk upload reels.</div>
          </div>
        </div>

        <!-- TAB 2: DELETE (HAPUS KONTEN) -->
        <div class="body hidden" id="deletePane">
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
    (document.documentElement || document.body).appendChild(hostEl);

    const id = (s) => shadow.getElementById(s);
    els = {
      pillBtn: id("pillBtn"),
      pillDot: id("pillDot"),
      pillLabel: id("pillLabel"),
      panel: id("panel"),
      dragHandle: id("dragHandle"),
      toggleLayoutBtn: id("toggleLayoutBtn"),
      settingsBtn: id("settingsBtn"),
      minimizeBtn: id("minimizeBtn"),
      settingsDrawer: id("settingsDrawer"),
      viewFloatingBtn: id("viewFloatingBtn"),
      viewSidebarBtn: id("viewSidebarBtn"),
      pushPageRow: id("pushPageRow"),
      pushPageCheck: id("pushPageCheck"),
      openBrowserSidePanelBtn: id("openBrowserSidePanelBtn"),
      sidePanelNotice: id("sidePanelNotice"),
      statusBadge: id("statusBadge"),
      tabComposerBtn: id("tabComposerBtn"),
      tabDeleteBtn: id("tabDeleteBtn"),
      composerPane: id("composerPane"),
      deletePane: id("deletePane"),

      // Composer elements
      cEnableDesc: id("cEnableDesc"),
      cDescBody: id("cDescBody"),
      cCustomTitle: id("cCustomTitle"),
      cDescTemplate: id("cDescTemplate"),
      cEpMode: id("cEpMode"),
      cStartEp: id("cStartEp"),
      cEpStep: id("cEpStep"),
      cCleanUnderscore: id("cCleanUnderscore"),
      cEnableSched: id("cEnableSched"),
      cSchedBody: id("cSchedBody"),
      cUseLastSched: id("cUseLastSched"),
      cLastSchedHint: id("cLastSchedHint"),
      cStartDate: id("cStartDate"),
      cStartTime: id("cStartTime"),
      cIntervalVal: id("cIntervalVal"),
      cIntervalUnit: id("cIntervalUnit"),
      cAdvSchedBtn: id("cAdvSchedBtn"),
      cAdvSchedBox: id("cAdvSchedBox"),
      cWindowEnabled: id("cWindowEnabled"),
      cWindowStart: id("cWindowStart"),
      cWindowEnd: id("cWindowEnd"),
      cMaxPerDay: id("cMaxPerDay"),
      cJitterMin: id("cJitterMin"),
      cEnableCover: id("cEnableCover"),
      cCoverBody: id("cCoverBody"),
      cCoverFiles: id("cCoverFiles"),
      cCoverCountText: id("cCoverCountText"),
      cCoverMode: id("cCoverMode"),
      cLoopCovers: id("cLoopCovers"),
      cStartRow: id("cStartRow"),
      cMaxRows: id("cMaxRows"),
      cDelaySec: id("cDelaySec"),
      cOnlyChecked: id("cOnlyChecked"),
      cPreviewBox: id("cPreviewBox"),
      cStartBtn: id("cStartBtn"),
      cPauseBtn: id("cPauseBtn"),
      cResumeBtn: id("cResumeBtn"),
      cStopBtn: id("cStopBtn"),
      cDiagBtn: id("cDiagBtn"),
      cDoneVal: id("cDoneVal"),
      cTotalVal: id("cTotalVal"),
      cFailVal: id("cFailVal"),
      cCurrentBox: id("cCurrentBox"),
      cDiagBox: id("cDiagBox"),
      cLogBox: id("cLogBox"),

      // Delete elements
      modeBulkBtn: id("modeBulkBtn"),
      modeSingleBtn: id("modeSingleBtn"),
      bulkOptions: id("bulkOptions"),
      singleOptions: id("singleOptions"),
      bulkBatchInput: id("bulkBatchInput"),
      singleMethodSelect: id("singleMethodSelect"),
      skipOnErrorCheck: id("skipOnErrorCheck"),
      delaySecInput: id("delaySecInput"),
      maxCountInput: id("maxCountInput"),
      advToggleBtn: id("advToggleBtn"),
      advBox: id("advBox"),
      customKwInput: id("customKwInput"),
      startBtn: id("startBtn"),
      pauseBtn: id("pauseBtn"),
      resumeBtn: id("resumeBtn"),
      stopBtn: id("stopBtn"),
      diagBtn: id("diagBtn"),
      deletedVal: id("deletedVal"),
      batchVal: id("batchVal"),
      secondaryStatLbl: id("secondaryStatLbl"),
      failedVal: id("failedVal"),
      currentBox: id("currentBox"),
      diagBox: id("diagBox"),
      logBox: id("logBox")
    };

    els.cStartDate.value = defaultDateStr();
    els.cStartTime.value = defaultTimeStr();

    bindEvents();
    setupDragging();
    applyDisplayMode();
    applyPanelVisibility();
    applyActiveTab();
  }

  let savedBodyMarginRight = null;

  function applyDisplayMode() {
    if (!hostEl || !els.panel || !els.pillBtn) return;
    const isSidebar = uiPrefs.displayMode === "sidebar";

    hostEl.classList.toggle("sidebar-mode", isSidebar);
    hostEl.classList.toggle("collapsed", isSidebar && !uiPrefs.panelOpen);
    els.panel.classList.toggle("sidebar-mode", isSidebar);
    els.pillBtn.classList.toggle("sidebar-mode", isSidebar);

    if (els.viewFloatingBtn && els.viewSidebarBtn) {
      els.viewFloatingBtn.classList.toggle("active", !isSidebar);
      els.viewSidebarBtn.classList.toggle("active", isSidebar);
    }
    if (els.pushPageRow && els.pushPageCheck) {
      els.pushPageRow.classList.toggle("hidden", !isSidebar);
      els.pushPageCheck.checked = uiPrefs.pushPage !== false;
    }
    if (els.toggleLayoutBtn) {
      els.toggleLayoutBtn.innerHTML = isSidebar ? "&#10064;" : "&#9707;";
      els.toggleLayoutBtn.title = isSidebar ? "Ubah ke mode Mengambang" : "Ubah ke mode Sidebar";
    }
    if (els.settingsDrawer && els.settingsBtn) {
      els.settingsDrawer.classList.toggle("hidden", !uiPrefs.settingsOpen);
      els.settingsBtn.classList.toggle("active", uiPrefs.settingsOpen);
    }

    if (isSidebar) {
      hostEl.style.right = "";
      hostEl.style.bottom = "";
      if (document.body) {
        if (savedBodyMarginRight === null) {
          savedBodyMarginRight = document.body.style.marginRight || "";
        }
        if (uiPrefs.panelOpen && uiPrefs.pushPage !== false) {
          document.body.style.marginRight = SIDEBAR_WIDTH + "px";
        } else {
          document.body.style.marginRight = savedBodyMarginRight;
        }
      }
    } else {
      hostEl.style.right = (uiPrefs.floatingRight || 18) + "px";
      hostEl.style.bottom = (uiPrefs.floatingBottom || 18) + "px";
      if (document.body && savedBodyMarginRight !== null) {
        document.body.style.marginRight = savedBodyMarginRight;
      }
    }
  }

  function applyPanelVisibility() {
    if (!els.panel || !els.pillBtn) return;
    els.panel.classList.toggle("hidden", !uiPrefs.panelOpen);
    els.pillBtn.classList.toggle("hidden", uiPrefs.panelOpen);
    applyDisplayMode();
  }

  function applyActiveTab() {
    if (!els.tabComposerBtn) return;
    const isComposer = uiPrefs.activeTab === "composer";
    els.tabComposerBtn.classList.toggle("active", isComposer);
    els.tabDeleteBtn.classList.toggle("active", !isComposer);
    els.composerPane.classList.toggle("hidden", !isComposer);
    els.deletePane.classList.toggle("hidden", isComposer);
    updateHeaderBadge();
    if (isComposer) renderComposerPreview();
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

  function updateHeaderBadge() {
    const snap = uiPrefs.activeTab === "composer"
      ? composerEngine.getSnapshot()
      : deleteEngine.getSnapshot();
    const count = uiPrefs.activeTab === "composer" ? snap.processedCount : snap.deletedCount;
    els.statusBadge.textContent = statusLabel(snap.status);
    els.statusBadge.className = "badge " + snap.status;
    els.pillDot.className = "pill-dot " + snap.status;
    els.pillLabel.textContent = uiPrefs.activeTab === "composer"
      ? `Auto Isi (${count})`
      : `Auto Hapus (${count})`;
  }

  function updateLastScheduleHint(iso) {
    if (!els.cLastSchedHint) return;
    if (!iso) {
      els.cLastSchedHint.classList.add("hidden");
      return;
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const pad = (n) => String(n).padStart(2, "0");
    els.cLastSchedHint.textContent = `Jadwal terakhir tersimpan: ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    els.cLastSchedHint.classList.remove("hidden");
  }

  // ---- Delete Tab Config & Render ----
  function readDeleteConfigFromInputs() {
    const mode = els.modeSingleBtn.classList.contains("active") ? "single" : "bulk";
    return {
      mode,
      delayMs: Math.round(Math.max(0.5, parseFloat(els.delaySecInput.value) || 2.5) * 1000),
      maxCount: Math.max(0, parseInt(els.maxCountInput.value, 10) || 0),
      bulkBatchSize: Math.max(0, parseInt(els.bulkBatchInput.value, 10) || 0),
      singleMethod: els.singleMethodSelect.value || "auto",
      skipOnError: Boolean(els.skipOnErrorCheck.checked),
      customDeleteKeywords: (els.customKwInput.value || "").trim()
    };
  }

  function syncDeleteInputs(cfg) {
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

  function renderDeleteSnapshot(snap) {
    if (!els.deletedVal) return;
    const isRunning = snap.status === "running";
    const isPaused = snap.status === "paused";
    const isActive = isRunning || isPaused;

    els.deletedVal.textContent = String(snap.deletedCount);
    els.batchVal.textContent = snap.mode === "single" ? String(snap.skippedCount) : String(snap.batchCount);
    els.secondaryStatLbl.textContent = snap.mode === "single" ? "Dilewati" : "Batch";
    els.failedVal.textContent = String(snap.failedCount);

    els.startBtn.classList.toggle("hidden", isActive);
    els.pauseBtn.classList.toggle("hidden", !isRunning);
    els.resumeBtn.classList.toggle("hidden", !isPaused);
    els.stopBtn.classList.toggle("hidden", !isActive);

    [
      els.bulkBatchInput,
      els.singleMethodSelect,
      els.skipOnErrorCheck,
      els.delaySecInput,
      els.maxCountInput,
      els.customKwInput
    ].forEach((input) => { input.disabled = isActive; });

    if (snap.currentItem) {
      els.currentBox.classList.remove("hidden");
      els.currentBox.textContent = "Memproses: " + snap.currentItem;
    } else {
      els.currentBox.classList.add("hidden");
    }

    renderLogList(els.logBox, snap.logs);
    updateHeaderBadge();
  }

  function runDeleteDiagnostics() {
    const cfg = readDeleteConfigFromInputs();
    const info = dom.inspectPageDiagnostics(document, dom.parseCustomKeywords(cfg.customDeleteKeywords));
    els.diagBox.classList.remove("hidden");
    els.diagBox.textContent = "";
    [
      `• Checkbox Pilih Semua: ${info.hasMasterCheckbox ? "Terdeteksi (" + info.masterState + ")" : "Tidak ditemukan"}`,
      `• Jumlah baris konten terlihat: ${info.rowCount}`,
      `• Konten teratas: ${info.topRowTitle || "-"}`,
      `• Tombol (...) baris teratas: ${info.hasTopRowMoreButton ? "Ada" : "Tidak ada"}`,
      `• Tombol bulk Hapus: ${info.hasBulkDeleteButton ? "Aktif" : "Belum muncul (pilih konten dulu)"}`
    ].forEach((txt) => {
      const div = document.createElement("div");
      div.textContent = txt;
      els.diagBox.appendChild(div);
    });
    deleteEngine.addLog(`Cek elemen: ${info.rowCount} baris konten terdeteksi.`, info.rowCount > 0 ? "info" : "warn");
  }

  // ---- Composer Tab Config & Render ----
  function readComposerConfigFromInputs() {
    const prev = composerEngine.getSnapshot().config;
    const windowEnabled = Boolean(els.cWindowEnabled.checked);
    const maxPerDay = Math.max(0, parseInt(els.cMaxPerDay.value, 10) || 0);
    const jitterMin = Math.max(0, parseInt(els.cJitterMin.value, 10) || 0);

    return {
      enableDescription: Boolean(els.cEnableDesc.checked),
      customTitle: els.cCustomTitle.value || "",
      descriptionTemplate: els.cDescTemplate.value || "",
      episodeMode: els.cEpMode.value || "sequence",
      startEpisode: Math.max(0, parseInt(els.cStartEp.value, 10) || 0),
      episodeStep: Math.max(1, parseInt(els.cEpStep.value, 10) || 1),
      cleanVideoUnderscores: Boolean(els.cCleanUnderscore.checked),

      enableSchedule: Boolean(els.cEnableSched.checked),
      useLastScheduled: Boolean(els.cUseLastSched.checked),
      lastScheduledIso: prev.lastScheduledIso || "",
      scheduleStartDate: els.cStartDate.value || defaultDateStr(),
      scheduleStartTime: els.cStartTime.value || defaultTimeStr(),
      intervalValue: Math.max(1, parseInt(els.cIntervalVal.value, 10) || 1),
      intervalUnit: els.cIntervalUnit.value || "hour",

      advancedScheduleEnabled: windowEnabled || maxPerDay > 0 || jitterMin > 0,
      activeWindowEnabled: windowEnabled,
      windowStart: els.cWindowStart.value || "08:00",
      windowEnd: els.cWindowEnd.value || "22:00",
      maxPerDay,
      jitterMinutes: jitterMin,

      enableCover: Boolean(els.cEnableCover.checked),
      coverMatchMode: els.cCoverMode.value || "sequential",
      loopCovers: Boolean(els.cLoopCovers.checked),

      startRow: Math.max(1, parseInt(els.cStartRow.value, 10) || 1),
      maxRows: Math.max(0, parseInt(els.cMaxRows.value, 10) || 0),
      delayMs: Math.round(Math.max(0.3, parseFloat(els.cDelaySec.value) || 1.2) * 1000),
      onlyCheckedRows: Boolean(els.cOnlyChecked.checked)
    };
  }

  function syncComposerInputs(cfg) {
    els.cEnableDesc.checked = cfg.enableDescription !== false;
    els.cDescBody.classList.toggle("hidden", !els.cEnableDesc.checked);
    els.cCustomTitle.value = cfg.customTitle || "";
    els.cDescTemplate.value = cfg.descriptionTemplate || "{judul} Episode {episode}";
    els.cEpMode.value = cfg.episodeMode || "sequence";
    els.cStartEp.value = String(cfg.startEpisode ?? 1);
    els.cEpStep.value = String(cfg.episodeStep ?? 1);
    els.cCleanUnderscore.checked = cfg.cleanVideoUnderscores !== false;

    els.cEnableSched.checked = cfg.enableSchedule !== false;
    els.cSchedBody.classList.toggle("hidden", !els.cEnableSched.checked);
    els.cUseLastSched.checked = Boolean(cfg.useLastScheduled);
    updateLastScheduleHint(cfg.lastScheduledIso);
    els.cStartDate.value = cfg.scheduleStartDate || defaultDateStr();
    els.cStartTime.value = cfg.scheduleStartTime || defaultTimeStr();
    els.cIntervalVal.value = String(cfg.intervalValue ?? 1);
    els.cIntervalUnit.value = cfg.intervalUnit || "hour";

    els.cWindowEnabled.checked = Boolean(cfg.activeWindowEnabled);
    els.cWindowStart.value = cfg.windowStart || "08:00";
    els.cWindowEnd.value = cfg.windowEnd || "22:00";
    els.cMaxPerDay.value = String(cfg.maxPerDay ?? 0);
    els.cJitterMin.value = String(cfg.jitterMinutes ?? 0);

    els.cEnableCover.checked = Boolean(cfg.enableCover);
    els.cCoverBody.classList.toggle("hidden", !els.cEnableCover.checked);
    els.cCoverMode.value = cfg.coverMatchMode || "sequential";
    els.cLoopCovers.checked = Boolean(cfg.loopCovers);

    els.cStartRow.value = String(cfg.startRow ?? 1);
    els.cMaxRows.value = String(cfg.maxRows ?? 0);
    els.cDelaySec.value = String(((cfg.delayMs || 1200) / 1000).toFixed(1).replace(/\.0$/, ""));
    els.cOnlyChecked.checked = Boolean(cfg.onlyCheckedRows);

    renderComposerPreview();
  }

  function handleComposerConfigChange() {
    els.cDescBody.classList.toggle("hidden", !els.cEnableDesc.checked);
    els.cSchedBody.classList.toggle("hidden", !els.cEnableSched.checked);
    els.cCoverBody.classList.toggle("hidden", !els.cEnableCover.checked);

    const cfg = readComposerConfigFromInputs();
    composerEngine.setConfig(cfg);
    saveState(STORAGE_KEY_COMP, cfg);
    renderComposerPreview();
  }

  function renderComposerPreview() {
    if (!els.cPreviewBox) return;
    const rows = cdom.findComposerRows(document);
    const plan = composerEngine.previewPlan(rows, 2);

    els.cPreviewBox.textContent = "";
    const hdr = document.createElement("div");
    hdr.style.fontWeight = "700";
    hdr.textContent = rows.length > 0
      ? `Preview (${rows.length} video terdeteksi):`
      : "Preview contoh (belum ada baris video):";
    els.cPreviewBox.appendChild(hdr);

    const pad = (n) => String(n).padStart(2, "0");
    plan.forEach((item) => {
      const line = document.createElement("div");
      const parts = [];
      if (item.description) parts.push(`"${item.description.slice(0, 42)}${item.description.length > 42 ? "..." : ""}"`);
      if (item.scheduledDate) {
        const d = item.scheduledDate;
        parts.push(`${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
      if (item.coverFile) parts.push(`Cover: ${item.coverFile.name}`);
      line.textContent = `#${item.rowNumber}: ${parts.join(" | ") || "(tidak ada aksi aktif)"}`;
      els.cPreviewBox.appendChild(line);
    });
  }

  function renderComposerSnapshot(snap) {
    if (!els.cDoneVal) return;
    const isRunning = snap.status === "running";
    const isPaused = snap.status === "paused";
    const isActive = isRunning || isPaused;

    els.cDoneVal.textContent = String(snap.processedCount);
    els.cTotalVal.textContent = String(snap.totalTarget);
    els.cFailVal.textContent = String(snap.failedCount);

    els.cStartBtn.classList.toggle("hidden", isActive);
    els.cPauseBtn.classList.toggle("hidden", !isRunning);
    els.cResumeBtn.classList.toggle("hidden", !isPaused);
    els.cStopBtn.classList.toggle("hidden", !isActive);

    if (snap.currentItem) {
      els.cCurrentBox.classList.remove("hidden");
      els.cCurrentBox.textContent = "Memproses: " + snap.currentItem;
    } else {
      els.cCurrentBox.classList.add("hidden");
    }

    renderLogList(els.cLogBox, snap.logs);
    updateHeaderBadge();
  }

  function runComposerDiagnostics() {
    const info = cdom.inspectComposerDiagnostics(document);
    els.cDiagBox.classList.remove("hidden");
    els.cDiagBox.textContent = "";
    [
      `• Video terdeteksi: ${info.rowCount} baris`,
      `• Kolom Deskripsi: ${info.withDescriptionCount} baris (${info.topDescriptionType || "-"})`,
      `• Tombol Jadwal: ${info.withScheduleCount} baris`,
      `• Tombol More edit options: ${info.withMoreEditCount} baris`,
      `• Video #1: ${info.topVideoTitle || "-"}`
    ].forEach((txt) => {
      const div = document.createElement("div");
      div.textContent = txt;
      els.cDiagBox.appendChild(div);
    });
    renderComposerPreview();
    composerEngine.addLog(`Cek Bulk Upload: ${info.rowCount} baris video terdeteksi.`, info.rowCount > 0 ? "info" : "warn");
  }

  function renderLogList(boxEl, logs) {
    if (!boxEl || !logs || logs.length === 0) return;
    boxEl.textContent = "";
    for (const item of logs) {
      const row = document.createElement("div");
      row.className = "log-entry log-" + (item.level || "info");
      const timeSpan = document.createElement("span");
      timeSpan.className = "log-time";
      timeSpan.textContent = "[" + item.time + "]";
      row.appendChild(timeSpan);
      row.appendChild(document.createTextNode(" " + item.message));
      boxEl.appendChild(row);
    }
  }

  function setDisplayMode(mode, pushPageVal) {
    uiPrefs.displayMode = mode === "sidebar" ? "sidebar" : "floating";
    if (typeof pushPageVal === "boolean") {
      uiPrefs.pushPage = pushPageVal;
    }
    applyDisplayMode();
    saveState(STORAGE_KEY_DEL, {
      displayMode: uiPrefs.displayMode,
      pushPage: uiPrefs.pushPage
    });
  }

  function bindEvents() {
    els.minimizeBtn.addEventListener("click", () => {
      uiPrefs.panelOpen = false;
      applyPanelVisibility();
      saveState(STORAGE_KEY_DEL, { panelOpen: false });
    });

    els.pillBtn.addEventListener("click", () => {
      uiPrefs.panelOpen = true;
      applyPanelVisibility();
      saveState(STORAGE_KEY_DEL, { panelOpen: true });
    });

    els.toggleLayoutBtn.addEventListener("click", () => {
      setDisplayMode(uiPrefs.displayMode === "sidebar" ? "floating" : "sidebar");
    });

    els.settingsBtn.addEventListener("click", () => {
      uiPrefs.settingsOpen = !uiPrefs.settingsOpen;
      applyDisplayMode();
    });

    els.viewFloatingBtn.addEventListener("click", () => setDisplayMode("floating"));
    els.viewSidebarBtn.addEventListener("click", () => setDisplayMode("sidebar"));
    els.pushPageCheck.addEventListener("change", () => {
      setDisplayMode(uiPrefs.displayMode, Boolean(els.pushPageCheck.checked));
    });

    els.openBrowserSidePanelBtn.addEventListener("click", () => {
      els.sidePanelNotice.classList.add("hidden");
      try {
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            els.sidePanelNotice.textContent = "Klik ikon ekstensi di toolbar Chrome lalu pilih 'Buka Side Panel' (Chrome mewajibkan klik langsung dari toolbar).";
            els.sidePanelNotice.classList.remove("hidden");
          }
        });
      } catch (_err) {
        els.sidePanelNotice.textContent = "Buka melalui ikon ekstensi di toolbar Chrome.";
        els.sidePanelNotice.classList.remove("hidden");
      }
    });

    els.tabComposerBtn.addEventListener("click", () => {
      uiPrefs.activeTab = "composer";
      applyActiveTab();
    });

    els.tabDeleteBtn.addEventListener("click", () => {
      uiPrefs.activeTab = "delete";
      applyActiveTab();
    });

    // Composer events
    shadow.querySelectorAll(".chip[data-tpl]").forEach((chip) => {
      chip.addEventListener("click", () => {
        els.cDescTemplate.value = chip.getAttribute("data-tpl") || "";
        handleComposerConfigChange();
      });
    });

    els.cAdvSchedBtn.addEventListener("click", () => {
      const hidden = els.cAdvSchedBox.classList.toggle("hidden");
      els.cAdvSchedBtn.textContent = hidden ? "+ Pengaturan jadwal lanjutan" : "- Tutup jadwal lanjutan";
    });

    els.cCoverFiles.addEventListener("change", () => {
      const files = els.cCoverFiles.files;
      composerEngine.setCoverFiles(files);
      els.cCoverCountText.textContent = files && files.length > 0
        ? `${files.length} gambar dipilih (${files[0].name}${files.length > 1 ? ", ..." : ""})`
        : "Belum ada gambar dipilih.";
      renderComposerPreview();
    });

    [
      els.cEnableDesc, els.cCustomTitle, els.cDescTemplate, els.cEpMode,
      els.cStartEp, els.cEpStep, els.cCleanUnderscore,
      els.cEnableSched, els.cUseLastSched, els.cStartDate, els.cStartTime,
      els.cIntervalVal, els.cIntervalUnit,
      els.cWindowEnabled, els.cWindowStart, els.cWindowEnd, els.cMaxPerDay, els.cJitterMin,
      els.cEnableCover, els.cCoverMode, els.cLoopCovers,
      els.cStartRow, els.cMaxRows, els.cDelaySec, els.cOnlyChecked
    ].forEach((el) => {
      el.addEventListener("change", () => {
        if ((el === els.cStartDate || el === els.cStartTime) && els.cUseLastSched.checked) {
          els.cUseLastSched.checked = false;
        }
        handleComposerConfigChange();
      });
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.addEventListener("input", () => {
          if ((el === els.cStartDate || el === els.cStartTime) && els.cUseLastSched.checked) {
            els.cUseLastSched.checked = false;
          }
          composerEngine.setConfig(readComposerConfigFromInputs());
          renderComposerPreview();
        });
      }
    });

    els.cStartBtn.addEventListener("click", () => {
      const cfg = readComposerConfigFromInputs();
      saveState(STORAGE_KEY_COMP, cfg);
      els.cDiagBox.classList.add("hidden");
      composerEngine.start(cfg);
    });
    els.cPauseBtn.addEventListener("click", () => composerEngine.pause());
    els.cResumeBtn.addEventListener("click", () => composerEngine.resume());
    els.cStopBtn.addEventListener("click", () => composerEngine.stop());
    els.cDiagBtn.addEventListener("click", runComposerDiagnostics);

    // Delete events
    els.modeBulkBtn.addEventListener("click", () => {
      if (deleteEngine.getSnapshot().status === "running") return;
      els.modeBulkBtn.classList.add("active");
      els.modeSingleBtn.classList.remove("active");
      els.bulkOptions.classList.remove("hidden");
      els.singleOptions.classList.add("hidden");
      els.secondaryStatLbl.textContent = "Batch";
      const cfg = readDeleteConfigFromInputs();
      deleteEngine.setConfig(cfg);
      saveState(STORAGE_KEY_DEL, cfg);
    });

    els.modeSingleBtn.addEventListener("click", () => {
      if (deleteEngine.getSnapshot().status === "running") return;
      els.modeSingleBtn.classList.add("active");
      els.modeBulkBtn.classList.remove("active");
      els.singleOptions.classList.remove("hidden");
      els.bulkOptions.classList.add("hidden");
      els.secondaryStatLbl.textContent = "Dilewati";
      const cfg = readDeleteConfigFromInputs();
      deleteEngine.setConfig(cfg);
      saveState(STORAGE_KEY_DEL, cfg);
    });

    [
      els.bulkBatchInput,
      els.singleMethodSelect,
      els.skipOnErrorCheck,
      els.delaySecInput,
      els.maxCountInput,
      els.customKwInput
    ].forEach((input) => {
      input.addEventListener("change", () => {
        const cfg = readDeleteConfigFromInputs();
        deleteEngine.setConfig(cfg);
        saveState(STORAGE_KEY_DEL, cfg);
      });
    });

    els.advToggleBtn.addEventListener("click", () => {
      const isHidden = els.advBox.classList.toggle("hidden");
      els.advToggleBtn.textContent = isHidden ? "+ Pengaturan lanjutan" : "- Tutup pengaturan lanjutan";
    });

    els.startBtn.addEventListener("click", () => {
      const cfg = readDeleteConfigFromInputs();
      saveState(STORAGE_KEY_DEL, cfg);
      els.diagBox.classList.add("hidden");
      deleteEngine.start(cfg);
    });
    els.pauseBtn.addEventListener("click", () => deleteEngine.pause());
    els.resumeBtn.addEventListener("click", () => deleteEngine.resume());
    els.stopBtn.addEventListener("click", () => deleteEngine.stop());
    els.diagBtn.addEventListener("click", runDeleteDiagnostics);
  }

  function setupDragging() {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startRight = 18;
    let startBottom = 18;

    els.dragHandle.addEventListener("mousedown", (e) => {
      if (uiPrefs.displayMode === "sidebar") return;
      if (e.target && e.target.closest && e.target.closest("button")) return;
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
      const r = Math.max(8, Math.min(window.innerWidth - 100, startRight - dx));
      const b = Math.max(8, Math.min(window.innerHeight - 60, startBottom - dy));
      uiPrefs.floatingRight = r;
      uiPrefs.floatingBottom = b;
      hostEl.style.right = r + "px";
      hostEl.style.bottom = b + "px";
    });

    window.addEventListener("mouseup", () => { dragging = false; });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === "GET_STATE") {
      const customKws = dom.parseCustomKeywords(deleteEngine.getSnapshot().config.customDeleteKeywords);
      sendResponse({
        activeTab: uiPrefs.activeTab,
        displayMode: uiPrefs.displayMode,
        pushPage: uiPrefs.pushPage,
        snapshot: deleteEngine.getSnapshot(),
        composerSnapshot: composerEngine.getSnapshot(),
        panelOpen: uiPrefs.panelOpen,
        diagnostics: dom.inspectPageDiagnostics(document, customKws),
        composerDiagnostics: cdom.inspectComposerDiagnostics(document)
      });
      return;
    }

    if (message.type === "SET_DISPLAY_MODE") {
      setDisplayMode(message.displayMode, message.pushPage);
      sendResponse({ ok: true, displayMode: uiPrefs.displayMode, pushPage: uiPrefs.pushPage });
      return;
    }

    if (message.type === "SET_ACTIVE_TAB") {
      uiPrefs.activeTab = message.activeTab === "composer" ? "composer" : "delete";
      applyActiveTab();
      sendResponse({ ok: true, activeTab: uiPrefs.activeTab });
      return;
    }

    if (message.type === "DIAGNOSE") {
      if (message.tab === "composer") {
        runComposerDiagnostics();
        sendResponse({ ok: true, composerDiagnostics: cdom.inspectComposerDiagnostics(document) });
      } else {
        runDeleteDiagnostics();
        const customKws = dom.parseCustomKeywords(deleteEngine.getSnapshot().config.customDeleteKeywords);
        sendResponse({ ok: true, diagnostics: dom.inspectPageDiagnostics(document, customKws) });
      }
      return;
    }

    if (message.type === "SET_CONFIG") {
      deleteEngine.setConfig(message.config);
      syncDeleteInputs(deleteEngine.getSnapshot().config);
      saveState(STORAGE_KEY_DEL, deleteEngine.getSnapshot().config);
      sendResponse({ ok: true, snapshot: deleteEngine.getSnapshot() });
      return;
    }

    if (message.type === "SET_COMPOSER_CONFIG") {
      composerEngine.setConfig(message.config);
      syncComposerInputs(composerEngine.getSnapshot().config);
      saveState(STORAGE_KEY_COMP, composerEngine.getSnapshot().config);
      sendResponse({ ok: true, composerSnapshot: composerEngine.getSnapshot() });
      return;
    }

    if (message.type === "SET_COVER_FILES") {
      const reconstructed = (message.files || []).map((f) => {
        const bytes = new Uint8Array(f.bytes || []);
        return new File([bytes], f.name || "cover.jpg", { type: f.mime || "image/jpeg" });
      });
      composerEngine.setCoverFiles(reconstructed);
      els.cCoverCountText.textContent = reconstructed.length > 0
        ? `${reconstructed.length} gambar dipilih (${reconstructed[0].name}${reconstructed.length > 1 ? ", ..." : ""})`
        : "Belum ada gambar dipilih.";
      renderComposerPreview();
      sendResponse({ ok: true, coverCount: reconstructed.length });
      return;
    }

    if (message.type === "START") {
      uiPrefs.activeTab = "delete";
      applyActiveTab();
      if (message.config) {
        deleteEngine.setConfig(message.config);
        syncDeleteInputs(deleteEngine.getSnapshot().config);
        saveState(STORAGE_KEY_DEL, deleteEngine.getSnapshot().config);
      }
      deleteEngine.start(message.config || readDeleteConfigFromInputs());
      sendResponse({ ok: true, snapshot: deleteEngine.getSnapshot() });
      return;
    }

    if (message.type === "START_COMPOSER") {
      uiPrefs.activeTab = "composer";
      applyActiveTab();
      if (message.config) {
        composerEngine.setConfig(message.config);
        syncComposerInputs(composerEngine.getSnapshot().config);
        saveState(STORAGE_KEY_COMP, composerEngine.getSnapshot().config);
      }
      composerEngine.start(message.config || readComposerConfigFromInputs());
      sendResponse({ ok: true, composerSnapshot: composerEngine.getSnapshot() });
      return;
    }

    if (message.type === "PAUSE") {
      const target = message.tab || uiPrefs.activeTab;
      if (target === "composer") composerEngine.pause();
      else deleteEngine.pause();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "RESUME") {
      const target = message.tab || uiPrefs.activeTab;
      if (target === "composer") composerEngine.resume();
      else deleteEngine.resume();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "STOP") {
      const target = message.tab || uiPrefs.activeTab;
      if (target === "composer") composerEngine.stop();
      else deleteEngine.stop();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "TOGGLE_PANEL") {
      uiPrefs.panelOpen = typeof message.open === "boolean" ? message.open : !uiPrefs.panelOpen;
      applyPanelVisibility();
      saveState(STORAGE_KEY_DEL, { panelOpen: uiPrefs.panelOpen });
      sendResponse({ ok: true, panelOpen: uiPrefs.panelOpen });
    }
  });

  function init() {
    createPanelDOM();

    getSavedState(STORAGE_KEY_DEL, (saved) => {
      if (typeof saved.panelOpen === "boolean") {
        uiPrefs.panelOpen = saved.panelOpen;
      }
      if (saved.displayMode === "sidebar" || saved.displayMode === "floating") {
        uiPrefs.displayMode = saved.displayMode;
      }
      if (typeof saved.pushPage === "boolean") {
        uiPrefs.pushPage = saved.pushPage;
      }
      applyPanelVisibility();
      const restoredDel = Object.assign({}, engineFactory.DEFAULT_CONFIG, saved);
      deleteEngine.setConfig(restoredDel);
      syncDeleteInputs(deleteEngine.getSnapshot().config);
      renderDeleteSnapshot(deleteEngine.getSnapshot());
    });

    getSavedState(STORAGE_KEY_COMP, (saved) => {
      const restoredComp = Object.assign({}, cengineFactory.DEFAULT_COMPOSER_CONFIG, saved);
      if (!restoredComp.scheduleStartDate) restoredComp.scheduleStartDate = defaultDateStr();
      if (!restoredComp.scheduleStartTime) restoredComp.scheduleStartTime = defaultTimeStr();
      composerEngine.setConfig(restoredComp);
      syncComposerInputs(composerEngine.getSnapshot().config);
      renderComposerSnapshot(composerEngine.getSnapshot());
    });

    // Auto-switch tab when Meta SPA navigates between Posts and Bulk Upload Composer
    let lastHref = location.href;
    const observer = new MutationObserver(() => {
      if (!hostEl || !hostEl.isConnected) {
        createPanelDOM();
        renderDeleteSnapshot(deleteEngine.getSnapshot());
        renderComposerSnapshot(composerEngine.getSnapshot());
      }
      if (location.href !== lastHref) {
        lastHref = location.href;
        const delIdle = deleteEngine.getSnapshot().status === "idle";
        const compIdle = composerEngine.getSnapshot().status === "idle";
        if (delIdle && compIdle) {
          uiPrefs.activeTab = detectDefaultTab();
          applyActiveTab();
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  init();
})();
