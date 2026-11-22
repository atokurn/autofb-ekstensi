(function (root) {
  "use strict";

  const DEFAULT_COMPOSER_CONFIG = {
    enableDescription: true,
    descriptionTemplate: "{judul} Episode {episode}",
    customTitle: "",
    cleanVideoUnderscores: true,
    episodeMode: "sequence", // "sequence" | "filename"
    startEpisode: 1,
    episodeStep: 1,

    enableSchedule: true,
    scheduleStartDate: "", // YYYY-MM-DD (empty = today)
    scheduleStartTime: "", // HH:MM (empty = now + 15m)
    intervalValue: 1,
    intervalUnit: "hour", // "minute" | "hour" | "day"
    useLastScheduled: false,
    lastScheduledIso: "",

    advancedScheduleEnabled: false,
    activeWindowEnabled: false,
    windowStart: "08:00",
    windowEnd: "22:00",
    maxPerDay: 0,
    jitterMinutes: 0,

    enableCover: false,
    coverMatchMode: "sequential", // "sequential" | "filename" | "single"
    loopCovers: false,

    onlyCheckedRows: false,
    startRow: 1, // 1-based
    maxRows: 0, // 0 = all
    delayMs: 1200,
    stepDelayMs: 400
  };

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function pad3(n) {
    return String(n).padStart(3, "0");
  }

  function toDateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseTimeParts(hhmm, fallbackH, fallbackM) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return { h: fallbackH, m: fallbackM };
    return {
      h: Math.max(0, Math.min(23, parseInt(m[1], 10))),
      m: Math.max(0, Math.min(59, parseInt(m[2], 10)))
    };
  }

  function formatReadableTitle(name, cleanUnderscores) {
    let out = String(name || "")
      .replace(/\.(mp4|mov|mkv|avi|webm|m4v)$/i, "")
      .trim();
    if (cleanUnderscores) {
      out = out.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    }
    return out;
  }

  function extractEpisodeFromName(name) {
    const text = String(name || "");
    const patterns = [
      /(?:episode|eps?|part|bagian)[\s._-]*(\d{1,5})/i,
      /\bE(\d{1,5})\b/i,
      /[#_-](\d{1,5})\b/,
      /\b(\d{1,5})\b/
    ];
    for (const re of patterns) {
      const m = re.exec(text);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  function renderDescriptionTemplate(template, ctx) {
    const ep = ctx.episodeNum != null ? ctx.episodeNum : 1;
    const videoName = ctx.videoTitle || "";
    const judul = ctx.customTitle ? ctx.customTitle : videoName;
    const sched = ctx.scheduledDate instanceof Date ? ctx.scheduledDate : null;
    const tanggal = sched ? `${pad2(sched.getDate())}/${pad2(sched.getMonth() + 1)}/${sched.getFullYear()}` : "";
    const jam = sched ? `${pad2(sched.getHours())}:${pad2(sched.getMinutes())}` : "";

    return String(template || "")
      .replace(/\{judul\}|\{title\}/gi, judul)
      .replace(/\{nama_video\}|\{video\}/gi, videoName)
      .replace(/\{episode_03\}|\{ep_03\}/gi, pad3(ep))
      .replace(/\{episode_02\}|\{ep_02\}/gi, pad2(ep))
      .replace(/\{episode\}|\{ep\}/gi, String(ep))
      .replace(/\{no\}|\{index\}/gi, String(ctx.rowNumber || 1))
      .replace(/\{tanggal\}|\{date\}/gi, tanggal)
      .replace(/\{jam\}|\{time\}/gi, jam)
      .trim();
  }

  function addIntervalToDate(dateObj, value, unit) {
    const next = new Date(dateObj.getTime());
    const amount = Math.max(1, Number(value) || 1);
    if (unit === "minute") {
      next.setMinutes(next.getMinutes() + amount);
    } else if (unit === "day") {
      next.setDate(next.getDate() + amount);
    } else {
      next.setHours(next.getHours() + amount);
    }
    return next;
  }

  function getBaseStartDate(cfg, nowDate) {
    const now = nowDate instanceof Date ? new Date(nowDate.getTime()) : new Date();

    if (cfg.useLastScheduled && cfg.lastScheduledIso) {
      const parsedLast = new Date(cfg.lastScheduledIso);
      if (!Number.isNaN(parsedLast.getTime())) {
        return addIntervalToDate(parsedLast, cfg.intervalValue, cfg.intervalUnit);
      }
    }

    let base = new Date(now.getTime());
    if (cfg.scheduleStartDate && /^\d{4}-\d{2}-\d{2}$/.test(cfg.scheduleStartDate)) {
      const parts = cfg.scheduleStartDate.split("-").map((n) => parseInt(n, 10));
      base.setFullYear(parts[0], parts[1] - 1, parts[2]);
    }

    if (cfg.scheduleStartTime && /^\d{1,2}:\d{2}$/.test(cfg.scheduleStartTime)) {
      const t = parseTimeParts(cfg.scheduleStartTime, base.getHours(), base.getMinutes());
      base.setHours(t.h, t.m, 0, 0);
    } else {
      // Default: 20 minutes from now, rounded to nearest minute
      base.setMinutes(base.getMinutes() + 20, 0, 0);
    }

    return base;
  }

  function clampToScheduleRules(candidate, cfg, perDayCounter, prevAssigned, fallbackResetTime) {
    let dt = new Date(candidate.getTime());
    const useAdv = Boolean(cfg.advancedScheduleEnabled);
    const useWindow = useAdv && Boolean(cfg.activeWindowEnabled);
    const maxPerDay = useAdv ? Math.max(0, parseInt(cfg.maxPerDay, 10) || 0) : 0;

    const winStart = parseTimeParts(cfg.windowStart, 8, 0);
    const winEnd = parseTimeParts(cfg.windowEnd, 22, 0);
    const resetTime = useWindow ? winStart : fallbackResetTime;

    for (let guard = 0; guard < 365; guard++) {
      if (useWindow) {
        const mins = dt.getHours() * 60 + dt.getMinutes();
        const startMins = winStart.h * 60 + winStart.m;
        const endMins = winEnd.h * 60 + winEnd.m;

        if (endMins > startMins) {
          if (mins < startMins) {
            dt.setHours(winStart.h, winStart.m, 0, 0);
          } else if (mins > endMins) {
            dt.setDate(dt.getDate() + 1);
            dt.setHours(winStart.h, winStart.m, 0, 0);
            continue;
          }
        }
      }

      if (maxPerDay > 0) {
        const key = toDateKey(dt);
        const countToday = perDayCounter.get(key) || 0;
        if (countToday >= maxPerDay) {
          dt.setDate(dt.getDate() + 1);
          dt.setHours(resetTime.h, resetTime.m, 0, 0);
          continue;
        }
      }

      if (prevAssigned && dt.getTime() <= prevAssigned.getTime()) {
        dt = new Date(prevAssigned.getTime() + 60000);
        continue;
      }

      break;
    }

    return dt;
  }

  function computeScheduleDates(count, cfg, deps) {
    const nowFn = (deps && deps.nowDate) || (() => new Date());
    const randFn = (deps && deps.random) || Math.random;
    const dates = [];
    if (count <= 0) return dates;

    const perDayCounter = new Map();
    let cursor = getBaseStartDate(cfg, nowFn());
    const resetTime = { h: cursor.getHours(), m: cursor.getMinutes() };
    const jitterMax = cfg.advancedScheduleEnabled ? Math.max(0, parseInt(cfg.jitterMinutes, 10) || 0) : 0;

    for (let i = 0; i < count; i++) {
      let candidate = i === 0 ? new Date(cursor.getTime()) : addIntervalToDate(cursor, cfg.intervalValue, cfg.intervalUnit);

      if (jitterMax > 0) {
        const deltaMin = Math.round((randFn() * 2 - 1) * jitterMax);
        candidate.setMinutes(candidate.getMinutes() + deltaMin);
      }

      const prev = dates.length > 0 ? dates[dates.length - 1] : null;
      const finalDate = clampToScheduleRules(candidate, cfg, perDayCounter, prev, resetTime);
      dates.push(finalDate);

      const dayKey = toDateKey(finalDate);
      perDayCounter.set(dayKey, (perDayCounter.get(dayKey) || 0) + 1);
      cursor = new Date(finalDate.getTime());
    }

    return dates;
  }

  function stripExtension(filename) {
    return String(filename || "").replace(/\.[^.]+$/, "");
  }

  function normalizeForMatch(str) {
    return stripExtension(str)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function pickCoverFile(files, row, itemIndex, cfg) {
    if (!files || files.length === 0) return null;
    const mode = cfg.coverMatchMode || "sequential";

    if (mode === "single") {
      return files[0];
    }

    if (mode === "filename") {
      const targetNorm = normalizeForMatch(row.videoTitle || "");
      const rowEp = extractEpisodeFromName(row.videoTitle || "");

      // 1. Exact or substring normalized match
      const exactOrSub = files.find((f) => {
        const fNorm = normalizeForMatch(f.name || "");
        return fNorm && targetNorm && (targetNorm.includes(fNorm) || fNorm.includes(targetNorm));
      });
      if (exactOrSub) return exactOrSub;

      // 2. Episode number match
      if (rowEp != null) {
        const epMatch = files.find((f) => extractEpisodeFromName(f.name || "") === rowEp);
        if (epMatch) return epMatch;
      }
    }

    // Sequential (or fallback)
    if (itemIndex < files.length) {
      return files[itemIndex];
    }
    return cfg.loopCovers ? files[itemIndex % files.length] : null;
  }

  function createComposerEngine(deps) {
    const doc = (deps && deps.document) || (typeof document !== "undefined" ? document : null);
    const cdom = (deps && deps.composerDom) || root.MetaComposerDOM;
    const domBase = (deps && deps.domBase) || root.MetaDeleterDOM;
    const onUpdate = (deps && deps.onUpdate) || function () {};
    const onSaveLastSchedule = (deps && deps.onSaveLastSchedule) || function () {};
    const sleepImpl = (deps && deps.sleep) || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const nowImpl = (deps && deps.now) || (() => Date.now());

    let config = Object.assign({}, DEFAULT_COMPOSER_CONFIG);
    let coverFiles = [];
    let state = {
      status: "idle", // "idle" | "running" | "paused" | "stopping" | "completed" | "error"
      processedCount: 0,
      totalTarget: 0,
      failedCount: 0,
      currentItem: "",
      lastError: "",
      lastScheduledIso: "",
      coverCount: 0,
      logs: []
    };

    let runToken = 0;

    function nowTime() {
      return new Date().toTimeString().slice(0, 8);
    }

    function getSnapshot() {
      return {
        status: state.status,
        processedCount: state.processedCount,
        totalTarget: state.totalTarget,
        failedCount: state.failedCount,
        currentItem: state.currentItem,
        lastError: state.lastError,
        lastScheduledIso: state.lastScheduledIso,
        coverCount: coverFiles.length,
        logs: state.logs.slice(),
        config: Object.assign({}, config)
      };
    }

    function emit() {
      try {
        onUpdate(getSnapshot());
      } catch (_err) {
        // ignore
      }
    }

    function addLog(message, level) {
      const entry = {
        time: nowTime(),
        level: level || "info",
        message
      };
      state.logs = [entry].concat(state.logs).slice(0, 80);
      emit();
    }

    function setConfig(partial) {
      config = Object.assign({}, config, partial || {});
      config.intervalValue = Math.max(1, parseInt(config.intervalValue, 10) || 1);
      config.startEpisode = Math.max(0, parseInt(config.startEpisode, 10) || 0);
      config.episodeStep = Math.max(1, parseInt(config.episodeStep, 10) || 1);
      config.startRow = Math.max(1, parseInt(config.startRow, 10) || 1);
      config.maxRows = Math.max(0, parseInt(config.maxRows, 10) || 0);
      config.delayMs = Math.max(200, Number(config.delayMs) || 1200);
      config.stepDelayMs = Math.max(150, Number(config.stepDelayMs) || 400);
      emit();
    }

    function setCoverFiles(files) {
      coverFiles = Array.from(files || []);
      state.coverCount = coverFiles.length;
      emit();
    }

    function selectTargetRows(allRows) {
      let rows = config.onlyCheckedRows ? allRows.filter((r) => r.checked) : allRows.slice();
      const startIdx = Math.max(0, (config.startRow || 1) - 1);
      rows = rows.slice(startIdx);
      if (config.maxRows > 0) {
        rows = rows.slice(0, config.maxRows);
      }
      return rows;
    }

    function previewPlan(sampleRows, previewCount) {
      const rows = (sampleRows && sampleRows.length > 0)
        ? selectTargetRows(sampleRows)
        : [
            { index: 0, videoTitle: "Contoh Video Ep 1" },
            { index: 1, videoTitle: "Contoh Video Ep 2" },
            { index: 2, videoTitle: "Contoh Video Ep 3" }
          ];
      const limit = Math.min(rows.length, previewCount || 3);
      const sliced = rows.slice(0, limit);
      const schedDates = config.enableSchedule ? computeScheduleDates(sliced.length, config) : [];

      return sliced.map((row, idx) => {
        const cleanName = formatReadableTitle(row.videoTitle, config.cleanVideoUnderscores);
        const epNum = config.episodeMode === "filename"
          ? (extractEpisodeFromName(row.videoTitle) ?? (config.startEpisode + idx * config.episodeStep))
          : (config.startEpisode + idx * config.episodeStep);
        const scheduledDate = schedDates[idx] || null;
        const description = config.enableDescription
          ? renderDescriptionTemplate(config.descriptionTemplate, {
              customTitle: config.customTitle,
              videoTitle: cleanName,
              episodeNum: epNum,
              rowNumber: idx + 1,
              scheduledDate
            })
          : "";
        return {
          rowNumber: idx + 1,
          videoTitle: cleanName,
          episodeNum: epNum,
          description,
          scheduledDate,
          coverFile: config.enableCover ? pickCoverFile(coverFiles, row, idx, config) : null
        };
      });
    }

    function isAborted(token) {
      return token !== runToken || state.status === "stopping" || state.status === "idle";
    }

    async function waitWhilePaused(token) {
      while (state.status === "paused" && token === runToken) {
        await sleepImpl(200);
      }
      return !isAborted(token);
    }

    async function smartSleep(ms, token) {
      const chunk = 150;
      let elapsed = 0;
      while (elapsed < ms) {
        if (!(await waitWhilePaused(token))) return false;
        const wait = Math.min(chunk, ms - elapsed);
        await sleepImpl(wait);
        elapsed += wait;
      }
      return await waitWhilePaused(token);
    }

    async function waitFor(predicate, timeoutMs, intervalMs, token) {
      const start = nowImpl();
      while (nowImpl() - start <= timeoutMs) {
        if (!(await waitWhilePaused(token))) return null;
        const res = predicate();
        if (res) return res;
        await sleepImpl(intervalMs || 150);
      }
      return null;
    }

    function closeAnySchedulePopover() {
      try {
        if (doc && typeof KeyboardEvent === "function") {
          const evt = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
          doc.dispatchEvent(evt);
          if (doc.body) doc.body.dispatchEvent(evt);
        }
      } catch (_err) {
        // ignore
      }
    }

    async function applyScheduleForRow(row, targetDate, token) {
      if (!row.scheduleBtn) {
        return { ok: false, reason: "Tombol jadwal pada baris tidak ditemukan." };
      }

      if (cdom.findSchedulePopover(doc)) {
        closeAnySchedulePopover();
        await smartSleep(150, token);
      }

      domBase.clickElement(row.scheduleBtn);
      const popover = await waitFor(() => cdom.findSchedulePopover(doc), 3500, 120, token);
      if (!popover) {
        return { ok: false, reason: "Popover jadwal tidak muncul." };
      }

      // Click "Schedule" / "Jadwal" tab inside popover
      domBase.clickElement(popover.scheduleTab);
      if (!(await smartSleep(Math.min(350, config.stepDelayMs), token))) {
        return { ok: false, aborted: true };
      }

      // Wait for date/time inputs to mount inside the active Schedule/Jadwal tab
      const readyPopover = await waitFor(() => {
        const pop = cdom.findSchedulePopover(doc) || popover;
        const classified = cdom.classifyScheduleInputs(pop.container, doc);
        return (classified.dateInput || classified.timeInputs.length > 0) ? pop : null;
      }, 2000, 100, token) || cdom.findSchedulePopover(doc) || popover;

      if (typeof cdom.commitScheduleInput === "function") {
        const { dateInput, timeInputs, amPmControl } = cdom.classifyScheduleInputs(readyPopover.container, doc);
        if (!dateInput && timeInputs.length === 0) {
          closeAnySchedulePopover();
          return { ok: false, reason: "Input tanggal/jam pada popover jadwal tidak ditemukan." };
        }

        const preferDmy = typeof cdom.isIndonesianPopover === "function" && cdom.isIndonesianPopover(readyPopover.container);

        if (dateInput && dateInput.isConnected) {
          // Focus first so Meta's DateInput switches from display text to editable format (e.g. 20/11/2026)
          if (typeof dateInput.click === "function") dateInput.click();
          if (typeof dateInput.focus === "function") dateInput.focus();
          if (!(await smartSleep(80, token))) return { ok: false, aborted: true };

          const sample = dateInput.value || dateInput.getAttribute("placeholder") || "";
          const dmyStr = `${pad2(targetDate.getDate())}/${pad2(targetDate.getMonth() + 1)}/${targetDate.getFullYear()}`;
          const formattedDate = preferDmy && (!sample || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sample))
            ? dmyStr
            : cdom.formatDateForInput(
                targetDate,
                sample,
                (dateInput.getAttribute("type") || "").toLowerCase(),
                preferDmy
              );

          cdom.commitScheduleInput(dateInput, formattedDate, doc, true);
          if (!(await smartSleep(120, token))) return { ok: false, aborted: true };

          // If DateInput reverted or ignored month-name format, fallback to DD/MM/YYYY (20/11/2026)
          const curDateVal = String(dateInput.value || "").trim();
          const targetDayStr = String(targetDate.getDate());
          if (preferDmy && formattedDate !== dmyStr && !curDateVal.includes(targetDayStr)) {
            cdom.commitScheduleInput(dateInput, dmyStr, doc, true);
            if (!(await smartSleep(120, token))) return { ok: false, aborted: true };
          }
        }

        const win = (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);

        const refreshClassified = () => {
          const pop = cdom.findSchedulePopover(doc) || readyPopover;
          return cdom.classifyScheduleInputs(pop.container, doc);
        };

        const activeAfterDate = refreshClassified();
        const curAmPm = activeAfterDate.amPmControl || amPmControl;
        let curTimeInputs = activeAfterDate.timeInputs.length > 0 ? activeAfterDate.timeInputs : timeInputs;

        let hours = targetDate.getHours();
        if (curAmPm) {
          const wantPm = hours >= 12;
          const curLabel = String(curAmPm.innerText || curAmPm.textContent || curAmPm.value || "").trim().toLowerCase();
          if ((wantPm && curLabel === "am") || (!wantPm && curLabel === "pm")) {
            if (curAmPm.tagName === "SELECT") {
              cdom.commitScheduleInput(curAmPm, wantPm ? "PM" : "AM", doc, false);
            } else if (typeof curAmPm.click === "function") {
              curAmPm.click();
            }
            if (!(await smartSleep(60, token))) return { ok: false, aborted: true };
          }
          hours = hours % 12 || 12;
        }

        const hh = pad2(hours);
        const mins = targetDate.getMinutes();
        const min = pad2(mins);

        async function finishInputEdit(inp, pressEnter) {
          if (pressEnter && typeof cdom.dispatchKeyEvent === "function") {
            cdom.dispatchKeyEvent(inp, win, "keydown", "Enter");
            cdom.dispatchKeyEvent(inp, win, "keyup", "Enter");
          }
          const EventCtor = (win && win.Event) || (typeof Event !== "undefined" ? Event : null);
          if (EventCtor && typeof inp.dispatchEvent === "function") {
            inp.dispatchEvent(new EventCtor("blur", { bubbles: true }));
            inp.dispatchEvent(new EventCtor("focusout", { bubbles: true }));
          }
          return smartSleep(50, token);
        }

        function focusInputEl(inp) {
          if (typeof cdom.focusScheduleField === "function") {
            cdom.focusScheduleField(inp, doc);
          } else {
            if (typeof inp.click === "function") inp.click();
            if (typeof inp.focus === "function") inp.focus();
          }
        }

        async function applyTimeSegment(inp, targetNum, formattedStr, pressEnter) {
          if (!inp || !inp.isConnected) return { ok: false, reason: "Input jam/menit tidak aktif." };

          focusInputEl(inp);
          if (!(await smartSleep(50, token))) return { ok: false, aborted: true };

          cdom.commitScheduleInput(inp, formattedStr, doc, pressEnter);
          if (!(await smartSleep(60, token))) return { ok: false, aborted: true };

          if (typeof cdom.readSpinbuttonNumber !== "function") {
            return { ok: true };
          }

          let actual = cdom.readSpinbuttonNumber(inp, doc);
          if (actual === null || actual === targetNum) {
            return { ok: true };
          }

          // Retry A: Re-focus and push value via native setter + input/change + blur
          focusInputEl(inp);
          if (!(await smartSleep(40, token))) return { ok: false, aborted: true };

          if (typeof cdom.setInputViaNativeSetter === "function" && (inp.tagName === "INPUT" || inp.tagName === "TEXTAREA")) {
            cdom.setInputViaNativeSetter(inp, formattedStr, win, "insertText", formattedStr);
            if (!(await smartSleep(40, token))) return { ok: false, aborted: true };
            if (!(await finishInputEdit(inp, pressEnter))) return { ok: false, aborted: true };
          }

          actual = cdom.readSpinbuttonNumber(inp, doc);
          if (actual === null || actual === targetNum) {
            return { ok: true };
          }

          // Retry B: Step via ArrowUp / ArrowDown with short async waits between ticks
          if (typeof cdom.dispatchKeyEvent === "function") {
            focusInputEl(inp);
            if (!(await smartSleep(40, token))) return { ok: false, aborted: true };

            let cur = cdom.readSpinbuttonNumber(inp, doc);
            for (let step = 0; step < 65; step++) {
              if (cur === null || cur === targetNum) break;
              const arrowKey = targetNum > cur ? "ArrowUp" : "ArrowDown";
              cdom.dispatchKeyEvent(inp, win, "keydown", arrowKey);
              cdom.dispatchKeyEvent(inp, win, "keyup", arrowKey);
              if (!(await smartSleep(15, token))) return { ok: false, aborted: true };
              const next = cdom.readSpinbuttonNumber(inp, doc);
              if (next === null || next === cur) break;
              cur = next;
            }
            if (!(await finishInputEdit(inp, pressEnter))) return { ok: false, aborted: true };
            actual = cdom.readSpinbuttonNumber(inp, doc);
          }

          if (actual !== null && actual !== targetNum) {
            return { ok: false, actual };
          }
          return { ok: true };
        }

        if (curTimeInputs.length === 0) {
          closeAnySchedulePopover();
          return { ok: false, reason: "Input jam/menit pada popover jadwal tidak ditemukan." };
        } else if (curTimeInputs.length >= 2) {
          const hRes = await applyTimeSegment(curTimeInputs[0], hours, hh, false);
          if (hRes.aborted) return hRes;
          if (!hRes.ok) {
            closeAnySchedulePopover();
            return { ok: false, reason: `Gagal mengubah jam jadwal ke ${hh} (masih ${hRes.actual ?? "?"}).` };
          }

          if (!(await smartSleep(80, token))) return { ok: false, aborted: true };

          // Re-check minute input in case changing hour re-rendered the time field
          if (!curTimeInputs[1].isConnected) {
            const re = refreshClassified();
            if (re.timeInputs.length >= 2) curTimeInputs = re.timeInputs;
          }

          const mRes = await applyTimeSegment(curTimeInputs[1], mins, min, true);
          if (mRes.aborted) return mRes;
          if (!mRes.ok) {
            closeAnySchedulePopover();
            return { ok: false, reason: `Gagal mengubah menit jadwal ke ${min} (masih ${mRes.actual ?? "?"}).` };
          }
        } else if (curTimeInputs.length === 1) {
          cdom.commitScheduleInput(curTimeInputs[0], `${hh}:${min}`, doc, true);
        }
      } else {
        const setRes = cdom.setScheduleInputsInPopover(readyPopover, targetDate, doc);
        if (!setRes.ok) {
          closeAnySchedulePopover();
          return setRes;
        }
      }

      if (!(await smartSleep(250, token))) return { ok: false, aborted: true };

      const finalPopover = cdom.findSchedulePopover(doc) || readyPopover;
      if (finalPopover.updateBtn && (finalPopover.updateBtn.disabled ||
          (finalPopover.updateBtn.getAttribute && finalPopover.updateBtn.getAttribute("aria-disabled") === "true"))) {
        closeAnySchedulePopover();
        return { ok: false, reason: "Tombol Perbarui nonaktif (pastikan waktu jadwal minimal 20 menit ke depan dan maks 29 hari)." };
      }
      domBase.clickElement(finalPopover.updateBtn);
      await waitFor(() => !cdom.findSchedulePopover(doc), 3000, 120, token);
      return { ok: true };
    }

    async function armMainWorldCoverBridge(win, coverFile, token) {
      if (!win || typeof win.postMessage !== "function" || typeof win.addEventListener !== "function") {
        return null;
      }
      if (typeof coverFile.arrayBuffer !== "function") {
        return null;
      }

      const REQ_SOURCE = "meta-auto-cover-req";
      const RESP_SOURCE = "meta-auto-cover-res";
      const requestId = `cov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      let bytes;
      try {
        bytes = new Uint8Array(await coverFile.arrayBuffer());
      } catch (_err) {
        return null;
      }

      const result = { armed: false, ok: false, error: null, done: false };
      let cleanup = null;

      const listener = (event) => {
        if (event.source !== win || !event.data || event.data.source !== RESP_SOURCE) return;
        if (event.data.requestId !== requestId) return;
        if (event.data.armed) result.armed = true;
        if (typeof event.data.ok === "boolean") {
          result.ok = event.data.ok;
          result.error = event.data.error || null;
          result.done = true;
        }
      };

      win.addEventListener("message", listener);
      cleanup = () => {
        try {
          win.removeEventListener("message", listener);
        } catch (_err) {
          // ignore
        }
        try {
          win.postMessage({ source: REQ_SOURCE, action: "DISARM_COVER_UPLOAD", requestId }, "*");
        } catch (_err) {
          // ignore
        }
      };

      try {
        win.postMessage({
          source: REQ_SOURCE,
          action: "ARM_COVER_UPLOAD",
          requestId,
          name: coverFile.name || "cover.jpg",
          type: coverFile.type || "image/jpeg",
          bytes
        }, "*");
      } catch (_err) {
        cleanup();
        return null;
      }

      await waitFor(() => result.armed || result.done, 350, 30, token);
      if (!result.armed && !result.done) {
        cleanup();
        return null;
      }

      return { result, cleanup };
    }

    async function closeCoverModal(modal) {
      const active = cdom.findActiveModal(doc) || modal;
      if (active && typeof cdom.findCancelModalButton === "function") {
        const cancelBtn = cdom.findCancelModalButton(active, doc);
        if (cancelBtn) {
          domBase.clickElement(cancelBtn);
          await waitFor(() => !cdom.findActiveModal(doc), 1500, 100, runToken);
          return;
        }
      }
      closeAnySchedulePopover();
    }

    async function applyCoverForRow(row, coverFile, token) {
      if (!row.moreEditBtn) {
        return { ok: false, reason: "Tombol 'More edit options' tidak ditemukan." };
      }

      domBase.clickElement(row.moreEditBtn);
      const modal = await waitFor(() => cdom.findActiveModal(doc), 4000, 150, token);
      if (!modal) {
        return { ok: false, reason: "Modal 'More edit options' tidak muncul." };
      }

      if (!(await smartSleep(Math.min(400, config.stepDelayMs), token))) {
        return { ok: false, aborted: true };
      }

      const win = (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);

      async function clickWithInputCapture(targetEl, waitFn) {
        const InputProto = win && win.HTMLInputElement ? win.HTMLInputElement.prototype : null;
        const origClick = InputProto ? InputProto.click : null;
        let captured = null;

        if (InputProto && origClick) {
          InputProto.click = function () {
            const t = (this && (this.type || (typeof this.getAttribute === "function" && this.getAttribute("type")) || "")).toLowerCase();
            if (t === "file") {
              captured = this;
              return;
            }
            return origClick.apply(this, arguments);
          };
        }

        try {
          domBase.clickElement(targetEl);
          if (waitFn) {
            const matched = await waitFn(() => captured);
            return { captured, matched };
          }
          if (!(await smartSleep(400, token))) return { aborted: true };
          return { captured };
        } finally {
          if (InputProto && origClick) {
            InputProto.click = origClick;
          }
        }
      }

      // 1. Check if <input type="file"> already exists inside modal
      let fileInput = cdom.findImageFileInputInModal(cdom.findActiveModal(doc) || modal);
      let mainWorldHandled = false;

      if (!fileInput) {
        // 2. Activate "Unggah gambar" / "Upload image" segmented tab if needed
        const curModal = cdom.findActiveModal(doc) || modal;
        const uploadTab = cdom.findUploadImageTabInModal(curModal, doc);
        const tabAlreadyActive = uploadTab && (
          uploadTab.getAttribute("aria-pressed") === "true" ||
          uploadTab.getAttribute("aria-selected") === "true"
        );
        let trigger = typeof cdom.findUploadImageTriggerInModal === "function"
          ? cdom.findUploadImageTriggerInModal(curModal, doc)
          : null;

        if (uploadTab && (!tabAlreadyActive || !trigger)) {
          const tabClickRes = await clickWithInputCapture(uploadTab);
          if (tabClickRes.aborted) return { ok: false, aborted: true };
          fileInput = tabClickRes.captured || cdom.findImageFileInputInModal(cdom.findActiveModal(doc) || modal);
          if (!fileInput && typeof cdom.findUploadImageTriggerInModal === "function") {
            trigger = cdom.findUploadImageTriggerInModal(cdom.findActiveModal(doc) || modal, doc);
          }
        }

        // 3. Click inner "Unggah gambar" link/trigger with MAIN-world bridge armed for ephemeral <input type="file">
        if (!fileInput && (trigger || uploadTab)) {
          const clickTarget = trigger || uploadTab;
          const bridge = await armMainWorldCoverBridge(win, coverFile, token);

          try {
            const clickRes = await clickWithInputCapture(clickTarget, (getCaptured) =>
              waitFor(() => {
                if (bridge && bridge.result.done) return { kind: "bridge" };
                const cap = getCaptured();
                if (cap) return { kind: "captured", el: cap };
                const mounted = cdom.findImageFileInputInModal(cdom.findActiveModal(doc) || modal);
                if (mounted) return { kind: "mounted", el: mounted };
                return null;
              }, 1400, 80, token)
            );
            if (isAborted(token)) return { ok: false, aborted: true };

            const matched = clickRes.matched;
            if (matched && matched.kind === "bridge" && bridge.result.ok) {
              mainWorldHandled = true;
            } else if (matched && matched.kind === "captured") {
              fileInput = matched.el;
            } else if (matched && matched.kind === "mounted") {
              fileInput = matched.el;
            } else {
              fileInput = clickRes.captured || cdom.findImageFileInputInModal(cdom.findActiveModal(doc) || modal);
            }
          } finally {
            if (bridge && bridge.cleanup) {
              bridge.cleanup();
            }
          }
        }
      }

      if (!mainWorldHandled) {
        if (!fileInput) {
          await closeCoverModal(modal);
          return { ok: false, reason: "Input unggah gambar cover (input[type=file]) tidak ditemukan di modal." };
        }

        const attached = cdom.attachFileToInput(fileInput, coverFile, doc);
        if (!attached) {
          await closeCoverModal(modal);
          return { ok: false, reason: "Gagal melampirkan file cover ke input gambar." };
        }
      }

      addLog(`Cover "${coverFile.name}" diunggah untuk "${row.videoTitle}".`, "info");
      if (!(await smartSleep(Math.max(1000, config.stepDelayMs), token))) {
        return { ok: false, aborted: true };
      }

      // Advance modal steps (Berikutnya -> Berikutnya -> Simpan) up to 5 steps
      for (let step = 0; step < 5; step++) {
        const activeModal = cdom.findActiveModal(doc);
        if (!activeModal) break;

        const adv = await waitFor(() => {
          const cur = cdom.findActiveModal(doc);
          return cur ? cdom.findModalAdvanceButton(cur, doc) : null;
        }, 8000, 200, token);
        if (!adv) break;

        domBase.clickElement(adv.button);
        if (!(await smartSleep(Math.max(550, config.stepDelayMs), token))) return { ok: false, aborted: true };

        if (adv.kind === "save") {
          await waitFor(() => !cdom.findActiveModal(doc), 6000, 150, token);
          break;
        }
      }

      if (cdom.findActiveModal(doc)) {
        await closeCoverModal(modal);
        return { ok: false, reason: "Modal edit cover tidak tersimpan/tertutup." };
      }

      return { ok: true };
    }

    async function start(overrideConfig) {
      if (state.status === "running" || state.status === "paused") return;
      if (overrideConfig) setConfig(overrideConfig);

      const allRows = cdom.findComposerRows(doc);
      const targetRows = selectTargetRows(allRows);

      if (targetRows.length === 0) {
        state.status = "error";
        state.lastError = "Tidak ada baris video di halaman Bulk Upload Composer.";
        addLog(state.lastError, "error");
        return;
      }

      runToken += 1;
      const token = runToken;
      state.status = "running";
      state.processedCount = 0;
      state.failedCount = 0;
      state.totalTarget = targetRows.length;
      state.currentItem = "";
      state.lastError = "";

      const schedDates = config.enableSchedule ? computeScheduleDates(targetRows.length, config) : [];
      addLog(`Memulai pengisian otomatis untuk ${targetRows.length} video...`, "info");

      try {
        for (let i = 0; i < targetRows.length; i++) {
          if (isAborted(token) || !(await waitWhilePaused(token))) break;

          // Re-query row by domIndex to avoid stale React references
          let latestRows = cdom.findComposerRows(doc);
          let row = latestRows.find((r) => r.domIndex === targetRows[i].domIndex);
          if (!row && targetRows[i].rowEl && targetRows[i].rowEl.isConnected) {
            row = targetRows[i];
          }
          if (!row || !row.rowEl || !row.rowEl.isConnected) {
            state.status = "error";
            state.lastError = "Halaman Bulk Upload berubah atau gagal dimuat. Silakan refresh halaman.";
            addLog(state.lastError, "error");
            emit();
            return;
          }

          const cleanName = formatReadableTitle(row.videoTitle, config.cleanVideoUnderscores);
          const epNum = config.episodeMode === "filename"
            ? (extractEpisodeFromName(row.videoTitle) ?? (config.startEpisode + i * config.episodeStep))
            : (config.startEpisode + i * config.episodeStep);
          const targetDate = schedDates[i] || null;

          state.currentItem = `Baris ${i + 1}/${targetRows.length}: ${cleanName}`;
          emit();

          let rowHadError = false;

          // 1. Description
          if (config.enableDescription) {
            const descText = renderDescriptionTemplate(config.descriptionTemplate, {
              customTitle: config.customTitle,
              videoTitle: cleanName,
              episodeNum: epNum,
              rowNumber: i + 1,
              scheduledDate: targetDate
            });

            if (row.descriptionEl && row.descriptionEl.isConnected) {
              const focusedEl = typeof cdom.focusDescriptionField === "function"
                ? cdom.focusDescriptionField(row.descriptionEl, doc)
                : row.descriptionEl;
              if (!(await smartSleep(120, token))) break;

              if (typeof cdom.isMetaErrorPage === "function" && cdom.isMetaErrorPage(doc)) {
                state.status = "error";
                state.lastError = "Halaman Meta menampilkan layar error setelah fokus deskripsi.";
                addLog(state.lastError, "error");
                emit();
                return;
              }

              // Re-check descriptionEl in case React swapped placeholder on focus
              latestRows = cdom.findComposerRows(doc);
              const refreshedRow = latestRows.find((r) => r.domIndex === targetRows[i].domIndex);
              const descTarget = (refreshedRow && refreshedRow.descriptionEl && refreshedRow.descriptionEl.isConnected)
                ? refreshedRow.descriptionEl
                : ((focusedEl && focusedEl.isConnected) ? focusedEl : row.descriptionEl);

              const okDesc = cdom.setNativeInputValue(descTarget, descText, doc);
              if (okDesc) {
                addLog(`[#${i + 1}] Deskripsi diisi: "${descText.slice(0, 45)}${descText.length > 45 ? "..." : ""}"`, "info");
              } else {
                rowHadError = true;
                addLog(`[#${i + 1}] Gagal mengisi kolom deskripsi (elemen tidak aktif/terlepas).`, "warn");
              }
            } else {
              rowHadError = true;
              addLog(`[#${i + 1}] Kolom deskripsi tidak ditemukan.`, "warn");
            }
            if (!(await smartSleep(config.stepDelayMs, token))) break;
          }

          if (typeof cdom.isMetaErrorPage === "function" && cdom.isMetaErrorPage(doc)) {
            state.status = "error";
            state.lastError = "Halaman Meta menampilkan layar error. Proses dihentikan.";
            addLog(state.lastError, "error");
            emit();
            return;
          }

          // Refresh row references after description update in case React re-rendered the row
          latestRows = cdom.findComposerRows(doc);
          row = latestRows.find((r) => r.domIndex === targetRows[i].domIndex) || row;
          if (!row || !row.rowEl || !row.rowEl.isConnected) {
            state.status = "error";
            state.lastError = "Halaman Bulk Upload berubah setelah mengisi deskripsi. Silakan refresh halaman.";
            addLog(state.lastError, "error");
            emit();
            return;
          }

          // 2. Schedule
          if (config.enableSchedule && targetDate) {
            const sRes = await applyScheduleForRow(row, targetDate, token);
            if (sRes.aborted) break;
            if (sRes.ok) {
              const iso = targetDate.toISOString();
              state.lastScheduledIso = iso;
              config.lastScheduledIso = iso;
              onSaveLastSchedule(iso);
              addLog(
                `[#${i + 1}] Dijadwalkan: ${pad2(targetDate.getDate())}/${pad2(targetDate.getMonth() + 1)}/${targetDate.getFullYear()} ${pad2(targetDate.getHours())}:${pad2(targetDate.getMinutes())}`,
                "success"
              );
            } else {
              rowHadError = true;
              addLog(`[#${i + 1}] Gagal atur jadwal: ${sRes.reason}`, "warn");
            }
            if (!(await smartSleep(config.stepDelayMs, token))) break;
          }

          // Refresh row references again before opening More edit modal
          latestRows = cdom.findComposerRows(doc);
          row = latestRows.find((r) => r.domIndex === targetRows[i].domIndex) || row;

          // 3. Cover Image (optional)
          if (config.enableCover) {
            const coverFile = pickCoverFile(coverFiles, row, i, config);
            if (!coverFile) {
              addLog(`[#${i + 1}] Tidak ada gambar cover yang cocok, dilewati.`, "warn");
            } else {
              const cRes = await applyCoverForRow(row, coverFile, token);
              if (cRes.aborted) break;
              if (!cRes.ok) {
                rowHadError = true;
                addLog(`[#${i + 1}] Gagal unggah cover: ${cRes.reason}`, "warn");
              }
            }
          }

          if (rowHadError) {
            state.failedCount += 1;
          } else {
            state.processedCount += 1;
          }
          emit();

          if (i < targetRows.length - 1) {
            if (!(await smartSleep(config.delayMs, token))) break;
          }
        }

        if (!isAborted(token)) {
          state.status = "completed";
          state.currentItem = "";
          addLog(`Selesai! ${state.processedCount} video berhasil diproses (${state.failedCount} catatan gagal).`, "success");
          emit();
        }
      } catch (err) {
        if (!isAborted(token)) {
          state.status = "error";
          state.lastError = err && err.message ? err.message : String(err);
          addLog("Terjadi error: " + state.lastError, "error");
          emit();
          return;
        }
      }

      if (token === runToken && state.status === "stopping") {
        state.status = "idle";
        state.currentItem = "";
        addLog("Proses pengisian dihentikan oleh pengguna.", "warn");
        emit();
      }
    }

    function pause() {
      if (state.status === "running") {
        state.status = "paused";
        addLog("Proses dijeda.", "warn");
      }
    }

    function resume() {
      if (state.status === "paused") {
        state.status = "running";
        addLog("Proses dilanjutkan.", "info");
      }
    }

    function stop() {
      if (state.status === "running" || state.status === "paused") {
        state.status = "stopping";
        runToken += 1;
        state.status = "idle";
        state.currentItem = "";
        addLog("Proses dihentikan oleh pengguna.", "warn");
      }
    }

    return {
      start,
      pause,
      resume,
      stop,
      setConfig,
      setCoverFiles,
      previewPlan,
      getSnapshot,
      addLog
    };
  }

  const api = {
    DEFAULT_COMPOSER_CONFIG,
    extractEpisodeFromName,
    formatReadableTitle,
    renderDescriptionTemplate,
    computeScheduleDates,
    pickCoverFile,
    createComposerEngine
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MetaComposerEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
