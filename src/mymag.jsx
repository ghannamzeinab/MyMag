import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import "./mymag.css";
import SettingsPanel from "./SettingsPanel";

import katex from "katex";
import "katex/dist/katex.min.css";

const STORAGE_KEY = "mymagSettings";

/* ---------- Browser-extension mode ----------
   Only active when the app runs inside the MyMag extension; on the website
   extApi is null and nothing below changes.
   mode=overlay : shown in a full-window overlay on top of a web page
   mode=tab     : shown in its own tab (pages that do not allow an overlay) */
const extApi =
  typeof window !== "undefined" && window.chrome && window.chrome.runtime && window.chrome.runtime.id
    ? window.chrome
    : null;
const extMode = extApi ? new URLSearchParams(window.location.search).get("mode") : null;
const PENDING_KEY = "mymagPendingText"; // selected text handed over by the extension
const CLIPBOARD_KEY = "mymagPendingClipboard"; // true: no selection readable, use copied text
const closeExtension = () => {
  try {
    if (extMode === "overlay") {
      window.parent.postMessage({ type: "mymag-close" }, "*");
    } else if (extMode === "tab") {
      extApi.tabs.getCurrent((t) => { if (t) extApi.tabs.remove(t.id); });
    }
  } catch {}
};
const LONG_THRESHOLD = 16;
const TWO_WORD_WRAP_THRESHOLD = 140;

/* Auto-scroll speed is a READING speed in words per minute. The pixel speed
   is derived from how much screen height the words actually occupy, so it
   adapts to font size, word/letter spacing and window width automatically. */
export const WPM_MIN = 10;
export const WPM_MAX = 300;
const clampWpm = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 80;
  return Math.max(WPM_MIN, Math.min(WPM_MAX, Math.round(n)));
};
const countWords = (s) => (s || "").trim().split(/\s+/).filter(Boolean).length;

const DEFAULTS = {
  autoWpm: 80,
  fontSize: 48,
  wordSpacing: 25,
  fontWeight: 700,
  showAsRTL: false,
  darkMode: false,
  bodyBgColor: "#e5e7eb",
  btnBgLeft: "#ffffff",
  btnBgRight: "#ffffff",
  showFloatingButtons: true,
  showBorder: true,
  showTextArea: true,
  showShadow: true,
  currentLineIntensity: 35,
  letterColors: {
    m: "#0057E9", M: "#0057E9",
    n: "#699953", N: "#699953",
    r: "#de7c00", Q: "#E11845",
    l: "#FF00BD", w: "#E11845", W: "#E11845",
  },
};

/* ---------- Color/contrast helpers ---------- */
const hexToRgb = (hex) => {
  let h = (hex || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const x = parseInt(h, 16);
  return { r: (x >> 16) & 255, g: (x >> 8) & 255, b: x & 255 };
};
const srgbToLin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const relLuminance = ({ r, g, b }) =>
  0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
const contrastRatio = (hex1, hex2) => {
  const L1 = relLuminance(hexToRgb(hex1));
  const L2 = relLuminance(hexToRgb(hex2));
  const [a, b] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (a + 0.05) / (b + 0.05);
};
const iconOn = (btnBgHex) => {
  const black = "#000000";
  const white = "#ffffff";
  return contrastRatio(black, btnBgHex) >= contrastRatio(white, btnBgHex)
    ? black
    : white;
};
const normalizeBtnBg = (btnBgHex, pageBgHex, darkMode) => {
  try {
    if (contrastRatio(btnBgHex, pageBgHex) >= 1.6) return btnBgHex;
  } catch {}
  return darkMode ? "#374151" : "#e5e7eb";
};
const borderForBg = (pageBgHex) => {
  const black = "#000000";
  const white = "#ffffff";
  return contrastRatio(black, pageBgHex) >= 3 ? black : white;
};

/* ---------- split helpers (unchanged from previous version) ---------- */
const urlToLines = (url) => {
  const lines = [];
  let s = url.trim();
  const schemeMatch = s.match(/^(https?:\/\/)/i);
  if (schemeMatch) {
    lines.push(schemeMatch[1]);
    s = s.slice(schemeMatch[1].length);
  }
  const firstSlash = s.indexOf("/");
  const host = firstSlash === -1 ? s : s.slice(0, firstSlash);
  const path = firstSlash === -1 ? "" : s.slice(firstSlash + 1);

  if (/^www\./i.test(host)) {
    lines.push("www.");
    const restHost = host.slice(4);
    if (restHost) lines.push(path ? `${restHost}/` : restHost);
  } else if (host) {
    lines.push(path ? `${host}/` : host);
  }

  if (!path) return lines;

  const segs = path.split("/").filter(Boolean);
  segs.forEach((seg, idx) => {
    const isLastSeg = idx === segs.length - 1;
    if (seg.includes("-")) {
      const hy = seg.split("-").filter(Boolean);
      hy.forEach((h, i) => {
        const lastHy = i === hy.length - 1;
        lines.push(lastHy ? h : `${h}-`);
      });
    } else {
      lines.push(isLastSeg ? seg : `${seg}/`);
    }
  });

  return lines;
};

const emailToLines = (email) => {
  const [local, domain] = email.split("@");
  return [`${local}@`, domain ?? ""];
};

const dottedDigitsToLines = (s) => {
  const digits = s.replace(/\./g, "");
  const out = [];
  for (let i = 0; i < digits.length; i += 4) {
    const chunk = digits.slice(i, i + 4);
    if (!chunk) continue;
    out.push(i + 4 < digits.length ? `${chunk}.` : chunk);
  }
  return out;
};

const classicDoiToLines = (s) => {
  const lower = s.toLowerCase();
  let body = s;
  const out = [];
  if (lower.startsWith("doi:")) {
    out.push("doi:");
    body = s.slice(4);
  }
  const parts = body.split(".");
  parts.forEach((p, i) => {
    const isLast = i === parts.length - 1;
    out.push(isLast ? p : `${p}.`);
  });
  return out;
};

const PUNCT_FOLLOW = /[)\],.!?;:]+/;
const firstMatch = (text, regex) => {
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const r = new RegExp(regex.source, flags);
  r.lastIndex = 0;
  const m = r.exec(text);
  return m ? { index: m.index, length: m[0].length, value: m[0] } : null;
};
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
const DOI_RE = /\b(?:doi:\s*)?10\.\d{2,9}\/\S+\b/i;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const findNextSpecial = (text) => {
  const cands = [];
  const url = firstMatch(text, URL_RE);
  if (url) cands.push({ type: "url", ...url });
  const doi = firstMatch(text, DOI_RE);
  if (doi) cands.push({ type: "doi", ...doi });
  const email = firstMatch(text, EMAIL_RE);
  if (email) cands.push({ type: "email", ...email });
  if (cands.length === 0) return null;
  cands.sort((a, b) => a.index - b.index);
  return cands[0];
};

