(() => {
  const radios = document.querySelectorAll('input[name="mode"]');

  function normalizeMode(mode) {
    if (mode === "off" || mode === "show" || mode === "highlight") {
      return mode;
    }
    return "highlight";
  }

  function apply(mode) {
    const v = normalizeMode(mode);
    chrome.storage.local.set({ mode: v }, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          return;
        }
        const tab = tabs[0];
        if (!tab || typeof tab.id !== "number") {
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "itr-mode", mode: v }, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            return;
          }
        });
      });
    });
  }

  function setSelected(mode) {
    let i = 0;
    const n = radios.length;
    while (i < n) {
      const r = radios[i];
      r.checked = r.value === mode;
      i += 1;
    }
  }

  chrome.storage.local.get({ mode: "highlight" }, (res) => {
    const mode = normalizeMode(res && res.mode ? res.mode : "highlight");
    setSelected(mode);
  });

  let i = 0;
  const n = radios.length;
  while (i < n) {
    const r = radios[i];
    r.addEventListener("change", () => {
      if (!r.checked) {
        return;
      }
      apply(r.value);
    });
    i += 1;
  }
})();
