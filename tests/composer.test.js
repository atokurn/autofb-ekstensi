"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const domBase = require("../src/dom-helpers.js");
const cdom = require("../src/composer-dom.js");
const cengine = require("../src/composer-engine.js");

class MockDataTransfer {
  constructor() {
    this._files = [];
    this.items = {
      add: (file) => this._files.push(file)
    };
  }
  get files() {
    return this._files;
  }
}

class MockElement {
  constructor(tagName, doc, attrs = {}) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = doc;
    this.parentElement = null;
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.value = "";
    this.files = [];
    this.checked = false;
    this.disabled = false;
    this._text = "";
    this._listeners = {};
    this._rect = { left: 0, top: 0, width: 100, height: 30 };

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
    if (k === "value") this.value = String(v);
    if (k === "disabled") this.disabled = true;
  }

  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
  }

  hasAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attrs, k);
  }

  appendChild(child) {
    if (child.parentElement) child.parentElement.removeChild(child);
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
    if (this.parentElement) this.parentElement.removeChild(this);
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
    return [this._rect];
  }

  focus() {}

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  dispatchEvent(evt) {
    const list = this._listeners[evt.type] || [];
    for (const fn of list) fn(evt);
    return !evt.defaultPrevented;
  }

  click() {
    if (this.disabled) return;
    if (this.tagName === "INPUT" && this.getAttribute("type") === "checkbox") {
      this.checked = !this.checked;
    }
    for (const fn of (this._listeners.click || [])) fn({ target: this });
    for (const fn of (this._listeners.change || [])) fn({ target: this });
  }

  matches(selector) {
    const parts = selector.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.some((sel) => {
      if (sel.startsWith("#")) return this.getAttribute("id") === sel.slice(1);
      const attrMatches = [...sel.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)];
      const tagPart = sel.replace(/\[[^\]]+\]/g, "").trim();
      if (tagPart && this.tagName !== tagPart.toUpperCase()) return false;
      for (const m of attrMatches) {
        const [, name, val] = m;
        if (val === undefined) {
          if (!this.hasAttribute(name)) return false;
        } else if (this.getAttribute(name) !== val) {
          return false;
        }
      }
      return true;
    });
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

