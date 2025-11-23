let ENTRIES = [];
const COOKIE_NAME = "learning_dict_data";
let headwordToEntry = {};
const tooltipLayers = [];
let tooltipHandlersInstalled = false;
let HEADWORD_LIST = [];

const MEANING_FILTER_WORDS = [
  { id: "a", label: "a." },
  { id: "bu", label: "bu." },
  { id: "cj", label: "cj." },
  { id: "e", label: "e." },
  { id: "hh", label: "hh." },
  { id: "i", label: "i." },
  { id: "k", label: "k." },
  { id: "p", label: "p." },
  { id: "q", label: "q." },
  { id: "r", label: "r." },
  { id: "sj", label: "sj." },
  { id: "y", label: "y." },
];

let meaningFilterSelected = new Set();
let translationFilterMode = "all";

function isUpperLike(word) {
  return /^[A-Z0-9]+$/.test(word);
}

function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = "expires=" + d.toUTCString();
  document.cookie =
    name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
}

function getCookie(name) {
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(";");
  const prefix = name + "=";
  for (let c of ca) {
    c = c.trim();
    if (c.indexOf(prefix) === 0) {
      return c.substring(prefix.length, c.length);
    }
  }
  return "";
}

function loadUserData() {
  try {
    // Prefer localStorage (larger storage, avoids cookie size limits)
    if (typeof localStorage !== "undefined") {
      try {
        const rawLocal = localStorage.getItem(COOKIE_NAME);
        if (rawLocal) {
          const data = tryDecompressOrJson(rawLocal);
          if (typeof data === "object" && data !== null) return data;
        }
      } catch (e) {
        // localStorage may be unavailable, fall through to cookie
      }
    }

    // Fallback to cookie for older data / compatibility. If cookie exists, migrate it to localStorage.
    const raw = getCookie(COOKIE_NAME);
    if (!raw) return {};
    const data = tryDecompressOrJson(raw);
    if (typeof data !== "object" || data === null) return {};

    // Attempt migration: save compressed representation into localStorage and delete cookie
    try {
      if (typeof localStorage !== "undefined") {
        const compressed = compressUserData(data);
        localStorage.setItem(COOKIE_NAME, compressed);
        deleteCookie(COOKIE_NAME);
      }
    } catch (e) {
      // ignore migration errors
    }

    return data;
  } catch {
    return {};
  }
}

function saveUserData(userData) {
  // Store in compressed form to avoid cookie size limits. Use localStorage only.
  try {
    const compressed = compressUserData(userData);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(COOKIE_NAME, compressed);
    }
  } catch (e) {
    // If localStorage fails, try to at least set a cookie as a last resort
    try {
      setCookie(COOKIE_NAME, JSON.stringify(userData), 365);
    } catch (_) {
      // give up silently
    }
  }
}

function deleteCookie(name) {
  try {
    document.cookie =
      name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax";
  } catch (e) {
    // ignore
  }
}

// Compress userData (object mapping ids to {translation}) into compact string.
// Format: "0:encoded|13:encoded|..." where numeric keys are entry indices (without leading 'e').
function compressUserData(userData) {
  const parts = [];
  for (const id of Object.keys(userData)) {
    const val = userData[id]?.translation;
    if (!val) continue;
    let key = id;
    const m = /^e(\d+)$/.exec(id);
    if (m) key = m[1];
    parts.push(`${key}:${encodeURIComponent(val)}`);
  }
  return parts.join("|");
}

// Try to decompress compressed format or parse JSON. Returns object mapping ids to {translation}.
function tryDecompressOrJson(raw) {
  if (!raw) return {};
  raw = String(raw);
  // Heuristic: if it looks like JSON object
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {}
  }

  // Otherwise parse compressed pairs
  const obj = {};
  const parts = raw.split("|");
  for (const p of parts) {
    if (!p) continue;
    const idx = p.indexOf(":");
    if (idx === -1) continue;
    const k = p.slice(0, idx);
    const v = p.slice(idx + 1);
    const decoded = decodeURIComponent(v);
    const id = /^\d+$/.test(k) ? `e${k}` : k;
    obj[id] = { translation: decoded };
  }
  return obj;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  const entries = [];
  let current = null;

  function unquote(s) {
    s = s.trim();
    if (s.startsWith('"') && s.endsWith('"')) {
      s = s.slice(1, -1).replace(/""/g, '"');
    }
    return s;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const idx = line.indexOf(",");
    if (idx === -1) continue;
    const wRaw = line.slice(0, idx);
    const dRaw = line.slice(idx + 1);
    const word = unquote(wRaw);
    const def = unquote(dRaw);
    if (word) {
      if (current) entries.push(current);
      current = { headword: word, meaning: def };
    } else if (current && def) {
      current.meaning += " " + def;
    }
  }
  if (current) entries.push(current);
  return entries.map((e, i) => ({
    id: "e" + i,
    headword: e.headword,
    meaning: e.meaning,
  }));
}

