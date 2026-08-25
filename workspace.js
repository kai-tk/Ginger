const WORKSPACE_STORAGE_KEY = "ginger_custom_pages_v1";

let workspaceState = loadWorkspaceState();
let activePageId = "dictionary";

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePage(page) {
  if (!page || typeof page !== "object") return null;

  // Migrate pages created by the first workspace version without losing useful data.
  if (!Array.isArray(page.sentences)) {
    page.sentences = [];
    if (Array.isArray(page.items)) {
      page.items.forEach((item) => {
        if (item?.type === "example" && item.source?.trim()) {
          page.sentences.push({ id: item.id || makeId("sentence"), text: item.source });
        }
      });
    }
  }

  if (!page.words || typeof page.words !== "object" || Array.isArray(page.words)) {
    page.words = {};
    if (Array.isArray(page.items)) {
      page.items.forEach((item) => {
        if (item?.type === "word" && item.word?.trim()) {
          page.words[item.word.trim()] = item.translation || "";
        }
      });
    }
  }

  // Rebuild the word list from all stored sentences while preserving meanings.
  page.sentences.forEach((sentence) => {
    splitSentence(sentence.text).forEach((word) => {
      if (!(word in page.words)) page.words[word] = "";
    });
  });

  delete page.items;
  return page;
}

function loadWorkspaceState() {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return { pages: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.pages)) return { pages: [] };
    parsed.pages = parsed.pages.map(normalizePage).filter(Boolean);
    return parsed;
  } catch {
    return { pages: [] };
  }
}

function saveWorkspaceState() {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaceState));
  } catch (e) {
    console.warn("Failed to save custom pages", e);
  }
}

function escapeWorkspaceHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function splitSentence(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function getPage(pageId) {
  return workspaceState.pages.find((page) => page.id === pageId) || null;
}

function addPage() {
  const number = workspaceState.pages.length + 1;
  const page = {
    id: makeId("page"),
    title: `Page ${number}`,
    sentences: [],
    words: {},
  };
  workspaceState.pages.push(page);
  saveWorkspaceState();
  activePageId = page.id;
  renderPageTabs();
  renderActivePage();
}

function renamePage(pageId) {
  const page = getPage(pageId);
  if (!page) return;
  const next = window.prompt("Page name", page.title);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  page.title = trimmed;
  saveWorkspaceState();
  renderPageTabs();
  renderActivePage();
}

function deletePage(pageId) {
  const page = getPage(pageId);
  if (!page) return;
  if (!window.confirm(`Delete “${page.title}”?`)) return;
  workspaceState.pages = workspaceState.pages.filter((item) => item.id !== pageId);
  saveWorkspaceState();
  activePageId = "dictionary";
  renderPageTabs();
  renderActivePage();
}

function syncWordsFromSentences(page) {
  const usedWords = new Set();
  page.sentences.forEach((sentence) => {
    splitSentence(sentence.text).forEach((word) => usedWords.add(word));
  });

  // Keep only words that still occur in at least one sentence.
  const nextWords = {};
  usedWords.forEach((word) => {
    nextWords[word] = page.words[word] || "";
  });
  page.words = nextWords;
}

function addSentence(pageId, text) {
  const page = getPage(pageId);
  const trimmed = String(text || "").trim();
  if (!page || !trimmed) return false;

  page.sentences.push({ id: makeId("sentence"), text: trimmed });
  splitSentence(trimmed).forEach((word) => {
    if (!(word in page.words)) page.words[word] = "";
  });
  saveWorkspaceState();
  renderActivePage();
  return true;
}

function updateSentence(pageId, sentenceId, text) {
  const page = getPage(pageId);
  const sentence = page?.sentences.find((item) => item.id === sentenceId);
  if (!page || !sentence) return;
  sentence.text = text;
  syncWordsFromSentences(page);
  saveWorkspaceState();
  renderActivePage();
}

function deleteSentence(pageId, sentenceId) {
  const page = getPage(pageId);
  if (!page) return;
  page.sentences = page.sentences.filter((item) => item.id !== sentenceId);
  syncWordsFromSentences(page);
  saveWorkspaceState();
  renderActivePage();
}

function updateWordMeaning(pageId, word, meaning) {
  const page = getPage(pageId);
  if (!page || !(word in page.words)) return;
  page.words[word] = meaning;
  saveWorkspaceState();
  updateSentenceRubies(page);
}

function renderPageTabs() {
  const tabs = document.getElementById("page-tabs");
  if (!tabs) return;
  tabs.innerHTML = "";

  const dictionaryButton = document.createElement("button");
  dictionaryButton.type = "button";
  dictionaryButton.className = `page-tab${activePageId === "dictionary" ? " active" : ""}`;
  dictionaryButton.dataset.pageId = "dictionary";
  dictionaryButton.textContent = "Dictionary";
  dictionaryButton.addEventListener("click", () => {
    activePageId = "dictionary";
    renderPageTabs();
    renderActivePage();
  });
  tabs.appendChild(dictionaryButton);

  workspaceState.pages.forEach((page) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-tab${activePageId === page.id ? " active" : ""}`;
    button.dataset.pageId = page.id;
    button.textContent = page.title;
    button.title = "Double-click to rename";
    button.addEventListener("click", () => {
      activePageId = page.id;
      renderPageTabs();
      renderActivePage();
    });
    button.addEventListener("dblclick", () => renamePage(page.id));
    tabs.appendChild(button);
  });
}

function renderSentenceHtml(page, text) {
  const tokens = String(text || "").split(/(\s+)/);
  return tokens.map((token) => {
    if (/^\s+$/.test(token)) return escapeWorkspaceHtml(token);
    if (!token) return "";
    const meaning = page.words[token] || "";
    const emptyClass = meaning ? "" : " ruby-empty";
    return `<ruby class="workspace-ruby" data-word="${escapeWorkspaceHtml(token)}"><span class="base-word">${escapeWorkspaceHtml(token)}</span><rt class="workspace-ruby-text${emptyClass}">${escapeWorkspaceHtml(meaning)}</rt></ruby>`;
  }).join("");
}

function renderWordList(page) {
  const entries = Object.entries(page.words);
  if (!entries.length) {
    return `<div class="workspace-empty">文章を追加すると、ここに単語が自動で並ぶよ。</div>`;
  }

  return entries.map(([word, meaning]) => `
    <div class="workspace-word-row" data-word="${escapeWorkspaceHtml(word)}">
      <div class="workspace-word">${escapeWorkspaceHtml(word)}</div>
      <input
        class="workspace-meaning-input"
        type="text"
        value="${escapeWorkspaceHtml(meaning)}"
        placeholder="意味"
        aria-label="${escapeWorkspaceHtml(word)} meaning"
      />
    </div>`).join("");
}

function renderSentenceList(page) {
  if (!page.sentences.length) {
    return `<div class="workspace-empty">上の入力欄から文章を追加してね。</div>`;
  }

  return page.sentences.map((sentence) => `
    <article class="workspace-sentence-card" data-sentence-id="${escapeWorkspaceHtml(sentence.id)}">
      <div class="workspace-sentence-display">${renderSentenceHtml(page, sentence.text)}</div>
      <div class="workspace-sentence-actions">
        <button type="button" class="edit-sentence">Edit</button>
        <button type="button" class="delete-sentence danger-button">Delete</button>
      </div>
    </article>`).join("");
}

function updateSentenceRubies(page) {
  const host = document.getElementById("custom-page-host");
  if (!host) return;
  host.querySelectorAll(".workspace-ruby").forEach((ruby) => {
    const word = ruby.dataset.word;
    const rt = ruby.querySelector(".workspace-ruby-text");
    if (!rt) return;
    const meaning = page.words[word] || "";
    rt.textContent = meaning;
    rt.classList.toggle("ruby-empty", !meaning);
  });
}

function editSentence(page, sentenceId) {
  const sentence = page.sentences.find((item) => item.id === sentenceId);
  if (!sentence) return;
  const next = window.prompt("Edit sentence", sentence.text);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  updateSentence(page.id, sentenceId, trimmed);
}

function bindCustomPageEvents(page) {
  const host = document.getElementById("custom-page-host");
  if (!host) return;

  const form = host.querySelector("#sentence-add-form");
  const input = host.querySelector("#sentence-input");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (addSentence(page.id, input?.value || "")) {
      input.value = "";
    }
  });

  host.querySelectorAll(".workspace-meaning-input").forEach((meaningInput) => {
    const row = meaningInput.closest(".workspace-word-row");
    meaningInput.addEventListener("input", () => {
      updateWordMeaning(page.id, row.dataset.word, meaningInput.value);
    });
  });

  host.querySelectorAll(".edit-sentence").forEach((button) => {
    const card = button.closest(".workspace-sentence-card");
    button.addEventListener("click", () => editSentence(page, card.dataset.sentenceId));
  });

  host.querySelectorAll(".delete-sentence").forEach((button) => {
    const card = button.closest(".workspace-sentence-card");
    button.addEventListener("click", () => deleteSentence(page.id, card.dataset.sentenceId));
  });

  host.querySelector("#rename-page")?.addEventListener("click", () => renamePage(page.id));
  host.querySelector("#delete-page")?.addEventListener("click", () => deletePage(page.id));
}

function renderCustomPage(page) {
  const host = document.getElementById("custom-page-host");
  if (!host) return;

  host.innerHTML = `
    <section class="custom-page-wrapper">
      <header class="custom-page-header">
        <div>
          <h1>${escapeWorkspaceHtml(page.title)}</h1>
          <p class="sub">文章から単語を自動抽出して、意味を付けながら読み解くページ。</p>
        </div>
        <div class="page-management-actions">
          <button id="rename-page" type="button">Rename</button>
          <button id="delete-page" type="button" class="danger-button">Delete page</button>
        </div>
      </header>

      <div class="workspace-split">
        <aside class="workspace-words-panel">
          <div class="workspace-panel-head">
            <h2>Words</h2>
            <span>${Object.keys(page.words).length}</span>
          </div>
          <div class="workspace-word-list">${renderWordList(page)}</div>
        </aside>

        <section class="workspace-sentences-panel">
          <form id="sentence-add-form" class="sentence-add-form">
            <textarea id="sentence-input" rows="3" placeholder="文章を入力。空白文字ごとに単語へ分解されるよ。"></textarea>
            <button type="submit">+ Add sentence</button>
          </form>
          <div class="workspace-sentence-list">${renderSentenceList(page)}</div>
        </section>
      </div>
    </section>`;

  bindCustomPageEvents(page);
}

function renderActivePage() {
  const dictionaryPage = document.getElementById("dictionary-page");
  const customHost = document.getElementById("custom-page-host");
  const searchBox = document.getElementById("search-box");
  const footer = document.getElementById("dictionary-footer");

  if (activePageId === "dictionary") {
    if (dictionaryPage) dictionaryPage.hidden = false;
    if (customHost) customHost.hidden = true;
    if (searchBox) searchBox.hidden = false;
    if (footer) footer.hidden = false;
    return;
  }

  const page = getPage(activePageId);
  if (!page) {
    activePageId = "dictionary";
    renderPageTabs();
    renderActivePage();
    return;
  }

  if (dictionaryPage) dictionaryPage.hidden = true;
  if (customHost) customHost.hidden = false;
  if (searchBox) searchBox.hidden = true;
  if (footer) footer.hidden = true;
  renderCustomPage(page);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("add-page-button")?.addEventListener("click", addPage);
  renderPageTabs();
  renderActivePage();
});