class MockDocument {
  constructor() {
    this.documentElement = new MockElement("html", this);
    this.body = new MockElement("body", this);
    this.body._rect = { left: 0, top: 0, width: 1200, height: 800 };
    this.documentElement.appendChild(this.body);
    this.defaultView = {
      DataTransfer: MockDataTransfer,
      Event: class { constructor(type) { this.type = type; } },
      HTMLInputElement: MockElement,
      HTMLTextAreaElement: MockElement,
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
}

function createComposerPageSim(videos) {
  const doc = new MockDocument();
  const table = doc.createElement("div", { role: "table" });
  doc.body.appendChild(table);

  const header = doc.createElement("div", { role: "row" });
  const hCb = doc.createElement("input", { type: "checkbox", "aria-label": "Select all" });
  hCb._rect = { left: 20, top: 80, width: 18, height: 18 };
  const hTitle = doc.createElement("span");
  hTitle.textContent = "Thumbnail";
  header.appendChild(hCb);
  header.appendChild(hTitle);
  table.appendChild(header);

  const rowStates = [];
  let activePopover = null;
  let activeModal = null;

  function openSchedulePopover(state) {
    if (activePopover) activePopover.remove();
    const pop = doc.createElement("div");
    const pubTab = doc.createElement("button");
    pubTab.textContent = "Publish now";
    const schedTab = doc.createElement("button");
    schedTab.textContent = "Schedule";

    const dateInput = doc.createElement("input", { type: "text" });
    dateInput.value = "20 November 2026";
    const hourInput = doc.createElement("input", { type: "text", role: "spinbutton", "aria-label": "hours" });
    hourInput.value = "17";
    const minInput = doc.createElement("input", { type: "text", role: "spinbutton", "aria-label": "minutes" });
    minInput.value = "03";

    const updateBtn = doc.createElement("button");
    updateBtn.textContent = "Update";
    updateBtn.addEventListener("click", () => {
      state.scheduledDate = dateInput.value;
      state.scheduledTime = `${hourInput.value}:${minInput.value}`;
      state.schedBtn.textContent = `${dateInput.value}, ${state.scheduledTime}`;
      pop.remove();
      activePopover = null;
    });

    pop.appendChild(pubTab);
    pop.appendChild(schedTab);
    pop.appendChild(dateInput);
    pop.appendChild(hourInput);
    pop.appendChild(minInput);
    pop.appendChild(updateBtn);
    doc.body.appendChild(pop);
    activePopover = pop;
  }

  function openMoreEditModal(state) {
    if (activeModal) activeModal.remove();
    const modal = doc.createElement("div", { role: "dialog", "aria-modal": "true" });
    let step = 1;

    const uploadTab = doc.createElement("button");
    uploadTab.textContent = "Upload image";
    let fileInput = null;

    uploadTab.addEventListener("click", () => {
      if (!fileInput) {
        fileInput = doc.createElement("input", { type: "file", accept: "image/*" });
        fileInput.addEventListener("change", () => {
          if (fileInput.files && fileInput.files[0]) {
            state.uploadedCover = fileInput.files[0].name;
          }
        });
        modal.appendChild(fileInput);
      }
    });

    const footerBtn = doc.createElement("button");
    footerBtn.textContent = "Next";
    footerBtn.addEventListener("click", () => {
      if (step === 1) {
        step = 2;
        footerBtn.textContent = "Save";
      } else {
        modal.remove();
        activeModal = null;
      }
    });

    modal.appendChild(uploadTab);
    modal.appendChild(footerBtn);
    doc.body.appendChild(modal);
    activeModal = modal;
  }

  videos.forEach((v, idx) => {
    const row = doc.createElement("div", { role: "row" });
    const cb = doc.createElement("input", { type: "checkbox" });
    cb._rect = { left: 20, top: 140 + idx * 60, width: 18, height: 18 };
    const titleEl = doc.createElement("span");
    titleEl.textContent = v.name;
    const desc = doc.createElement("textarea");
    desc.addEventListener("input", () => { state.description = desc.value; });
    const schedBtn = doc.createElement("button");
    schedBtn.textContent = "Publish now";
    const moreBtn = doc.createElement("button");
    moreBtn.textContent = "More edit opti...";

    const state = {
      name: v.name,
      description: "",
      scheduledDate: "",
      scheduledTime: "",
      uploadedCover: "",
      schedBtn
    };
    rowStates.push(state);

    schedBtn.addEventListener("click", () => openSchedulePopover(state));
    moreBtn.addEventListener("click", () => openMoreEditModal(state));

    row.appendChild(cb);
    row.appendChild(titleEl);
    row.appendChild(desc);
    row.appendChild(schedBtn);
    row.appendChild(moreBtn);
    table.appendChild(row);
  });

  return { doc, rowStates };
}

test("renderDescriptionTemplate supports custom title, video name, and episode formats", () => {
  const sched = new Date(2026, 10, 20, 17, 30);
  const out1 = cengine.renderDescriptionTemplate("{judul} Episode {episode_02} ({tanggal} {jam})", {
    customTitle: "My Online Girlfriend",
    videoTitle: "video_ep_3",
    episodeNum: 3,
    rowNumber: 1,
    scheduledDate: sched
  });
  assert.equal(out1, "My Online Girlfriend Episode 03 (20/11/2026 17:30)");

  const out2 = cengine.renderDescriptionTemplate("{nama_video} - Ep {episode}", {
    customTitle: "",
    videoTitle: cengine.formatReadableTitle("My_Girl_Ep_5.mp4", true),
    episodeNum: cengine.extractEpisodeFromName("My_Girl_Ep_5.mp4"),
    rowNumber: 1
  });
  assert.equal(out2, "My Girl Ep 5 - Ep 5");
});

test("computeScheduleDates handles minute/hour/day intervals, active window rollover, maxPerDay, and continue", () => {
  // 1. Hourly with active window 08:00 - 21:00
  const dates = cengine.computeScheduleDates(4, {
    scheduleStartDate: "2026-11-20",
    scheduleStartTime: "20:00",
    intervalValue: 1,
    intervalUnit: "hour",
    advancedScheduleEnabled: true,
    activeWindowEnabled: true,
    windowStart: "08:00",
    windowEnd: "21:00",
    maxPerDay: 0,
    jitterMinutes: 0
  });

  assert.equal(dates.length, 4);
  assert.equal(dates[0].getHours(), 20);
  assert.equal(dates[1].getHours(), 21);
  // Third rolls over to next day 08:00
  assert.equal(dates[2].getDate(), 21);
  assert.equal(dates[2].getHours(), 8);
  assert.equal(dates[3].getDate(), 21);
  assert.equal(dates[3].getHours(), 9);

  // 2. Continue from last scheduled (+30 minutes)
  const cont = cengine.computeScheduleDates(2, {
    intervalValue: 30,
    intervalUnit: "minute",
    useLastScheduled: true,
    lastScheduledIso: dates[3].toISOString()
  });
  assert.equal(cont[0].getHours(), 9);
  assert.equal(cont[0].getMinutes(), 30);
  assert.equal(cont[1].getHours(), 10);
  assert.equal(cont[1].getMinutes(), 0);
});

test("formatDateForInput preserves Meta locale date formatting", () => {
  const d = new Date(2026, 10, 25, 10, 0);
  assert.equal(cdom.formatDateForInput(d, "20 November 2026", "text"), "25 November 2026");
  assert.equal(cdom.formatDateForInput(d, "20 Mei 2026", "text"), "25 November 2026");
  assert.equal(cdom.formatDateForInput(d, "2026-11-20", "date"), "2026-11-25");
  assert.equal(cdom.formatDateForInput(d, "11/20/2026", "text"), "11/25/2026");
});

test("pickCoverFile matches sequentially, by filename/episode, and single", () => {
  const files = [{ name: "ep1.jpg" }, { name: "ep2_cover.png" }];
  assert.equal(
    cengine.pickCoverFile(files, { videoTitle: "My Drama Episode 2" }, 0, { coverMatchMode: "filename" }).name,
    "ep2_cover.png"
  );
  assert.equal(
    cengine.pickCoverFile(files, { videoTitle: "Any" }, 1, { coverMatchMode: "sequential" }).name,
    "ep2_cover.png"
  );
  assert.equal(
    cengine.pickCoverFile(files, { videoTitle: "Any" }, 1, { coverMatchMode: "single" }).name,
    "ep1.jpg"
  );
});

test("Composer engine fills description, schedules rows, and uploads covers end-to-end", async () => {
  const { doc, rowStates } = createComposerPageSim([
    { name: "My_Online_Girl_01.mp4" },
    { name: "My_Online_Girl_02.mp4" }
  ]);

  let clock = 0;
  const eng = cengine.createComposerEngine({
    document: doc,
    composerDom: cdom,
    domBase,
    sleep: (ms) => {
      clock += Math.max(1, ms || 1);
      return Promise.resolve();
    },
    now: () => clock
  });

  eng.setCoverFiles([{ name: "cover_1.jpg" }, { name: "cover_2.jpg" }]);

  await eng.start({
    enableDescription: true,
    customTitle: "My Online Girlfriend",
    descriptionTemplate: "{judul} Episode {episode}",
    episodeMode: "sequence",
    startEpisode: 1,
    episodeStep: 1,
    enableSchedule: true,
    scheduleStartDate: "2026-11-21",
    scheduleStartTime: "10:00",
    intervalValue: 2,
    intervalUnit: "hour",
    enableCover: true,
    coverMatchMode: "sequential",
    delayMs: 200,
    stepDelayMs: 150
  });

  const snap = eng.getSnapshot();
  assert.equal(snap.status, "completed");
  assert.equal(snap.processedCount, 2);
  assert.equal(snap.failedCount, 0);

  assert.equal(rowStates[0].description, "My Online Girlfriend Episode 1");
  assert.equal(rowStates[0].scheduledDate, "21 November 2026");
  assert.equal(rowStates[0].scheduledTime, "10:00");
  assert.equal(rowStates[0].uploadedCover, "cover_1.jpg");

  assert.equal(rowStates[1].description, "My Online Girlfriend Episode 2");
  assert.equal(rowStates[1].scheduledDate, "21 November 2026");
  assert.equal(rowStates[1].scheduledTime, "12:00");
  assert.equal(rowStates[1].uploadedCover, "cover_2.jpg");
});

test("setNativeInputValue safely handles Lexical contenteditable, detached nodes, and outer textbox wrappers", () => {
  const { doc } = createComposerPageSim([]);
  const row = doc.createElement("div", { role: "row" });
  const outerWrapper = doc.createElement("div", { role: "textbox" });
  const placeholderChild = doc.createElement("span");
  placeholderChild.textContent = "Describe your reel";
  const innerEditable = doc.createElement("div", { contenteditable: "true" });
  const lexicalChild = doc.createElement("p");
  innerEditable.appendChild(lexicalChild);
  outerWrapper.appendChild(placeholderChild);
  outerWrapper.appendChild(innerEditable);
  row.appendChild(outerWrapper);
  doc.body.appendChild(row);

  // findRowDescriptionField must choose inner [contenteditable="true"] over outer [role="textbox"]
  const picked = cdom.findRowDescriptionField(row, doc);
  assert.equal(picked, innerEditable);

  // Simulate browser with execCommand + throwing addRange: must NOT wipe lexicalChild
  const commands = [];
  doc.execCommand = (cmd, _ui, val) => {
    commands.push([cmd, val]);
    if (cmd === "insertText") {
      lexicalChild.textContent = val;
    }
    return true;
  };
  doc.createRange = () => ({ selectNodeContents() {}, collapse() {} });
  doc.defaultView.getSelection = () => ({
    removeAllRanges() {},
    addRange() {
      throw new Error("The given range isn't in document.");
    }
  });

  // Fallback execCommand inserts text without selectAll (never wiping React child nodes)
  const ok = cdom.setNativeInputValue(outerWrapper, "Judul Episode 1", doc);
  assert.equal(ok, true);
  assert.equal(innerEditable.children.length, 1);
  assert.equal(lexicalChild.textContent, "Judul Episode 1");
  assert.deepEqual(commands, [["insertText", "Judul Episode 1"]]);

  // When Lexical handles beforeinput via preventDefault(), execCommand must NOT be called
  commands.length = 0;
  doc.defaultView.InputEvent = class {
    constructor(type, opts) {
      this.type = type;
      this.data = opts.data;
      this.defaultPrevented = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  innerEditable.addEventListener("beforeinput", (evt) => {
    evt.preventDefault();
    lexicalChild.textContent = evt.data;
  });
  assert.equal(cdom.setNativeInputValue(innerEditable, "Judul Episode 2", doc), true);
  assert.equal(lexicalChild.textContent, "Judul Episode 2");
  assert.equal(commands.length, 0);

  // Non-editable role="textbox" without inner editable must NOT run execCommand in real browser mode
  const fakeBox = doc.createElement("div", { role: "textbox" });
  row.appendChild(fakeBox);
  commands.length = 0;
  assert.equal(cdom.setNativeInputValue(fakeBox, "ShouldSkip", doc), false);
  assert.equal(commands.length, 0);

  // Detached element must return false without throwing
  row.remove();
  assert.equal(cdom.setNativeInputValue(innerEditable, "X", doc), false);
});

test("Composer handles Indonesian Bulk Upload labels (Terbitkan sekarang -> Jadwal tab -> Perbarui) and Opsi edi...", async () => {
  const doc = new MockDocument();
  const table = doc.createElement("div", { role: "table" });
  doc.body.appendChild(table);

  const row = doc.createElement("div", { role: "row" });
  const cb = doc.createElement("input", { type: "checkbox" });
  cb._rect = { left: 20, top: 120, width: 18, height: 18 };
  const titleEl = doc.createElement("span");
  titleEl.textContent = "Video Ep 1";
  const desc = doc.createElement("textarea");
  const schedBtn = doc.createElement("button");
  schedBtn.textContent = "Terbitkan sekarang";
  const moreBtn = doc.createElement("button");
  moreBtn.textContent = "Opsi edi...";

  let savedDate = "";
  let savedTime = "";
  let activePop = null;

  schedBtn.addEventListener("click", () => {
    if (activePop) activePop.remove();
    const pop = doc.createElement("div");
    const pubTab = doc.createElement("div", { role: "tab", "aria-selected": "true" });
    pubTab.textContent = "Terbitkan sekarang";
    const schedTab = doc.createElement("div", { role: "tab", "aria-selected": "false" });
    schedTab.textContent = "Jadwal";
    const draftTab = doc.createElement("div", { role: "tab", "aria-selected": "false" });
    draftTab.textContent = "Simpan sebagai Draf";
    const inputsWrap = doc.createElement("div");

    let dateInput = null;
    let hourInput = null;
    let minInput = null;

    schedTab.addEventListener("click", () => {
      if (!dateInput) {
        dateInput = doc.createElement("input", { type: "text" });
        dateInput.value = "20 November 2026";
        hourInput = doc.createElement("input", { type: "text", role: "spinbutton" });
        hourInput.value = "20";
        minInput = doc.createElement("input", { type: "text", role: "spinbutton" });
        minInput.value = "31";
        inputsWrap.appendChild(dateInput);
        inputsWrap.appendChild(hourInput);
        inputsWrap.appendChild(minInput);
      }
    });

    const updateBtn = doc.createElement("button");
    updateBtn.textContent = "Perbarui";
    updateBtn.addEventListener("click", () => {
      savedDate = dateInput ? dateInput.value : "";
      savedTime = (hourInput && minInput) ? `${hourInput.value}:${minInput.value}` : "";
      pop.remove();
      activePop = null;
    });

    pop.appendChild(pubTab);
    pop.appendChild(schedTab);
    pop.appendChild(draftTab);
    pop.appendChild(inputsWrap);
    pop.appendChild(updateBtn);
    doc.body.appendChild(pop);
    activePop = pop;
  });

  row.appendChild(cb);
  row.appendChild(titleEl);
  row.appendChild(desc);
  row.appendChild(schedBtn);
  row.appendChild(moreBtn);
  table.appendChild(row);

  let clock = 0;
  const eng = cengine.createComposerEngine({
    document: doc,
    composerDom: cdom,
    domBase,
    sleep: (ms) => {
      clock += Math.max(1, ms || 1);
      return Promise.resolve();
    },
    now: () => clock
  });

  await eng.start({
    enableDescription: true,
    customTitle: "Drama",
    descriptionTemplate: "{judul} Episode {episode}",
    enableSchedule: true,
    scheduleStartDate: "2026-11-22",
    scheduleStartTime: "21:15",
    enableCover: false,
    delayMs: 200,
    stepDelayMs: 150
  });

  const snap = eng.getSnapshot();
  assert.equal(snap.status, "completed");
  assert.equal(snap.processedCount, 1);
  assert.equal(desc.value, "Drama Episode 1");
  assert.equal(savedDate, "22 November 2026");
  assert.equal(savedTime, "21:15");
  assert.ok(cdom.findRowMoreEditButton(row, doc));
});

test("Composer sets 20/11/2026 date, label-wrapped minute input, and rolls date 20 -> 21 past midnight", async () => {
  const doc = new MockDocument();
  const table = doc.createElement("div", { role: "table" });
  doc.body.appendChild(table);

  const results = [];
  let activePop = null;

  for (let idx = 0; idx < 3; idx++) {
    const row = doc.createElement("div", { role: "row" });
    const cb = doc.createElement("input", { type: "checkbox" });
    cb._rect = { left: 20, top: 120 + idx * 50, width: 18, height: 18 };
    const titleEl = doc.createElement("span");
    titleEl.textContent = `Ep ${idx + 1}`;
    const desc = doc.createElement("textarea");
    const schedBtn = doc.createElement("button");
    schedBtn.textContent = "Terbitkan sekarang";

    schedBtn.addEventListener("click", () => {
      if (activePop) activePop.remove();
      const pop = doc.createElement("div");
      const schedTab = doc.createElement("button", { role: "tab" });
      schedTab.textContent = "Jadwal";
      const wrap = doc.createElement("div");

      let dateInp = null;
      let hourInp = null;
      let minInp = null;

      schedTab.addEventListener("click", () => {
        if (dateInp) return;
        // Date input displays "20 November 2026" unfocused, switches to "20/11/2026" on focus (like js_gn)
        dateInp = doc.createElement("input", { id: "js_gn", type: "text" });
        dateInp.value = "20 November 2026";
        dateInp.addEventListener("click", () => {
          if (dateInp.value === "20 November 2026") dateInp.value = "20/11/2026";
        });

        hourInp = doc.createElement("input", { id: "js_gv", type: "text", role: "spinbutton" });
        hourInp.value = "21";

        // Minute input wrapped in visible <label>, with zero-size/hidden input style
        const minLabel = doc.createElement("label");
        minLabel._rect = { left: 200, top: 200, width: 40, height: 24 };
        minInp = doc.createElement("input", { type: "text", role: "spinbutton" });
        minInp._rect = { left: 200, top: 200, width: 0, height: 0 };
        minInp.value = "46";
        minLabel.appendChild(minInp);

        wrap.appendChild(dateInp);
        wrap.appendChild(hourInp);
        wrap.appendChild(minLabel);
      });

      const updateBtn = doc.createElement("button");
      updateBtn.textContent = "Perbarui";
      updateBtn.addEventListener("click", () => {
        results.push({
          date: dateInp.value,
          time: `${hourInp.value}:${minInp.value}`
        });
        pop.remove();
        activePop = null;
      });

      pop.appendChild(schedTab);
      pop.appendChild(wrap);
      pop.appendChild(updateBtn);
      doc.body.appendChild(pop);
      activePop = pop;
    });

    row.appendChild(cb);
    row.appendChild(titleEl);
    row.appendChild(desc);
    row.appendChild(schedBtn);
    table.appendChild(row);
  }

  let clock = 0;
  const eng = cengine.createComposerEngine({
    document: doc,
    composerDom: cdom,
    domBase,
    sleep: (ms) => {
      clock += Math.max(1, ms || 1);
      return Promise.resolve();
    },
    now: () => clock
  });

  await eng.start({
    enableDescription: false,
    enableSchedule: true,
    scheduleStartDate: "2026-11-20",
    scheduleStartTime: "23:30",
    intervalValue: 30,
    intervalUnit: "minute",
    enableCover: false,
    delayMs: 200,
    stepDelayMs: 150
  });

  const snap = eng.getSnapshot();
  assert.equal(snap.status, "completed");
  assert.equal(snap.processedCount, 3);
  assert.deepEqual(results, [
    { date: "20/11/2026", time: "23:30" },
    { date: "21/11/2026", time: "00:00" },
    { date: "21/11/2026", time: "00:30" }
  ]);
  // Also confirm DMY ambiguity check (06/11/2026 with preferDmy=true)
  assert.equal(cdom.formatDateForInput(new Date(2026, 10, 6), "05/11/2026", "text", true), "06/11/2026");
});
