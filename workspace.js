const WORKSPACE_STORAGE_KEY = "ginger_custom_pages_v1";

let workspaceState = loadWorkspaceState();
let activePageId = "dictionary";

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadWorkspaceState() {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return { pages: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.pages)) return { pages: [] };
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

function getPage(pageId) {
  return workspaceState.pages.find((page) => page.id === pageId) || null;
}

function addPage() {
  const number = workspaceState.pages.length + 1;
  const page = {
    id: makeId("page"),
    title: `Page ${number}`,
    items: [],
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

function addItem(pageId, type) {
  const page = getPage(pageId);
  if (!page) return;

  let item;
  if (type === "word") {
    item = {
      id: makeId("item"),
      type: "word",
      word: "",
      translation: "",
      meaning: "",
    };
  } else if (type === "example") {
    item = {
      id: makeId("item"),
      type: "example",
      source: "",
      translation: "",
      note: "",
    };
  } else {
    item = {
      id: makeId("item"),
      type: "note",
      text: "",
    };
  }

  page.items.push(item);
  saveWorkspaceState();
  renderActivePage();
}

function updateItem(pageId, itemId, field, value) {
  const page = getPage(pageId);
  const item = page?.items.find((entry) => entry.id === itemId);
  if (!item || !(field in item)) return;
  item[field] = value;
  saveWorkspaceState();
}

function deleteItem(pageId, itemId) {
  const page = getPage(pageId);
  if (!page) return;
  page.items = page.items.filter((item) => item.id !== itemId);
  saveWorkspaceState();
  renderActivePage();
}

function moveItem(pageId, itemId, direction) {
  const page = getPage(pageId);
  if (!page) return;
  const index = page.items.findIndex((item) => item.id === itemId);
  if (index < 0) return;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= page.items.length) return;
  [page.items[index], page.items[nextIndex]] = [page.items[nextIndex], page.items[index]];
  saveWorkspaceState();
  renderActivePage();
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

function renderWordItem(page, item, index) {
  return `
    <article class="study-card" data-item-id="${escapeWorkspaceHtml(item.id)}">
      <div class="study-card-head">
        <span class="study-type-badge">Word</span>
        ${renderItemActions(page, item, index)}
      </div>
      <div class="study-grid word-grid">
        <label>
          <span>Word</span>
          <input class="workspace-field" data-field="word" value="${escapeWorkspaceHtml(item.word)}" placeholder="ginger word" />
        </label>
        <label>
          <span>Translation</span>
          <input class="workspace-field" data-field="translation" value="${escapeWorkspaceHtml(item.translation)}" placeholder="meaning / translation" />
        </label>
        <label class="study-wide">
          <span>Meaning / notes</span>
          <textarea class="workspace-field" data-field="meaning" rows="3" placeholder="definition, grammar notes, related words...">${escapeWorkspaceHtml(item.meaning)}</textarea>
        </label>
      </div>
    </article>`;
}

function renderExampleItem(page, item, index) {
  return `
    <article class="study-card" data-item-id="${escapeWorkspaceHtml(item.id)}">
      <div class="study-card-head">
        <span class="study-type-badge">Example</span>
        ${renderItemActions(page, item, index)}
      </div>
      <div class="study-grid example-grid">
        <label class="study-wide">
          <span>Ginger sentence</span>
          <textarea class="workspace-field" data-field="source" rows="2" placeholder="Example sentence...">${escapeWorkspaceHtml(item.source)}</textarea>
        </label>
        <label class="study-wide">
          <span>Translation</span>
          <textarea class="workspace-field" data-field="translation" rows="2" placeholder="Japanese / English translation...">${escapeWorkspaceHtml(item.translation)}</textarea>
        </label>
        <label class="study-wide">
          <span>Notes</span>
          <textarea class="workspace-field" data-field="note" rows="2" placeholder="Grammar, interpretation, evidence...">${escapeWorkspaceHtml(item.note)}</textarea>
        </label>
      </div>
    </article>`;
}

function renderNoteItem(page, item, index) {
  return `
    <article class="study-card" data-item-id="${escapeWorkspaceHtml(item.id)}">
      <div class="study-card-head">
        <span class="study-type-badge">Note</span>
        ${renderItemActions(page, item, index)}
      </div>
      <label class="note-field">
        <textarea class="workspace-field" data-field="text" rows="5" placeholder="Write anything here...">${escapeWorkspaceHtml(item.text)}</textarea>
      </label>
    </article>`;
}

function renderItemActions(page, item, index) {
  const upDisabled = index === 0 ? " disabled" : "";
  const downDisabled = index === page.items.length - 1 ? " disabled" : "";
  return `
    <div class="study-actions">
      <button type="button" class="move-item" data-direction="-1"${upDisabled} aria-label="Move up">↑</button>
      <button type="button" class="move-item" data-direction="1"${downDisabled} aria-label="Move down">↓</button>
      <button type="button" class="delete-item danger-button">Delete</button>
    </div>`;
}

function bindCustomPageEvents(page) {
  const host = document.getElementById("custom-page-host");
  if (!host) return;

  host.querySelectorAll(".workspace-field").forEach((field) => {
    const card = field.closest(".study-card");
    field.addEventListener("input", () => {
      updateItem(page.id, card.dataset.itemId, field.dataset.field, field.value);
    });
  });

  host.querySelectorAll(".delete-item").forEach((button) => {
    const card = button.closest(".study-card");
    button.addEventListener("click", () => deleteItem(page.id, card.dataset.itemId));
  });

  host.querySelectorAll(".move-item").forEach((button) => {
    const card = button.closest(".study-card");
    button.addEventListener("click", () => {
      moveItem(page.id, card.dataset.itemId, Number(button.dataset.direction));
    });
  });

  host.querySelector("#add-word-item")?.addEventListener("click", () => addItem(page.id, "word"));
  host.querySelector("#add-example-item")?.addEventListener("click", () => addItem(page.id, "example"));
  host.querySelector("#add-note-item")?.addEventListener("click", () => addItem(page.id, "note"));
  host.querySelector("#rename-page")?.addEventListener("click", () => renamePage(page.id));
  host.querySelector("#delete-page")?.addEventListener("click", () => deletePage(page.id));
}

function renderCustomPage(page) {
  const host = document.getElementById("custom-page-host");
  if (!host) return;

  const itemsHtml = page.items.length
    ? page.items
        .map((item, index) => {
          if (item.type === "word") return renderWordItem(page, item, index);
          if (item.type === "example") return renderExampleItem(page, item, index);
          return renderNoteItem(page, item, index);
        })
        .join("")
    : `<div class="empty-page-state">No items yet. Add a word, example sentence, or note.</div>`;

  host.innerHTML = `
    <section class="custom-page-wrapper">
      <header class="custom-page-header">
        <div>
          <h1>${escapeWorkspaceHtml(page.title)}</h1>
          <p class="sub">A free workspace for your own Ginger notes and examples.</p>
        </div>
        <div class="page-management-actions">
          <button id="rename-page" type="button">Rename</button>
          <button id="delete-page" type="button" class="danger-button">Delete page</button>
        </div>
      </header>

      <div class="item-add-bar">
        <button id="add-word-item" type="button">+ Word</button>
        <button id="add-example-item" type="button">+ Example</button>
        <button id="add-note-item" type="button">+ Note</button>
      </div>

      <div class="study-card-list">${itemsHtml}</div>
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
