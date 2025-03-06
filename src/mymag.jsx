import React, { useState, useEffect, useRef } from "react";
import "./mymag.css";

const Mymag = () => {
  const [text, setText] = useState("");
  const containerRef = useRef(null);
  const [wordsPerRow, setWordsPerRow] = useState(5);
  const [fontSize, setFontSize] = useState(75);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const letterColors = {
    m: " #0057E9",
     M: " #0057E9",
    n: " #699953",
    N: " #699953",
    r: " #de7c00",
    Q: "#E11845",
    l: " #FF00BD",
    w: "#E11845",
    W: "#E11845",
  };

  useEffect(() => {
    const updateWordsPerRow = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const averageWordWidth = 100;
        setWordsPerRow(Math.max(1, Math.floor(containerWidth / averageWordWidth)));
      }
    };

    updateWordsPerRow();
    window.addEventListener("resize", updateWordsPerRow);
    return () => window.removeEventListener("resize", updateWordsPerRow);
  }, []);

  const handleChange = (e) => {
    setText(e.target.value);
  };

  const formatText = (inputText) => {
    return inputText.split("\n").flatMap((line) => {
      if (line.length > 30) {
        if (line.includes("+")) {
          return line.split(/(\+)/).reduce((acc, part) => {
            if (acc.length === 0 || acc[acc.length - 1].length + part.length > 30) {
              acc.push(part);
            } else {
              acc[acc.length - 1] += part;
            }
            return acc;
          }, []);
        }
      }
      return [line];
    });
  };

  const formattedText = formatText(text);

  return (
    <div className="container" ref={containerRef}>
      <button className="settings-button" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
        <span className="icon" style={{ color: "#000" , position: "absolute", top: "10px", right: "10px", fontSize: "50px" }}>⚙️</span>
      </button>
      {isSettingsOpen && (
        <div className="settings-modal">
          <label>Font Size:</label>
          <input
            type="number"
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value) || 75)}
          />
          <p>Confusing Letters:</p>
          <ul>
            {Object.entries(letterColors).map(([char, color]) => (
              <li key={char} style={{ color }}>{`${char}: ${color}`}</li>
            ))}
          </ul>
        </div>
      )}
      <textarea
        className="text-input"
        placeholder="Paste your text here..."
        value={text}
        onChange={handleChange}
      />
      <div className="text-output">
        {formattedText.map((line, lineIndex) => (
          <div key={lineIndex} className="text-line">
            <div className="text-row">
              {line.split(" ").map((word, wordIndex) => (
                <span key={wordIndex} className="text-word" style={{ fontSize: `${fontSize}px`, fontWeight: "bold", letterSpacing: "3px", textShadow: "2px 2px 3px yellow", marginRight: "5px", whiteSpace: "nowrap" }}>
                  {word.split("").map((char, charIndex) => (
                    <span key={charIndex} style={{ color: letterColors[char] || "inherit" }}>{char}</span>
                  ))}
                </span>
              ))}
            </div>
            <div className="line-break"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Mymag;