function computeReferences() {
  ENTRIES.forEach((entry) => {
    entry._refs = [];
    entry._tokenSet = new Set();
  });

  const SPECIAL_HEADWORDS = [
    "a",
    "bu",
    "cj",
    "e",
    "hh",
    "i",
    "k",
    "p",
    "q",
    "r",
    "sj",
    "y",
  ];

  const map = headwordToEntry;

  for (const A of ENTRIES) {
    if (!A.meaning) continue;

    const tokens = A.meaning.split(/\s+/);
    const tokenSet = new Set();

    for (const raw of tokens) {
      if (!raw) continue;

      const token = raw.replace(/^[^\w]+|[^\w]+$/g, "");
      if (!token) continue;

      const norm = token.toLowerCase();
      tokenSet.add(norm);

      const B = map[token];
      if (!B) continue;
      if (B === A) continue;
      if (SPECIAL_HEADWORDS.includes(B.headword)) continue;

      if (!B._refs.includes(A.headword)) {
        B._refs.push(A.headword);
      }
    }

    A._tokenSet = tokenSet;
  }
}

function renderMeaningHtml(text, translations) {
  if (!text) return "";

  const map = headwordToEntry;
  const parts = [];

  const tokens = text.split(/(\s+)/);

  for (const raw of tokens) {
    if (!raw) continue;

    if (/^\s+$/.test(raw)) {
      parts.push(escapeHtml(raw));
      continue;
    }

    const core = raw.replace(/^[^\w]+|[^\w]+$/g, "");
    if (!core) {
      parts.push(escapeHtml(raw));
      continue;
    }

    const entry = map[core];
    if (!entry) {
      parts.push(escapeHtml(raw));
      continue;
    }

    const hw = entry.headword;
    const translation = translations[hw] || "";
    const rtClass = translation ? "" : " ruby-empty";

    const escapedHw = escapeHtml(hw);
    const escapedRaw = escapeHtml(raw);
    const escapedTr = escapeHtml(translation);

    parts.push(
      `<span class="dict-word" data-headword="${escapedHw}">` +
        `<ruby>` +
        `<span class="base-word">${escapedRaw}</span>` +
        `<rt class="ruby-editable${rtClass}">${escapedTr}</rt>` +
        `</ruby>` +
        `</span>`
    );
  }

  return parts.join("");
}

function buildTable() {
  const tbody = document.getElementById("dict-body");
  tbody.innerHTML = "";
  const userData = loadUserData();
  computeReferences();

  ENTRIES.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.dataset.entryId = entry.id;

    const tdHead = document.createElement("td");
    tdHead.className = "headword";
    tdHead.textContent = entry.headword;
    tr.appendChild(tdHead);

    const tdTrans = document.createElement("td");
    const locked = isUpperLike(entry.headword);
    const stored = userData[entry.id];

    if (locked) {
      tdTrans.textContent = "—";
      tdTrans.classList.add("translation-locked");
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "translation-input";
      input.dataset.entryId = entry.id;
      input.dataset.headword = entry.headword;
      input.value = stored?.translation || "";
      input.addEventListener("change", () => {
        const data = loadUserData();
        if (!data[entry.id]) data[entry.id] = {};
        data[entry.id].translation = input.value;
        saveUserData(data);
        updateRubyForHeadword(entry.headword);
        applyFilter();
      });

      tdTrans.appendChild(input);
    }
    tr.appendChild(tdTrans);

    const tdMeaning = document.createElement("td");
    tdMeaning.className = "meaning-cell";
    tdMeaning.dataset.entryId = entry.id;
    tdMeaning.textContent = entry.meaning;
    tr.appendChild(tdMeaning);

    const tdRef = document.createElement("td");
    tdRef.className = "ref-list";
    tdRef.dataset.entryId = entry.id;
    tr.appendChild(tdRef);

    tbody.appendChild(tr);
  });

  renderReferences();

  requestAnimationFrame(() => {
    updateAllMeaningsFromInputs();
    applyFilter();
  });
}

