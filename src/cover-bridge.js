(function () {
  "use strict";

  if (window.__META_AUTO_COVER_BRIDGE__) return;
  window.__META_AUTO_COVER_BRIDGE__ = true;

  const REQ_SOURCE = "meta-auto-cover-req";
  const RESP_SOURCE = "meta-auto-cover-res";

  let pendingCover = null;

  const origClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (
      pendingCover &&
      Date.now() < pendingCover.expiresAt &&
      this &&
      this.type === "file"
    ) {
      const payload = pendingCover;
      pendingCover = null;
      try {
        const dt = new DataTransfer();
        const u8 = payload.bytes instanceof Uint8Array
          ? payload.bytes
          : new Uint8Array(payload.bytes || []);
        const file = new File([u8], payload.name || "cover.jpg", {
          type: payload.type || "image/jpeg"
        });
        dt.items.add(file);
        this.files = dt.files;
        this.dispatchEvent(new Event("input", { bubbles: true }));
        this.dispatchEvent(new Event("change", { bubbles: true }));
        window.postMessage({
          source: RESP_SOURCE,
          requestId: payload.requestId,
          ok: true
        }, "*");
        return;
      } catch (err) {
        window.postMessage({
          source: RESP_SOURCE,
          requestId: payload.requestId,
          ok: false,
          error: err && err.message ? err.message : String(err)
        }, "*");
        return;
      }
    }
    return origClick.apply(this, arguments);
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== REQ_SOURCE) {
      return;
    }
    const msg = event.data;
    if (msg.action === "ARM_COVER_UPLOAD") {
      pendingCover = {
        requestId: msg.requestId,
        name: msg.name || "cover.jpg",
        type: msg.type || "image/jpeg",
        bytes: msg.bytes || new Uint8Array(0),
        expiresAt: Date.now() + 8000
      };
      window.postMessage({
        source: RESP_SOURCE,
        requestId: msg.requestId,
        armed: true
      }, "*");
    } else if (msg.action === "DISARM_COVER_UPLOAD") {
      if (pendingCover && (!msg.requestId || pendingCover.requestId === msg.requestId)) {
        pendingCover = null;
      }
    }
  });
})();