const normalizeHref = (raw) => {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return "https://" + trimmed;
  return trimmed;
};

const expandLineMixed = (line) => {
  const out = [];
  let rest = line;

  while (rest.length > 0) {
    const m = findNextSpecial(rest);
    if (!m) {
      out.push({ text: rest, isSplitProduct: false });
      break;
    }

    const before = rest.slice(0, m.index);
    if (before.trim().length > 0) out.push({ text: before.trim(), isSplitProduct: false });

    let core = m.value;
    let after = rest.slice(m.index + m.length);

    let trailing = "";
    while (after.length > 0 && PUNCT_FOLLOW.test(after[0])) {
      trailing += after[0];
      after = after.slice(1);
    }

    const coreForLength = core.replace(/\s+/g, "");
    if (coreForLength.length > LONG_THRESHOLD) {
      let lines = [];
      let kind = null;
      if (m.type === "url") { lines = urlToLines(core); kind = "url"; }
      else if (m.type === "email") { lines = emailToLines(core); kind = "email"; }
      else if (m.type === "doi") { lines = classicDoiToLines(core); kind = "doi"; }
      else if (/^\d+(?:\.\d+)+$/.test(core)) { lines = dottedDigitsToLines(core); kind = "dotted"; }

      if (lines.length > 0) {
        lines[lines.length - 1] = `${lines[lines.length - 1]}${trailing}`;
        lines.forEach((t) => out.push({ text: t, isSplitProduct: true, splitKind: kind }));
        if (m.type === "url") {
          out.push({
            text: "link",
            isSplitProduct: true,
            splitKind: "urlLink",
            isLink: true,
            href: normalizeHref(core),
          });
        }
      } else {
        out.push({ text: core + trailing, isSplitProduct: false });
      }
    } else {
      out.push({ text: core + trailing, isSplitProduct: false });
    }

    rest = after;
  }

  if (out.length === 0) out.push({ text: line, isSplitProduct: false });
  return out;
};

const RTL_CHAR_RE = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const isRTLText = (s) => RTL_CHAR_RE.test(s || "");

/* ---------- Width measuring (real rendered width, any script) ---------- */
const MARK_RE = /\p{M}/u; // combining marks (accents, Arabic harakat...)
let _measureCtx = null;
const measureWordPx = (word, fontSize, fontWeight) => {
  // letter-spacing is added once per visible letter, not per combining mark
  const letters = Array.from(word).filter((c) => !MARK_RE.test(c)).length;
  if (!_measureCtx && typeof document !== "undefined") {
    try { _measureCtx = document.createElement("canvas").getContext("2d"); } catch {}
  }
  if (!_measureCtx) return letters * (fontSize * 0.62 + 3);
  _measureCtx.font = `${fontWeight} ${fontSize}px Tahoma, sans-serif`;
  return _measureCtx.measureText(word).width + letters * 3;
};

/* A letter together with the marks sitting on it must never be separated. */
const toClusters = (word) => {
  const out = [];
  for (const ch of Array.from(word)) {
    if (out.length && MARK_RE.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
};

/* Split a word ONLY when it is really wider than the row (measured), and
   then into pieces that each fit. Counting characters is wrong for scripts
   like Arabic, where marks take no width and letters join. */
const splitWordByWidth = (word, { fontSize, fontWeight, availPx }) => {
  const w = (s) => measureWordPx(s, fontSize, fontWeight);
  if (w(word) <= availPx) return [{ text: word, isSplitProduct: false }];
  const pieces = [];
  let cur = "";
  for (const c of toClusters(word)) {
    if (cur && w(cur + c + "-") > availPx) {
      pieces.push(cur);
      cur = c;
    } else {
      cur += c;
    }
  }
  if (cur) pieces.push(cur);
  if (pieces.length < 2) return [{ text: word, isSplitProduct: false }];
  return pieces.map((p, i) => {
    const last = i === pieces.length - 1;
    return {
      text: last ? p : p + "-",
      isSplitProduct: true,
      splitKind: "hyphenWord",
      hyphenAppended: !last,
    };
  });
};

const hyphenateLongWordsForLargeFont = (fragment, opts) => {
  const tooWide = (tok) => measureWordPx(tok, opts.fontSize, opts.fontWeight) > opts.availPx;
  if (!fragment.split(/\s+/).some((t) => t && tooWide(t))) {
    return [{ text: fragment, isSplitProduct: false }];
  }

  const tokens = fragment.split(/(\s+)/);
  const out = [];
  let buffer = "";

  const flushBuffer = () => {
    const t = buffer.trim();
    if (t.length > 0) out.push({ text: t, isSplitProduct: false });
    buffer = "";
  };

  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      buffer += tok;
      continue;
    }
    if (tooWide(tok)) {
      flushBuffer();
      const pieces = splitWordByWidth(tok, opts);
      pieces.forEach((p) => out.push(p));
    } else {
      buffer += tok;
    }
  }
  flushBuffer();
  return out.length ? out : [{ text: fragment, isSplitProduct: false }];
};

/* ---------- Math helpers ----------
   A line is a formula when it is wrapped in \[ \], $$ $$, \( \) or $ $.
   Returns the LaTeX inside, or null. */
const mathBody = (line) => {
  const t = (line || "").trim();
  let m =
    t.match(/^\\\[([\s\S]+)\\\]$/) ||
    t.match(/^\$\$([\s\S]+)\$\$$/) ||
    t.match(/^\\\(([\s\S]+)\\\)$/) ||
    t.match(/^\$([^$]+)\$$/);
  return m ? m[1].trim() : null;
};
/* Formulas written over several lines are joined onto one line so they
   are treated as a single formula. */
