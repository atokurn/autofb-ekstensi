"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const dom = require("../src/dom-helpers.js");
const engineFactory = require("../src/engine.js");

/**
 * Minimal DOM implementation sufficient for testing dom-helpers.js and engine.js
 * without external npm dependencies.
 */
class MockElement {
  constructor(tagName, ownerDocument, attrs = {}) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.checked = false;
    this.indeterminate = false;
    this.disabled = false;
    this._text = "";
    this._listeners = {};
    this._rect = { left: 0, top: 0, width: 100, height: 40 };

    for (const [k, v] of Object.entries(attrs)) {
      this.setAttribute(k, v);
    }
  }

  get isConnected() {
    let curr = this;
    while (curr) {
      if (curr === this.ownerDocument.documentElement) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  get textContent() {
    if (this.children.length === 0) return this._text;
    return this._text + this.children.map((c) => c.textContent).join(" ");
  }

  set textContent(val) {
    this._text = String(val || "");
    this.children = [];
  }

  get innerText() {
    return this.textContent;
  }

  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "checked") this.checked = true;
    if (k === "disabled") this.disabled = true;
  }

  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
  }

  hasAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attrs, k);
  }

  removeAttribute(k) {
    delete this.attrs[k];
    if (k === "disabled") this.disabled = false;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  contains(other) {
    let curr = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  getBoundingClientRect() {
    return this._rect;
  }

  getClientRects() {
    return this._rect.width > 0 && this._rect.height > 0 ? [this._rect] : [];
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  click() {
    if (this.disabled) return;
    if (this.tagName === "INPUT" && this.getAttribute("type") === "checkbox") {
      this.checked = !this.checked;
      this.indeterminate = false;
    }
    const cbs = this._listeners.click || [];
    for (const fn of cbs) fn({ target: this });
    const changes = this._listeners.change || [];
    for (const fn of changes) fn({ target: this });
  }

  matches(selector) {
    const parts = selector.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.some((sel) => matchSimpleSelector(this, sel));
  }

  closest(selector) {
    let curr = this;
    while (curr && curr.nodeType === 1) {
      if (curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function matchSimpleSelector(el, sel) {
  if (sel.startsWith("#")) {
    return el.getAttribute("id") === sel.slice(1);
  }
  const attrMatches = [...sel.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)];
  const tagPart = sel.replace(/\[[^\]]+\]/g, "").trim();
  if (tagPart && el.tagName !== tagPart.toUpperCase()) {
    return false;
  }
  for (const m of attrMatches) {
    const attrName = m[1];
    const attrVal = m[2];
    if (attrVal === undefined) {
      if (!el.hasAttribute(attrName)) return false;
    } else if (el.getAttribute(attrName) !== attrVal) {
      return false;
    }
  }
  return true;
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement("html", this);
    this.body = new MockElement("body", this);
    this.body._rect = { left: 0, top: 0, width: 1200, height: 800 };
    this.documentElement.appendChild(this.body);
    this.defaultView = {
      getComputedStyle: (el) => ({
        display: el.style.display || "block",
        visibility: el.style.visibility || "visible",
        opacity: el.style.opacity || "1"
      })
    };
  }

  createElement(tag, attrs) {
    return new MockElement(tag, this, attrs);
  }

  querySelectorAll(sel) {
    return this.documentElement.querySelectorAll(sel);
  }

  querySelector(sel) {
    return this.documentElement.querySelector(sel);
  }

  dispatchEvent() {}
}

/**
 * Builds a realistic Meta Business Suite content page simulation.
 */
function createMetaPageSim(initialItems, options = {}) {
  const doc = new MockDocument();
  const root = doc.createElement("div");
  doc.body.appendChild(root);

  // Own extension root (should always be ignored by dom-helpers!)
  const ownExt = doc.createElement("div", { id: dom.EXTENSION_HOST_ID });
  const ownFakeBtn = doc.createElement("button");
  ownFakeBtn.textContent = "Hapus";
  ownExt.appendChild(ownFakeBtn);
  doc.body.appendChild(ownExt);

  // Toolbar container (shows Bulk Hapus when >=1 row checked)
  const toolbar = doc.createElement("div");
  root.appendChild(toolbar);

  let bulkBtn = null;
  let openMenu = null;
  let openDialog = null;

  const table = doc.createElement("div", { role: "table" });
  root.appendChild(table);

  // Header row
  const headerRow = doc.createElement("div", { role: "row" });
  headerRow._rect = { left: 20, top: 100, width: 900, height: 40 };
  const masterCb = doc.createElement("input", { type: "checkbox" });
  masterCb._rect = { left: 24, top: 110, width: 18, height: 18 };
  const colJudul = doc.createElement("span");
  colJudul.textContent = options.english ? "Title" : "Judul";
  colJudul._rect = { left: 60, top: 110, width: 120, height: 18 };
  const colDate = doc.createElement("span");
  colDate.textContent = options.english ? "Date published" : "Tanggal dipublikasikan";
  headerRow.appendChild(masterCb);
  headerRow.appendChild(colJudul);
  headerRow.appendChild(colDate);
  table.appendChild(headerRow);

  const rowRefs = [];

  function syncToolbarAndMaster() {
    const anyChecked = rowRefs.some((r) => r.cb.checked);
    const allChecked = rowRefs.length > 0 && rowRefs.every((r) => r.cb.checked);
    masterCb.checked = allChecked;
    masterCb.indeterminate = anyChecked && !allChecked;

    if (anyChecked && !bulkBtn) {
      bulkBtn = doc.createElement("button");
      bulkBtn.textContent = options.english ? "Delete" : "Hapus";
      bulkBtn.addEventListener("click", () => {
        const selected = rowRefs.filter((r) => r.cb.checked);
        openConfirmDialog(selected);
      });
      toolbar.appendChild(bulkBtn);
    } else if (!anyChecked && bulkBtn) {
      bulkBtn.remove();
      bulkBtn = null;
    }
  }

  masterCb.addEventListener("click", () => {
    const targetState = masterCb.checked;
    for (const r of rowRefs) {
      r.cb.checked = targetState;
    }
    syncToolbarAndMaster();
  });

  function closeMenu() {
    if (openMenu) {
      openMenu.remove();
      openMenu = null;
    }
  }

  function openConfirmDialog(targetRefs) {
    closeMenu();
    if (openDialog) openDialog.remove();

    openDialog = doc.createElement("div", { role: "dialog", "aria-modal": "true" });
    const title = doc.createElement("div");
    title.textContent = options.english ? "Delete posts?" : "Hapus postingan?";
    const cancelBtn = doc.createElement("button");
    cancelBtn.textContent = options.english ? "Cancel" : "Batal";
    cancelBtn.addEventListener("click", () => {
      openDialog.remove();
      openDialog = null;
    });

    const confirmBtn = doc.createElement("button");
    confirmBtn.textContent = options.english ? "Delete" : "Hapus";
    confirmBtn.addEventListener("click", () => {
      for (const ref of targetRefs) {
        if (ref.undeletable) continue;
        ref.rowEl.remove();
        const idx = rowRefs.indexOf(ref);
        if (idx >= 0) rowRefs.splice(idx, 1);
      }
      openDialog.remove();
      openDialog = null;
      syncToolbarAndMaster();
    });

    openDialog.appendChild(title);
    openDialog.appendChild(cancelBtn);
    openDialog.appendChild(confirmBtn);
    doc.body.appendChild(openDialog);
  }

  initialItems.forEach((item, idx) => {
    const rowEl = doc.createElement("div", { role: "row" });
    rowEl._rect = { left: 20, top: 150 + idx * 60, width: 900, height: 55 };

    const cb = doc.createElement("input", { type: "checkbox" });
    cb._rect = { left: 24, top: 165 + idx * 60, width: 18, height: 18 };
    cb.addEventListener("click", syncToolbarAndMaster);

    const titleSpan = doc.createElement("span");
    titleSpan.textContent = item.title;

    const boostBtn = doc.createElement("button");
    boostBtn.textContent = options.english ? "Boost" : "Promosikan";

    const moreBtn = doc.createElement("button", { "aria-haspopup": "menu", "aria-label": options.english ? "More" : "Lainnya" });
    moreBtn.textContent = "...";

    const ref = { rowEl, cb, item, undeletable: Boolean(item.undeletable) };
    rowRefs.push(ref);

    moreBtn.addEventListener("click", () => {
      closeMenu();
      openMenu = doc.createElement("div", { role: "menu" });
      if (!item.noMenuDelete) {
        const delItem = doc.createElement("div", { role: "menuitem" });
        delItem.textContent = options.english ? "Delete post" : "Hapus postingan";
        delItem.addEventListener("click", () => openConfirmDialog([ref]));
        openMenu.appendChild(delItem);
      } else {
        const editItem = doc.createElement("div", { role: "menuitem" });
        editItem.textContent = "Edit";
        openMenu.appendChild(editItem);
      }
      doc.body.appendChild(openMenu);
    });

    rowEl.appendChild(cb);
    rowEl.appendChild(titleSpan);
    rowEl.appendChild(boostBtn);
    rowEl.appendChild(moreBtn);
    table.appendChild(rowEl);
  });

  return { doc, rowRefs };
}

function createTestClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: (ms) => {
      time += Math.max(1, ms || 1);
      return Promise.resolve();
    }
  };
}

test("inspectPageDiagnostics detects master checkbox, rows, and top row actions", () => {
  const { doc } = createMetaPageSim([
    { title: "ASMR Compiled #1" },
    { title: "ASMR Compiled #2" }
  ]);

  const diag = dom.inspectPageDiagnostics(doc);
  assert.equal(diag.hasMasterCheckbox, true);
  assert.equal(diag.masterState, "false");
  assert.equal(diag.rowCount, 2);
  assert.equal(diag.topRowTitle, "ASMR Compiled #1");
  assert.equal(diag.hasTopRowMoreButton, true);
  assert.equal(diag.hasBulkDeleteButton, false);
});

test("Bulk Delete selects all via master checkbox and deletes all rows", async () => {
  const { doc, rowRefs } = createMetaPageSim([
    { title: "Konten A" },
    { title: "Konten B" },
    { title: "Konten C" }
  ]);

  const clock = createTestClock();
  const eng = engineFactory.createEngine({
    document: doc,
    dom,
    sleep: clock.sleep,
    now: clock.now
  });

  await eng.start({
    mode: "bulk",
    bulkBatchSize: 0,
    delayMs: 300,
    stepDelayMs: 150
  });

  const snap = eng.getSnapshot();
  assert.equal(snap.status, "completed");
  assert.equal(snap.deletedCount, 3);
  assert.equal(snap.batchCount, 1);
  assert.equal(rowRefs.length, 0);
});

test("Bulk Delete respects bulkBatchSize and maxCount", async () => {
  const { doc, rowRefs } = createMetaPageSim([
    { title: "Post 1" },
    { title: "Post 2" },
    { title: "Post 3" },
    { title: "Post 4" },
    { title: "Post 5" }
  ], { english: true });

  const clock = createTestClock();
  const eng = engineFactory.createEngine({
    document: doc,
    dom,
    sleep: clock.sleep,
    now: clock.now
  });

  await eng.start({
    mode: "bulk",
    bulkBatchSize: 2,
    maxCount: 3,
    delayMs: 300,
    stepDelayMs: 150
  });

  const snap = eng.getSnapshot();
  assert.equal(snap.status, "completed");
  assert.equal(snap.deletedCount, 3);
  assert.deepEqual(
    rowRefs.map((r) => r.item.title),
    ["Post 4", "Post 5"]
  );
});

test("1-by-1 Delete from top removes items sequentially starting from row 0", async () => {
  const { doc, rowRefs } = createMetaPageSim([
    { title: "Top 1" },
    { title: "Top 2" },
    { title: "Top 3" }
  ]);

  const clock = createTestClock();
  const eng = engineFactory.createEngine({
    document: doc,
    dom,
    sleep: clock.sleep,
    now: clock.now
  });

  await eng.start({
    mode: "single",
    singleMethod: "menu",
    maxCount: 2,
    delayMs: 300,
    stepDelayMs: 150
  });

  const snap = eng.getSnapshot();
  const deletedLogs = snap.logs
    .filter((l) => l.level === "success" && l.message.startsWith("Terhapus"))
    .reverse();

  assert.equal(snap.status, "completed");
  assert.equal(snap.deletedCount, 2);
  assert.equal(deletedLogs.length, 2);
  assert.match(deletedLogs[0].message, /Top 1/);
  assert.match(deletedLogs[1].message, /Top 2/);
  assert.deepEqual(
    rowRefs.map((r) => r.item.title),
    ["Top 3"]
  );
});

test("1-by-1 auto mode falls back to checkbox if menu has no delete, and skips undeletable rows", async () => {
  const { doc, rowRefs } = createMetaPageSim([
    { title: "Iklan Terkunci", noMenuDelete: true, undeletable: true },
    { title: "No Menu Delete Only", noMenuDelete: true },
    { title: "Normal Top Item" }
  ]);

  const clock = createTestClock();
  const eng = engineFactory.createEngine({
    document: doc,
    dom,
    sleep: clock.sleep,
    now: clock.now
  });

  await eng.start({
    mode: "single",
    singleMethod: "auto",
    skipOnError: true,
    delayMs: 300,
    stepDelayMs: 150
  });

  const snap = eng.getSnapshot();
  assert.equal(snap.status, "completed");
  assert.equal(snap.deletedCount, 2);
  assert.equal(snap.skippedCount, 1);
  assert.deepEqual(
    rowRefs.map((r) => r.item.title),
    ["Iklan Terkunci"]
  );
});

test("Engine supports pause, resume, and stop cleanly", async () => {
  const { doc, rowRefs } = createMetaPageSim([
    { title: "Item 1" },
    { title: "Item 2" },
    { title: "Item 3" }
  ]);

  let ticks = 0;
  const eng = engineFactory.createEngine({
    document: doc,
    dom,
    sleep: () => new Promise((r) => setTimeout(r, 10)),
    onUpdate: (s) => {
      if (s.deletedCount === 1 && s.status === "running" && ticks === 0) {
        ticks = 1;
        eng.stop();
      }
    }
  });

  await eng.start({
    mode: "single",
    singleMethod: "menu",
    delayMs: 300,
    stepDelayMs: 150
  });

  const snap = eng.getSnapshot();
  assert.equal(snap.status, "idle");
  assert.equal(snap.deletedCount, 1);
  assert.equal(rowRefs.length, 2);
});
