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
    "terbitkan",
    "jadwal",
    "jadwalkan",
    "simpan sebagai draf",
    "opsi penjadwalan",
    "opsi penja"
  ];

  const SCHEDULE_TAB_LABELS = ["schedule", "jadwal", "jadwalkan"];
  const UPDATE_BTN_LABELS = ["update", "perbarui", "simpan", "save", "terapkan", "apply"];
  const MORE_EDIT_LABELS = [
    "more edit options",
    "more edit opti",
    "opsi pengeditan lainnya",
    "opsi pengeditan",
    "opsi edit lainnya",
    "opsi edit",
    "opsi edi",
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

  function findEditableLeafNode(target) {
    if (!target || typeof target.querySelector !== "function") return target;
    const leaf = target.querySelector('[data-text="true"], span[data-offset-key], p');
    if (leaf && leaf.isConnected) return leaf;
    const block = target.querySelector('[data-block="true"]');
    if (block && block.isConnected) return block;
    return target;
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

          // Ensure focus is actually inside target before touching selection/input
          const active = ownerDoc.activeElement;
          const focusInside = !active || active === target ||
            (typeof target.contains === "function" && target.contains(active));
          if (!focusInside) {
            return false;
          }

          // Preserve natural selection if already inside target; otherwise place caret inside deepest leaf
          if (win && typeof win.getSelection === "function" && typeof ownerDoc.createRange === "function") {
            const sel = win.getSelection();
            const alreadyInside = sel && sel.rangeCount > 0 && sel.anchorNode &&
              (sel.anchorNode === target || (typeof target.contains === "function" && target.contains(sel.anchorNode)));
            if (!alreadyInside && sel) {
              const leafNode = findEditableLeafNode(target);
              if (leafNode && leafNode.isConnected) {
                const range = ownerDoc.createRange();
                range.selectNodeContents(leafNode);
                range.collapse(false);
                if (range.startContainer && range.startContainer.isConnected) {
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
            }
          }

          // 1. Try Lexical-friendly InputEvent("beforeinput") first (no direct DOM mutation if editor handles it)
          const InputEvtCtor = (win && win.InputEvent) || (typeof InputEvent !== "undefined" ? InputEvent : null);
          if (InputEvtCtor && typeof target.dispatchEvent === "function") {
            const biEvt = new InputEvtCtor("beforeinput", {
              bubbles: true,
              cancelable: true,
              inputType: "insertText",
              data: strVal
            });
            const dispatchOk = target.dispatchEvent(biEvt);
            if (dispatchOk === false || biEvt.defaultPrevented) {
              return true;
            }
          }

          // 2. Try Draft.js-friendly TextEvent("textInput")
          if (typeof ownerDoc.createEvent === "function" && typeof target.dispatchEvent === "function") {
            try {
              const textEvt = ownerDoc.createEvent("TextEvent");
              if (textEvt && typeof textEvt.initTextEvent === "function") {
                textEvt.initTextEvent("textInput", true, true, win, strVal);
                const dispatchOk = target.dispatchEvent(textEvt);
                if (dispatchOk === false || textEvt.defaultPrevented) {
                  return true;
                }
              }
            } catch (_textEvtErr) {
              // ignore if TextEvent unsupported
            }
          }

          // 3. Fallback: execCommand insertText (without selectAll so React nodes are not wiped)
          ownerDoc.execCommand("insertText", false, strVal);
          return true;
        } catch (_err) {
          // Never wipe React/Lexical/Draft child nodes via target.textContent = strVal
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

  function formatDateForInput(dateObj, sampleValue, inputType, preferDmy) {
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
      const first = parseInt(sample.split("/")[0], 10);
      const second = parseInt(sample.split("/")[1], 10);
      if (first > 12) return `${dd}/${mm}/${yyyy}`;
      if (second > 12) return `${mm}/${dd}/${yyyy}`;
      return preferDmy ? `${dd}/${mm}/${yyyy}` : `${mm}/${dd}/${yyyy}`;
    }

    if (/dd\/mm\/yyyy|hh\/bb\/tttt/i.test(sample)) {
      return `${dd}/${mm}/${yyyy}`;
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

    return preferDmy ? `${dd}/${mm}/${yyyy}` : `${dayNum} ${MONTHS_EN[d.getMonth()]} ${yyyy}`;
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
      (el.innerText || el.textContent || "") + " " +
      (el.getAttribute("aria-label") || "") + " " +
      (el.getAttribute("title") || "") + " " +
      (el.getAttribute("data-tooltip-content") || "")
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
      // If already scheduled, Meta shows the date/time string like "20 Nov 2026" or "20 November 2026, 17:03" or "20 Nov..."
      if (/\b\d{4}\b/.test(lbl) && /\d{1,2}[:.]\d{2}/.test(lbl)) {
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
    // Narrow viewport fallback when button displays truncated "O..." without aria-label
    for (const btn of buttons) {
      const text = normalize(btn.innerText || btn.textContent || "");
      if (text === "o..." || text === "o…") {
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
    // Look for visible tab/button matching "Schedule" / "Jadwal" / "Jadwalkan" inside a floating container with an "Update"/"Perbarui" button
    const buttons = Array.from(
      documentRef.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"], [aria-checked], [aria-selected], label')
    ).filter((el) => isVisible(el, documentRef) && !isOwn(el));

    const schedTabs = buttons.filter((el) => {
      const lbl = normalize(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
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

  function isIndonesianPopover(container) {
    if (!container) return false;
    const txt = normalize(container.textContent || "");
    return txt.includes("jadwal") || txt.includes("perbarui") || txt.includes("terbitkan");
  }

  function findAssociatedLabel(el, doc) {
    if (!el) return null;
    const elId = el.id || (typeof el.getAttribute === "function" ? el.getAttribute("id") : "");
    if (!elId) return null;
    const ownerDoc = el.ownerDocument || doc || (typeof document !== "undefined" ? document : null);
    if (!ownerDoc || typeof ownerDoc.querySelectorAll !== "function") return null;
    const labels = ownerDoc.querySelectorAll("label[for]");
    for (const lbl of labels) {
      if (lbl.getAttribute && lbl.getAttribute("for") === elId) {
        return lbl;
      }
    }
    return null;
  }

  function isVisuallyPresentIgnoringAriaHidden(el, doc) {
    if (!el || !el.isConnected || isOwn(el)) return false;
    const ownerDoc = el.ownerDocument || doc || (typeof document !== "undefined" ? document : null);
    const win = getDocView(ownerDoc);
    let curr = el;
    while (curr && curr.nodeType === 1) {
      if (curr.hasAttribute && curr.hasAttribute("hidden")) return false;
      if (win && typeof win.getComputedStyle === "function") {
        const style = win.getComputedStyle(curr);
        if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
          return false;
        }
      } else if (curr.style && (curr.style.display === "none" || curr.style.visibility === "hidden")) {
        return false;
      }
      curr = curr.parentElement;
    }
    if (win && typeof el.getBoundingClientRect === "function") {
      const bodyRect = ownerDoc && ownerDoc.body && ownerDoc.body.getBoundingClientRect ? ownerDoc.body.getBoundingClientRect() : null;
      if (bodyRect && (bodyRect.width > 0 || bodyRect.height > 0)) {
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      }
    }
    return true;
  }

  function isFieldVisibleOrLabelVisible(el, doc) {
    if (!el || !el.isConnected || isOwn(el)) return false;
    if (isVisible(el, doc)) return true;

    const parentLbl = typeof el.closest === "function" ? el.closest("label") : null;
    if (parentLbl && isVisuallyPresentIgnoringAriaHidden(parentLbl, doc)) return true;

    const assocLbl = findAssociatedLabel(el, doc);
    if (assocLbl && isVisuallyPresentIgnoringAriaHidden(assocLbl, doc)) return true;

    if (el.getAttribute && el.getAttribute("role") === "spinbutton") {
      const appWrap = typeof el.closest === "function" ? el.closest('[role="application"]') : null;
      if (appWrap && isVisible(appWrap, doc)) return true;
    }

    return false;
  }

  function classifyScheduleInputs(container, doc) {
    const raw = Array.from(
      container.querySelectorAll('input, [role="spinbutton"]')
    ).filter((el) => {
      if (!isFieldVisibleOrLabelVisible(el, doc)) return false;
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "radio" || type === "checkbox" || type === "hidden" || type === "submit" || type === "button") {
        return false;
      }
      if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
      return true;
    });

    // Deduplicate if a spinbutton wraps an input
    const inputs = [];
    for (const el of raw) {
      if (el.getAttribute("role") === "spinbutton" && el.tagName !== "INPUT" && el.querySelector && el.querySelector("input")) {
        continue;
      }
      inputs.push(el);
    }

    let dateInput = null;
    const timeInputs = [];

    const getFieldMeta = (el) => {
      const parentLabel = typeof el.closest === "function" ? el.closest("label") : null;
      return {
        aria: normalize(
          (el.getAttribute("aria-label") || "") + " " +
          (el.getAttribute("placeholder") || "") + " " +
          (parentLabel ? (parentLabel.getAttribute("aria-label") || "") : "")
        ),
        maxAttr: el.getAttribute("max") || el.getAttribute("aria-valuemax")
      };
    };

    for (const inp of inputs) {
      const type = (inp.getAttribute("type") || "").toLowerCase();
      const val = String(inp.value || inp.textContent || "").trim();
      const { aria, maxAttr } = getFieldMeta(inp);

      const isExplicitTime =
        type === "time" ||
        aria.includes("hour") ||
        aria.includes("jam") ||
        aria.includes("minute") ||
        aria.includes("menit") ||
        maxAttr === "23" ||
        maxAttr === "12" ||
        maxAttr === "59" ||
        inp.getAttribute("role") === "spinbutton";

      if (
        !isExplicitTime &&
        (
          type === "date" ||
          aria.includes("date") ||
          aria.includes("tanggal") ||
          /dd\/mm\/yyyy|mm\/dd\/yyyy|hh\/bb\/tttt/i.test(aria) ||
          /\d{4}/.test(val) ||
          /[A-Za-z]{3,}/.test(val) ||
          /\d{1,2}\/\d{1,2}\/\d{4}/.test(val)
        )
      ) {
        if (!dateInput) dateInput = inp;
        continue;
      }

      if (
        isExplicitTime ||
        type === "number" ||
        type === "tel" ||
        /^\d{1,2}(:\d{2})?$/.test(val)
      ) {
        timeInputs.push(inp);
      } else if (dateInput && (type === "text" || type === "")) {
        timeInputs.push(inp);
      }
    }

    if (timeInputs.length >= 2) {
      const hIdx = timeInputs.findIndex((el) => {
        const { aria, maxAttr } = getFieldMeta(el);
        return aria.includes("hour") || aria.includes("jam") || maxAttr === "23" || maxAttr === "12";
      });
      const mIdx = timeInputs.findIndex((el) => {
        const { aria, maxAttr } = getFieldMeta(el);
        return aria.includes("minute") || aria.includes("menit") || maxAttr === "59";
      });
      if (hIdx >= 0 && mIdx >= 0 && hIdx !== mIdx) {
        const hEl = timeInputs[hIdx];
        const mEl = timeInputs[mIdx];
        const rest = timeInputs.filter((_, idx) => idx !== hIdx && idx !== mIdx);
        timeInputs.splice(0, timeInputs.length, hEl, mEl, ...rest);
      }
    }

    // Fallback: if 3 inputs total -> [date, hour, minute]; if 2 inputs -> [date, time]
    if (!dateInput && inputs.length >= 2) {
      dateInput = inputs[0];
      return {
        dateInput,
        timeInputs: inputs.slice(1),
        amPmControl: findAmPmControl(container, doc)
      };
    }

    return {
      dateInput,
      timeInputs,
      amPmControl: findAmPmControl(container, doc)
    };
  }

  function findAmPmControl(container, doc) {
    const btns = Array.from(container.querySelectorAll('button, [role="button"], select')).filter((el) =>
      isVisible(el, doc)
    );
    return btns.find((el) => {
      const lbl = normalize(el.innerText || el.textContent || el.value || "");
      return lbl === "am" || lbl === "pm";
    }) || null;
  }

  function parseNumericText(raw) {
    const str = String(raw == null ? "" : raw).trim();
    if (!/^-?\d+$/.test(str)) return null;
    const n = parseInt(str, 10);
    return Number.isFinite(n) ? n : null;
  }

  function readSpinbuttonNumber(el, doc) {
    if (!el) return null;
    const assocLbl = findAssociatedLabel(el, doc);
    if (assocLbl && isVisuallyPresentIgnoringAriaHidden(assocLbl, doc)) {
      const lblNum = parseNumericText(assocLbl.textContent);
      if (lblNum !== null) return lblNum;
    }
    if (el.getAttribute && el.getAttribute("aria-valuenow") != null) {
      const ariaNum = parseNumericText(el.getAttribute("aria-valuenow"));
      if (ariaNum !== null) return ariaNum;
    }
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      const valNum = parseNumericText(el.value);
      if (valNum !== null) return valNum;
    } else {
      const txtNum = parseNumericText(el.textContent);
      if (txtNum !== null) return txtNum;
    }
    if (assocLbl) {
      return parseNumericText(assocLbl.textContent);
    }
    return null;
  }

  function focusScheduleField(el, doc) {
    if (!el || !el.isConnected) return false;
    const ownerDoc = el.ownerDocument || doc || (typeof document !== "undefined" ? document : null);
    if (typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (_err) {
        // ignore
      }
    }
    // Only click associated/wrapping <label> if input itself is visually hidden; otherwise a shared <label> can steal focus
    const assocLbl = findAssociatedLabel(el, ownerDoc);
    if (isVisible(el, ownerDoc)) {
      if (typeof el.click === "function") el.click();
      if (typeof el.focus === "function") el.focus();
    } else if (assocLbl && isVisuallyPresentIgnoringAriaHidden(assocLbl, ownerDoc)) {
      if (typeof assocLbl.click === "function") assocLbl.click();
      if (ownerDoc && ownerDoc.activeElement !== el && typeof el.focus === "function") {
        el.focus();
      }
    } else {
      const parentLbl = typeof el.closest === "function" ? el.closest("label") : null;
      if (parentLbl && typeof parentLbl.click === "function") parentLbl.click();
      else if (typeof el.click === "function") el.click();
      if (typeof el.focus === "function") el.focus();
    }
    return true;
  }

  function buildKeyInfo(key) {
    if (key === "Enter") return { key: "Enter", code: "Enter", keyCode: 13 };
    if (key === "ArrowUp") return { key: "ArrowUp", code: "ArrowUp", keyCode: 38 };
    if (key === "ArrowDown") return { key: "ArrowDown", code: "ArrowDown", keyCode: 40 };
    if (key === "Backspace") return { key: "Backspace", code: "Backspace", keyCode: 8 };
    if (/^\d$/.test(key)) {
      const kc = 48 + parseInt(key, 10);
      return { key, code: "Digit" + key, keyCode: kc };
    }
    const chCode = key && key.length === 1 ? key.charCodeAt(0) : 0;
    return { key, code: key, keyCode: chCode };
  }

  function dispatchKeyEvent(el, win, eventType, key, codeOverride, keyCodeOverride) {
    if (!el || typeof el.dispatchEvent !== "function") return true;
    const info = buildKeyInfo(key);
    const code = codeOverride || info.code;
    const keyCode = keyCodeOverride != null ? keyCodeOverride : info.keyCode;
    const KeyEvt = (win && win.KeyboardEvent) || (typeof KeyboardEvent !== "undefined" ? KeyboardEvent : null);
    const init = {
      key: info.key,
      code,
      keyCode,
      which: keyCode,
      charCode: eventType === "keypress" ? keyCode : 0,
      bubbles: true,
      cancelable: true
    };
    const evt = KeyEvt
      ? new KeyEvt(eventType, init)
      : Object.assign({
          type: eventType,
          defaultPrevented: false,
          preventDefault() {
            this.defaultPrevented = true;
          }
        }, init);
    const res = el.dispatchEvent(evt);
    return res !== false && !evt.defaultPrevented;
  }

  function dispatchSimpleEvent(el, win, eventType) {
    if (!el || typeof el.dispatchEvent !== "function") return;
    const EventCtor = (win && win.Event) || (typeof Event !== "undefined" ? Event : null);
    if (EventCtor) {
      el.dispatchEvent(new EventCtor(eventType, { bubbles: true }));
    }
  }

  function setInputViaNativeSetter(el, strVal, win, inputType, data) {
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA"
      ? (win && win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : null)
      : (win && win.HTMLInputElement ? win.HTMLInputElement.prototype : null);
    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(el, strVal);
    } else {
      el.value = strVal;
    }

    const InputEvt = (win && win.InputEvent) || (typeof InputEvent !== "undefined" ? InputEvent : null);
    const EventCtor = (win && win.Event) || (typeof Event !== "undefined" ? Event : null);
    if (InputEvt && typeof el.dispatchEvent === "function") {
      el.dispatchEvent(new InputEvt("input", {
        bubbles: true,
        inputType: inputType || "insertText",
        data: data !== undefined ? data : strVal
      }));
    } else if (EventCtor && typeof el.dispatchEvent === "function") {
      el.dispatchEvent(new EventCtor("input", { bubbles: true }));
    }
    if (EventCtor && typeof el.dispatchEvent === "function") {
      el.dispatchEvent(new EventCtor("change", { bubbles: true }));
    }
    return true;
  }

  function selectAllInputText(el) {
    if (typeof el.select === "function") {
      try {
        el.select();
      } catch (_err) {
        // ignore
      }
    }
    if (typeof el.setSelectionRange === "function") {
      try {
        el.setSelectionRange(0, String(el.value || "").length);
      } catch (_err) {
        // ignore (e.g. type="number")
      }
    }
  }

  function typeDigitsIntoSpinbutton(el, strVal, ownerDoc, win) {
    selectAllInputText(el);
    const InputEvt = (win && win.InputEvent) || (typeof InputEvent !== "undefined" ? InputEvent : null);
    const assocLbl = findAssociatedLabel(el, ownerDoc);
    const hasLabelDisplay = Boolean(assocLbl && isVisuallyPresentIgnoringAriaHidden(assocLbl, ownerDoc));

    for (let idx = 0; idx < strVal.length; idx++) {
      const ch = strVal[idx];
      const prefix = strVal.slice(0, idx + 1);
      const prefixNum = parseInt(prefix, 10);
      const prevLabelText = hasLabelDisplay ? String(assocLbl.textContent || "").trim() : null;
      const keyNotCanceled = dispatchKeyEvent(el, win, "keydown", ch);

      const handledByLabel = hasLabelDisplay &&
        String(assocLbl.textContent || "").trim() !== prevLabelText &&
        readSpinbuttonNumber(el, ownerDoc) === prefixNum;

      if (keyNotCanceled && !handledByLabel) {
        dispatchKeyEvent(el, win, "keypress", ch);

        let beforeNotCanceled = true;
        if (InputEvt && typeof el.dispatchEvent === "function") {
          const biEvt = new InputEvt("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: ch
          });
          const res = el.dispatchEvent(biEvt);
          beforeNotCanceled = res !== false && !biEvt.defaultPrevented;
        }

        const handledAfterBeforeInput = hasLabelDisplay &&
          String(assocLbl.textContent || "").trim() !== prevLabelText &&
          readSpinbuttonNumber(el, ownerDoc) === prefixNum;

        if (beforeNotCanceled && !handledAfterBeforeInput && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
          if (idx === 0) selectAllInputText(el);
          let insertedViaExec = false;
          if (ownerDoc && typeof ownerDoc.execCommand === "function") {
            try {
              ownerDoc.execCommand("insertText", false, ch);
              insertedViaExec = true;
            } catch (_err) {
              insertedViaExec = false;
            }
          }
          if (!insertedViaExec || String(el.value || "") !== prefix) {
            setInputViaNativeSetter(el, prefix, win, "insertText", ch);
          }
        }
      }

      dispatchKeyEvent(el, win, "keyup", ch);
    }
  }

  function stepSpinbuttonWithArrows(el, targetNum, ownerDoc, win, maxSteps) {
    let cur = readSpinbuttonNumber(el, ownerDoc);
    if (cur === null || cur === targetNum) return cur === targetNum;
    const limit = maxSteps || 65;
    for (let step = 0; step < limit; step++) {
      if (cur === targetNum) return true;
      const arrowKey = targetNum > cur ? "ArrowUp" : "ArrowDown";
      dispatchKeyEvent(el, win, "keydown", arrowKey);
      dispatchKeyEvent(el, win, "keyup", arrowKey);
      const next = readSpinbuttonNumber(el, ownerDoc);
      if (next === null || next === cur) break;
      cur = next;
    }
    return cur === targetNum;
  }

  function isSpinbuttonInput(el) {
    if (!el) return false;
    if (el.getAttribute && el.getAttribute("role") === "spinbutton") return true;
    const type = (el.getAttribute && el.getAttribute("type") ? el.getAttribute("type") : "").toLowerCase();
    if (type === "time" || type === "date") return false;
    const maxAttr = el.getAttribute ? el.getAttribute("max") : null;
    return maxAttr === "23" || maxAttr === "12" || maxAttr === "59";
  }

  function commitScheduleInput(el, value, doc, pressEnter) {
    if (!el || !el.isConnected) return false;
    const ownerDoc = el.ownerDocument || doc || (typeof document !== "undefined" ? document : null);
    const win = getDocView(ownerDoc);
    const strVal = String(value == null ? "" : value);

    focusScheduleField(el, ownerDoc);

    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      if (isSpinbuttonInput(el) && /^\d{1,2}$/.test(strVal)) {
        const targetNum = parseInt(strVal, 10);
        typeDigitsIntoSpinbutton(el, strVal, ownerDoc, win);

        if (readSpinbuttonNumber(el, ownerDoc) !== targetNum) {
          setInputViaNativeSetter(el, strVal, win, "insertText", strVal);
        }
        if (readSpinbuttonNumber(el, ownerDoc) !== targetNum) {
          stepSpinbuttonWithArrows(el, targetNum, ownerDoc, win, 65);
        }

        if (pressEnter) {
          dispatchKeyEvent(el, win, "keydown", "Enter");
          dispatchKeyEvent(el, win, "keyup", "Enter");
        }
        dispatchSimpleEvent(el, win, "blur");
        dispatchSimpleEvent(el, win, "focusout");
        return true;
      }

      selectAllInputText(el);

      if (ownerDoc && typeof ownerDoc.execCommand === "function") {
        try {
          ownerDoc.execCommand("selectAll", false, null);
          ownerDoc.execCommand("insertText", false, strVal);
        } catch (_err) {
          // fallback below
        }
      }

      if (el.value !== strVal) {
        setInputViaNativeSetter(el, strVal, win, "insertText", strVal);
      }

      if (pressEnter) {
        dispatchKeyEvent(el, win, "keydown", "Enter");
        dispatchKeyEvent(el, win, "keyup", "Enter");
      }

      dispatchSimpleEvent(el, win, "blur");
      dispatchSimpleEvent(el, win, "focusout");
      return true;
    }

    // Non-input spinbutton or contenteditable
    if (el.isContentEditable || (el.getAttribute && el.getAttribute("contenteditable") === "true")) {
      return setNativeInputValue(el, strVal, ownerDoc);
    }

    if (typeof el.dispatchEvent === "function") {
      for (const ch of strVal) {
        dispatchKeyEvent(el, win, "keydown", ch);
        dispatchKeyEvent(el, win, "keypress", ch);
        dispatchKeyEvent(el, win, "keyup", ch);
      }
      if (/^\d{1,2}$/.test(strVal)) {
        const targetNum = parseInt(strVal, 10);
        if (readSpinbuttonNumber(el, ownerDoc) !== targetNum) {
          stepSpinbuttonWithArrows(el, targetNum, ownerDoc, win, 65);
        }
      }
      if (pressEnter) {
        dispatchKeyEvent(el, win, "keydown", "Enter");
        dispatchKeyEvent(el, win, "keyup", "Enter");
      }
      dispatchSimpleEvent(el, win, "blur");
      dispatchSimpleEvent(el, win, "focusout");
      return true;
    }
    return false;
  }

  function setScheduleInputsInPopover(popover, dateObj, doc) {
    const { container } = popover;
    const { dateInput, timeInputs, amPmControl } = classifyScheduleInputs(container, doc);

    if (!dateInput && timeInputs.length === 0) {
      return { ok: false, reason: "Input tanggal/jam pada popover jadwal tidak ditemukan." };
    }

    const preferDmy = isIndonesianPopover(container);

    if (dateInput) {
      const sample = dateInput.value || dateInput.getAttribute("placeholder") || "";
      const formattedDate = formatDateForInput(
        dateObj,
        sample,
        (dateInput.getAttribute("type") || "").toLowerCase(),
        preferDmy
      );
      commitScheduleInput(dateInput, formattedDate, doc, true);
    }

    let hours = dateObj.getHours();
    if (amPmControl) {
      const wantPm = hours >= 12;
      const curLabel = normalize(amPmControl.innerText || amPmControl.textContent || amPmControl.value || "");
      if ((wantPm && curLabel === "am") || (!wantPm && curLabel === "pm")) {
        if (amPmControl.tagName === "SELECT") {
          commitScheduleInput(amPmControl, wantPm ? "PM" : "AM", doc, false);
        } else if (typeof amPmControl.click === "function") {
          amPmControl.click();
        }
      }
      hours = hours % 12 || 12;
    }

    const hh = pad2(hours);
    const min = pad2(dateObj.getMinutes());

    if (timeInputs.length >= 2) {
      // Hour + Minute inputs (e.g. "23" : "00")
      commitScheduleInput(timeInputs[0], hh, doc, false);
      commitScheduleInput(timeInputs[1], min, doc, true);
    } else if (timeInputs.length === 1) {
      commitScheduleInput(timeInputs[0], `${hh}:${min}`, doc, true);
    }

    return { ok: true };
  }

  function findActiveModal(doc) {
    return domBase ? domBase.findTopDialog(doc) : doc.querySelector('[role="dialog"], [aria-modal="true"]');
  }

  function matchesUploadImageLabel(el) {
    if (!el) return false;
    if (el.getAttribute && el.getAttribute("role") === "heading") return false;
    const lbl = normalize((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || ""));
    return UPLOAD_IMAGE_TAB_LABELS.some((kw) => lbl === kw || lbl.includes(kw));
  }

  function findUploadImageTabInModal(modal, doc) {
    if (!modal) return null;
    const candidates = Array.from(
      modal.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"]')
    ).filter((el) => isVisible(el, doc) && matchesUploadImageLabel(el));

    // Prefer segmented tab inside [role="group"] or with aria-pressed/aria-selected
    const segmented = candidates.find((el) =>
      (typeof el.closest === "function" && el.closest('[role="group"]')) ||
      el.hasAttribute("aria-pressed") ||
      el.hasAttribute("aria-selected") ||
      el.getAttribute("role") === "tab" ||
      el.getAttribute("role") === "radio"
    );
    return segmented || candidates[0] || null;
  }

  function findUploadImageTriggerInModal(modal, doc) {
    if (!modal) return null;
    // 1. Prefer inner <a> / [role="link"] ("Unggah gambar" link inside the dropzone card)
    const links = Array.from(
      modal.querySelectorAll('a, [role="link"]')
    ).filter((el) => isVisible(el, doc) && matchesUploadImageLabel(el));
    if (links.length > 0) return links[0];

    // 2. Fallback: secondary upload button outside the segmented tab [role="group"]
    const buttons = Array.from(
      modal.querySelectorAll('button, [role="button"]')
    ).filter((el) =>
      isVisible(el, doc) &&
      matchesUploadImageLabel(el) &&
      !(typeof el.closest === "function" && el.closest('[role="group"]')) &&
      el.getAttribute("role") !== "tab" &&
      el.getAttribute("role") !== "radio"
    );
    return buttons[0] || null;
  }

  function findCancelModalButton(modal, doc) {
    if (!modal) return null;
    const cancelLabels = ["cancel", "batal", "close", "tutup"];
    const buttons = Array.from(modal.querySelectorAll('button, [role="button"]')).filter((el) =>
      isVisible(el, doc) && !el.disabled && el.getAttribute("aria-disabled") !== "true"
    );
    for (const btn of buttons) {
      const lbl = normalize((btn.innerText || btn.textContent || "") + " " + (btn.getAttribute("aria-label") || ""));
      if (cancelLabels.some((kw) => lbl === kw)) {
        return btn;
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

  function describeFieldType(el) {
    if (!el) return "-";
    const tag = el.tagName || "?";
    if (tag === "TEXTAREA" || tag === "INPUT") return tag;
    if (el.getAttribute && el.getAttribute("data-lexical-editor") === "true") return `${tag} (Lexical)`;
    if (el.querySelector && el.querySelector("[data-contents], [data-offset-key]")) return `${tag} (Draft.js)`;
    if (el.isContentEditable || (el.getAttribute && el.getAttribute("contenteditable") === "true")) {
      return `${tag} (ContentEditable)`;
    }
    return `${tag} (${el.getAttribute ? (el.getAttribute("role") || "other") : "other"})`;
  }

  function inspectComposerDiagnostics(doc) {
    const documentRef = doc || document;
    const rows = findComposerRows(documentRef);
    return {
      rowCount: rows.length,
      withDescriptionCount: rows.filter((r) => Boolean(r.descriptionEl)).length,
      withScheduleCount: rows.filter((r) => Boolean(r.scheduleBtn)).length,
      withMoreEditCount: rows.filter((r) => Boolean(r.moreEditBtn)).length,
      topVideoTitle: rows[0] ? rows[0].videoTitle : null,
      topDescriptionType: rows[0] ? describeFieldType(rows[0].descriptionEl) : null
    };
  }

  const api = {
    MONTHS_EN,
    MONTHS_ID,
    pad2,
    cleanVideoTitle,
    formatDateForInput,
    focusDescriptionField,
    isMetaErrorPage,
    isIndonesianPopover,
    readSpinbuttonNumber,
    focusScheduleField,
    dispatchKeyEvent,
    setInputViaNativeSetter,
    typeDigitsIntoSpinbutton,
    stepSpinbuttonWithArrows,
    commitScheduleInput,
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
    findUploadImageTriggerInModal,
    findCancelModalButton,
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