const joinMultilineMath = (text) =>
  text
    .replace(/\\\[[\s\S]*?\\\]/g, (m) => m.replace(/\s*\n\s*/g, " "))
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => m.replace(/\s*\n\s*/g, " "));

/* ---------- Formulas pasted from a PDF ----------
   A PDF puts a fraction on the clipboard as two separate lines (top, then
   bottom) — the bar itself is a drawing, not a character, so it is lost.
   Typical paste:   :=  /  Di  /  e0(Xi)  /  +  /  1 − Di  /  1 − e0(Xi)  /  .
   Rule used to rebuild it: between lines that hold only an operator, two
   short lines are the top and bottom of a fraction, one short line is a
   plain term. Lines are only regrouped when at least one fraction is found. */
const OP_ONLY_RE = /^\s*(?::=|=|≡|≈|≤|≥|\+|[-−–]|×|·|±)\s*$/;
const PUNCT_ONLY_RE = /^\s*[.,;:]\s*$/;
const isShortTerm = (l) => {
  const t = (l ?? "").trim();
  return (
    t.length > 0 && t.length <= 30 &&
    !OP_ONLY_RE.test(t) && !PUNCT_ONLY_RE.test(t) &&
    t.split(/\s+/).length <= 6
  );
};
const endsTerm = (l) =>
  l === undefined || l.trim() === "" || OP_ONLY_RE.test(l) || PUNCT_ONLY_RE.test(l);

const groupPastedFormulas = (lines) => {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (OP_ONLY_RE.test(lines[i])) {
      const parts = [];
      let hasFrac = false;
      let j = i;
      while (j < lines.length && OP_ONLY_RE.test(lines[j])) {
        const op = lines[j].trim();
        const a = lines[j + 1];
        const b = lines[j + 2];
        if (!isShortTerm(a)) break;
        if (isShortTerm(b) && endsTerm(lines[j + 3])) {
          parts.push({ type: "op", text: op }, { type: "frac", num: a.trim(), den: b.trim() });
          hasFrac = true;
          j += 3;
        } else if (endsTerm(b)) {
          parts.push({ type: "op", text: op }, { type: "term", text: a.trim() });
          j += 2;
        } else {
          break;
        }
      }
      if (hasFrac) {
        if (j < lines.length && PUNCT_ONLY_RE.test(lines[j])) {
          parts.push({ type: "term", text: lines[j].trim() });
          j += 1;
        }
        const flat = parts.map((p) => (p.type === "frac" ? `${p.num} ${p.den}` : p.text)).join(" ");
        out.push({ text: flat, isSplitProduct: false, isFormulaRow: true, parts });
        i = j;
        continue;
      }
    }
    out.push(lines[i]);
    i += 1;
  }
  return out;
};

/* At large fonts every visual row becomes its own line (own highlight and
   separator). Each row takes as many words as really fit the available
   width — measured, so short words (e.g. Arabic) fill the row instead of
   being cut after a fixed number of words. */
const fitWrap = (items, { fontSize, fontWeight, wordSpacing, availPx }) => {
  if (fontSize <= TWO_WORD_WRAP_THRESHOLD) return items;
  const out = [];
  for (const item of items) {
    if (item.isLink || item.isMath || item.isFormulaRow || item.isSplitProduct) { out.push(item); continue; }
    const trimmed = (item.text ?? "").trim();
    const words = trimmed.length ? trimmed.split(/\s+/).filter(Boolean) : [];
    if (words.length <= 1) { out.push(item); continue; }

    const rows = [];
    let row = [];
    let rowW = 0;
    for (const w of words) {
      const ww = measureWordPx(w, fontSize, fontWeight);
      const next = row.length ? rowW + wordSpacing + ww : ww;
      if (row.length && next > availPx) {
        rows.push(row);
        row = [w];
        rowW = ww;
      } else {
        row.push(w);
        rowW = next;
      }
    }
    if (row.length) rows.push(row);

    if (rows.length === 1) { out.push(item); continue; }
    rows.forEach((r) =>
      out.push({ ...item, text: r.join(" "), isSplitProduct: true, splitKind: "twoWordWrap" })
    );
  }
  return out;
};

/* Highlight of the line being read.
   It lives in its own tiny component and paints through one CSS rule, so
   moving the highlight while scrolling never re-renders the (possibly
   huge) text. The line is found with a binary search, not by measuring
   every line on every scroll event. */
const CurrentLineHighlight = React.memo(({ bg, ring, refreshKey }) => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const out = document.getElementById("printable-text");
      const kids = out ? out.children : null;
      const n = kids ? kids.length : 0;
      if (!n) return;
      const sight = window.innerHeight * 0.33;
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (kids[mid].getBoundingClientRect().bottom < sight) lo = mid + 1;
        else hi = mid;
      }
      let best = lo;
      if (lo > 0) {
        const a = kids[lo].getBoundingClientRect();
        const b = kids[lo - 1].getBoundingClientRect();
        if (Math.abs(b.top + b.height / 2 - sight) < Math.abs(a.top + a.height / 2 - sight)) best = lo - 1;
      }
      setIdx(best);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(compute); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    compute();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [refreshKey]);

  if (!bg) return null;
  return (
    <style>{`@media screen { #printable-text > .text-line:nth-child(${idx + 1}) { background-color: ${bg}; box-shadow: ${ring}; } }`}</style>
  );
});

