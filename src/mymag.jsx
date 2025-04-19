import React, { useState, useEffect, useRef } from "react";
import "./mymag.css";
import SettingsPanel from "./SettingsPanel";

const Mymag = () => {
  const [showInfoModal, setShowInfoModal] = useState(false);

  const [text, setText] = useState("");
  const containerRef = useRef(null);
  const [wordsPerRow, setWordsPerRow] = useState(5);
  const [fontSize, setFontSize] = useState(90);
  const [wordSpacing, setWordSpacing] = useState(25);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fontWeight, setFontWeight] = useState(600);
  const [showAsRTL, setShowAsRTL] = useState(false);

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

 

  const handleAutoScroll = () => {
    window.scrollBy({ top: 500, behavior: "smooth" });
  };

  /* global html2pdf */

const handleDownloadPDF = () => {
  const element = document.getElementById("printable-text");

  if (!element) return;

  setTimeout(() => {
    const opt = {
      margin: 0,
      filename: "mymag-output.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true, // if external fonts/images used
        logging: true
      },
      jsPDF: { unit: "px", format: "a4", orientation: "portrait" }
    };

    html2pdf().set(opt).from(element).save();
  }, 100); // wait 100ms to ensure layout is ready
};



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
        setIsSettingsOpen = { setIsSettingsOpen }
      />

    <div className="left-floating-buttons">
  <button
  className="action-button"
  onClick={() => setShowInfoModal(true)}
  title="About MyMag"
>
  <i className="fa-solid fa-info"></i>
</button>

  <button className="action-button" onClick={handleAutoScroll} title="Auto Scroll Down">
    <i className="fa-solid fa-arrow-down"></i>
        </button>
        
         {/* <button
    className="action-button"
    onClick={handleDownloadPDF}
    title="Download Output as PDF"
  >
    <i className="fa-solid fa-download"></i>
        </button> */}
        
</div>

<div className="floating-buttons">
  {/* Settings */}
  <button
    className="action-button"
    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
    title="Settings"
  >
    <i className="fa-solid fa-gear"></i>
  </button>

  {/* Paste from clipboard */}
  <button
    className="action-button"
    onClick={handlePaste}
    title="Paste a text"
  >
    <i className="fa-solid fa-paste"></i>
  </button>

  {/* Scroll to top */}
  <button
    className="action-button"
    onClick={handleScrollToTop}
    title="Scroll to Top"
  >
    <i className="fa-solid fa-arrow-up"></i>
  </button>

  {/* Clear text */}
  <button
    className="action-button"
    onClick={handleClearText}
    title="Clear Text"
  >
    <i className="fa-solid fa-trash"></i>
  </button>

  {/* Toggle RTL/LTR */}
  <button
    className="action-button"
    onClick={() => setShowAsRTL(!showAsRTL)}
    title={showAsRTL ? "Switch to Left-to-Right" : "Switch to Right-to-Left"}
  >
    <i className={`fa-solid ${showAsRTL ? "fa-repeat" : "fa-right-left"}`}></i>
  </button>
</div>




      <textarea
        className="text-input"
        placeholder="Paste your text here..."
        value={text}
        onChange={handleChange}
        dir={showAsRTL ? "rtl" : "ltr"}
      />

      <div
        id="printable-text"
        className="text-output"
        style={{
          direction: showAsRTL ? "rtl" : "ltr",
          textAlign: showAsRTL ? "right" : "left",
          overflowX: "auto",
          whiteSpace: "nowrap",
        }}
      >
        {formattedText.map((line, lineIndex) => (
          <div key={lineIndex} className="text-line">
            <div
              className="text-row"
              style={{
                display: "flex",
                flexDirection: showAsRTL ? "row-reverse" : "row",
                justifyContent: showAsRTL ? "flex-end" : "flex-start",
              }}
            >
              {(showAsRTL ? line.split(" ").reverse() : line.split(" ")).map((word, wordIndex) => (
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
                    whiteSpace: "nowrap",
                    direction: showAsRTL ? "rtl" : "ltr",
                    display: "inline-block"
                  }}
                >
                  {showAsRTL ? (
                    <span style={{ color: "inherit" }}>{word}</span>
                  ) : (
                    word.split("").map((char, charIndex) => (
                      <span key={charIndex} style={{ color: letterColors[char] || "inherit" }}>
                        {char}
                      </span>
                    ))
                  )}
                </span>
              ))}
            </div>
            <div className="line-break"></div>
          </div>
        ))}
      </div>
      {showInfoModal && (
  <div className="modal-overlay" onClick={() => setShowInfoModal(false)}>
          <div
            
      className="modal-content"
      onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside
          >
            <button className="modal-close-x" onClick={() => setShowInfoModal(false)}>
  <i className="fa-solid fa-xmark"></i>
</button>
      <h2><i className="fa-solid fa-book-open"></i> About <strong>MyMag</strong></h2>
      <p>
        <i className="fa-solid fa-glasses"></i> MyMag is an easy-to-use tool to help people with vision impairment read quicker!
        <br /><br />
        This is particularly useful when a large text has to be read.
        <br /><br />
        <i className="fa-solid fa-face-smile"></i> Lay back, smile and enjoy reading!
        <br /><br />
        <i className="fa-solid fa-user"></i> About the Author:
        Zeinab Ghannam
        <br /><br />
        
        <i className="fa-brands fa-linkedin"></i> LinkedIn: <a href="https://linkedin.com/in/zeinabghannam" target="_blank" rel="noopener noreferrer">
  linkedin.com/in/zeinabghannam
</a><br />
        <i className="fa-brands fa-github"></i> Source Code: <a href="https://github.com/ghannamzeinab" target="_blank" rel="noopener noreferrer">
  github.com/ghannamzeinab
</a>
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
