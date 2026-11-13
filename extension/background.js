/* MyMag extension — background script (Chrome service worker / Firefox event page).

   Three ways to open MyMag on the text you selected:
     - keyboard shortcut (Ctrl+M by default)
     - right-click -> "Read with MyMag"
     - the toolbar button

   MyMag opens as a full-window overlay on top of the page. Esc or the red
   button closes it and you are back on the page, selection intact.
   Where a page does not allow an overlay (browser PDF viewers, browser
   internal pages) MyMag opens in a new tab next to it instead. */

const api = typeof browser !== "undefined" ? browser : chrome;
const MENU_ID = "mymag-read-selection";
const PENDING_KEY = "mymagPendingText";
const CLIPBOARD_KEY = "mymagPendingClipboard";

/* ---------- functions that run INSIDE the web page ---------- */

// Selected text of the page (or of a focused text field), and whether the
// page is a PDF shown by the browser.
function grabSelection() {
  let t = "";
  try { t = String(window.getSelection ? window.getSelection() : ""); } catch (e) {}
  if (!t) {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
      try { t = el.value.substring(el.selectionStart, el.selectionEnd); } catch (e) {}
    }
  }
  let pdf = false;
  try {
    pdf =
      document.contentType === "application/pdf" ||
      !!document.querySelector('embed[type="application/pdf"], embed[type="application/x-google-chrome-pdf"]');
  } catch (e) {}
  return { text: t, pdf };
}

// Chrome's built-in PDF viewer: ask the viewer for its selected text.
function grabPdfSelection() {
  return new Promise((resolve) => {
    const embed = document.querySelector(
      'embed[type="application/pdf"], embed[type="application/x-google-chrome-pdf"]'
    );
    if (!embed && !window.frames.length) return resolve("");
    let finished = false;
    const done = (v) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("message", onMsg);
      resolve(v);
    };
    const onMsg = (e) => {
      if (e.data && e.data.type === "getSelectedTextReply") done(e.data.selectedText || "");
    };
    window.addEventListener("message", onMsg);
    // Older viewer: the <embed> itself accepts the request.
    // Newer viewer: it lives in a child frame.
    try { if (embed && typeof embed.postMessage === "function") embed.postMessage({ type: "getSelectedText" }, "*"); } catch (e) {}
    for (let i = 0; i < window.frames.length; i++) {
      try { window.frames[i].postMessage({ type: "getSelectedText" }, "*"); } catch (e) {}
    }
    setTimeout(() => done(""), 600);
  });
}

// Full-window overlay holding the MyMag app.
function showOverlay(src) {
  try {
    const ID = "mymag-extension-overlay";
    const old = document.getElementById(ID);
    if (old) { if (old.__mymagClose) old.__mymagClose(); else old.remove(); }

    const root = document.documentElement;
    const frame = document.createElement("iframe");
    frame.id = ID;
    frame.title = "MyMag";
    frame.src = src;
    frame.setAttribute("allow", "clipboard-read; clipboard-write");
    frame.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;border:0;margin:0;padding:0;" +
      "z-index:2147483647;background:#e5e7eb;color-scheme:light;display:block;";

    const prevOverflow = root.style.overflow;
    const prevFocus = document.activeElement;
    const close = () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("keydown", onKey, true);
      frame.remove();
      root.style.overflow = prevOverflow;
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
    };
    const onMsg = (e) => {
      if (e.source === frame.contentWindow && e.data && e.data.type === "mymag-close") close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); }
    };
    frame.__mymagClose = close;
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey, true);
    root.style.overflow = "hidden"; // the page behind must not scroll
    (document.body || root).appendChild(frame);
    frame.addEventListener("load", () => {
      try { frame.contentWindow.focus(); } catch (e) {}
    });
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- background logic ---------- */

// Reads the page: { text, readable (could we look inside the page?), pdf }.
async function readPage(tabId) {
  let results = null;
  try {
    results = await api.scripting.executeScript({ target: { tabId, allFrames: true }, func: grabSelection });
  } catch (e) {
    try {
      results = await api.scripting.executeScript({ target: { tabId }, func: grabSelection });
    } catch (e2) {}
  }
  const infos = (results || []).map((r) => r && r.result).filter(Boolean);
  const hit = infos.find((i) => typeof i.text === "string" && i.text.trim());
  let text = hit ? hit.text : "";
  const pdf = infos.some((i) => i.pdf);

  if (!text && results) {
    try {
      const r = await api.scripting.executeScript({ target: { tabId }, world: "MAIN", func: grabPdfSelection });
      const t = r && r[0] && r[0].result;
      if (typeof t === "string" && t.trim()) text = t;
    } catch (e) {}
  }
  return { text, readable: !!results, pdf };
}

async function openMyMag(tab, hintText) {
  const hasTab = tab && typeof tab.id === "number" && tab.id >= 0;
  const page = hasTab ? await readPage(tab.id) : { text: "", readable: false, pdf: false };
  let text = page.text;
  // The right-click menu (and the Firefox Ctrl+M listener) also report the
  // selection — used when the page itself could not be read.
  if (!text.trim()) text = hintText || "";

  // Browser PDF viewers do not let an extension read the selection on a
  // keyboard shortcut. Last resort there: use what was copied (Ctrl+C).
  const looksPdf = page.pdf || !page.readable || /\.pdf([?#]|$)/i.test((tab && tab.url) || "");
  const useClipboard = !text.trim() && looksPdf;

  await api.storage.local.set({ [PENDING_KEY]: text, [CLIPBOARD_KEY]: useClipboard });
  const url = api.runtime.getURL("index.html");

  try {
    if (!hasTab) throw new Error("no tab");
    const res = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: showOverlay,
      args: [url + "?mode=overlay"],
    });
    if (!res || !res[0] || res[0].result !== true) throw new Error("overlay refused");
  } catch (e) {
    const opts = { url: url + "?mode=tab" };
    if (hasTab) { opts.index = tab.index + 1; opts.openerTabId = tab.id; }
    await api.tabs.create(opts);
  }
}

async function activeTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0];
}

api.runtime.onInstalled.addListener(() => {
  Promise.resolve(api.contextMenus.removeAll()).then(() => {
    api.contextMenus.create({ id: MENU_ID, title: "Read with MyMag", contexts: ["selection"] });
  });
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) openMyMag(tab, info.selectionText || "");
});

api.commands.onCommand.addListener(async (command, tab) => {
  if (command === "open-mymag") openMyMag(tab || (await activeTab()), "");
});

// Toolbar button ("action" in Chrome, "browserAction" in Firefox).
(api.action || api.browserAction).onClicked.addListener((tab) => {
  openMyMag(tab, "");
});

// Firefox: Ctrl+M is caught inside the page (shortcut.firefox.js) and sent here.
api.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "mymag-open" && sender && sender.tab) {
    openMyMag(sender.tab, typeof msg.text === "string" ? msg.text : "");
  }
});