const Mymag = () => {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [text, setText] = useState("");
  const containerRef = useRef(null);

  const rafRef = useRef(null);
  const [autoActive, setAutoActive] = useState(false);
  const [autoWpm, setAutoWpm] = useState(DEFAULTS.autoWpm);
  const autoWpmRef = useRef(DEFAULTS.autoWpm);
  const wordCountRef = useRef(0);
  const textAreaRef = useRef(null);
  const typedRef = useRef(null); // caret position of the latest keystroke


  const [fontSize, setFontSize] = useState(DEFAULTS.fontSize);
  const [wordSpacing, setWordSpacing] = useState(DEFAULTS.wordSpacing);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fontWeight, setFontWeight] = useState(DEFAULTS.fontWeight);
  const [showAsRTL, setShowAsRTL] = useState(DEFAULTS.showAsRTL);

  const [darkMode, setDarkMode] = useState(DEFAULTS.darkMode);
  const [bodyBgColor, setBodyBgColor] = useState(DEFAULTS.bodyBgColor);
  const [btnBgLeft, setBtnBgLeft] = useState(DEFAULTS.btnBgLeft);
  const [btnBgRight, setBtnBgRight] = useState(DEFAULTS.btnBgRight);
  const [showFloatingButtons, setShowFloatingButtons] = useState(DEFAULTS.showFloatingButtons);
  const [showBorder, setShowBorder] = useState(DEFAULTS.showBorder);
  const [showTextArea, setShowTextArea] = useState(DEFAULTS.showTextArea);
  const [showShadow, setShowShadow] = useState(DEFAULTS.showShadow);
  const [currentLineIntensity, setCurrentLineIntensity] = useState(DEFAULTS.currentLineIntensity);

  const [letterColors, setLetterColors] = useState(DEFAULTS.letterColors);

  const [viewportW, setViewportW] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Real inner width of the display box (used to decide how many words fit a row).
  const [outputW, setOutputW] = useState(0);
  useLayoutEffect(() => {
    const el = document.getElementById("printable-text");
    if (el && el.clientWidth) setOutputW(el.clientWidth);
  }, [viewportW, showBorder, showFloatingButtons, showTextArea]);

  /* -------- Load persisted settings + migrate old slow speeds -------- */
  useEffect(() => {
    let local = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(encodeURIComponent(STORAGE_KEY) + "="))
        ?.split("=")[1];
      local = raw ?? (cookie ? decodeURIComponent(cookie) : null);
    } catch {}

    const apply = (txt) => {
    try {
      if (txt) {
        const s = JSON.parse(txt);
        if (typeof s.fontSize === "number") setFontSize(s.fontSize);
        if (typeof s.wordSpacing === "number") setWordSpacing(s.wordSpacing);
        if (typeof s.fontWeight === "number") setFontWeight(s.fontWeight);
        if (typeof s.showAsRTL === "boolean") setShowAsRTL(s.showAsRTL);
        if (s.letterColors && typeof s.letterColors === "object") setLetterColors(s.letterColors);
        if (typeof s.darkMode === "boolean") setDarkMode(s.darkMode);
        if (typeof s.bodyBgColor === "string") setBodyBgColor(s.bodyBgColor);
        if (typeof s.btnBgLeft === "string") setBtnBgLeft(s.btnBgLeft);
        if (typeof s.btnBgRight === "string") setBtnBgRight(s.btnBgRight);
        if (typeof s.showFloatingButtons === "boolean") setShowFloatingButtons(s.showFloatingButtons);
        // (old "autoIntervalMs" per-line values are ignored: they were not
        // comparable across font sizes, so the default speed is used instead)
        if (typeof s.autoWpm === "number") setAutoWpm(clampWpm(s.autoWpm));
        if (typeof s.showBorder === "boolean") setShowBorder(s.showBorder);
        if (typeof s.showTextArea === "boolean") setShowTextArea(s.showTextArea);
        if (typeof s.showShadow === "boolean") setShowShadow(s.showShadow);
        if (typeof s.currentLineIntensity === "number") setCurrentLineIntensity(s.currentLineIntensity);
      }
    } catch {}
    };

    apply(local);

    // Extension: settings are kept in the extension's own storage (the same
    // on every website), and the selected text is waiting there too.
    if (extApi) {
      try {
        extApi.storage.local.get([STORAGE_KEY, PENDING_KEY, CLIPBOARD_KEY], (r) => {
          if (!r) return;
          if (typeof r[STORAGE_KEY] === "string") apply(r[STORAGE_KEY]);
          if (typeof r[PENDING_KEY] === "string") setText(r[PENDING_KEY]);
          // PDF viewers hide the selection from extensions on a keyboard
          // shortcut: fall back to the text the user copied (Ctrl+C).
          if (r[CLIPBOARD_KEY] === true && !(r[PENDING_KEY] || "").trim()) {
            const readClip = () =>
              navigator.clipboard.readText().then((t) => { if (t && t.trim()) setText(t); });
            readClip().catch(() => {
              // needs the window to be focused — try once more when it is
              const once = () => {
                window.removeEventListener("focus", once);
                readClip().catch(() => {});
              };
              window.addEventListener("focus", once);
            });
          }
          extApi.storage.local.remove([PENDING_KEY, CLIPBOARD_KEY]);
        });
      } catch {}
    }
  }, []);

  useEffect(() => {
    const bg = darkMode ? "#111111" : (bodyBgColor || "#e5e7eb");
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    document.body.style.color = darkMode ? "#ffffff" : "#000000";
  }, [darkMode, bodyBgColor]);

  const saveSettings = () => {
    const payload = JSON.stringify({
      fontSize, wordSpacing, fontWeight, letterColors, showAsRTL,
      darkMode, bodyBgColor, btnBgLeft, btnBgRight, showFloatingButtons,
      autoWpm, showBorder, showTextArea, showShadow, currentLineIntensity,
    });
    try { localStorage.setItem(STORAGE_KEY, payload); } catch {}
    try { if (extApi) extApi.storage.local.set({ [STORAGE_KEY]: payload }); } catch {}
    try {
      const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
      document.cookie = `${encodeURIComponent(STORAGE_KEY)}=${encodeURIComponent(payload)}; expires=${expires}; path=/; SameSite=Lax`;
    } catch {}
  };

  const resetToDefaults = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    try { if (extApi) extApi.storage.local.remove(STORAGE_KEY); } catch {}
    try {
      document.cookie = `${encodeURIComponent(STORAGE_KEY)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    } catch {}

    setAutoWpm(DEFAULTS.autoWpm);
    setFontSize(DEFAULTS.fontSize);
    setWordSpacing(DEFAULTS.wordSpacing);
    setFontWeight(DEFAULTS.fontWeight);
    setShowAsRTL(DEFAULTS.showAsRTL);
    setDarkMode(DEFAULTS.darkMode);
    setBodyBgColor(DEFAULTS.bodyBgColor);
    setBtnBgLeft(DEFAULTS.btnBgLeft);
    setBtnBgRight(DEFAULTS.btnBgRight);
    setShowFloatingButtons(DEFAULTS.showFloatingButtons);
    setShowBorder(DEFAULTS.showBorder);
    setShowTextArea(DEFAULTS.showTextArea);
    setShowShadow(DEFAULTS.showShadow);
    setCurrentLineIntensity(DEFAULTS.currentLineIntensity);
    setLetterColors(DEFAULTS.letterColors);
  };

  const handleChange = (e) => {
    // Follow the caret only for typing. A paste (or any big jump in length)
    // must leave the view where it is, at the start of the text.
    const kind = (e.nativeEvent && e.nativeEvent.inputType) || "";
    const bigChange = Math.abs(e.target.value.length - text.length) > 40;
    typedRef.current =
      /Paste|Drop/i.test(kind) || bigChange
        ? null
        : { caret: e.target.selectionStart ?? e.target.value.length };
    setText(e.target.value);
  };

  /* -------- Follow the typing: keep the enlarged word being written in view.
     The text box sticks to the top of the window while focused (CSS), and the
     page scrolls so the matching enlarged word sits in the free area below it.
     Positions come from the rendered words themselves, so any font size,
     spacing or window size works. -------- */
  useEffect(() => {
    const typed = typedRef.current;
    typedRef.current = null;
    if (!typed || autoActive) return;
    const out = document.getElementById("printable-text");
    if (!out) return;

    const caret = Math.min(typed.caret, text.length);
    const atEnd = text.slice(caret).trim() === "";
    let target = null;

    if (atEnd) {
      const lines = out.querySelectorAll(".text-line");
      const lastLine = lines[lines.length - 1];
      if (lastLine) {
        const words = lastLine.querySelectorAll(".text-word");
        target = /\n\s*$/.test(text) || !words.length ? lastLine : words[words.length - 1];
      }
    } else {
      // Caret in the middle: locate the enlarged word by its word position
      // (proportional, because URLs / long words are split into extra pieces).
      const words = out.querySelectorAll(".text-word");
      const total = countWords(text);
      const before = countWords(text.slice(0, caret));
      if (words.length && total) {
        const idx = Math.round((before / total) * words.length) - 1;
        target = words[Math.max(0, Math.min(words.length - 1, idx))];
      }
    }
    if (!target) return;

    const pad = 16;
    const ta = textAreaRef.current;
    const zoneTop = (ta ? Math.max(0, ta.getBoundingClientRect().bottom) : 0) + pad;
    const zoneBottom = window.innerHeight - pad;
    const r = target.getBoundingClientRect();

    let delta = 0;
    if (r.bottom > zoneBottom) delta = r.bottom - zoneBottom;
    else if (r.top < zoneTop) delta = r.top - zoneTop;
    if (Math.abs(delta) < 1) return;

    const reduceMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Small steps glide; big steps (very large fonts, fast typing) go straight
    // there so the view never lags behind or bounces.
    const bigStep = Math.abs(delta) > window.innerHeight * 0.5;
    window.scrollBy({ top: delta, behavior: reduceMotion || bigStep ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const formatText = (inputText) => {
    return groupPastedFormulas(joinMultilineMath(inputText).split("\n")).flatMap((line) => {
      if (typeof line !== "string") return [line]; // rebuilt formula row
      if (mathBody(line) !== null) return [line];
      if (line.length > 30 && line.includes("+")) {
        return line.split(/(\+)/).reduce((acc, part) => {
          if (acc.length === 0 || acc[acc.length - 1].length + part.length > 30) {
            acc.push(part);
          } else {
            acc[acc.length - 1] += part;
          }
          return acc;
        }, []);
      }
      return [line];
    });
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
    } catch (err) {
      console.error("Failed to paste from clipboard:", err);
    }
  };

  useEffect(() => { autoWpmRef.current = clampWpm(autoWpm); }, [autoWpm]);
  const fontSizeRef = useRef(fontSize);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);

  /* Pixels of page height one word takes up on average, measured from the
     rendered text. Bigger font / wider spacing / narrower window => more px
     per word => proportionally faster pixel speed for the same reading speed. */
  const getPxPerWord = useCallback(() => {
    const out = document.getElementById("printable-text");
    if (!out) return 0;
    const words = Math.max(1, wordCountRef.current);
    return out.getBoundingClientRect().height / words;
  }, []);

  /* Scroll speed in px/second for a given reading speed.
     1) words model: wpm x px-per-word (right for small / medium text).
     2) row limit: with very large text a row holds only 1-2 words, so the
        words model would make rows fly past. A row must stay at least
        ~2 s at the default speed (scaled by the slider) so the eye can
        follow it. The slower of the two is used. */
  const getPxPerSec = useCallback((wpm) => {
    const wordsModel = (wpm / 60) * getPxPerWord();
    const wordEl = document.querySelector("#printable-text .text-word");
    const rowH = (wordEl && wordEl.getBoundingClientRect().height) || fontSizeRef.current * 1.2;
    const minSecPerRow = 2 * (DEFAULTS.autoWpm / wpm);
    return Math.min(wordsModel, rowH / minSecPerRow);
  }, [getPxPerWord]);

  /* =========================================================
     ✅ Auto-scroll — single self-contained effect.
     - Keeps a private `virtualY` (float) so subpixel rounding
       in window.scrollY can't stall the loop.
     - Speed = reading speed (words/min) x measured px-per-word,
       re-read every frame so slider / font changes apply live.
     - Logs diagnostics so you can confirm in DevTools.
     ========================================================= */
  useEffect(() => {
    if (!autoActive) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Capture the docs height up front for the diagnostic message.
    const docElInit = document.scrollingElement || document.documentElement;
    const docHeightInit = Math.max(
      docElInit.scrollHeight || 0,
      document.body.scrollHeight || 0,
      document.documentElement.scrollHeight || 0
    );
    const initialMaxScroll = docHeightInit - window.innerHeight;

    console.info(
      "[MyMag] Auto-scroll START",
      "| speed:", autoWpmRef.current, "words/min",
      "| px per word:", Math.round(getPxPerWord()),
      "| =>", Math.round(getPxPerSec(autoWpmRef.current)), "px/s",
      "| docHeight:", docHeightInit, "px",
      "| viewport:", window.innerHeight, "px",
      "| scrollable:", initialMaxScroll, "px"
    );

    // Float-accurate position tracker — independent of window.scrollY rounding.
    let virtualY = window.scrollY;
    let lastTs = 0;
    let stoppedReason = null;
    let speedAt = -Infinity;
    let speedWpm = 0;
    let speedPxPerSec = 0;

    const step = (ts) => {
      const docEl = document.scrollingElement || document.documentElement;
      const docHeight = Math.max(
        docEl.scrollHeight || 0,
        document.body.scrollHeight || 0,
        document.documentElement.scrollHeight || 0
      );
      const maxScroll = docHeight - window.innerHeight;

      if (maxScroll <= 0) {
        stoppedReason = "nothing-to-scroll";
        setAutoActive(false);
        rafRef.current = null;
        return;
      }

      // First tick: seed the timestamp, scroll on next frame.
      if (!lastTs) {
        lastTs = ts;
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const dtMs = ts - lastTs;
      lastTs = ts;

      // Re-measure the speed twice a second, not on every frame.
      if (ts - speedAt > 500 || speedWpm !== autoWpmRef.current) {
        speedWpm = autoWpmRef.current;
        speedPxPerSec = getPxPerSec(speedWpm);
        speedAt = ts;
      }
      const pxPerMs = speedPxPerSec / 1000;
      // Cap dt so a long background-tab pause doesn't cause a big jump
      // (kept generous: throttled frames must not slow the reading speed).
      const dy = pxPerMs * Math.min(dtMs, 1500);

      virtualY = Math.min(virtualY + dy, maxScroll);
      window.scrollTo(0, virtualY);

      if (virtualY >= maxScroll - 0.5) {
        stoppedReason = "reached-end";
        setAutoActive(false);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (stoppedReason) {
        console.info("[MyMag] Auto-scroll STOP —", stoppedReason);
      } else {
        console.info("[MyMag] Auto-scroll STOP — user toggle");
      }
    };
  }, [autoActive, getPxPerWord, getPxPerSec]);

  const toggleAutoScroll = () => {
    if (!autoActive) {
      const docEl = document.scrollingElement || document.documentElement;
      const docHeight = Math.max(
        docEl.scrollHeight || 0,
        document.body.scrollHeight || 0,
        document.documentElement.scrollHeight || 0
      );
      const maxScroll = docHeight - window.innerHeight;
      if (!text || maxScroll <= 0) {
        console.warn(
          "[MyMag] Auto-scroll not started: nothing to scroll.",
          "Text length:", text.length,
          "| Document scrollable height:", maxScroll, "px"
        );
        return;
      }
    }
    setAutoActive((prev) => !prev);
  };

  /* Keyboard control, identical in every browser:
     Space = play / pause, Escape = pause.
     Ignored while typing in a field, and Space is left alone on buttons and
     links (there it already "presses" the focused control). */
  const toggleAutoRef = useRef(toggleAutoScroll);
  toggleAutoRef.current = toggleAutoScroll;
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // In the extension, Esc always closes MyMag (even while typing).
      if (e.key === "Escape" && extMode) {
        e.preventDefault();
        closeExtension();
        return;
      }
      const t = e.target;
      const tag = (t && t.tagName) || "";
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || (t && t.isContentEditable)) return;
      if (e.key === "Escape") {
        setAutoActive(false);
      } else if (e.key === " " || e.code === "Space") {
        if (tag === "BUTTON" || tag === "A") return;
        e.preventDefault(); // otherwise Space pages the window down
        toggleAutoRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const renderWithKatex = (latex) => {
    // Follow the Bold setting when the formula allows it.
    if (fontWeight >= 700) {
      try {
        return katex.renderToString(`\\boldsymbol{${latex}}`, { throwOnError: true, displayMode: true });
      } catch {}
    }
    try {
      return katex.renderToString(latex, { throwOnError: false, displayMode: true });
    } catch (err) {
      console.error("KaTeX error:", err);
      return latex;
    }
  };

  // Width available to the words of one row: the display box minus the
  // line padding (8px each side) and a small safety margin.
  const availPx = Math.max(
    120,
    (outputW || (viewportW - 40) * 0.8 - 2) - 16 - 4
  );

  /* The line list is rebuilt ONLY when the text or a layout setting changes.
     With long texts, redoing this on every render (e.g. while scrolling)
     was what made auto-scroll stutter. */
  const displayLines = useMemo(() => {
    // Formulas skip the word-splitting steps (they would break the LaTeX).
    const mixedExpanded = formatText(text).flatMap((line) =>
      typeof line !== "string"
        ? [line]
        : mathBody(line) !== null
          ? [{ text: line, isSplitProduct: false, isMath: true }]
          : expandLineMixed(line)
    );
    const withHyphenated = mixedExpanded.flatMap((frag) =>
      frag.isSplitProduct || frag.isMath || frag.isFormulaRow
        ? [frag]
        : hyphenateLongWordsForLargeFont(frag.text, { fontSize, fontWeight, availPx })
    );
    return fitWrap(withHyphenated, { fontSize, fontWeight, wordSpacing, availPx });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, fontSize, fontWeight, wordSpacing, availPx]);
  wordCountRef.current = useMemo(
    () => displayLines.reduce((n, it) => n + countWords(it.text), 0),
    [displayLines]
  );

  const pageBg = darkMode ? "#111111" : (bodyBgColor || "#e5e7eb");
  const leftBtnBgEff = normalizeBtnBg(btnBgLeft, pageBg, darkMode);
  const rightBtnBgEff = normalizeBtnBg(btnBgRight, pageBg, darkMode);
  const leftIconEff = iconOn(leftBtnBgEff);
  const rightIconEff = iconOn(rightBtnBgEff);
  const borderColorEff = borderForBg(pageBg);

  const clampedIntensity = Math.max(0, Math.min(100, Number(currentLineIntensity) || 0));
  const intensity01 = clampedIntensity / 100;
  const maxAlpha = darkMode ? 0.55 : 0.85;
  const highlightAlpha = (intensity01 * maxAlpha).toFixed(3);
  const currentLineBg =
    clampedIntensity === 0
      ? "transparent"
      : `rgba(250, 204, 21, ${highlightAlpha})`;
  const ringAlpha = clampedIntensity === 0 ? 0 : Math.min(0.7, intensity01 * 0.7);
  const currentLineRing =
    clampedIntensity === 0
      ? "none"
      : `inset 0 0 0 2px rgba(250, 204, 21, ${ringAlpha.toFixed(3)})`;

  const logoSrc = `${process.env.PUBLIC_URL || ""}/mymag.png`;

  return (
    <div className="container" ref={containerRef}>
      <SettingsPanel
        className={isSettingsOpen ? "" : "hidden"}
        fontSize={fontSize}
        setFontSize={setFontSize}
        wordSpacing={wordSpacing}
        setWordSpacing={setWordSpacing}
        fontWeight={fontWeight}
        setFontWeight={setFontWeight}
        letterColors={letterColors}
        setLetterColors={setLetterColors}
        setIsSettingsOpen={setIsSettingsOpen}
        onSaveSettings={() => { saveSettings(); setIsSettingsOpen(false); }}
        onResetDefaults={() => { resetToDefaults(); saveSettings(); setIsSettingsOpen(false); }}
        showAsRTL={showAsRTL}
        setShowAsRTL={setShowAsRTL}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        bodyBgColor={bodyBgColor}
        setBodyBgColor={setBodyBgColor}
        btnBgLeft={btnBgLeft}
        setBtnBgLeft={setBtnBgLeft}
        btnBgRight={btnBgRight}
        setBtnBgRight={setBtnBgRight}
        showFloatingButtons={showFloatingButtons}
        setShowFloatingButtons={setShowFloatingButtons}
        autoWpm={autoWpm}
        setAutoWpm={setAutoWpm}
        wpmMin={WPM_MIN}
        wpmMax={WPM_MAX}
        showBorder={showBorder}
        setShowBorder={setShowBorder}
        showTextArea={showTextArea}
        setShowTextArea={setShowTextArea}
        showShadow={showShadow}
        setShowShadow={setShowShadow}
        currentLineIntensity={currentLineIntensity}
        setCurrentLineIntensity={setCurrentLineIntensity}
      />

      {extMode && (
        <button
          className="ext-close-button"
          onClick={closeExtension}
          title="Close MyMag (Esc)"
          aria-label="Close MyMag"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      )}

      {showFloatingButtons && (
        <div className="left-floating-buttons">
          <img
            src={logoSrc}
            alt="MyMag logo"
            className="app-logo"
            title="MyMag"
            onError={(e) => {
              if (e.currentTarget.src.endsWith("/mymag.png")) {
                e.currentTarget.src = "mymag.png";
              }
            }}
          />

          <button
            className="action-button"
            onClick={() => setShowInfoModal(true)}
            title="About MyMag"
            aria-label="About MyMag"
            style={{ backgroundColor: leftBtnBgEff }}
          >
            <i className="fa-solid fa-info" style={{ color: leftIconEff }}></i>
          </button>

          <button
            className="action-button"
            onClick={() => setDarkMode((v) => !v)}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{ backgroundColor: leftBtnBgEff }}
          >
            <i
              className={`fa-solid ${darkMode ? "fa-sun" : "fa-moon"}`}
              style={{ color: leftIconEff }}
            ></i>
          </button>

          <button
            className={`action-button ${autoActive ? "is-playing" : ""}`}
            onClick={toggleAutoScroll}
            title={autoActive ? "Pause Auto Scroll (Space or Esc)" : "Start Auto Scroll (Space)"}
            aria-label={autoActive ? "Pause Auto Scroll" : "Start Auto Scroll"}
            aria-pressed={autoActive}
            style={{ backgroundColor: leftBtnBgEff }}
          >
            <i
              className={`fa-solid ${autoActive ? "fa-pause" : "fa-play"}`}
              style={{ color: leftIconEff }}
            ></i>
          </button>
        </div>
      )}

      {showFloatingButtons && (
        <div className="floating-buttons">
          <button
            className="action-button"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            title="Settings"
            aria-label="Open Settings"
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i className="fa-solid fa-gear" style={{ color: rightIconEff }}></i>
          </button>
          <button
            className="action-button"
            onClick={handlePaste}
            title="Paste a text"
            aria-label="Paste a text"
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i className="fa-solid fa-paste" style={{ color: rightIconEff }}></i>
          </button>
          <button
            className="action-button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Scroll to Top"
            aria-label="Scroll to Top"
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i className="fa-solid fa-arrow-up" style={{ color: rightIconEff }}></i>
          </button>
          <button
            className="action-button"
            onClick={() => setText("")}
            title="Clear Text"
            aria-label="Clear Text"
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i className="fa-solid fa-trash" style={{ color: rightIconEff }}></i>
          </button>
          <button
            className="action-button"
            onClick={() => setShowAsRTL(!showAsRTL)}
            title={showAsRTL ? "Switch to Left-to-Right" : "Switch to Right-to-Left"}
            aria-label={showAsRTL ? "Switch to Left-to-Right" : "Switch to Right-to-Left"}
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i
              className={`fa-solid ${showAsRTL ? "fa-repeat" : "fa-right-left"}`}
              style={{ color: rightIconEff }}
            ></i>
          </button>
        </div>
      )}

      {showTextArea && (
        <div className="text-input-bar">
          <textarea
            ref={textAreaRef}
            className="text-input"
            placeholder="Paste your text here..."
            value={text}
            onChange={handleChange}
            dir={showAsRTL ? "rtl" : "ltr"}
          />
        </div>
      )}

      <div
        id="printable-text"
        className="text-output"
        style={{
          direction: showAsRTL ? "rtl" : "ltr",
          textAlign: showAsRTL ? "right" : "left",
          overflowX: "hidden",
          whiteSpace: "normal",
          width: "80%",
          border: showBorder ? `1px solid ${borderColorEff}` : "none",
        }}
      >
        {useMemo(() => displayLines.map((item, lineIndex) => {
          const lineText = item.text;
          const trimmedLine = (lineText || "").trim();
          const latex = item.isMath ? mathBody(trimmedLine) : null;
          const isMath = latex !== null;
          const lineIsRTL = !item.isFormulaRow && (isRTLText(lineText) || showAsRTL);

          return (
            <div
              key={lineIndex}
              className="text-line"
              data-line-index={lineIndex}
            >
              {isMath ? (
                <div
                  className="math-block"
                  style={{
                    fontSize: `${fontSize}px`,
                    textShadow: showShadow ? "2px 2px 3px yellow" : "none",
                    direction: "ltr",
                  }}
                  dangerouslySetInnerHTML={{ __html: renderWithKatex(latex) }}
                />
              ) : item.isLink ? (
                <div
                  className="text-row"
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    direction: lineIsRTL ? "rtl" : "ltr",
                    unicodeBidi: "isolate",
                    width: "100%",
                  }}
                >
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.href}
                    aria-label={`Open link ${item.href}`}
                    style={{
                      color: "#2563eb",
                      textDecoration: "underline",
                      fontFamily: "Tahoma, sans-serif",
                      fontSize: `${fontSize}px`,
                      fontWeight: fontWeight,
                      letterSpacing: "3px",
                      marginRight: `${wordSpacing}px`,
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      display: "inline-block",
                    }}
                  >
                    link
                  </a>
                </div>
              ) : (
                <div
                  className="text-row"
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: `${wordSpacing}px`,
                    // "flex-start" is the right edge when the row is RTL
                    justifyContent: "flex-start",
                    alignItems: item.isFormulaRow ? "center" : undefined,
                    direction: lineIsRTL ? "rtl" : "ltr",
                    unicodeBidi: "isolate",
                    width: "100%",
                  }}
                >
                  {(() => {
                    const renderWords = (txt) => txt.split(/\s+/).filter(Boolean).map((word, wordIndex) => (
                    <span
                      key={wordIndex}
                      className="text-word"
                      aria-label={word}
                      role="text"
                      style={{
                        fontFamily: "Tahoma, sans-serif",
                        fontSize: `${fontSize}px`,
                        fontWeight: fontWeight,
                        letterSpacing: "3px",
                        textShadow: showShadow ? "2px 2px 3px yellow" : "none",
                        marginInlineEnd: 0,
                        marginRight: 0,
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        direction: lineIsRTL ? "rtl" : "ltr",
                        unicodeBidi: "isolate",
                        display: "inline-block",
                        maxWidth: "100%",
                      }}
                    >
                      {Array.from(word).map((char, charIndex, arr) => {
                        let color = "inherit";
                        const mapped = letterColors[char];

                        if (item.isSplitProduct && item.splitKind !== "hyphenWord" && item.splitKind !== "twoWordWrap") {
                          color = mapped || "#6b7280";
                        } else if (
                          item.isSplitProduct &&
                          item.splitKind === "hyphenWord" &&
                          item.hyphenAppended &&
                          char === "-" &&
                          charIndex === arr.length - 1
                        ) {
                          color = "#6b7280";
                        } else if (mapped) {
                          color = mapped;
                        }

                        return (
                          <span key={charIndex} style={{ color }} aria-hidden="true">
                            {char}
                          </span>
                        );
                      })}
                    </span>
                    ));

                    if (!item.isFormulaRow) return renderWords(lineText);

                    // Rebuilt formula: operators and terms side by side,
                    // fractions stacked with a bar, all in the settings font.
                    const group = { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `${wordSpacing}px`, maxWidth: "100%" };
                    return item.parts.map((part, pi) =>
                      part.type === "frac" ? (
                        <span
                          key={pi}
                          className="pasted-frac"
                          role="group"
                          aria-label={`${part.num} over ${part.den}`}
                          style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", maxWidth: "100%" }}
                        >
                          <span style={group}>{renderWords(part.num)}</span>
                          <span
                            aria-hidden="true"
                            style={{
                              alignSelf: "stretch",
                              height: Math.max(3, Math.round(fontSize / 12)),
                              margin: `${Math.max(2, Math.round(fontSize / 16))}px 0`,
                              borderRadius: 2,
                              backgroundColor: "currentColor",
                            }}
                          />
                          <span style={group}>{renderWords(part.den)}</span>
                        </span>
                      ) : (
                        <span key={pi} style={group}>{renderWords(part.text)}</span>
                      )
                    );
                  })()}
                </div>
              )}
              <div className={`line-break ${item.isSplitProduct ? "split" : ""}`}></div>
            </div>
          );
          // Re-created only when the lines or a text style setting change.
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }), [displayLines, fontSize, fontWeight, wordSpacing, showShadow, letterColors, showAsRTL])}
      </div>

      <CurrentLineHighlight
        bg={clampedIntensity > 0 ? currentLineBg : ""}
        ring={currentLineRing}
        refreshKey={`${text.length}|${fontSize}|${wordSpacing}|${viewportW}`}
      />

      {showInfoModal && (
        <div className="modal-overlay" onClick={() => setShowInfoModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => setShowInfoModal(false)} aria-label="Close">
              <i className="fa-solid fa-xmark"></i>
            </button>
            <h2><i className="fa-solid fa-book-open"></i> About <strong>MyMag</strong></h2>
            <p>
              <i className="fa-solid fa-glasses"></i> MyMag is an easy-to-use tool to help people with vision impairment read quicker!
              <br /><br />
              This is particularly useful when a large text has to be read.
              <br /><br />
              <i className="fa-solid fa-face-smile"></i> Enjoy reading!
              <br /><br />
              <i className="fa-solid fa-user"></i> About the Author:
              Zeinab Ghannam
              <br /><br />
              <i className="fa-brands fa-linkedin"></i> LinkedIn:{" "}
              <a href="https://linkedin.com/in/zeinabghannam" target="_blank" rel="noopener noreferrer">linkedin.com/in/zeinabghannam</a><br />
              <i className="fa-brands fa-github"></i> Source Code:{" "}
              <a href="https://github.com/ghannamzeinab" target="_blank" rel="noopener noreferrer">github.com/ghannamzeinab</a>
            </p>
            <button className="close-button" onClick={() => setShowInfoModal(false)}>
              <i className="fa-solid fa-xmark"></i> Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mymag;