import React, { useState, useEffect, useRef, useCallback } from "react";
import "./mymag.css";
import SettingsPanel from "./SettingsPanel";

import katex from "katex";
import "katex/dist/katex.min.css";

const STORAGE_KEY = "mymagSettings";
const LONG_THRESHOLD = 16;
const BIG_FONT_THRESHOLD = 150;
const TWO_WORD_WRAP_THRESHOLD = 140;

/* ===== Defaults in one place (used by reset button) ===== */
const DEFAULTS = {
  autoIntervalMs: 55555, // "Normal" — ms per line (higher = slower)
  fontSize: 48,
  wordSpacing: 25,
  fontWeight: 700, // Bold
  showAsRTL: false,
  darkMode: false,
  bodyBgColor: "#e5e7eb", // light gray
  btnBgLeft: "#ffffff",
  btnBgRight: "#ffffff",
  showFloatingButtons: true,
  showBorder: true,
  showTextArea: true,
  showShadow: true,
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

/* ---------- split helpers (produce display lines) ---------- */
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

/* ---------- mixed-content expansion ---------- */
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

// normalize an href for anchor (ensure scheme)
const normalizeHref = (raw) => {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return "https://" + trimmed;
  return trimmed;
};

// returns array of { text, isSplitProduct, splitKind?, hyphenAppended?, isLink?, href? }
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

    // attach trailing punctuation
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
        // apply trailing punctuation to last split line
        lines[lines.length - 1] = `${lines[lines.length - 1]}${trailing}`;
        // emit split lines
        lines.forEach((t) => out.push({ text: t, isSplitProduct: true, splitKind: kind }));
        // if it was a URL, also append a clickable "link" line
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

/* ---------- long-words hyphenation for large font ---------- */
const LONGWORD_RE = /\b[A-Za-z]{16,}\b/;
const hyphenateLongWordsForLargeFont = (fragment, fontSize) => {
  if (fontSize < BIG_FONT_THRESHOLD) return [{ text: fragment, isSplitProduct: false }];

  let rest = fragment;
  const out = [];
  while (true) {
    const m = LONGWORD_RE.exec(rest);
    if (!m) break;

    const before = rest.slice(0, m.index);
    const word = m[0];
    const after = rest.slice(m.index + word.length);

    if (before.trim().length > 0) out.push({ text: before.trim(), isSplitProduct: false });

    const half = Math.floor(word.length / 2);
    const first = word.slice(0, half);
    const second = word.slice(half);

    out.push({ text: first + "-", isSplitProduct: true, splitKind: "hyphenWord", hyphenAppended: true });
    out.push({ text: second, isSplitProduct: true, splitKind: "hyphenWord", hyphenAppended: false });

    rest = after;
  }
  if (rest.trim().length > 0) out.push({ text: rest.trim(), isSplitProduct: false });
  return out.length ? out : [{ text: fragment, isSplitProduct: false }];
};

/* ---------- 2 words per line if large font ---------- */
const twoWordWrap = (items, fontSize) => {
  if (fontSize <= TWO_WORD_WRAP_THRESHOLD) return items;
  const out = [];
  for (const item of items) {
    if (item.isLink) { out.push(item); continue; } // don't wrap link row
    const lineText = item.text ?? "";
    const trimmed = lineText.trim();
    const isMath = trimmed.startsWith("\\[") && trimmed.endsWith("\\]");
    if (isMath) { out.push(item); continue; }

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

  // --- Continuous auto-scroll (RAF), speed = ms per line ---
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);
  const stepRef = useRef(null); // keep latest step handler
  const [autoActive, setAutoActive] = useState(false);
  const [autoIntervalMs, setAutoIntervalMs] = useState(DEFAULTS.autoIntervalMs); // ms per line

  // defaults
  const [fontSize, setFontSize] = useState(DEFAULTS.fontSize);
  const [wordSpacing, setWordSpacing] = useState(DEFAULTS.wordSpacing);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fontWeight, setFontWeight] = useState(DEFAULTS.fontWeight);
  const [showAsRTL, setShowAsRTL] = useState(DEFAULTS.showAsRTL);

  // customizations
  const [darkMode, setDarkMode] = useState(DEFAULTS.darkMode);
  const [bodyBgColor, setBodyBgColor] = useState(DEFAULTS.bodyBgColor);
  const [btnBgLeft, setBtnBgLeft] = useState(DEFAULTS.btnBgLeft);
  const [btnBgRight, setBtnBgRight] = useState(DEFAULTS.btnBgRight);
  const [showFloatingButtons, setShowFloatingButtons] = useState(DEFAULTS.showFloatingButtons);
  const [showBorder, setShowBorder] = useState(DEFAULTS.showBorder);
  const [showTextArea, setShowTextArea] = useState(DEFAULTS.showTextArea);
  const [showShadow, setShowShadow] = useState(DEFAULTS.showShadow);

  const [letterColors, setLetterColors] = useState(DEFAULTS.letterColors);

  /* -------- Persisted settings load -------- */
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
        if (typeof s.autoIntervalMs === "number") setAutoIntervalMs(s.autoIntervalMs);
        if (typeof s.showBorder === "boolean") setShowBorder(s.showBorder);
        if (typeof s.showTextArea === "boolean") setShowTextArea(s.showTextArea);
        if (typeof s.showShadow === "boolean") setShowShadow(s.showShadow);
      }
    } catch {}
  }, []);

  /* -------- Apply page background & dark mode -------- */
  useEffect(() => {
    const bg = darkMode ? "#111111" : (bodyBgColor || "#e5e7eb");
    // apply to full page, html + body
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    document.body.style.color = darkMode ? "#ffffff" : "#000000";
  }, [darkMode, bodyBgColor]);

  const saveSettings = () => {
    const payload = JSON.stringify({
      fontSize,
      wordSpacing,
      fontWeight,
      letterColors,
      showAsRTL,
      darkMode,
      bodyBgColor,
      btnBgLeft,
      btnBgRight,
      showFloatingButtons,
      autoIntervalMs,
      showBorder,
      showTextArea,
      showShadow,
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

    // restore defaults
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
    setLetterColors(DEFAULTS.letterColors);
  };

  const handleChange = (e) => setText(e.target.value);

  // plus-chunking (kept)
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

  /* ---------- Auto-scroll (RAF): continuous until toggled off
       Scroll the WHOLE PAGE so the textarea can scroll away ---------- */
  const getLineHeightPx = useCallback(() => {
    const el = document.querySelector("#printable-text .text-line");
    if (!el) return Math.max(fontSize + 20, 80);
    const rect = el.getBoundingClientRect();
    return rect.height || Math.max(fontSize + 20, 80);
  }, [fontSize]);

  useEffect(() => {
    stepRef.current = (ts) => {
      if (!autoActive) { rafRef.current = null; return; }

      const docEl = document.scrollingElement || document.documentElement;
      const maxScroll = (docEl.scrollHeight || 0) - window.innerHeight;
      if (maxScroll <= 0) {
        setAutoActive(false);
        rafRef.current = null;
        return;
      }

      if (!lastTsRef.current) lastTsRef.current = ts;
      const dtMs = ts - lastTsRef.current;
      lastTsRef.current = ts;

      // pixels per ms so that one line distance is covered in autoIntervalMs
      const pxPerMs = getLineHeightPx() / Math.max(20, Number(autoIntervalMs) || DEFAULTS.autoIntervalMs);
      const dy = pxPerMs * dtMs;

      const nextY = Math.min(window.scrollY + dy, maxScroll);
      window.scrollTo(0, nextY);

      if (nextY >= maxScroll - 1) {
        // reached end: stop and switch icon back to "play"
        setAutoActive(false);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(stepRef.current);
    };
  }, [autoActive, autoIntervalMs, getLineHeightPx]);

  useEffect(() => {
    if (autoActive && !rafRef.current && stepRef.current) {
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(stepRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [autoActive]);

  const toggleAutoScroll = () => {
    setAutoActive((prev) => {
      const next = !prev;
      if (next && !rafRef.current && stepRef.current) {
        lastTsRef.current = 0;
        rafRef.current = requestAnimationFrame(stepRef.current);
      }
      return next;
    });
  };

  const renderWithKatex = (latex) => {
    try {
      return katex.renderToString(latex, { throwOnError: false, displayMode: true });
    } catch (err) {
      console.error("KaTeX error:", err);
      return latex;
    }
  };

  // pipeline for display lines
  const mixedExpanded = formattedText.flatMap((line) => expandLineMixed(line));
  const withHyphenated = mixedExpanded.flatMap((frag) =>
    frag.isSplitProduct ? [frag] : hyphenateLongWordsForLargeFont(frag.text, fontSize)
  );
  const displayLines = twoWordWrap(withHyphenated, fontSize);

  // Accessible colors for controls and border
  const pageBg = darkMode ? "#111111" : (bodyBgColor || "#e5e7eb");
  const leftBtnBgEff = normalizeBtnBg(btnBgLeft, pageBg, darkMode);
  const rightBtnBgEff = normalizeBtnBg(btnBgRight, pageBg, darkMode);
  const leftIconEff = iconOn(leftBtnBgEff);
  const rightIconEff = iconOn(rightBtnBgEff);
  const borderColorEff = borderForBg(pageBg);

  // Public logo path (robust across CRA/Vite)
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
  // ✅ actually persist and close
  onSaveSettings={() => { saveSettings(); setIsSettingsOpen(false); }}
  // ✅ reset, persist defaults, and close
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
/>


      {showFloatingButtons && (
        <div className="left-floating-buttons">
          {/* App Logo */}
          <img
            src={logoSrc}
            alt="MyMag logo"
            className="app-logo"
            title="MyMag"
            onError={(e) => {
              // fallback if PUBLIC_URL path fails
              if (e.currentTarget.src.endsWith("/mymag.png")) {
                e.currentTarget.src = "mymag.png";
              }
            }}
          />

          <button
            className="action-button"
            onClick={() => setShowInfoModal(true)}
            title="About MyMag"
            style={{ backgroundColor: leftBtnBgEff }}
          >
            <i className="fa-solid fa-info" style={{ color: leftIconEff }}></i>
          </button>

          {/* Dark mode quick toggle */}
          <button
            className="action-button"
            onClick={() => setDarkMode((v) => !v)}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{ backgroundColor: leftBtnBgEff }}
          >
            <i
              className={`fa-solid ${darkMode ? "fa-sun" : "fa-moon"}`}
              style={{ color: leftIconEff }}
            ></i>
          </button>

          {/* Auto-scroll toggle with icon change: play/pause */}
          {/* <button
            className="action-button"
            onClick={toggleAutoScroll}
            title={autoActive ? "Pause Auto Scroll" : "Start Auto Scroll"}
            style={{ backgroundColor: leftBtnBgEff }}
          >
            <i
              className={`fa-solid ${autoActive ? "fa-pause" : "fa-play"}`}
              style={{ color: leftIconEff }}
            ></i>
          </button> */}
        </div>
      )}

      {showFloatingButtons && (
        <div className="floating-buttons">
          <button
            className="action-button"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            title="Settings"
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i className="fa-solid fa-gear" style={{ color: rightIconEff }}></i>
          </button>
          <button
            className="action-button"
            onClick={handlePaste}
            title="Paste a text"
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i className="fa-solid fa-paste" style={{ color: rightIconEff }}></i>
          </button>
          <button
            className="action-button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Scroll to Top"
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i className="fa-solid fa-arrow-up" style={{ color: rightIconEff }}></i>
          </button>
          <button
            className="action-button"
            onClick={() => setText("")}
            title="Clear Text"
            style={{ backgroundColor: rightBtnBgEff }}
          >
            <i className="fa-solid fa-trash" style={{ color: rightIconEff }}></i>
          </button>
          <button
            className="action-button"
            onClick={() => setShowAsRTL(!showAsRTL)}
            title={showAsRTL ? "Switch to Left-to-Right" : "Switch to Right-to-Left"}
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
          overflowX: "auto",
          whiteSpace: "nowrap",
          width: "80%",
          border: showBorder ? `1px solid ${borderColorEff}` : "none",
        }}
      >
        {displayLines.map((item, lineIndex) => {
          const lineText = item.text;
          const isMath = lineText.trim().startsWith("\\[") && lineText.trim().endsWith("\\]");

          return (
            <div key={lineIndex} className="text-line">
              {isMath ? (
                <div
                  className="math-block"
                  dangerouslySetInnerHTML={{ __html: renderWithKatex(lineText.trim().slice(2, -2)) }}
                />
              ) : item.isLink ? (
                <div
                  className="text-row"
                  style={{
                    display: "flex",
                    flexDirection: showAsRTL ? "row-reverse" : "row",
                    justifyContent: showAsRTL ? "flex-end" : "flex-start",
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
                      whiteSpace: "nowrap",
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
                    flexDirection: showAsRTL ? "row-reverse" : "row",
                    justifyContent: showAsRTL ? "flex-end" : "flex-start",
                  }}
                >
                  {(showAsRTL ? lineText.split(/\s+/).filter(Boolean).reverse()
                              : lineText.split(/\s+/).filter(Boolean)
                  ).map((word, wordIndex) => (
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
                        marginRight: `${wordSpacing}px`,
                        whiteSpace: "nowrap",
                        direction: showAsRTL ? "rtl" : "ltr",
                        display: "inline-block",
                      }}
                    >
                      {word.split("").map((char, charIndex, arr) => {
                        let color = "inherit";
                        const mapped = letterColors[char];

                        if (item.isSplitProduct && item.splitKind !== "hyphenWord" && item.splitKind !== "twoWordWrap") {
                          color = mapped || "#6b7280"; // gray default for split lines; keep overrides
                        } else if (
                          item.isSplitProduct &&
                          item.splitKind === "hyphenWord" &&
                          item.hyphenAppended &&
                          char === "-" &&
                          charIndex === arr.length - 1
                        ) {
                          color = "#6b7280"; // gray hyphen only
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
            <button className="modal-close-x" onClick={() => setShowInfoModal(false)}>
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
