/* Firefox only.
   Firefox reserves Ctrl+M for "mute tab", and an extension shortcut that
   clashes with a built-in one is never delivered. So Ctrl+M is caught here,
   inside the page, before Firefox acts on it. */
document.addEventListener(
  "keydown",
  (e) => {
    if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    if (e.code !== "KeyM" && e.key !== "m" && e.key !== "M") return;
    e.preventDefault();
    e.stopPropagation();

    let text = "";
    try { text = String(window.getSelection()); } catch (err) {}
    if (!text) {
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
        try { text = el.value.substring(el.selectionStart, el.selectionEnd); } catch (err) {}
      }
    }
    browser.runtime.sendMessage({ type: "mymag-open", text });
  },
  true
);