function collectTranslationsFromInputs() {
  const inputs = document.querySelectorAll(".translation-input");
  const translations = {};
  inputs.forEach((input) => {
    const hw = input.dataset.headword;
    translations[hw] = input.value || "";
  });
  return translations;
}

function updateAllMeaningsFromInputs() {
  const translations = collectTranslationsFromInputs();
  ENTRIES.forEach((entry) => {
    const cell = document.querySelector(
      `.meaning-cell[data-entry-id="${entry.id}"]`
    );
    if (!cell) return;
    cell.innerHTML = renderMeaningHtml(entry.meaning, translations);
  });
  attachTooltipHandlers();
}

function updateRubyForHeadword(headword) {
  const translations = collectTranslationsFromInputs();
  const newRuby = translations[headword] || "";

  // data-headword="headword" を持つ単語だけを対象にする
  const selector = `.meaning-cell .dict-word[data-headword="${headword}"] rt.ruby-editable`;

  const rtNodes = document.querySelectorAll(selector);
  rtNodes.forEach((rt) => {
    rt.textContent = newRuby;

    if (newRuby) {
      rt.classList.remove("ruby-empty");
    } else {
      rt.classList.add("ruby-empty");
    }
  });
}

function renderReferences() {
  ENTRIES.forEach((entry) => {
    const cell = document.querySelector(
      `.ref-list[data-entry-id="${entry.id}"]`
    );
    if (!cell) return;
    cell.innerHTML = "";
    if (!entry._refs || entry._refs.length === 0) {
      cell.textContent = "-";
      return;
    }
    entry._refs.forEach((hw) => {
      const chip = document.createElement("span");
      chip.className = "ref-chip";
      chip.textContent = hw;

      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const headword = hw;
        const contextLevel = getLevelForElement(chip);
        const layerIndex = contextLevel;
        if (layerIndex >= tooltipLayers.length) return;
        hideTooltipFrom(layerIndex);
        showTooltip(layerIndex, chip, headword);
      });

      cell.appendChild(chip);
    });
  });
}

function applyFilter() {
  const selectedWords = meaningFilterSelected;
  const translationMode = translationFilterMode;
  const topMeaningText = (document.getElementById("meaning-search")?.value || "").trim().toLowerCase();

  ENTRIES.forEach((entry) => {
    const row = document.querySelector(`tr[data-entry-id="${entry.id}"]`);
    if (!row) return;

    let passMeaning = true;
    if (selectedWords.size > 0) {
      const tokenSet = entry._tokenSet || new Set();
      passMeaning = [...selectedWords].some((w) => tokenSet.has(w));
    }

    // top meaning text filter (partial match)
    if (passMeaning && topMeaningText) {
      const mv = (entry.meaning || "").toLowerCase();
      if (!mv.includes(topMeaningText)) passMeaning = false;
    }

    let passTranslation = true;
    if (translationMode !== "all") {
      const input = row.querySelector(".translation-input");
      const hasText = !!(input && input.value.trim());
      if (translationMode === "filled") {
        passTranslation = hasText;
      } else if (translationMode === "empty") {
        passTranslation = !hasText;
      }
    }

    row.style.display = passMeaning && passTranslation ? "" : "none";
  });
}

function handleFilterChange() {
  meaningFilterSelected = new Set(
    [...document.querySelectorAll(".filter-meaning-checkbox:checked")].map(
      (cb) => cb.dataset.word
    )
  );

  const radio = document.querySelector(
    'input[name="filter-translation"]:checked'
  );
  translationFilterMode = radio ? radio.value : "all";

  applyFilter();
}

