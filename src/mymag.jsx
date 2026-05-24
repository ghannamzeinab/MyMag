import React, { useState, useEffect, useRef, useCallback } from "react";
import "./mymag.css";
import SettingsPanel from "./SettingsPanel";

import katex from "katex";
import "katex/dist/katex.min.css";

const STORAGE_KEY = "mymagSettings";
const LONG_THRESHOLD = 16;
const BIG_FONT_THRESHOLD = 150;
const TWO_WORD_WRAP_THRESHOLD = 140;

/* ===== Defaults — auto-scroll values are now in a SANE range ===== */
const DEFAULTS = {
  autoIntervalMs: 3000, // Normal: 3 s per line
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

/* Migrate absurdly-slow old presets (from previous versions of MyMag)
   to the new sensible values. Anything > 12 s/line is treated as legacy. */
const migrateAutoIntervalMs = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return DEFAULTS.autoIntervalMs;
  if (n <= 12000) return n; // already in sane range
  if (n >= 80000) return 6000;   // legacy slow
  if (n >= 40000) return 3000;   // legacy normal
  if (n >= 25000) return 2000;   // legacy "a bit faster"
  return 1200;                   // legacy fast
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

const charsPerLineBudget = (fontSize) => {
  if (typeof window === "undefined") return 999;
  const availPx = Math.max(200, window.innerWidth * 0.8 - 24);
  const glyphPx = Math.max(8, fontSize * 0.62 + 3);
  const budget = Math.floor(availPx / glyphPx);
  return Math.max(4, budget);
};

const splitLongWordByBudget = (word, budget) => {
  const chunkSize = Math.max(2, budget - 1);
  if (word.length <= budget) {
    return [{ text: word, isSplitProduct: false }];
  }
  const pieces = [];
  let i = 0;
  while (i < word.length) {
    const remaining = word.length - i;
    if (remaining <= budget) {
      pieces.push({
        text: word.slice(i),
        isSplitProduct: true,
        splitKind: "hyphenWord",
        hyphenAppended: false,
      });
      break;
    }
    pieces.push({
      text: word.slice(i, i + chunkSize) + "-",
      isSplitProduct: true,
      splitKind: "hyphenWord",
      hyphenAppended: true,
    });
    i += chunkSize;
  }
  return pieces;
};

const hyphenateLongWordsForLargeFont = (fragment, fontSize) => {
  const budget = charsPerLineBudget(fontSize);
  const hasLongRun = /\S{16,}/u.test(fragment) || fragment.split(/\s+/).some((w) => w.length > budget);
  if (!hasLongRun && fontSize < BIG_FONT_THRESHOLD) {
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
    if (tok.length > budget) {
      flushBuffer();
      const pieces = splitLongWordByBudget(tok, budget);
      pieces.forEach((p) => out.push(p));
    } else {
      buffer += tok;
    }
  }
  flushBuffer();
  return out.length ? out : [{ text: fragment, isSplitProduct: false }];
};

const twoWordWrap = (items, fontSize) => {
  if (fontSize <= TWO_WORD_WRAP_THRESHOLD) return items;
  const out = [];
  for (const item of items) {
    if (item.isLink) { out.push(item); continue; }
    const lineText = item.text ?? "";
    const trimmed = lineText.trim();
    const isMath = trimmed.startsWith("\\[") && trimmed.endsWith("\\]");
    if (isMath) { out.push(item); continue; }

    if (item.isSplitProduct) { out.push(item); continue; }

    const words = trimmed.length ? trimmed.split(/\s+/).filter(Boolean) : [];
    if (words.length <= 2) { out.push(item); continue; }

    for (let i = 0; i < words.length; i += 2) {
      const chunk = words.slice(i, i + 2).join(" ");
      out.push({ ...item, text: chunk, isSplitProduct: true, splitKind: "twoWordWrap" });
    }
  }
  return out;
};

const Mymag = () => {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [text, setText] = useState("");
  const containerRef = useRef(null);

  const rafRef = useRef(null);
  const [autoActive, setAutoActive] = useState(false);
  const [autoIntervalMs, setAutoIntervalMs] = useState(DEFAULTS.autoIntervalMs);

  const [currentLineIdx, setCurrentLineIdx] = useState(0);

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

  /* -------- Load persisted settings + migrate old slow speeds -------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(encodeURIComponent(STORAGE_KEY) + "="))
        ?.split("=")[1];
      const txt = raw ?? (cookie ? decodeURIComponent(cookie) : null);
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
        if (typeof s.autoIntervalMs === "number") {
          const migrated = migrateAutoIntervalMs(s.autoIntervalMs);
          if (migrated !== s.autoIntervalMs) {
            console.info(
              "[MyMag] Migrated saved auto-scroll speed:",
              s.autoIntervalMs, "ms/line ->", migrated, "ms/line"
            );
          }
          setAutoIntervalMs(migrated);
        }
        if (typeof s.showBorder === "boolean") setShowBorder(s.showBorder);
        if (typeof s.showTextArea === "boolean") setShowTextArea(s.showTextArea);
        if (typeof s.showShadow === "boolean") setShowShadow(s.showShadow);
        if (typeof s.currentLineIntensity === "number") setCurrentLineIntensity(s.currentLineIntensity);
      }
    } catch {}
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
      autoIntervalMs, showBorder, showTextArea, showShadow, currentLineIntensity,
    });
    try { localStorage.setItem(STORAGE_KEY, payload); } catch {}
    try {
      const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
      document.cookie = `${encodeURIComponent(STORAGE_KEY)}=${encodeURIComponent(payload)}; expires=${expires}; path=/; SameSite=Lax`;
    } catch {}
  };

  const resetToDefaults = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    try {
      document.cookie = `${encodeURIComponent(STORAGE_KEY)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    } catch {}

    setAutoIntervalMs(DEFAULTS.autoIntervalMs);
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

  const handleChange = (e) => setText(e.target.value);

  const formatText = (inputText) => {
    return inputText.split("\n").flatMap((line) => {
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

  const formattedText = formatText(text);

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
    } catch (err) {
      console.error("Failed to paste from clipboard:", err);
    }
  };

  const getLineHeightPx = useCallback(() => {
    const el = document.querySelector("#printable-text .text-line");
    if (!el) return Math.max(fontSize + 20, 80);
    const rect = el.getBoundingClientRect();
    return rect.height || Math.max(fontSize + 20, 80);
  }, [fontSize]);

  const updateCurrentLineFromScroll = useCallback(() => {
    const nodes = document.querySelectorAll("#printable-text .text-line");
    if (!nodes.length) return;
    const sight = window.innerHeight * 0.33;
    let bestIdx = 0;
    let bestDist = Infinity;
    nodes.forEach((n, i) => {
      const r = n.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const d = Math.abs(center - sight);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    setCurrentLineIdx(bestIdx);
  }, []);

  useEffect(() => {
    const onScroll = () => updateCurrentLineFromScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    updateCurrentLineFromScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [updateCurrentLineFromScroll, text, fontSize, viewportW]);

  /* =========================================================
     ✅ Auto-scroll — single self-contained effect.
     - Keeps a private `virtualY` (float) so subpixel rounding
       in window.scrollY can't stall the loop.
     - Uses sensible ms-per-line values (3000 = ~50 px/sec for
       a 150 px line height — clearly visible).
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
      "| pace:", autoIntervalMs, "ms/line",
      "| lineHeight:", Math.round(getLineHeightPx()), "px",
      "| docHeight:", docHeightInit, "px",
      "| viewport:", window.innerHeight, "px",
      "| scrollable:", initialMaxScroll, "px"
    );

    // Float-accurate position tracker — independent of window.scrollY rounding.
    let virtualY = window.scrollY;
    let lastTs = 0;
    let stoppedReason = null;

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

      const lineHeight = getLineHeightPx();
      const intervalMs = Math.max(200, Number(autoIntervalMs) || DEFAULTS.autoIntervalMs);
      const pxPerMs = lineHeight / intervalMs;
      const dy = pxPerMs * dtMs;

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
  }, [autoActive, autoIntervalMs, getLineHeightPx]);

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

  const renderWithKatex = (latex) => {
    try {
      return katex.renderToString(latex, { throwOnError: false, displayMode: true });
    } catch (err) {
      console.error("KaTeX error:", err);
      return latex;
    }
  };

  const mixedExpanded = formattedText.flatMap((line) => expandLineMixed(line));
  const withHyphenated = mixedExpanded.flatMap((frag) =>
    frag.isSplitProduct ? [frag] : hyphenateLongWordsForLargeFont(frag.text, fontSize)
  );
  // eslint-disable-next-line no-unused-vars
  const _vw = viewportW;
  const displayLines = twoWordWrap(withHyphenated, fontSize);

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
        autoIntervalMs={autoIntervalMs}
        setAutoIntervalMs={setAutoIntervalMs}
        showBorder={showBorder}
        setShowBorder={setShowBorder}
        showTextArea={showTextArea}
        setShowTextArea={setShowTextArea}
        showShadow={showShadow}
        setShowShadow={setShowShadow}
        currentLineIntensity={currentLineIntensity}
        setCurrentLineIntensity={setCurrentLineIntensity}
      />

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
            title={autoActive ? "Pause Auto Scroll" : "Start Auto Scroll"}
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
        <textarea
          className="text-input"
          placeholder="Paste your text here..."
          value={text}
          onChange={handleChange}
          dir={showAsRTL ? "rtl" : "ltr"}
        />
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
        {displayLines.map((item, lineIndex) => {
          const lineText = item.text;
          const trimmedLine = (lineText || "").trim();
          const isMath = trimmedLine.startsWith("\\[") && trimmedLine.endsWith("\\]");
          const lineIsRTL = isRTLText(lineText) || showAsRTL;
          const isCurrent = lineIndex === currentLineIdx;

          const currentStyle =
            isCurrent && clampedIntensity > 0
              ? { backgroundColor: currentLineBg, boxShadow: currentLineRing }
              : undefined;

          return (
            <div
              key={lineIndex}
              className={`text-line ${isCurrent && clampedIntensity > 0 ? "current-line" : ""}`}
              style={currentStyle}
              data-line-index={lineIndex}
            >
              {isMath ? (
                <div
                  className="math-block"
                  dangerouslySetInnerHTML={{ __html: renderWithKatex(trimmedLine.slice(2, -2)) }}
                />
              ) : item.isLink ? (
                <div
                  className="text-row"
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: lineIsRTL ? "flex-end" : "flex-start",
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
                    justifyContent: lineIsRTL ? "flex-end" : "flex-start",
                    direction: lineIsRTL ? "rtl" : "ltr",
                    unicodeBidi: "isolate",
                    width: "100%",
                  }}
                >
                  {lineText.split(/\s+/).filter(Boolean).map((word, wordIndex) => (
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
                        marginInlineEnd: `${wordSpacing}px`,
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
                      {word.split("").map((char, charIndex, arr) => {
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
                  ))}
                </div>
              )}
              <div className={`line-break ${item.isSplitProduct ? "split" : ""}`}></div>
            </div>
          );
        })}
      </div>

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
