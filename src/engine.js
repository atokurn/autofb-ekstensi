(function (root) {
  "use strict";

  const DEFAULT_CONFIG = {
    mode: "bulk", // "bulk" | "single"
    singleMethod: "auto", // "auto" | "menu" | "checkbox"
    bulkBatchSize: 0, // 0 = Select All (master checkbox), >0 = check top N rows
    delayMs: 2500, // Delay between iterations/deletions
    stepDelayMs: 450, // Short delay between UI clicks (checkbox -> Hapus -> confirm)
    maxCount: 0, // 0 = unlimited; in single mode = max items, in bulk mode = max items (or batches)
    skipOnError: true,
    customDeleteKeywords: ""
  };

  function createEngine(deps) {
    const doc = (deps && deps.document) || (typeof document !== "undefined" ? document : null);
    const dom = (deps && deps.dom) || root.MetaDeleterDOM;
    const onUpdate = (deps && deps.onUpdate) || function () {};
    const sleepImpl = (deps && deps.sleep) || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const nowImpl = (deps && deps.now) || (() => Date.now());
    const emptyWaitMs = (deps && typeof deps.emptyWaitMs === "number") ? deps.emptyWaitMs : 8500;

    let config = Object.assign({}, DEFAULT_CONFIG);
    let state = {
      status: "idle", // "idle" | "running" | "paused" | "stopping" | "completed" | "error"
      mode: config.mode,
      deletedCount: 0,
      batchCount: 0,
      skippedCount: 0,
      failedCount: 0,
      currentItem: "",
      lastError: "",
      logs: []
    };

    let runToken = 0;

    function nowTime() {
      const d = new Date();
      return d.toTimeString().slice(0, 8);
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

    function getSnapshot() {
      return {
        status: state.status,
        mode: state.mode,
        deletedCount: state.deletedCount,
        batchCount: state.batchCount,
        skippedCount: state.skippedCount,
        failedCount: state.failedCount,
        currentItem: state.currentItem,
        lastError: state.lastError,
        logs: state.logs.slice(),
        config: Object.assign({}, config)
      };
    }

    function emit() {
      try {
        onUpdate(getSnapshot());
      } catch (_err) {
        // ignore listener errors
      }
    }

    function setConfig(partial) {
      config = Object.assign({}, config, partial || {});
      config.delayMs = Math.max(300, Number(config.delayMs) || 2500);
      config.stepDelayMs = Math.max(150, Number(config.stepDelayMs) || 450);
      config.maxCount = Math.max(0, Math.floor(Number(config.maxCount) || 0));
      config.bulkBatchSize = Math.max(0, Math.floor(Number(config.bulkBatchSize) || 0));
      state.mode = config.mode;
      emit();
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

    function getCustomKeywords() {
      return dom.parseCustomKeywords(config.customDeleteKeywords);
    }

    async function handleConfirmationDialog(token, customKws) {
      const dialog = await waitFor(() => dom.findTopDialog(doc), 5000, 150, token);
      if (!dialog) {
        return { ok: false, reason: "Dialog konfirmasi hapus tidak muncul." };
      }

      if (!(await smartSleep(Math.min(350, config.stepDelayMs), token))) {
        return { ok: false, aborted: true };
      }

      const confirmBtn = await waitFor(
        () => dom.findConfirmDeleteButton(dom.findTopDialog(doc), doc, customKws),
        3000,
        150,
        token
      );

      if (!confirmBtn) {
        // Check if it's an info/error dialog instead
        const dismissBtn = dom.findDialogDismissButton(dialog, doc);
        if (dismissBtn) {
          dom.clickElement(dismissBtn);
        }
        return { ok: false, reason: "Tombol konfirmasi hapus di dalam dialog tidak ditemukan." };
      }

      dom.clickElement(confirmBtn);
      addLog("Konfirmasi hapus diklik, menunggu proses...", "info");

      // Wait for dialog to close
      const closed = await waitFor(() => {
        const d = dom.findTopDialog(doc);
        if (!d) return true;
        // Check if dialog turned into an error/notice with only OK/Tutup
        const hasConfirm = dom.findConfirmDeleteButton(d, doc, customKws);
        const dismiss = dom.findDialogDismissButton(d, doc);
        if (!hasConfirm && dismiss) {
          return { unexpectedDialog: d, dismissBtn: dismiss };
        }
        return false;
      }, 15000, 200, token);

      if (closed && typeof closed === "object" && closed.unexpectedDialog) {
        const msg = dom.normalizeText(closed.unexpectedDialog.textContent || "").slice(0, 120);
        dom.clickElement(closed.dismissBtn);
        return { ok: false, reason: "Dialog pesan dari Meta: " + msg };
      }

      if (!closed) {
        return { ok: false, reason: "Dialog konfirmasi tidak kunjung tertutup (timeout)." };
      }

      return { ok: true };
    }

    function countRemovedSignatures(beforeSigs, afterSigs) {
      // Handle duplicate titles/signatures accurately via multiset counts
      const afterCounts = new Map();
      for (const s of afterSigs) {
        afterCounts.set(s, (afterCounts.get(s) || 0) + 1);
      }
      let remainingFromBefore = 0;
      for (const s of beforeSigs) {
        const c = afterCounts.get(s) || 0;
        if (c > 0) {
          remainingFromBefore++;
          afterCounts.set(s, c - 1);
        }
      }
      return Math.max(0, beforeSigs.length - remainingFromBefore);
    }

    async function clearAnyCheckedRows(token) {
      const ctx = dom.findContentContext(doc);
      if (ctx.masterCheckbox) {
        const mState = dom.getCheckboxState(ctx.masterCheckbox.control);
        if (mState === "true") {
          dom.clickElement(ctx.masterCheckbox.clickTarget);
          await smartSleep(config.stepDelayMs, token);
        }
      }
      const refreshed = dom.findContentContext(doc);
      for (const row of refreshed.rows) {
        if (dom.getCheckboxState(row.checkbox) === "true") {
          dom.clickElement(row.clickTarget);
          await smartSleep(120, token);
        }
      }
    }

    async function waitForAvailableContext(token, minRowsRequired) {
      let ctx = dom.findContentContext(doc);
      if (ctx.rows.length >= minRowsRequired) {
        return ctx;
      }

      const start = nowImpl();
      let loggedWait = false;
      let nudged = false;

      while (nowImpl() - start < emptyWaitMs) {
        if (!(await waitWhilePaused(token))) return null;
        const elapsed = nowImpl() - start;

        if (!loggedWait && elapsed >= 1200) {
          loggedWait = true;
          addLog("Menunggu daftar konten selesai dimuat...", "info");
        }
        if (!nudged && elapsed >= 3000 && typeof dom.nudgeScrollToLoadMore === "function") {
          nudged = true;
          dom.nudgeScrollToLoadMore(doc);
        }

        await sleepImpl(250);
        if (isAborted(token)) return null;

        ctx = dom.findContentContext(doc);
        if (ctx.rows.length >= minRowsRequired) {
          return ctx;
        }
      }

      return ctx;
    }

    async function runBulkIteration(token, customKws) {
      const ctx = await waitForAvailableContext(token, 1);
      if (!ctx) return { aborted: true };
      if (ctx.rows.length === 0) {
        return { done: true, reason: "Tidak ada konten yang tersisa." };
      }

      const remainingQuota = config.maxCount > 0 ? Math.max(0, config.maxCount - state.deletedCount) : Infinity;
      const useSelectAll = config.bulkBatchSize === 0 && Boolean(ctx.masterCheckbox) && remainingQuota >= ctx.rows.length;
      let targetRows = ctx.rows;

      if (useSelectAll) {
        state.currentItem = `Memilih semua (${ctx.rows.length} baris terlihat)`;
        emit();
        const mState = dom.getCheckboxState(ctx.masterCheckbox.control);
        if (mState === "false") {
          dom.clickElement(ctx.masterCheckbox.clickTarget);
          if (!(await smartSleep(config.stepDelayMs, token))) return { aborted: true };
        } else if (mState === "mixed") {
          dom.clickElement(ctx.masterCheckbox.clickTarget);
          if (!(await smartSleep(config.stepDelayMs, token))) return { aborted: true };
          if (dom.getCheckboxState(ctx.masterCheckbox.control) === "false") {
            dom.clickElement(ctx.masterCheckbox.clickTarget);
            if (!(await smartSleep(config.stepDelayMs, token))) return { aborted: true };
          }
        }
        addLog(`Pilih semua konten (${ctx.rows.length} item terlihat).`, "info");
      } else {
        // Select top N rows (respecting bulkBatchSize and remainingQuota)
        await clearAnyCheckedRows(token);
        const refreshed = dom.findContentContext(doc);
        const rawLimit = config.bulkBatchSize > 0
          ? Math.min(config.bulkBatchSize, refreshed.rows.length)
          : refreshed.rows.length;
        const limit = Math.min(rawLimit, remainingQuota);
        targetRows = refreshed.rows.slice(0, limit);
        state.currentItem = `Memilih ${targetRows.length} konten teratas`;
        emit();
        for (const row of targetRows) {
          if (!(await waitWhilePaused(token))) return { aborted: true };
          if (dom.getCheckboxState(row.checkbox) !== "true") {
            dom.clickElement(row.clickTarget);
            if (!(await smartSleep(120, token))) return { aborted: true };
          }
        }
        addLog(`Memilih ${targetRows.length} item teratas untuk bulk delete.`, "info");
      }

      const beforeCtx = dom.findContentContext(doc);
      const checkedRows = beforeCtx.rows.filter((r) => dom.getCheckboxState(r.checkbox) === "true");
      const trackedRows = checkedRows.length > 0 ? checkedRows : targetRows;
      const beforeSigs = trackedRows.map((r) => r.signature);

      const bulkBtn = await waitFor(
        () => dom.findBulkDeleteButton(doc, customKws),
        4000,
        150,
        token
      );
      if (!bulkBtn) {
        return {
          ok: false,
          reason: "Tombol bulk 'Hapus' / 'Delete' tidak ditemukan atau tidak aktif setelah memilih konten."
        };
      }

      dom.clickElement(bulkBtn);
      addLog("Tombol bulk Hapus diklik.", "info");

      const confirmRes = await handleConfirmationDialog(token, customKws);
      if (confirmRes.aborted) return { aborted: true };
      if (!confirmRes.ok) return { ok: false, reason: confirmRes.reason };

      // Wait for rows to be removed from DOM
      const removed = await waitFor(() => {
        const afterCtx = dom.findContentContext(doc);
        const afterSigs = afterCtx.rows.map((r) => r.signature);
        const diff = countRemovedSignatures(beforeSigs, afterSigs);
        return diff > 0 ? diff : 0;
      }, 10000, 250, token);

      if (!removed) {
        return {
          ok: false,
          reason: "Tidak ada konten yang terhapus setelah konfirmasi (coba gunakan mode 1 per 1)."
        };
      }

      state.batchCount += 1;
      state.deletedCount += removed;
      addLog(`Bulk batch #${state.batchCount} selesai: ${removed} konten terhapus.`, "success");
      emit();
      return { ok: true, removed };
    }

    function dismissOpenMenus(moreBtn) {
      try {
        if (doc && typeof KeyboardEvent === "function") {
          const evt = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
          doc.dispatchEvent(evt);
          if (doc.body) doc.body.dispatchEvent(evt);
        }
      } catch (_err) {
        // ignore
      }
      if (typeof dom.findOpenMenus === "function" && dom.findOpenMenus(doc).length > 0 && moreBtn) {
        dom.clickElement(moreBtn);
      }
    }

    async function deleteSingleViaMenu(row, customKws, token) {
      const moreBtn = dom.findRowMoreButton(row.rowEl, doc);
      if (!moreBtn) {
        return { ok: false, reason: "Tombol menu (...) pada baris tidak ditemukan." };
      }

      dom.clickElement(moreBtn);
      // Wait for menu container to open first, then look for delete item briefly
      if (typeof dom.findOpenMenus === "function") {
        await waitFor(() => dom.findOpenMenus(doc).length > 0, 1500, 100, token);
      }
      const menuItem = await waitFor(() => dom.findDeleteMenuItem(doc, customKws), 600, 100, token);
      if (!menuItem) {
        dismissOpenMenus(moreBtn);
        await smartSleep(180, token);
        return { ok: false, reason: "Opsi 'Hapus' di menu (...) tidak ditemukan." };
      }

      dom.clickElement(menuItem);
      addLog(`Klik menu Hapus untuk "${row.title}".`, "info");
      return await handleConfirmationDialog(token, customKws);
    }

    async function deleteSingleViaCheckbox(row, customKws, token) {
      await clearAnyCheckedRows(token);
      if (!(await waitWhilePaused(token))) return { aborted: true };

      if (dom.getCheckboxState(row.checkbox) !== "true") {
        dom.clickElement(row.clickTarget);
        if (!(await smartSleep(config.stepDelayMs, token))) return { aborted: true };
      }

      const bulkBtn = await waitFor(() => dom.findBulkDeleteButton(doc, customKws), 4000, 150, token);
      if (!bulkBtn) {
        return { ok: false, reason: "Tombol 'Hapus' di toolbar tidak muncul untuk baris ini." };
      }

      dom.clickElement(bulkBtn);
      addLog(`Klik tombol Hapus (checkbox) untuk "${row.title}".`, "info");
      return await handleConfirmationDialog(token, customKws);
    }

    async function runSingleIteration(token, customKws, skipOffset, autoHint) {
      const ctx = await waitForAvailableContext(token, 1);
      if (!ctx) return { aborted: true };
      if (ctx.rows.length === 0) {
        return { done: true, reason: "Tidak ada konten yang tersisa." };
      }
      if (skipOffset >= ctx.rows.length) {
        // Wait briefly in case more rows are lazy-loading below skipped rows
        const extraCtx = await waitForAvailableContext(token, skipOffset + 1);
        if (!extraCtx) return { aborted: true };
        if (skipOffset >= extraCtx.rows.length) {
          return { done: true, reason: "Semua konten yang dapat dihapus sudah diproses." };
        }
        ctx.rows = extraCtx.rows;
      }

      const targetRow = ctx.rows[skipOffset];
      const beforeSigs = ctx.rows.map((r) => r.signature);
      const targetBeforeSig = targetRow.signature;

      state.currentItem = `#${skipOffset + 1}: ${targetRow.title}`;
      emit();

      let res;
      if (config.singleMethod === "menu") {
        res = await deleteSingleViaMenu(targetRow, customKws, token);
      } else if (config.singleMethod === "checkbox") {
        res = await deleteSingleViaCheckbox(targetRow, customKws, token);
      } else if (autoHint && autoHint.preferCheckbox) {
        res = await deleteSingleViaCheckbox(targetRow, customKws, token);
        if (!res.ok && !res.aborted) {
          res = await deleteSingleViaMenu(targetRow, customKws, token);
        }
      } else {
        // "auto": try menu (...) first, fallback to checkbox
        res = await deleteSingleViaMenu(targetRow, customKws, token);
        if (!res.ok && !res.aborted) {
          addLog(`Menu (...) tidak tersedia (${res.reason}), mencoba via checkbox...`, "warn");
          res = await deleteSingleViaCheckbox(targetRow, customKws, token);
          if (res.ok && autoHint) {
            autoHint.menuMisses += 1;
            if (autoHint.menuMisses >= 2 && !autoHint.preferCheckbox) {
              autoHint.preferCheckbox = true;
              addLog("Beralih otomatis ke mode checkbox langsung agar lebih cepat & stabil.", "info");
            }
          }
        } else if (res.ok && autoHint) {
          autoHint.menuMisses = 0;
        }
      }

      if (res.aborted) return { aborted: true };
      if (!res.ok) return { ok: false, reason: res.reason, title: targetRow.title };

      // Verify top/target row disappeared (avoid false positive on transient empty skeleton if >1 rows existed)
      let emptySeenAt = 0;
      const confirmedRemoved = await waitFor(() => {
        const afterCtx = dom.findContentContext(doc);
        if (afterCtx.rows.length === 0) {
          if (beforeSigs.length <= 1) return true;
          if (!emptySeenAt) emptySeenAt = nowImpl();
          return nowImpl() - emptySeenAt >= 1500;
        }
        emptySeenAt = 0;
        if (afterCtx.rows.length < beforeSigs.length) return true;
        const rowNow = afterCtx.rows[skipOffset];
        if (!rowNow || rowNow.signature !== targetBeforeSig) return true;
        return false;
      }, 9000, 200, token);

      if (!confirmedRemoved) {
        return {
          ok: false,
          reason: `Konten "${targetRow.title}" masih ada di daftar setelah konfirmasi.`,
          title: targetRow.title
        };
      }

      state.deletedCount += 1;
      addLog(`Terhapus (${state.deletedCount}): "${targetRow.title}"`, "success");
      emit();
      return { ok: true };
    }

    async function start(overrideConfig) {
      if (state.status === "running" || state.status === "paused") {
        return;
      }
      if (overrideConfig) {
        setConfig(overrideConfig);
      }

      runToken += 1;
      const token = runToken;
      state.status = "running";
      state.deletedCount = 0;
      state.batchCount = 0;
      state.skippedCount = 0;
      state.failedCount = 0;
      state.currentItem = "";
      state.lastError = "";
      state.mode = config.mode;
      addLog(
        config.mode === "bulk"
          ? "Memulai penghapusan otomatis (Mode: Bulk Delete)..."
          : "Memulai penghapusan otomatis (Mode: 1 per 1 dari teratas)...",
        "info"
      );

      const customKws = getCustomKeywords();
      let skipOffset = 0;
      const autoHint = { menuMisses: 0, preferCheckbox: false };

      try {
        while (!isAborted(token)) {
          if (!(await waitWhilePaused(token))) break;

          if (config.maxCount > 0 && state.deletedCount >= config.maxCount) {
            state.status = "completed";
            state.currentItem = "";
            addLog(`Target maksimal tercapai (${state.deletedCount} konten terhapus).`, "success");
            emit();
            return;
          }

          if (config.mode === "bulk") {
            const res = await runBulkIteration(token, customKws);
            if (res.aborted || isAborted(token)) break;
            if (res.done) {
              state.status = "completed";
              state.currentItem = "";
              addLog(res.reason, "success");
              emit();
              return;
            }
            if (!res.ok) {
              state.failedCount += 1;
              state.lastError = res.reason;
              state.status = "error";
              addLog(res.reason, "error");
              emit();
              return;
            }
          } else {
            const res = await runSingleIteration(token, customKws, skipOffset, autoHint);
            if (res.aborted || isAborted(token)) break;
            if (res.done) {
              state.status = "completed";
              state.currentItem = "";
              addLog(res.reason, "success");
              emit();
              return;
            }
            if (!res.ok) {
              state.failedCount += 1;
              if (config.skipOnError) {
                state.skippedCount += 1;
                skipOffset += 1;
                addLog(`Dilewati (#${skipOffset}): ${res.reason}`, "warn");
                emit();
              } else {
                state.lastError = res.reason;
                state.status = "error";
                addLog(res.reason, "error");
                emit();
                return;
              }
            }
          }

          if (config.maxCount > 0 && state.deletedCount >= config.maxCount) {
            state.status = "completed";
            state.currentItem = "";
            addLog(`Target maksimal tercapai (${state.deletedCount} konten terhapus).`, "success");
            emit();
            return;
          }

          // Cooldown delay before next deletion
          if (!(await smartSleep(config.delayMs, token))) break;
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
        addLog("Proses dihentikan oleh pengguna.", "warn");
        emit();
      }
    }

    function pause() {
      if (state.status === "running") {
        state.status = "paused";
        addLog("Proses dijeda.", "warn");
        emit();
      }
    }

    function resume() {
      if (state.status === "paused") {
        state.status = "running";
        addLog("Proses dilanjutkan.", "info");
        emit();
      }
    }

    function stop() {
      if (state.status === "running" || state.status === "paused") {
        state.status = "stopping";
        runToken += 1;
        state.status = "idle";
        state.currentItem = "";
        addLog("Proses dihentikan oleh pengguna.", "warn");
        emit();
      }
    }

    return {
      start,
      pause,
      resume,
      stop,
      setConfig,
      getSnapshot,
      addLog
    };
  }

  const api = {
    DEFAULT_CONFIG,
    createEngine
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MetaDeleterEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
