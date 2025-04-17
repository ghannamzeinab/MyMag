import React, { useState, useEffect, useRef } from "react";
import "./mymag.css";
import SettingsPanel from "./SettingsPanel";

const Mymag = () => {
  const [text, setText] = useState("");

  const containerRef = useRef(null);
  const [wordsPerRow, setWordsPerRow] = useState(5);
  const [fontSize, setFontSize] = useState(90); 
  const [wordSpacing, setWordSpacing] = useState(25);  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [fontWeight, setFontWeight] = useState(500);  

  const [letterColors, setLetterColors] = useState({
    m: "#0057E9", M: "#0057E9",
    n: "#699953", N: "#699953",
    r: "#de7c00", Q: "#E11845",
    l: "#FF00BD", w: "#E11845", W: "#E11845",
  });

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

const handleScrollToTop = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

  const handleClearText = () => {
  setText("");
  };

const handleShowInfo = () => {
  alert(
    "📘 About MyMag\n\n" +
    "MyMag is an easy-to-use tool to help people with vision impairment read quicker!\n" +
    "This is particularly useful when a large text has to be read.\n\n" +
    "🧘‍♀️ Lay back, smile and enjoy reading!\n\n\n" +
    "👤 About the Author:\n" +
    "Zeinab Ghannam\n\n" +
    "🔗 LinkedIn: linkedin.com/in/zeinabghannam\n" +
    "🔗 GitHub: github.com/ghannamzeinab"
  );
};

  
  const handleAutoScroll = () => {
  window.scrollBy({ top: 500, behavior: "smooth" }); // scrolls down 500px
};

  
  return (
    <div className="container" ref={containerRef}>
      <button className="settings-button" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
        <span
          className="icon"
          style={{
            color: "#000",
            position: "absolute",
            top: "10px",
            right: "10px",
            fontSize: "50px"
          }}
        >
          ⚙️
        </span>
      </button>

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
/>

      <div className="left-floating-buttons">
  <button className="action-button" onClick={handleShowInfo}>ℹ️ </button>
  <button className="action-button" onClick={handleAutoScroll}>⬇️ </button>
</div>

 <div className="floating-buttons">
  <button className="action-button" onClick={handlePaste}>📋 </button>
        <button className="action-button" onClick={handleScrollToTop}>🔝 </button>
        <button className="action-button" onClick={handleClearText}>🗑️ </button>
</div>


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
                <span
                  key={wordIndex}
                  className="text-word"
                  style={{
                     fontFamily: "Tahoma, sans-serif",
                    fontSize: `${fontSize}px`,
                    fontWeight: fontWeight,
                    letterSpacing: "3px",
                    textShadow: "2px 2px 3px yellow",
                    marginRight: `${wordSpacing}px`,  
                    whiteSpace: "nowrap"
                  }}
                >
                  {word.split("").map((char, charIndex) => (
                    <span key={charIndex} style={{ color: letterColors[char] || "inherit" }}>
                      {char}
                    </span>
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
