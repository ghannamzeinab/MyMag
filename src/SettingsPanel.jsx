import React, { useState } from "react";
import "./SettingsPanel.css";

const SettingsPanel = ({
  fontSize,
  setFontSize,
  wordSpacing,
  setWordSpacing,
  fontWeight,
  setFontWeight,
  letterColors,
  setLetterColors,
  className
}) => {
  const [newChar, setNewChar] = useState("");
  const [newColor, setNewColor] = useState("#000000");

  const handleAddConfusingChar = () => {
    if (newChar && newColor) {
      setLetterColors(prev => ({ ...prev, [newChar]: newColor }));
      setNewChar("");
      setNewColor("#000000");
    }
  };

  return (
      <div className={`settings-modal ${className}`}>
      <div className="settings-row">
  <label>Font Size:</label>
  <input
    type="number"
    value={fontSize}
    onChange={(e) => setFontSize(parseInt(e.target.value) || 80)}
  />
</div>

<div className="settings-row">
  <label>Font Weight:</label>
  <input
    type="number"
    value={fontWeight}
    onChange={(e) => setFontWeight(parseInt(e.target.value) || 800)}
  />
</div>

<div className="settings-row">
  <label>Word Space:</label>
  <input
    type="number"
    value={wordSpacing}
    onChange={(e) => setWordSpacing(parseInt(e.target.value) || 0)}
  />
</div>

<p>Confusing Characters:</p>
<div className="confusing-input-row">
  <label>Char:</label>
  <input
    maxLength={1}
    value={newChar}
    onChange={(e) => setNewChar(e.target.value)}
  />
  <label>Color:</label>
  <input
    type="color"
    value={newColor}
    onChange={(e) => setNewColor(e.target.value)}
  />
  <button onClick={handleAddConfusingChar}>Add</button>
</div>

<ul className="confusing-list">
  {Object.entries(letterColors).map(([char, color]) => (
    <li key={char} style={{ color }}>{`${char}: ${color}`}</li>
  ))}
</ul>

    </div>
  );
};

export default SettingsPanel;
