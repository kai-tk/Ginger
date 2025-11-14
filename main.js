let ENTRIES = [];
const COOKIE_NAME = "learning_dict_data";
let headwordToEntry = {};
const tooltipLayers = [];
let tooltipHandlersInstalled = false;
let HEADWORD_LIST = [];

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
    const raw = getCookie(COOKIE_NAME);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return {};
    return data;
  } catch {
    return {};
  }
}

function saveUserData(userData) {
  setCookie(COOKIE_NAME, JSON.stringify(userData), 365);
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
  });
  for (const A of ENTRIES) {
    for (const B of ENTRIES) {
      if (A === B) continue;
      const re = new RegExp("\\b" + escapeRegExp(B.headword) + "\\b", "i");
      if (re.test(A.meaning)) {
        B._refs.push(A.headword);
      }
    }
  }
}

function renderMeaningHtml(text, translations) {
  let result = escapeHtml(text);
  const headwords = HEADWORD_LIST;

  headwords.forEach((hw) => {
    const translation = translations[hw] || "";
    const escapedHw = escapeHtml(hw);
    const escapedTr = escapeHtml(translation);

    const rtClass = translation ? "" : " ruby-empty";

    const replacement =
      `<span class="dict-word" data-headword="${escapedHw}">` +
      `<ruby>` +
      `<span class="base-word">${escapedHw}</span>` +
      `<rt class="ruby-editable${rtClass}">${escapedTr}</rt>` +
      `</ruby>` +
      `</span>`;

    const re = new RegExp("\\b" + escapeRegExp(hw) + "\\b", "g");
    result = result.replace(re, replacement);
  });

  return result;
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
        updateMeaningsForHeadword(entry.headword);
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

function updateMeaningsForHeadword(headword) {
  const translations = collectTranslationsFromInputs();
  const entry = headwordToEntry[headword];
  if (!entry) return;

  const selfCell = document.querySelector(
    `.meaning-cell[data-entry-id="${entry.id}"]`
  );
  if (selfCell) {
    selfCell.innerHTML = renderMeaningHtml(entry.meaning, translations);
  }

  const refs = entry._refs || [];
  refs.forEach((refHw) => {
    const refEntry = headwordToEntry[refHw];
    if (!refEntry) return;
    const refCell = document.querySelector(
      `.meaning-cell[data-entry-id="${refEntry.id}"]`
    );
    if (refCell) {
      refCell.innerHTML = renderMeaningHtml(refEntry.meaning, translations);
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
      chip.addEventListener("click", () => {
        const targetRow = [...document.querySelectorAll("tr")].find(
          (tr) => tr.querySelector(".headword")?.textContent === hw
        );
        if (targetRow) {
          targetRow.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          targetRow.style.outline = "2px solid #3b82f6";
          setTimeout(() => {
            targetRow.style.outline = "";
          }, 1500);
        }
      });
      cell.appendChild(chip);
    });
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
  const meaningHtml = renderMeaningHtml(
    meaning,
    collectTranslationsFromInputs()
  );
  layer.innerHTML =
    `<div class="tooltip-headword">${headEsc}</div>` +
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
  const headword = base ? base.textContent.trim() : "";
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
  const res = await fetch("dictionary.csv");
  const csvText = await res.text();
  ENTRIES = parseCsv(csvText);

  headwordToEntry = {};
  ENTRIES.forEach((e) => (headwordToEntry[e.headword] = e));
  HEADWORD_LIST = ENTRIES.map((e) => e.headword).sort(
    (a, b) => b.length - a.length
  );

  buildTable();
  attachTooltipHandlers();
}

document.addEventListener("DOMContentLoaded", async () => {
  loadDictionary();
});