function setupFilters() {
  const container = document.getElementById("filter-meaning-words");
  if (!container) return;

  MEANING_FILTER_WORDS.forEach((w) => {
    const label = document.createElement("label");
    label.className = "filter-chip";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "filter-meaning-checkbox";
    cb.dataset.word = w.id.toLowerCase();
    cb.addEventListener("change", handleFilterChange);

    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + w.label));
    container.appendChild(label);
  });

  document
    .querySelectorAll('input[name="filter-translation"]')
    .forEach((radio) => {
      radio.addEventListener("change", handleFilterChange);
    });
}

function initTooltipLayers() {
  tooltipLayers[0] = document.getElementById("tooltip-layer-0");
  tooltipLayers[1] = document.getElementById("tooltip-layer-1");
  tooltipLayers[2] = document.getElementById("tooltip-layer-2");
}

function hideTooltipFrom(level) {
  for (let i = level; i < tooltipLayers.length; i++) {
    const layer = tooltipLayers[i];
    if (!layer) continue;
    layer.classList.remove("visible");
    layer.innerHTML = "";
  }
}

function showTooltip(level, anchorEl, headword) {
  const layer = tooltipLayers[level];
  if (!layer) return;
  const entry = headwordToEntry[headword];
  const meaning = entry?.meaning || "";
  const headEsc = escapeHtml(headword);
  const translations = collectTranslationsFromInputs();
  const meaningHtml = renderMeaningHtml(meaning, translations);
  const translationText = translations[headword] || "";
  const transEsc = escapeHtml(translationText);

  layer.innerHTML =
    `<div class="tooltip-headword">${headEsc}</div>` +
    (translationText
      ? `<div class="tooltip-translation">${transEsc}</div>`
      : ``) +
    `<div class="tooltip-body">${meaningHtml}</div>`;
  layer.classList.add("visible");
  layer.style.left = "0px";
  layer.style.top = "0px";

  const margin = 8;
  let x, y;

  if (level === 0) {
    const anchorRect = anchorEl.getBoundingClientRect();
    const tipRect = layer.getBoundingClientRect();

    x = anchorRect.left;

    if (x + tipRect.width > window.innerWidth - margin) {
      x = window.innerWidth - tipRect.width - margin;
    }
    if (x < margin) x = margin;

    y = anchorRect.bottom + margin;

    if (y + tipRect.height > window.innerHeight - margin) {
      y = window.innerHeight - tipRect.height - margin;
      if (y < margin) y = margin;
    }
  } else {
    const prevLayer = tooltipLayers[level - 1];
    if (!prevLayer || !prevLayer.classList.contains("visible")) {
      return showTooltip(0, anchorEl, headword);
    }
    const prevRect = prevLayer.getBoundingClientRect();
    const tipRect = layer.getBoundingClientRect();
    const indentX = 16 * level;
    x = prevRect.left + indentX;
    if (x + tipRect.width > window.innerWidth - margin) {
      x = window.innerWidth - tipRect.width - margin;
    }
    if (x < margin) x = margin;
    y = prevRect.bottom + margin;
    if (y + tipRect.height > window.innerHeight - margin) {
      y = window.innerHeight - tipRect.height - margin;
      if (y < margin) y = margin;
    }
  }
  layer.style.left = x + "px";
  layer.style.top = y + "px";
}

function getLevelForElement(el) {
  if (el.closest("#tooltip-layer-2")) return 3;
  if (el.closest("#tooltip-layer-1")) return 2;
  if (el.closest("#tooltip-layer-0")) return 1;
  return 0;
}

function onDictWordClick(e) {
  const wordEl = e.target.closest(".dict-word");
  if (!wordEl) return;
  e.stopPropagation();

  const base = wordEl.querySelector(".base-word");
  const headword =
    wordEl.dataset.headword || (base ? base.textContent.trim() : "");
  if (!headword) return;

  const contextLevel = getLevelForElement(wordEl);
  const layerIndex = contextLevel;
  if (layerIndex >= tooltipLayers.length) return;
  hideTooltipFrom(layerIndex);
  showTooltip(layerIndex, wordEl, headword);
}

function onDocumentClickClose(e) {
  if (e.target.closest(".tooltip-box") || e.target.closest(".dict-word")) {
    return;
  }
  hideTooltipFrom(0);
}

function attachTooltipHandlers() {
  if (tooltipHandlersInstalled) return;
  tooltipHandlersInstalled = true;
  initTooltipLayers();
  document.addEventListener("click", onDictWordClick);
  document.addEventListener("click", onDocumentClickClose);
}

