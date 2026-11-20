(function (root) {
  "use strict";

  const domBase = root.MetaDeleterDOM || (typeof require === "function" ? require("./dom-helpers.js") : null);

  const MONTHS_EN = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const MONTHS_EN_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const MONTHS_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const MONTHS_ID_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
  ];

  const SCHEDULE_BTN_LABELS = [
    "publish now",
    "schedule",
    "save as draft",
    "scheduling options",
    "terbitkan sekarang",
    "jadwalkan",
    "simpan sebagai draf",
    "opsi penjadwalan"
  ];

  const SCHEDULE_TAB_LABELS = ["schedule", "jadwalkan"];
  const UPDATE_BTN_LABELS = ["update", "perbarui", "simpan", "save", "terapkan", "apply"];
  const MORE_EDIT_LABELS = [
    "more edit options",
    "more edit opti",
    "opsi pengeditan lainnya",
    "edit",
    "sunting"
  ];
  const UPLOAD_IMAGE_TAB_LABELS = ["upload image", "unggah gambar"];
  const NEXT_BTN_LABELS = ["next", "berikutnya", "lanjut"];
  const SAVE_MODAL_LABELS = ["save", "simpan", "done", "selesai", "update", "perbarui"];

  function normalize(str) {
    return domBase ? domBase.normalizeText(str) : String(str || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isVisible(el, doc) {
    return domBase ? domBase.isVisible(el, doc) : Boolean(el && el.isConnected);
  }

  function isOwn(el) {
    return Boolean(el && typeof el.closest === "function" && el.closest("#" + (domBase ? domBase.EXTENSION_HOST_ID : "meta-auto-deleter-root")));
  }

  function getDocView(doc) {
    return (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);
  }

  function resolveEditableTarget(el) {
    if (!el || !el.isConnected) return null;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el;
    if (el.isContentEditable === true || (el.getAttribute && el.getAttribute("contenteditable") === "true")) {
      return el;
    }
    if (typeof el.querySelector === "function") {
      const inner = el.querySelector('textarea, input[type="text"], [contenteditable="true"]');
      if (inner && inner.isConnected) return inner;
    }
    return el;
  }

  function focusDescriptionField(el, doc) {
    const target = resolveEditableTarget(el);
    if (!target || !target.isConnected) return null;
    if (typeof target.scrollIntoView === "function") {
      try {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (_err) {
        // ignore
      }
    }
    if (typeof target.click === "function") {
      target.click();
    }
    if (typeof target.focus === "function") {
      target.focus();
    }
    const ownerDoc = target.ownerDocument || doc || (typeof document !== "undefined" ? document : null);
    if (ownerDoc && ownerDoc.activeElement && ownerDoc.activeElement !== target) {
      const active = ownerDoc.activeElement;
      if (active.tagName === "TEXTAREA" || active.tagName === "INPUT" || active.isContentEditable === true ||
          (active.getAttribute && active.getAttribute("contenteditable") === "true")) {
        return active;
      }
    }
    return target;
  }

  function isMetaErrorPage(doc) {
    const documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || !documentRef.body) return false;
    const txt = normalize(documentRef.body.textContent || "");
    return (
      txt.includes("kami mengalami masalah dalam menyelesaikan permintaan anda") ||
      txt.includes("we're having trouble completing your request") ||
      txt.includes("something went wrong")
    );
  }

  function setNativeInputValue(el, value, doc) {
    const target = resolveEditableTarget(el);
    if (!target || !target.isConnected) return false;
    const ownerDoc = target.ownerDocument || doc || (typeof document !== "undefined" ? document : null);
    const win = getDocView(ownerDoc);
    const strVal = String(value == null ? "" : value);

    if (typeof target.scrollIntoView === "function") {
      try {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (_err) {
        // ignore
      }
    }
    if (typeof target.focus === "function") {
      target.focus();
    }
    if (!target.isConnected) return false;

    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      const proto = target.tagName === "TEXTAREA"
        ? (win && win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : null)
        : (win && win.HTMLInputElement ? win.HTMLInputElement.prototype : null);
      const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
      if (descriptor && typeof descriptor.set === "function") {
        descriptor.set.call(target, strVal);
      } else {
        target.value = strVal;
      }

      const EventCtor = (win && win.Event) || (typeof Event !== "undefined" ? Event : null);
      if (EventCtor && typeof target.dispatchEvent === "function") {
        target.dispatchEvent(new EventCtor("input", { bubbles: true }));
        target.dispatchEvent(new EventCtor("change", { bubbles: true }));
        target.dispatchEvent(new EventCtor("blur", { bubbles: true }));
      }
      return true;
    }

    // ContentEditable / Lexical / Draft.js editor: ONLY treat as editable if actually contentEditable
    const isRealContentEditable = target.isContentEditable === true ||
      (target.getAttribute && target.getAttribute("contenteditable") === "true");
    const isMockTextbox = !ownerDoc || typeof ownerDoc.execCommand !== "function";

    if (isRealContentEditable || (isMockTextbox && target.getAttribute && target.getAttribute("role") === "textbox")) {
      const hasExecCommand = ownerDoc && typeof ownerDoc.execCommand === "function";

      if (hasExecCommand) {
        try {
          if (typeof target.focus === "function") {
            target.focus();
          }
          if (!target.isConnected) return false;

          // Ensure focus is actually inside target before running execCommand (never selectAll on document!)
          const active = ownerDoc.activeElement;
          const focusInside = !active || active === target ||
            (typeof target.contains === "function" && target.contains(active));
          if (!focusInside) {
            return false;
          }

          const hasExistingText = normalize(target.textContent || "").length > 0;
          if (win && typeof win.getSelection === "function" && typeof ownerDoc.createRange === "function") {
            const sel = win.getSelection();
            const range = ownerDoc.createRange();
            const innerNode = target.querySelector ? (target.querySelector("p, div") || target) : target;
            if (innerNode && innerNode.isConnected) {
              range.selectNodeContents(innerNode);
              if (!hasExistingText) {
                range.collapse(true);
              }
              if (range.startContainer && range.startContainer.isConnected && sel) {
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
          }

          if (hasExistingText) {
            ownerDoc.execCommand("selectAll", false, null);
          }
          ownerDoc.execCommand("insertText", false, strVal);
          return true;
        } catch (_err) {
          // Never wipe React/Lexical child nodes via target.textContent = strVal
          return false;
        }
      }

      // Mock/non-browser DOM fallback (where execCommand is unavailable)
      target.textContent = strVal;
      const EventCtor = (win && win.Event) || (typeof Event !== "undefined" ? Event : null);
      if (EventCtor && typeof target.dispatchEvent === "function") {
        target.dispatchEvent(new EventCtor("input", { bubbles: true }));
        target.dispatchEvent(new EventCtor("change", { bubbles: true }));
        target.dispatchEvent(new EventCtor("blur", { bubbles: true }));
      }
      return true;
    }

    return false;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDateForInput(dateObj, sampleValue, inputType) {
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const dayNum = d.getDate();

    if (inputType === "date" || /^\d{4}-\d{2}-\d{2}$/.test(String(sampleValue || "").trim())) {
      return `${yyyy}-${mm}-${dd}`;
    }

    const sample = String(sampleValue || "").trim();
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sample)) {
      // Heuristic: if first part > 12 it's DD/MM/YYYY, else default MM/DD/YYYY (Meta US default)
      const first = parseInt(sample.split("/")[0], 10);
      return first > 12 ? `${dd}/${mm}/${yyyy}` : `${mm}/${dd}/${yyyy}`;
    }

    if (/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(sample)) {
      const monthWord = sample.split(/\s+/)[1] || "";
      const lowWord = monthWord.toLowerCase();
      const isIndonesian = MONTHS_ID.concat(MONTHS_ID_SHORT).some(
        (m) => m.toLowerCase() === lowWord
      );
      const isFullMonth = MONTHS_EN.concat(MONTHS_ID).some(
        (m) => m.toLowerCase() === lowWord
      );
      const isShort = !isFullMonth && monthWord.length <= 3;
      const idx = d.getMonth();
      const monthName = isIndonesian
        ? (isShort ? MONTHS_ID_SHORT[idx] : MONTHS_ID[idx])
        : (isShort ? MONTHS_EN_SHORT[idx] : MONTHS_EN[idx]);
      return `${dayNum} ${monthName} ${yyyy}`;
    }

    if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/.test(sample)) {
      const idx = d.getMonth();
      const firstWord = sample.split(/\s+/)[0] || "";
      const isFullMonth = MONTHS_EN.some((m) => m.toLowerCase() === firstWord.toLowerCase());
      const isShort = !isFullMonth && firstWord.length <= 3;
      const monthName = isShort ? MONTHS_EN_SHORT[idx] : MONTHS_EN[idx];
      return `${monthName} ${dayNum}, ${yyyy}`;
    }

    // Default Meta Business Suite format shown in screenshot: "20 November 2026"
    return `${dayNum} ${MONTHS_EN[d.getMonth()]} ${yyyy}`;
  }

  function cleanVideoTitle(raw) {
    return String(raw || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\.(mp4|mov|mkv|avi|webm|m4v)$/i, "");
  }

  function findRowDescriptionField(rowEl, doc) {
    if (!rowEl) return null;
    const selectors = [
      "textarea",
      '[contenteditable="true"]',
      'input[type="text"]',
      '[role="textbox"]'
    ];
    for (const sel of selectors) {
      const candidates = Array.from(rowEl.querySelectorAll(sel));
      for (const el of candidates) {
        if (!isVisible(el, doc)) continue;
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
        return el;
      }
    }
    return null;
  }

  function buttonLabel(el) {
    if (!el) return "";
    return normalize(
      (el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "")
    );
  }

  function findRowScheduleButton(rowEl, doc) {
    if (!rowEl) return null;
    const buttons = Array.from(rowEl.querySelectorAll('button, [role="button"]')).filter((el) =>
      isVisible(el, doc)
    );
    for (const btn of buttons) {
      const lbl = normalize(btn.innerText || btn.textContent || btn.getAttribute("aria-label") || "");
      if (SCHEDULE_BTN_LABELS.some((kw) => lbl === kw || lbl.startsWith(kw))) {
        return btn;
      }
      // If already scheduled, Meta shows the date/time string like "20 Nov 2026" or "20 November 2026, 17:03"
      if (/\b\d{4}\b/.test(lbl) && /\d{1,2}:\d{2}/.test(lbl)) {
        return btn;
      }
    }
    return null;
  }

  function findRowMoreEditButton(rowEl, doc) {
    if (!rowEl) return null;
    const buttons = Array.from(rowEl.querySelectorAll('button, [role="button"]')).filter((el) =>
      isVisible(el, doc)
    );
    for (const btn of buttons) {
      const lbl = buttonLabel(btn);
      if (MORE_EDIT_LABELS.some((kw) => lbl.includes(kw))) {
        return btn;
      }
    }
    return null;
  }

  function extractComposerVideoTitle(rowEl, index) {
    if (!rowEl) return "Video " + (index + 1);
    const ignoreExact = new Set([
      "publish now", "schedule", "save as draft", "scheduling options",
      "terbitkan sekarang", "jadwalkan", "simpan sebagai draf",
      "more edit options", "more edit opti...", "opsi pengeditan lainnya",
      "checking for copyrighted content", "checking for copyrighted content · optional",
      "checking for copyrighted content • optional"
    ]);

    const nodes = Array.from(rowEl.querySelectorAll("span, div, p, a, strong"));
    for (const node of nodes) {
      if (node.closest('button, [role="button"], textarea, [contenteditable="true"], [role="textbox"]')) continue;
      if (node.children.length > 0) continue;
      const txt = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt || txt.length < 2) continue;
      const low = txt.toLowerCase();
      if (ignoreExact.has(low)) continue;
      if (/^\d{1,3}%$/.test(txt)) continue;
      if (/^\d{1,2}:\d{2}$/.test(txt)) continue;
      if (low.includes("copyrighted content")) continue;
      return cleanVideoTitle(txt);
    }
    return "Video " + (index + 1);
  }

  function findComposerRows(doc) {
    const documentRef = doc || document;
    const ctx = domBase ? domBase.findContentContext(documentRef) : { rows: [] };

    // Filter rows that look like composer rows (contain description box or schedule/edit buttons)
    const composerRows = [];
    for (let i = 0; i < ctx.rows.length; i++) {
      const r = ctx.rows[i];
      const descEl = findRowDescriptionField(r.rowEl, documentRef);
      const schedBtn = findRowScheduleButton(r.rowEl, documentRef);
      const moreEditBtn = findRowMoreEditButton(r.rowEl, documentRef);
      if (descEl || schedBtn || moreEditBtn) {
        composerRows.push({
          index: composerRows.length,
          domIndex: r.index,
          rowEl: r.rowEl,
          checkbox: r.checkbox,
          clickTarget: r.clickTarget,
          checked: r.checked,
          videoTitle: extractComposerVideoTitle(r.rowEl, composerRows.length),
          descriptionEl: descEl,
          scheduleBtn: schedBtn,
          moreEditBtn
        });
      }
    }

    // Fallback: if checkboxes aren't present, detect rows via description boxes
    if (composerRows.length === 0) {
      const descFields = Array.from(
        documentRef.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
      ).filter((el) => isVisible(el, documentRef) && !isOwn(el) && !el.closest('[role="dialog"]'));

      descFields.forEach((descEl, idx) => {
        let rowEl = descEl.closest('[role="row"], tr');
        if (!rowEl) {
          let curr = descEl.parentElement;
          for (let d = 0; d < 6 && curr && curr.tagName !== "BODY"; d++) {
            if (findRowScheduleButton(curr, documentRef) || findRowMoreEditButton(curr, documentRef)) {
              rowEl = curr;
              break;
            }
            curr = curr.parentElement;
          }
        }
        if (rowEl) {
          composerRows.push({
            index: idx,
            domIndex: idx,
            rowEl,
            checkbox: null,
            clickTarget: null,
            checked: false,
            videoTitle: extractComposerVideoTitle(rowEl, idx),
            descriptionEl: descEl,
            scheduleBtn: findRowScheduleButton(rowEl, documentRef),
            moreEditBtn: findRowMoreEditButton(rowEl, documentRef)
          });
        }
      });
    }

    return composerRows;
  }

  function findSchedulePopover(doc) {
    const documentRef = doc || document;
    // Look for visible button matching "Schedule" / "Jadwalkan" inside a floating container with an "Update"/"Perbarui" button
    const buttons = Array.from(
      documentRef.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"], label')
    ).filter((el) => isVisible(el, documentRef) && !isOwn(el));

    const schedTabs = buttons.filter((el) => {
      const lbl = normalize(el.innerText || el.textContent || "");
      return SCHEDULE_TAB_LABELS.includes(lbl);
    });

    for (let i = schedTabs.length - 1; i >= 0; i--) {
      const tab = schedTabs[i];
      let curr = tab.parentElement;
      for (let depth = 0; depth < 14 && curr && curr.tagName !== "BODY"; depth++) {
        // Stop before hitting the entire composer table
        if (curr.querySelectorAll && curr.querySelectorAll('[role="row"]').length > 1) {
          break;
        }
        const innerBtns = Array.from(curr.querySelectorAll('button, [role="button"]')).filter((b) =>
          isVisible(b, documentRef)
        );
        const updateBtn = innerBtns.find((b) => {
          const lbl = normalize(b.innerText || b.textContent || "");
          return UPDATE_BTN_LABELS.includes(lbl);
        });
        if (updateBtn) {
          return {
            container: curr,
            scheduleTab: tab,
            updateBtn
          };
        }
        curr = curr.parentElement;
      }
    }
    return null;
  }

  function classifyScheduleInputs(container, doc) {
    const inputs = Array.from(
      container.querySelectorAll('input, [role="spinbutton"]')
    ).filter((el) => isVisible(el, doc) && !isOwn(el));

    let dateInput = null;
    const timeInputs = [];

    for (const inp of inputs) {
      const type = (inp.getAttribute("type") || "").toLowerCase();
      const val = String(inp.value || inp.textContent || "").trim();
      const aria = normalize((inp.getAttribute("aria-label") || "") + " " + (inp.getAttribute("placeholder") || ""));

      if (
        type === "date" ||
        aria.includes("date") ||
        aria.includes("tanggal") ||
        /\d{4}/.test(val) ||
        /[A-Za-z]{3,}/.test(val) ||
        /\d{1,2}\/\d{1,2}\/\d{4}/.test(val)
      ) {
        if (!dateInput) dateInput = inp;
        continue;
      }

      const maxAttr = inp.getAttribute("max");
      if (
        type === "time" ||
        type === "number" ||
        aria.includes("hour") ||
        aria.includes("jam") ||
        aria.includes("minute") ||
        aria.includes("menit") ||
        maxAttr === "23" ||
        maxAttr === "12" ||
        maxAttr === "59" ||
        /^\d{1,2}(:\d{2})?$/.test(val) ||
        inp.getAttribute("role") === "spinbutton"
      ) {
        timeInputs.push(inp);
      } else if (dateInput && type === "text") {
        // Remaining text input inside schedule popover after dateInput is likely time
        timeInputs.push(inp);
      }
    }

    // Fallback: if 3 inputs total -> [date, hour, minute]; if 2 inputs -> [date, time]
    if (!dateInput && inputs.length >= 2) {
      dateInput = inputs[0];
      return {
        dateInput,
        timeInputs: inputs.slice(1)
      };
    }

    return { dateInput, timeInputs };
  }

  function setScheduleInputsInPopover(popover, dateObj, doc) {
    const { container } = popover;
    const { dateInput, timeInputs } = classifyScheduleInputs(container, doc);

    if (!dateInput && timeInputs.length === 0) {
      return { ok: false, reason: "Input tanggal/jam pada popover jadwal tidak ditemukan." };
    }

    if (dateInput) {
      const sample = dateInput.value || dateInput.getAttribute("placeholder") || "";
      const formattedDate = formatDateForInput(dateObj, sample, (dateInput.getAttribute("type") || "").toLowerCase());
      setNativeInputValue(dateInput, formattedDate, doc);
    }

    const hh = pad2(dateObj.getHours());
    const min = pad2(dateObj.getMinutes());

    if (timeInputs.length >= 2) {
      // Hour + Minute inputs (e.g. "17" : "03")
      setNativeInputValue(timeInputs[0], hh, doc);
      setNativeInputValue(timeInputs[1], min, doc);
    } else if (timeInputs.length === 1) {
      setNativeInputValue(timeInputs[0], `${hh}:${min}`, doc);
    }

    return { ok: true };
  }

  function findActiveModal(doc) {
    return domBase ? domBase.findTopDialog(doc) : doc.querySelector('[role="dialog"], [aria-modal="true"]');
  }

  function findUploadImageTabInModal(modal, doc) {
    if (!modal) return null;
    const candidates = Array.from(
      modal.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"]')
    ).filter((el) => isVisible(el, doc));

    for (const el of candidates) {
      const lbl = normalize(el.innerText || el.textContent || "");
      if (UPLOAD_IMAGE_TAB_LABELS.some((kw) => lbl === kw || lbl.includes(kw))) {
        return el;
      }
    }
    return null;
  }

  function findImageFileInputInModal(modal) {
    if (!modal) return null;
    const inputs = Array.from(modal.querySelectorAll('input[type="file"]'));
    // Prefer accept="image/*"
    const imgInput = inputs.find((inp) => (inp.getAttribute("accept") || "").includes("image"));
    return imgInput || inputs[0] || null;
  }

  function attachFileToInput(fileInput, file, doc) {
    if (!fileInput || !file) return false;
    const win = getDocView(doc);
    const DT = (win && win.DataTransfer) || (typeof DataTransfer !== "undefined" ? DataTransfer : null);
    if (!DT) return false;

    const dt = new DT();
    dt.items.add(file);
    fileInput.files = dt.files;

    const EventCtor = (win && win.Event) || (typeof Event !== "undefined" ? Event : null);
    if (EventCtor && typeof fileInput.dispatchEvent === "function") {
      fileInput.dispatchEvent(new EventCtor("input", { bubbles: true }));
      fileInput.dispatchEvent(new EventCtor("change", { bubbles: true }));
    }
    return true;
  }

  function findModalAdvanceButton(modal, doc) {
    if (!modal) return null;
    const buttons = Array.from(modal.querySelectorAll('button, [role="button"]')).filter(
      (el) => isVisible(el, doc) && !el.disabled && el.getAttribute("aria-disabled") !== "true"
    );

    // Check Save/Done first, then Next
    for (const btn of buttons) {
      const lbl = normalize(btn.innerText || btn.textContent || "");
      if (SAVE_MODAL_LABELS.includes(lbl)) {
        return { button: btn, kind: "save" };
      }
    }
    for (const btn of buttons) {
      const lbl = normalize(btn.innerText || btn.textContent || "");
      if (NEXT_BTN_LABELS.includes(lbl)) {
        return { button: btn, kind: "next" };
      }
    }
    return null;
  }

  function inspectComposerDiagnostics(doc) {
    const documentRef = doc || document;
    const rows = findComposerRows(documentRef);
    return {
      rowCount: rows.length,
      withDescriptionCount: rows.filter((r) => Boolean(r.descriptionEl)).length,
      withScheduleCount: rows.filter((r) => Boolean(r.scheduleBtn)).length,
      withMoreEditCount: rows.filter((r) => Boolean(r.moreEditBtn)).length,
      topVideoTitle: rows[0] ? rows[0].videoTitle : null
    };
  }

  const api = {
    MONTHS_EN,
    MONTHS_ID,
    cleanVideoTitle,
    formatDateForInput,
    focusDescriptionField,
    isMetaErrorPage,
    setNativeInputValue,
    findComposerRows,
    findRowDescriptionField,
    findRowScheduleButton,
    findRowMoreEditButton,
    findSchedulePopover,
    classifyScheduleInputs,
    setScheduleInputsInPopover,
    findActiveModal,
    findUploadImageTabInModal,
    findImageFileInputInModal,
    attachFileToInput,
    findModalAdvanceButton,
    inspectComposerDiagnostics
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MetaComposerDOM = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
