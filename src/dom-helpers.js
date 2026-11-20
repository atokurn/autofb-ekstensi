(function (root) {
  "use strict";

  const EXTENSION_HOST_ID = "meta-auto-deleter-root";

  const DEFAULT_KEYWORDS = {
    deleteAction: [
      "hapus",
      "delete",
      "hapus postingan",
      "delete post",
      "delete posts",
      "hapus reel",
      "delete reel",
      "hapus foto",
      "delete photo",
      "hapus video",
      "delete video",
      "hapus cerita",
      "delete story",
      "pindahkan ke sampah",
      "move to trash",
      "buang"
    ],
    confirmAction: [
      "hapus",
      "delete",
      "hapus postingan",
      "delete post",
      "delete posts",
      "hapus reel",
      "delete reel",
      "pindahkan ke sampah",
      "move to trash",
      "konfirmasi",
      "confirm",
      "ya, hapus",
      "yes, delete"
    ],
    cancelAction: [
      "batal",
      "cancel",
      "tutup",
      "close",
      "kembali",
      "back",
      "tidak",
      "no"
    ],
    selectAll: [
      "pilih semua",
      "select all"
    ],
    moreActions: [
      "lainnya",
      "more",
      "opsi lainnya",
      "more options",
      "tindakan",
      "actions",
      "aksi",
      "menu"
    ],
    headerLabels: [
      "judul",
      "title",
      "tanggal dipublikasikan",
      "date published",
      "dijadwalkan",
      "scheduled",
      "terakhir diubah",
      "last modified",
      "status"
    ],
    ignoreRowButtons: [
      "promosikan",
      "boost",
      "boost post",
      "promosikan postingan",
      "lihat wawasan",
      "view insights",
      "edit",
      "sunting"
    ]
  };

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function isOwnElement(el) {
    return Boolean(el && typeof el.closest === "function" && el.closest("#" + EXTENSION_HOST_ID));
  }

  function hasNonZeroBox(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isElementHiddenByStyle(el, doc) {
    const win = (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);
    let curr = el;
    while (curr && curr.nodeType === 1) {
      if (curr.getAttribute && curr.getAttribute("aria-hidden") === "true") {
        return true;
      }
      if (curr.hasAttribute && curr.hasAttribute("hidden")) {
        return true;
      }
      if (win && typeof win.getComputedStyle === "function") {
        const style = win.getComputedStyle(curr);
        if (style) {
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return true;
          }
        }
      } else if (curr.style) {
        if (curr.style.display === "none" || curr.style.visibility === "hidden") {
          return true;
        }
      }
      curr = curr.parentElement;
    }
    return false;
  }

  function isVisible(el, doc) {
    if (!el || !el.isConnected) return false;
    if (isOwnElement(el)) return false;
    if (isElementHiddenByStyle(el, doc)) return false;
    // In real browsers, check layout box unless running in a boxless test DOM (e.g., jsdom)
    const win = (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);
    if (win && typeof el.getBoundingClientRect === "function") {
      const rect = el.getBoundingClientRect();
      // If document body has real layout (>0), require element rect to have area
      const bodyRect = doc && doc.body && doc.body.getBoundingClientRect ? doc.body.getBoundingClientRect() : null;
      if (bodyRect && (bodyRect.width > 0 || bodyRect.height > 0)) {
        if (rect.width <= 0 || rect.height <= 0) return false;
      }
    }
    return true;
  }

  function isEnabled(el) {
    if (!el) return false;
    if (el.disabled === true) return false;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  function getLabelCandidates(el) {
    if (!el) return [];
    const list = [];
    const attrs = ["aria-label", "title", "data-tooltip-content"];
    for (const attr of attrs) {
      const val = el.getAttribute ? el.getAttribute(attr) : "";
      if (val) list.push(normalizeText(val));
    }
    const text = normalizeText(el.innerText || el.textContent || "");
    if (text) list.push(text);
    return list;
  }

  function matchKeywordScore(el, keywords, excludeKeywords) {
    const candidates = getLabelCandidates(el);
    if (candidates.length === 0) return 0;

    if (excludeKeywords && excludeKeywords.length > 0) {
      for (const cand of candidates) {
        for (const ex of excludeKeywords) {
          const nex = normalizeText(ex);
          if (cand === nex) return 0;
        }
      }
    }

    let bestScore = 0;
    for (const cand of candidates) {
      for (let i = 0; i < keywords.length; i++) {
        const kw = normalizeText(keywords[i]);
        if (!kw) continue;
        if (cand === kw) {
          // Exact match; earlier keywords in list get slightly higher tie-breaker
          const score = 100 - i * 0.1;
          if (score > bestScore) bestScore = score;
        } else if (cand.startsWith(kw + " ") || cand.endsWith(" " + kw)) {
          const score = 60 - i * 0.1;
          if (score > bestScore) bestScore = score;
        } else if (cand.includes(kw)) {
          const score = 30 - i * 0.1;
          if (score > bestScore) bestScore = score;
        }
      }
    }
    return bestScore;
  }

  function mergeKeywords(base, customList) {
    if (!Array.isArray(customList) || customList.length === 0) return base;
    const cleaned = customList.map(normalizeText).filter(Boolean);
    return Array.from(new Set(cleaned.concat(base)));
  }

  function parseCustomKeywords(customStr) {
    if (!customStr) return [];
    return String(customStr)
      .split(",")
      .map((s) => normalizeText(s))
      .filter(Boolean);
  }

  function clickElement(el) {
    if (!el) return false;
    if (typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (_err) {
        // ignore scrollIntoView options errors in older/test environments
      }
    }
    if (typeof el.click === "function") {
      el.click();
      return true;
    }
    return false;
  }

  function getCheckboxState(control) {
    if (!control) return "false";
    const aria = control.getAttribute ? control.getAttribute("aria-checked") : null;
    if (aria === "true" || aria === "mixed" || aria === "false") {
      return aria;
    }
    if (control.indeterminate === true) return "mixed";
    if (control.checked === true) return "true";
    const nested = control.querySelector ? control.querySelector('input[type="checkbox"]') : null;
    if (nested) {
      if (nested.indeterminate) return "mixed";
      return nested.checked ? "true" : "false";
    }
    return "false";
  }

  function collectTableCheckboxes(doc) {
    const raw = Array.from(doc.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
    const seen = new Set();
    const items = [];

    for (const el of raw) {
      if (isOwnElement(el)) continue;
      if (el.closest('[role="dialog"], [aria-modal="true"], [role="menu"]')) continue;
      if (!isEnabled(el)) continue;

      // Deduplicate wrapper [role="checkbox"] and inner input[type="checkbox"]
      let canonical = el;
      let clickTarget = el;
      if (el.tagName === "INPUT") {
        const wrapper = el.closest('[role="checkbox"]');
        if (wrapper && !isOwnElement(wrapper)) {
          canonical = wrapper;
          clickTarget = el;
        } else {
          const label = el.closest("label");
          if (label && !isOwnElement(label)) {
            clickTarget = el;
          }
        }
      } else {
        const innerInput = el.querySelector('input[type="checkbox"]');
        if (innerInput) {
          clickTarget = innerInput;
        }
      }

      if (seen.has(canonical)) continue;
      seen.add(canonical);

      // Check visibility on wrapper or clickable element
      const visTarget = isVisible(canonical, doc) ? canonical : (canonical.parentElement && isVisible(canonical.parentElement, doc) ? canonical.parentElement : null);
      if (!visTarget) continue;

      const rect = typeof visTarget.getBoundingClientRect === "function"
        ? visTarget.getBoundingClientRect()
        : { left: 0, top: 0, width: 0, height: 0 };

      items.push({
        control: canonical,
        clickTarget,
        visTarget,
        rect
      });
    }

    if (items.length === 0) return [];

    // If layout geometry exists, filter to the vertical column with the most checkboxes
    const hasLayout = items.some((it) => it.rect.width > 0 || it.rect.height > 0);
    if (hasLayout) {
      const buckets = [];
      for (const item of items) {
        let bucket = buckets.find((b) => Math.abs(b.left - item.rect.left) <= 18);
        if (!bucket) {
          bucket = { left: item.rect.left, items: [] };
          buckets.push(bucket);
        }
        bucket.items.push(item);
      }
      buckets.sort((a, b) => b.items.length - a.items.length);
      const primary = buckets[0].items;
      primary.sort((a, b) => a.rect.top - b.rect.top);
      return primary;
    }

    return items;
  }

  function isHeaderCheckbox(item, doc, allCheckboxes) {
    const { control } = item;
    const aria = normalizeText(
      (control.getAttribute && (control.getAttribute("aria-label") || control.getAttribute("title"))) || ""
    );
    if (DEFAULT_KEYWORDS.selectAll.some((kw) => aria.includes(kw))) {
      return true;
    }
    if (control.closest('thead, [role="columnheader"]')) {
      return true;
    }

    // Check immediate row ancestor for column header labels (Judul, Tanggal dipublikasikan, Status)
    const rowLike = control.closest('[role="row"], tr') || findLikelyRowWrapper(control, allCheckboxes || []);
    if (rowLike) {
      const text = normalizeText(rowLike.textContent || "");
      let headerHits = 0;
      for (const kw of DEFAULT_KEYWORDS.headerLabels) {
        if (text.includes(kw)) headerHits++;
      }
      if (headerHits >= 1 && !rowLike.querySelector('[aria-haspopup="menu"]')) {
        return true;
      }
    }

    // Check if there is a sibling header text at roughly the same Y coordinate
    if (hasNonZeroBox(item.visTarget)) {
      const top = item.rect.top;
      const bottom = item.rect.top + item.rect.height;
      const allHeaders = Array.from(doc.querySelectorAll("span, div, th, [role='columnheader']"));
      for (const h of allHeaders) {
        if (isOwnElement(h)) continue;
        if (h.children.length > 2) continue;
        const txt = normalizeText(h.textContent);
        if (txt === "judul" || txt === "title") {
          const hr = h.getBoundingClientRect();
          if (hr.width > 0 && Math.abs((hr.top + hr.height / 2) - (top + (bottom - top) / 2)) <= 24) {
            return true;
          }
        }
      }
    }

    return false;
  }

  function findLikelyRowWrapper(checkboxEl, allCheckboxes) {
    const otherControls = new Set(
      allCheckboxes.map((c) => c.control).filter((c) => c !== checkboxEl)
    );

    // Prefer explicit ARIA/table row if it contains only this checkbox
    const semanticRow = checkboxEl.closest('[role="row"], tr');
    if (semanticRow && !isOwnElement(semanticRow)) {
      let containsOther = false;
      for (const other of otherControls) {
        if (semanticRow.contains(other)) {
          containsOther = true;
          break;
        }
      }
      if (!containsOther) return semanticRow;
    }

    // Walk up until parent would contain another checkbox or body
    let best = checkboxEl.parentElement;
    let curr = checkboxEl.parentElement;
    for (let depth = 0; depth < 10 && curr && curr.tagName !== "BODY"; depth++) {
      let containsOther = false;
      for (const other of otherControls) {
        if (curr.contains(other)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) break;

      // Prefer a container that also has text or action buttons inside the row
      const txtLen = normalizeText(curr.textContent).length;
      const hasBtn = Boolean(curr.querySelector('button, [role="button"]'));
      if (txtLen > 0 || hasBtn) {
        best = curr;
      }
      curr = curr.parentElement;
    }
    return best;
  }

  function extractRowTitle(rowEl, index) {
    if (!rowEl) return "Konten #" + (index + 1);
    const candidates = Array.from(rowEl.querySelectorAll("a, span, div, p, h1, h2, h3, h4"));
    const ignoreSet = new Set(["promosikan", "boost", "reel", "postingan", "post", "cerita", "story"]);
    for (const node of candidates) {
      if (node.closest('button, [role="button"]')) continue;
      if (node.children.length > 0) continue;
      const txt = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt || txt.length < 3) continue;
      if (ignoreSet.has(txt.toLowerCase())) continue;
      // Skip pure duration stamps like "1:30"
      if (/^\d{1,2}:\d{2}$/.test(txt)) continue;
      return txt.length > 55 ? txt.slice(0, 52) + "..." : txt;
    }
    const fallback = String(rowEl.textContent || "").replace(/\s+/g, " ").trim();
    if (!fallback) return "Konten #" + (index + 1);
    return fallback.length > 55 ? fallback.slice(0, 52) + "..." : fallback;
  }

  function getRowSignature(rowEl) {
    if (!rowEl) return "";
    const text = normalizeText(rowEl.textContent || "").slice(0, 140);
    const img = rowEl.querySelector("img");
    const src = img ? (img.getAttribute("src") || "") : "";
    return text + "|" + src.slice(0, 80);
  }

  function findContentContext(doc) {
    const documentRef = doc || document;
    const checkboxes = collectTableCheckboxes(documentRef);

    let master = null;
    const rowItems = [];

    for (let i = 0; i < checkboxes.length; i++) {
      const item = checkboxes[i];
      if (i === 0 && !master && isHeaderCheckbox(item, documentRef, checkboxes)) {
        master = item;
      } else {
        rowItems.push(item);
      }
    }

    const rows = rowItems.map((item, idx) => {
      const rowEl = findLikelyRowWrapper(item.control, checkboxes);
      return {
        index: idx,
        checkbox: item.control,
        clickTarget: item.clickTarget,
        rowEl,
        title: extractRowTitle(rowEl, idx),
        signature: getRowSignature(rowEl),
        checked: getCheckboxState(item.control) === "true"
      };
    });

    return {
      masterCheckbox: master,
      rows
    };
  }

  function findBulkDeleteButton(doc, customKeywords) {
    const documentRef = doc || document;
    const keywords = mergeKeywords(DEFAULT_KEYWORDS.deleteAction, customKeywords);
    const context = findContentContext(documentRef);
    const rowEls = context.rows.map((r) => r.rowEl).filter(Boolean);

    const candidates = Array.from(
      documentRef.querySelectorAll('button, [role="button"], a[role="button"]')
    );

    let bestEl = null;
    let bestScore = 0;

    for (const el of candidates) {
      if (!isVisible(el, documentRef) || !isEnabled(el)) continue;
      if (el.closest('[role="dialog"], [aria-modal="true"], [role="menu"]')) continue;
      if (rowEls.some((row) => row.contains(el))) continue;

      const score = matchKeywordScore(el, keywords, DEFAULT_KEYWORDS.cancelAction);
      if (score > bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }

    return bestScore >= 60 ? bestEl : null;
  }

  function findRowMoreButton(rowEl, doc, customMoreKeywords) {
    if (!rowEl) return null;
    const documentRef = doc || document;
    const moreKeywords = mergeKeywords(DEFAULT_KEYWORDS.moreActions, customMoreKeywords);

    const buttons = Array.from(
      rowEl.querySelectorAll('button, [role="button"], a[role="button"]')
    ).filter((el) => isVisible(el, documentRef) && isEnabled(el));

    let bestBtn = null;
    let bestScore = 0;

    for (const btn of buttons) {
      if (btn.getAttribute("role") === "checkbox") continue;
      const text = normalizeText(btn.innerText || btn.textContent || "");
      const aria = normalizeText((btn.getAttribute("aria-label") || "") + " " + (btn.getAttribute("title") || ""));

      // Skip "Promosikan" / "Boost" etc.
      if (DEFAULT_KEYWORDS.ignoreRowButtons.some((ig) => text === ig || aria === ig)) {
        continue;
      }

      let score = 0;
      if (btn.getAttribute("aria-haspopup") === "menu" || btn.getAttribute("aria-haspopup") === "true") {
        score += 90;
      }
      const kwScore = matchKeywordScore(btn, moreKeywords);
      if (kwScore > 0) {
        score += kwScore;
      }
      if (text === "..." || text === "•••" || text === "⋯") {
        score += 80;
      }
      // Icon-only button (SVG with no text, likely three-dots button)
      if (!text && btn.querySelector("svg")) {
        score += 35;
      }

      if (score > bestScore) {
        bestScore = score;
        bestBtn = btn;
      }
    }

    return bestScore > 0 ? bestBtn : null;
  }

  function findOpenMenus(doc) {
    const documentRef = doc || document;
    const menus = Array.from(
      documentRef.querySelectorAll('[role="menu"], [role="listbox"]')
    ).filter((el) => isVisible(el, documentRef));
    return menus;
  }

  function findDeleteMenuItem(doc, customKeywords) {
    const documentRef = doc || document;
    const keywords = mergeKeywords(DEFAULT_KEYWORDS.deleteAction, customKeywords);
    const menus = findOpenMenus(documentRef);

    // Search newest/last visible menu first
    for (let m = menus.length - 1; m >= 0; m--) {
      const menu = menus[m];
      const items = Array.from(
        menu.querySelectorAll('[role="menuitem"], [role="option"], button, [role="button"], a')
      ).filter((el) => isVisible(el, documentRef) && isEnabled(el));

      let bestItem = null;
      let bestScore = 0;
      for (const item of items) {
        const score = matchKeywordScore(item, keywords, DEFAULT_KEYWORDS.cancelAction);
        if (score > bestScore) {
          bestScore = score;
          bestItem = item;
        }
      }
      if (bestItem) return bestItem;
    }

    // Fallback: visible menuitem anywhere outside extension host
    const looseItems = Array.from(
      documentRef.querySelectorAll('[role="menuitem"]')
    ).filter((el) => isVisible(el, documentRef) && isEnabled(el));
    let bestLoose = null;
    let bestScore = 0;
    for (const item of looseItems) {
      const score = matchKeywordScore(item, keywords, DEFAULT_KEYWORDS.cancelAction);
      if (score > bestScore) {
        bestScore = score;
        bestLoose = item;
      }
    }
    return bestLoose;
  }

  function findTopDialog(doc) {
    const documentRef = doc || document;
    const dialogs = Array.from(
      documentRef.querySelectorAll('[role="dialog"], [aria-modal="true"]')
    ).filter((el) => isVisible(el, documentRef));
    return dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
  }

  function findConfirmDeleteButton(dialogEl, doc, customKeywords) {
    if (!dialogEl) return null;
    const documentRef = doc || document;
    const keywords = mergeKeywords(DEFAULT_KEYWORDS.confirmAction, customKeywords);
    const buttons = Array.from(
      dialogEl.querySelectorAll('button, [role="button"], a[role="button"]')
    ).filter((el) => isVisible(el, documentRef) && isEnabled(el));

    let bestBtn = null;
    let bestScore = 0;

    for (const btn of buttons) {
      const score = matchKeywordScore(btn, keywords, DEFAULT_KEYWORDS.cancelAction);
      if (score > bestScore) {
        bestScore = score;
        bestBtn = btn;
      }
    }

    return bestScore >= 30 ? bestBtn : null;
  }

  function findDialogDismissButton(dialogEl, doc) {
    if (!dialogEl) return null;
    const documentRef = doc || document;
    const dismissKeywords = ["ok", "tutup", "close", "mengerti", "got it", "selesai", "done"];
    const buttons = Array.from(
      dialogEl.querySelectorAll('button, [role="button"]')
    ).filter((el) => isVisible(el, documentRef) && isEnabled(el));

    for (const btn of buttons) {
      if (matchKeywordScore(btn, dismissKeywords) >= 60) {
        return btn;
      }
    }
    return null;
  }

  function inspectPageDiagnostics(doc, customKeywords) {
    const documentRef = doc || document;
    const ctx = findContentContext(documentRef);
    const bulkBtn = findBulkDeleteButton(documentRef, customKeywords);
    const topRow = ctx.rows[0] || null;
    const topMoreBtn = topRow ? findRowMoreButton(topRow.rowEl, documentRef) : null;
    const dialog = findTopDialog(documentRef);

    return {
      hasMasterCheckbox: Boolean(ctx.masterCheckbox),
      masterState: ctx.masterCheckbox ? getCheckboxState(ctx.masterCheckbox.control) : null,
      rowCount: ctx.rows.length,
      topRowTitle: topRow ? topRow.title : null,
      hasTopRowMoreButton: Boolean(topMoreBtn),
      hasBulkDeleteButton: Boolean(bulkBtn),
      hasOpenDialog: Boolean(dialog)
    };
  }

  const api = {
    EXTENSION_HOST_ID,
    DEFAULT_KEYWORDS,
    normalizeText,
    parseCustomKeywords,
    isVisible,
    isEnabled,
    clickElement,
    getCheckboxState,
    findContentContext,
    findBulkDeleteButton,
    findRowMoreButton,
    findDeleteMenuItem,
    findTopDialog,
    findConfirmDeleteButton,
    findDialogDismissButton,
    inspectPageDiagnostics
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MetaDeleterDOM = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