async function loadDictionary() {
  ENTRIES = parseCsv(window.DICTIONARY_CSV);

  headwordToEntry = {};
  ENTRIES.forEach((e) => (headwordToEntry[e.headword] = e));
  HEADWORD_LIST = ENTRIES.map((e) => e.headword).sort(
    (a, b) => b.length - a.length
  );

  buildTable();
  attachTooltipHandlers();
}

document.addEventListener("DOMContentLoaded", async () => {
  setupFilters();
  loadDictionary();
  setupSearch();
  // wire meaning-search box (under headword search)
  const meaningInput = document.getElementById("meaning-search");
  const meaningBtn = document.getElementById("meaning-search-button");
  const meaningClear = document.getElementById("meaning-clear-search");
  if (meaningInput) {
    function debounce(fn, wait) {
      let t = null;
      return function (...args) {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    }
    meaningInput.addEventListener("input", debounce(() => {
      applyFilter();
    }, 200));

    if (meaningBtn) {
      meaningBtn.addEventListener("click", (e) => {
        e.preventDefault();
        applyFilter();
      });
    }
    if (meaningClear) {
      meaningClear.addEventListener("click", (e) => {
        e.preventDefault();
        meaningInput.value = "";
        meaningInput.focus();
        applyFilter();
      });
    }
  }
});

function setupSearch() {
  const input = document.getElementById("global-search");
  const btn = document.getElementById("search-button");
  const clear = document.getElementById("clear-search");
  if (!input || !btn || !clear) return;

  // simple debounce helper to avoid excessive jumps while typing
  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const doSearch = () => {
    const q = input.value.trim();
    if (!q) return;
    jumpToHeadword(q);
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    doSearch();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  });

  // Auto-search as the user types (debounced)
  input.addEventListener("input", debounce(() => {
    const q = input.value.trim();
    if (!q) return;
    doSearch();
  }, 220));

  clear.addEventListener("click", (e) => {
    e.preventDefault();
    input.value = "";
    input.focus();
  });
}

function jumpToHeadword(query) {
  const q = query.trim().toLowerCase();
  if (!q) return;

  // exact match first
  const rows = Array.from(document.querySelectorAll("tr"));
  let target = rows.find((tr) => {
    const hw = tr.querySelector(".headword");
    return hw && hw.textContent.trim().toLowerCase() === q;
  });

  // fallback: startsWith
  if (!target) {
    target = rows.find((tr) => {
      const hw = tr.querySelector(".headword");
      return hw && hw.textContent.trim().toLowerCase().startsWith(q);
    });
  }

  // fallback: includes
  if (!target) {
    target = rows.find((tr) => {
      const hw = tr.querySelector(".headword");
      return hw && hw.textContent.trim().toLowerCase().includes(q);
    });
  }

  if (!target) {
    // optionally, flash input to indicate not found
    const input = document.getElementById("global-search");
    if (input) {
      input.classList.add("not-found");
      setTimeout(() => input.classList.remove("not-found"), 800);
    }
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.style.outline = "3px solid #f59e0b";
  setTimeout(() => {
    target.style.outline = "";
  }, 1600);
}

function downloadUserData() {
  const data = loadUserData();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "dictionary-translations.json";
  a.click();

  URL.revokeObjectURL(url);
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    downloadUserData();
  }
});

function importUserData(jsonText) {
  try {
    const obj = JSON.parse(jsonText);
    if (typeof obj !== "object" || obj === null) return alert("Invalid file.");
    saveUserData(obj);
    updateAllInputsFromUserData();
    updateAllMeaningsFromInputs();
    alert("Translations imported.");
  } catch (e) {
    alert("Failed to load JSON.");
  }
}

function updateAllInputsFromUserData() {
  const data = loadUserData();
  document.querySelectorAll(".translation-input").forEach((input) => {
    const id = input.dataset.entryId;
    input.value = data[id]?.translation || "";
  });
}

document.getElementById("import-button").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    importUserData(ev.target.result);
  };
  reader.readAsText(file);
});

window.addEventListener("dragover", (e) => {
  e.preventDefault();
});

window.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    importUserData(ev.target.result);
  };
  reader.readAsText(file);
});
