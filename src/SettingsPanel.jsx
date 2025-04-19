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
  
   setIsSettingsOpen ,
  className
}) => {
  const [newChar, setNewChar] = useState("");
  const [newColor, setNewColor] = useState("#000000");

  const [showFontWeightInfo, setShowFontWeightInfo] = useState(false);

  const handleAddConfusingChar = () => {
    if (newChar && newColor) {
      setLetterColors(prev => ({ ...prev, [newChar]: newColor }));
      setNewChar("");
      setNewColor("#000000");
    }
  };

  return (
      <div className={`settings-modal ${className}`}>
       <button
    className="settings-close-button"
    onClick={() => setIsSettingsOpen(false)}
    title="Close Settings"
  >
    <i className="fa-solid fa-xmark"></i>
      </button>
      
      <div className="settings-row">
  <label>Font Size:</label>
  <input
    type="number"
    value={fontSize}
    onChange={(e) => setFontSize(parseInt(e.target.value) || 80)}
  />
</div>

      <div className="settings-row">
        
 <div className="label-wrapper">
  <label htmlFor="fontWeight">Font Weight:</label>
  <button
    className="info-icon-button"
    title="Font Weight Info"
    onClick={() => setShowFontWeightInfo(true)}
  >
    <i className="fa-solid fa-circle-info"></i>
  </button>
</div>

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
  <button className="add-color-btn" onClick={handleAddConfusingChar}>Add</button>
</div>

<ul className="confusing-list inline-bullets">
  {Object.entries(letterColors).map(([char, color]) => (
    <li key={char} style={{ color }}>{`${char}`}</li>
  ))}
</ul>

      {showFontWeightInfo && (
  <div className="modal-overlay" onClick={() => setShowFontWeightInfo(false)}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close-x" onClick={() => setShowFontWeightInfo(false)}>
        <i className="fa-solid fa-xmark"></i>
      </button>
      <h2><i className="fa-solid fa-weight-hanging"></i> Font Weight Info</h2>
      <p>
        100 – Thin<br />
        200 – Extra Light<br />
        300 – Light<br />
        400 – Regular (Normal)<br />
        500 – Medium<br />
        600 – Semi Bold<br />
        700 – Bold<br />
        800 – Extra Bold<br />
        900 – Black (Heavy)
      </p>
    </div>
  </div>
)}

    </div>
  );
};

export default SettingsPanel;
