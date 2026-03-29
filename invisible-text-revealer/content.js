(() => {
  const MARK = "data-invisible-text-revealed";
  const ORIG_STYLE = "data-itr-orig-style";
  const ORIG_HAS_STYLE = "data-itr-orig-has-style";
  const BANNED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "META", "LINK", "HEAD"]);
  let mode = "";
  let observing = false;

  function normalizeMode(v) {
    if (v === "off" || v === "show" || v === "highlight") {
      return v;
    }
    return "highlight";
  }

  function alphaFromColor(color) {
    if (!color) {
      return 1;
    }
    const c = color.trim().toLowerCase();
    if (c === "transparent") {
      return 0;
    }
    const m = c.match(/^rgba\(([^)]+)\)$/);
    if (!m) {
      return 1;
    }
    const parts = m[1].split(",");
    if (parts.length !== 4) {
      return 1;
    }
    const a = parseFloat(parts[3]);
    if (!Number.isFinite(a)) {
      return 1;
    }
    return a;
  }

  function normText(s) {
    if (!s) {
      return "";
    }
    return s.replace(/\s+/g, " ").trim();
  }

  function extractOwnText(el) {
    if (BANNED_TAGS.has(el.tagName)) {
      return "";
    }
    let out = "";
    let i = 0;
    const nodes = el.childNodes;
    const ln = nodes.length;
    while (i < ln) {
      const n = nodes[i];
      if (n.nodeType === Node.TEXT_NODE) {
        const t = n.textContent;
        if (t) {
          out += t;
        }
      }
      i += 1;
    }
    return normText(out);
  }

  function classTextHint(el) {
    let cls = "";
    if (typeof el.className === "string") {
      cls = el.className.toLowerCase();
    }
    if (!cls) {
      return false;
    }
    if (cls.includes("copy-inject")) {
      return true;
    }
    if (cls.includes("invisible")) {
      return true;
    }
    if (cls.includes("hidden-text")) {
      return true;
    }
    if (cls.includes("sr-only")) {
      return true;
    }
    return false;
  }

  function isOffscreen(cs) {
    if (cs.position !== "absolute" && cs.position !== "fixed") {
      return false;
    }

    const left = parseFloat(cs.left);
    const right = parseFloat(cs.right);
    const top = parseFloat(cs.top);
    const bottom = parseFloat(cs.bottom);

    if (Number.isFinite(left) && left <= -500) {
      return true;
    }
    if (Number.isFinite(right) && right <= -500) {
      return true;
    }
    if (Number.isFinite(top) && top <= -500) {
      return true;
    }
    if (Number.isFinite(bottom) && bottom <= -500) {
      return true;
    }

    return false;
  }

  function isHiddenOverflow(v) {
    if (!v) {
      return false;
    }
    const x = v.toLowerCase();
    if (x === "hidden") {
      return true;
    }
    if (x === "clip") {
      return true;
    }
    return false;
  }

  function hiddenReason(el, cs) {
    if (el.tagName === "SUB" || el.tagName === "SUP") {
      return null;
    }

    const opacity = parseFloat(cs.opacity);
    const fontSize = parseFloat(cs.fontSize);
    const lineHeight = parseFloat(cs.lineHeight);
    const textIndent = parseFloat(cs.textIndent);
    const height = parseFloat(cs.height);
    const maxHeight = parseFloat(cs.maxHeight);
    const width = parseFloat(cs.width);
    const maxWidth = parseFloat(cs.maxWidth);
    const colorAlpha = alphaFromColor(cs.color || "");
    const fillAlpha = alphaFromColor(cs.webkitTextFillColor || "");
    const inlineStyle = (el.getAttribute("style") || "").toLowerCase();
    const offscreen = isOffscreen(cs);
    const clipY = isHiddenOverflow(cs.overflowY) || isHiddenOverflow(cs.overflow);
    const clipX = isHiddenOverflow(cs.overflowX) || isHiddenOverflow(cs.overflow);
    const rectCount = el.getClientRects().length;
    const sizeCollapsedY = (Number.isFinite(height) && height <= 0.5) || (Number.isFinite(maxHeight) && maxHeight <= 0.5);
    const sizeCollapsedX = (Number.isFinite(width) && width <= 0.5) || (Number.isFinite(maxWidth) && maxWidth <= 0.5);
    const sizeCollapseHint = (sizeCollapsedY && (clipY || rectCount === 0)) || (sizeCollapsedX && (clipX || rectCount === 0));

    const ownText = extractOwnText(el);
    let text = ownText;
    const hint = classTextHint(el);
    if (!text && (hint || sizeCollapseHint)) {
      text = normText(el.textContent || "");
    }
    if (!text) {
      return null;
    }
    if (text.length > 8000 && !hint) {
      return null;
    }

    if (cs.display === "none") {
      return "display-none";
    }
    if (cs.visibility === "hidden" || cs.visibility === "collapse") {
      return "visibility-hidden";
    }
    if (Number.isFinite(opacity) && opacity <= 0.05) {
      return "opacity-zero";
    }
    if (Number.isFinite(fontSize) && fontSize < 1) {
      return "font-size-zero";
    }
    if (Number.isFinite(lineHeight) && lineHeight === 0) {
      if ((Number.isFinite(fontSize) && fontSize <= 1) || rectCount === 0) {
        return "line-height-zero";
      }
    }
    if (Number.isFinite(height) && height <= 0.5 && (clipY || rectCount === 0)) {
      return "height-zero";
    }
    if (Number.isFinite(maxHeight) && maxHeight <= 0.5 && (clipY || rectCount === 0)) {
      return "max-height-zero";
    }
    if (Number.isFinite(width) && width <= 0.5 && (clipX || rectCount === 0)) {
      return "width-zero";
    }
    if (Number.isFinite(maxWidth) && maxWidth <= 0.5 && (clipX || rectCount === 0)) {
      return "max-width-zero";
    }
    if (Number.isFinite(textIndent) && textIndent <= -500) {
      return "text-indent-hide";
    }

    const clipPath = (cs.clipPath || "").trim().toLowerCase();
    if (clipPath && clipPath !== "none") {
      if (clipPath.includes("inset(50%") || clipPath.includes("circle(0") || clipPath.includes("polygon(0 0, 0 0, 0 0")) {
        return "clipped";
      }
    }

    const clip = (cs.clip || "").trim().toLowerCase();
    if (clip && clip !== "auto" && clip !== "rect(auto, auto, auto, auto)") {
      return "clipped";
    }

    const transform = (cs.transform || "").toLowerCase();
    if (transform.includes("scale(0") || transform.includes("scalex(0") || transform.includes("scaley(0") || transform.includes("matrix(0")) {
      return "scaled-zero";
    }

    if (offscreen) {
      return "offscreen";
    }

    const transparentInline = inlineStyle.includes("color:transparent")
      || inlineStyle.includes("color: transparent")
      || inlineStyle.includes("-webkit-text-fill-color:transparent")
      || inlineStyle.includes("-webkit-text-fill-color: transparent");
    if (transparentInline) {
      return "transparent-inline";
    }

    if (hint) {
      if ((Number.isFinite(fontSize) && fontSize <= 1) || (Number.isFinite(lineHeight) && lineHeight <= 1)) {
        return "inject-hidden";
      }
      if (colorAlpha <= 0.05 || fillAlpha <= 0.05) {
        return "inject-hidden";
      }
    }

    if (colorAlpha <= 0.03 || fillAlpha <= 0.03) {
      if ((Number.isFinite(fontSize) && fontSize <= 1) || (Number.isFinite(opacity) && opacity <= 0.7)) {
        return "transparent-text";
      }
    }

    return null;
  }

  function ensureOriginalStyle(el) {
    if (el.hasAttribute(MARK)) {
      return;
    }
    const orig = el.getAttribute("style");
    if (orig === null) {
      el.setAttribute(ORIG_HAS_STYLE, "0");
      el.setAttribute(ORIG_STYLE, "");
      return;
    }
    el.setAttribute(ORIG_HAS_STYLE, "1");
    el.setAttribute(ORIG_STYLE, orig);
  }

  function applyHighlightStyle(el, on) {
    if (on) {
      el.style.setProperty("background", "#ff4d4f", "important");
      el.style.setProperty("outline", "2px solid #8b0000", "important");
      el.style.setProperty("border-radius", "2px", "important");
      el.style.setProperty("padding", "1px 2px", "important");
      return;
    }
    el.style.removeProperty("background");
    el.style.removeProperty("outline");
    el.style.removeProperty("border-radius");
    el.style.removeProperty("padding");
  }

  function reveal(el, cs, reason) {
    ensureOriginalStyle(el);

    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("visibility", "visible", "important");

    if (reason === "display-none") {
      el.style.setProperty("display", "inline-block", "important");
    }

    if (reason === "offscreen" || isOffscreen(cs)) {
      el.style.setProperty("position", "static", "important");
      el.style.setProperty("left", "auto", "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("top", "auto", "important");
      el.style.setProperty("bottom", "auto", "important");
      el.style.setProperty("transform", "none", "important");
    }

    if (reason === "height-zero" || reason === "max-height-zero") {
      el.style.setProperty("height", "auto", "important");
      el.style.setProperty("max-height", "none", "important");
      el.style.setProperty("overflow", "visible", "important");
      el.style.setProperty("overflow-y", "visible", "important");
    }

    if (reason === "width-zero" || reason === "max-width-zero") {
      el.style.setProperty("width", "auto", "important");
      el.style.setProperty("max-width", "none", "important");
      el.style.setProperty("overflow", "visible", "important");
      el.style.setProperty("overflow-x", "visible", "important");
    }

    const fs = parseFloat(cs.fontSize);
    if (!Number.isFinite(fs) || fs < 12) {
      el.style.setProperty("font-size", "16px", "important");
    }

    el.style.setProperty("line-height", "1.4", "important");
    el.style.setProperty("text-indent", "0", "important");
    el.style.setProperty("clip", "auto", "important");
    el.style.setProperty("clip-path", "none", "important");

    if (alphaFromColor(cs.color) <= 0.2 || cs.color === "transparent") {
      el.style.setProperty("color", "#111", "important");
      el.style.setProperty("-webkit-text-fill-color", "#111", "important");
    }

    applyHighlightStyle(el, mode === "highlight");
    el.setAttribute(MARK, "1");
  }

  function clearReveal(el) {
    if (!el.hasAttribute(MARK)) {
      return;
    }
    const hadStyle = el.getAttribute(ORIG_HAS_STYLE);
    const origStyle = el.getAttribute(ORIG_STYLE);
    if (hadStyle === "1") {
      if (origStyle === null) {
        el.removeAttribute("style");
      } else {
        el.setAttribute("style", origStyle);
      }
    } else {
      el.removeAttribute("style");
    }
    el.removeAttribute(MARK);
    el.removeAttribute(ORIG_STYLE);
    el.removeAttribute(ORIG_HAS_STYLE);
  }

  function clearAllReveals() {
    const nodes = document.querySelectorAll("[" + MARK + "]");
    let i = 0;
    const n = nodes.length;
    while (i < n) {
      clearReveal(nodes[i]);
      i += 1;
    }
  }

  function refreshMarkedPresentation() {
    if (mode === "off") {
      return;
    }
    const nodes = document.querySelectorAll("[" + MARK + "]");
    let i = 0;
    const n = nodes.length;
    while (i < n) {
      applyHighlightStyle(nodes[i], mode === "highlight");
      i += 1;
    }
  }

  function processElement(el) {
    if (!(el instanceof Element)) {
      return;
    }
    if (mode === "off") {
      return;
    }

    const cs = getComputedStyle(el);
    const reason = hiddenReason(el, cs);
    if (!reason) {
      return;
    }

    reveal(el, cs, reason);
  }

  function scanNode(root) {
    if (!root) {
      return;
    }
    if (mode === "off") {
      return;
    }

    if (root instanceof Element) {
      processElement(root);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let cur = walker.nextNode();
    while (cur) {
      processElement(cur);
      if (cur.shadowRoot) {
        scanNode(cur.shadowRoot);
      }
      cur = walker.nextNode();
    }
  }

  let scheduled = false;
  function scheduleScan() {
    if (mode === "off") {
      return;
    }
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanNode(document.documentElement);
    });
  }

  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  function startObserver() {
    if (observing) {
      return;
    }
    if (!document.documentElement) {
      return;
    }
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
      attributeFilter: ["style", "class", "hidden", "aria-hidden"]
    });
    observing = true;
  }

  function stopObserver() {
    if (!observing) {
      return;
    }
    observer.disconnect();
    observing = false;
  }

  function applyMode(nextMode) {
    const m = normalizeMode(nextMode);
    mode = m;
    if (mode === "off") {
      stopObserver();
      clearAllReveals();
      return;
    }
    startObserver();
    refreshMarkedPresentation();
    scheduleScan();
  }

  function initMode() {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      applyMode("highlight");
      return;
    }

    chrome.storage.local.get({ mode: "highlight" }, (res) => {
      const v = normalizeMode(res && res.mode ? res.mode : "highlight");
      applyMode(v);
    });
  }

  function start() {
    if (!document.documentElement) {
      return;
    }
    initMode();
  }

  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") {
        return;
      }
      if (!changes.mode) {
        return;
      }
      applyMode(changes.mode.newValue);
    });
  }

  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== "itr-mode") {
        return;
      }
      applyMode(msg.mode);
      sendResponse({ ok: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
