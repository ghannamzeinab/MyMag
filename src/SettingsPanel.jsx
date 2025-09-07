import React, { useMemo, useState } from "react";
import "./SettingsPanel.css";

// Two options only: Thin and Bold
const WEIGHT_OPTIONS = [
  { label: "Thin", value: 300 },
  { label: "Bold", value: 700 },
];

// Smart speed presets (ms per line)
const SPEED_PRESETS = [
  { key: "slow", label: "Slow", ms: 90000 },
  { key: "normal", label: "Normal (55,555 ms)", ms: 55555 },
  { key: "faster", label: "A bit faster", ms: 35000 },
  { key: "fast", label: "Fast", ms: 15000 },
];

const SettingsPanel = ({
  fontSize,
  setFontSize,
  wordSpacing,
  setWordSpacing,
  fontWeight,
  setFontWeight,
  letterColors,
  setLetterColors,
  setIsSettingsOpen,
  className,
  onSaveSettings,
  onResetDefaults,
  showAsRTL,
  setShowAsRTL,

  // customizations
  darkMode,
  setDarkMode,
  bodyBgColor,
  setBodyBgColor,
  // Button color props kept for backward compatibility (not exposed as controls here)
  btnBgLeft,
  setBtnBgLeft,
  btnBgRight,
  setBtnBgRight,
  showFloatingButtons,
  setShowFloatingButtons,
  autoIntervalMs,
  setAutoIntervalMs,
  showBorder,
  setShowBorder,
  showTextArea,
  setShowTextArea,
  showShadow,
  setShowShadow,
}) => {
  const [newChar, setNewChar] = useState("");
  const [newColor, setNewColor] = useState("#000000");
  const [showFontWeightInfo, setShowFontWeightInfo] = useState(false);

  const handleAddConfusingChar = () => {
    if (newChar && newColor) {
      setLetterColors((prev) => ({ ...prev, [newChar]: newColor }));
      setNewChar("");
      setNewColor("#000000");
    }
  };

  const activeSpeedKey = useMemo(() => {
    const list = SPEED_PRESETS;
    let best = list[0].key;
    let bestDiff = Infinity;
    list.forEach((p) => {
      const d = Math.abs((autoIntervalMs ?? 0) - p.ms);
      if (d < bestDiff) {
        bestDiff = d;
        best = p.key;
      }
    });
    return best;
  }, [autoIntervalMs]);

  const handleSpeedChange = (key) => {
    const found = SPEED_PRESETS.find((p) => p.key === key);
    if (found) setAutoIntervalMs(found.ms);
  };

  return (
    <div
      className={`settings-modal ${className}`}
      id="settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* Sticky close button */}
      <button
        className="settings-close-button"
        onClick={() => setIsSettingsOpen(false)}
        title="Close Settings"
        aria-label="Close settings"
      >
        <i className="fa-solid fa-xmark"></i>
      </button>

      {/* Title (H2 in this earlier working build) */}
      <h2 className="settings-title" id="settings-title">
        <i className="fa-solid fa-gear" aria-hidden="true"></i> Settings
      </h2>

      {/* Font Size slider */}
      <div className="settings-row settings-row-full">
        <label className="slider-label" htmlFor="fontSizeRange">
          Font Size: <span className="slider-value">{fontSize}px</span>
        </label>
        <input
          id="fontSizeRange"
          type="range"
          min={16}
          max={300}
          step={2}
          value={fontSize}
          onChange={(e) => setFontSize(parseInt(e.target.value) || 48)}
          aria-valuemin={16}
          aria-valuemax={300}
          aria-valuenow={fontSize}
        />
      </div>

      {/* Word Space slider */}
      <div className="settings-row settings-row-full">
        <label className="slider-label" htmlFor="wordSpaceRange">
          Word Space: <span className="slider-value">{wordSpacing}px</span>
        </label>
        <input
          id="wordSpaceRange"
          type="range"
          min={0}
          max={120}
          step={1}
          value={wordSpacing}
          onChange={(e) => setWordSpacing(parseInt(e.target.value) || 0)}
          aria-valuemin={0}
          aria-valuemax={120}
          aria-valuenow={wordSpacing}
        />
      </div>

      {/* Show/Hide character shadow */}
      <div className="settings-row">
        <label>Show Character Shadow:</label>
        <div className="toggle-wrap">
          <button
            className={`toggle-btn ${showShadow ? "active" : ""}`}
            onClick={() => setShowShadow((v) => !v)}
            aria-pressed={showShadow}
            title="Toggle yellow shadow behind characters"
          >
            {showShadow ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* Font weight radio pill buttons */}
      <div className="settings-row settings-row-full">
        <div className="label-wrapper">
          <label>Font Weight:</label>
          <button
            className="info-icon-button"
            title="Font Weight Info"
            onClick={() => setShowFontWeightInfo(true)}
            aria-label="Font weight info"
          >
            <i className="fa-solid fa-circle-info" aria-hidden="true"></i>
          </button>
        </div>
        <div className="weight-group" role="radiogroup" aria-label="Font weight">
          {WEIGHT_OPTIONS.map((opt) => {
            const id = `fw-${opt.value}`;
            return (
              <div className="weight-option" key={opt.value}>
                <input
                  id={id}
                  className="weight-input"
                  type="radio"
                  name="font-weight"
                  value={opt.value}
                  checked={fontWeight === opt.value}
                  onChange={() => setFontWeight(opt.value)}
                />
                <label className="weight-label" htmlFor={id}>
                  {opt.label}
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reading Direction */}
      <div className="settings-row">
        <label>Reading Direction:</label>
        <div className="toggle-wrap">
          <button
            className="toggle-btn"
            onClick={() => setShowAsRTL(!showAsRTL)}
            title="Toggle Right-to-Left"
            aria-pressed={showAsRTL}
          >
            {showAsRTL ? "RTL" : "LTR"}
          </button>
        </div>
      </div>

      {/* Dark mode */}
      <div className="settings-row">
        <label>Dark Mode:</label>
        <div className="toggle-wrap">
          <button
            className={`toggle-btn ${darkMode ? "active" : ""}`}
            onClick={() => setDarkMode(!darkMode)}
            aria-pressed={darkMode}
            title="Toggle dark mode"
          >
            {darkMode ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* Page background */}
      <div className="settings-row">
        <label>Page Background:</label>
        <input
          type="color"
          value={bodyBgColor}
          onChange={(e) => setBodyBgColor(e.target.value)}
          title="Background color of the page"
        />
      </div>

      {/* Display border toggle */}
      <div className="settings-row">
        <label>Display Border:</label>
        <div className="toggle-wrap">
          <button
            className="toggle-btn"
            onClick={() => setShowBorder((v) => !v)}
            aria-pressed={showBorder}
            title="Show/Hide display border"
          >
            {showBorder ? "Shown" : "Hidden"}
          </button>
        </div>
      </div>

      {/* Text area toggle */}
      <div className="settings-row">
        <label>Text Area:</label>
        <div className="toggle-wrap">
          <button
            className="toggle-btn"
            onClick={() => setShowTextArea((v) => !v)}
            aria-pressed={showTextArea}
            title="Show/Hide text input"
          >
            {showTextArea ? "Shown" : "Hidden"}
          </button>
        </div>
      </div>

      {/* Auto-scroll speed presets (ms per line) */}
      <div className="settings-row settings-row-full">
        <div className="label-wrapper">
          <label>Auto-scroll speed (ms per line — higher = slower):</label>
        </div>
        <div className="weight-group" role="radiogroup" aria-label="Auto-scroll speed">
          {SPEED_PRESETS.map((p) => {
            const id = `speed-${p.key}`;
            const checked = activeSpeedKey === p.key;
            return (
              <div className="weight-option" key={p.key}>
                <input
                  id={id}
                  className="weight-input"
                  type="radio"
                  name="auto-speed"
                  value={p.key}
                  checked={checked}
                  onChange={() => handleSpeedChange(p.key)}
                />
                <label className="weight-label" htmlFor={id}>
                  {p.label}
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confusing Characters */}
      <p className="section-label">Confusing Characters:</p>
      <div className="confusing-input-row">
        <label htmlFor="char-input">Char:</label>
        <input
          id="char-input"
          className="char-input"
          maxLength={1}
          value={newChar}
          onChange={(e) => setNewChar(e.target.value)}
          aria-describedby="char-help"
          style={{ width: "50%" }}
        />
        <span id="char-help" className="sr-only">
          Type a single character
        </span>
        <label htmlFor="color-input">Color:</label>
        <input
          id="color-input"
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
        />
        <button className="add-color-btn" onClick={handleAddConfusingChar}>
          Add
        </button>
      </div>

      <ul className="confusing-list inline-bullets" aria-label="Colored characters list">
        {Object.entries(letterColors).map(([char, color]) => (
          <li key={char} style={{ color }}>{`${char}`}</li>
        ))}
      </ul>

      {/* Actions */}
      <div className="settings-actions">
        <button
          className="save-btn"
          onClick={() => {
            onSaveSettings && onSaveSettings();
            setIsSettingsOpen(false); // close after save
          }}
          title="Save settings to local storage"
        >
          <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i>{" "}
          Save the settings to your browser local storage
        </button>

        <button
          className="reset-btn"
          onClick={() => {
            onResetDefaults && onResetDefaults();
          }}
          title="Clear saved settings and restore defaults"
        >
          <i className="fa-solid fa-rotate-left" aria-hidden="true"></i>{" "}
          Reset to defaults (clear local storage)
        </button>
      </div>

      {showFontWeightInfo && (
        <div className="modal-overlay" onClick={() => setShowFontWeightInfo(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-x"
              onClick={() => setShowFontWeightInfo(false)}
              aria-label="Close font weight info"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
            <h2>
              <i className="fa-solid fa-weight-hanging" aria-hidden="true"></i> Font Weight Info
            </h2>
            <p>
              300 – Thin<br />
              700 – Bold<br />
              (Other weights are disabled)
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
