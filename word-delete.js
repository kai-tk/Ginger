(() => {
  workspaceState.pages.forEach((page) => {
    if (!page.ignoredWords || typeof page.ignoredWords !== "object" || Array.isArray(page.ignoredWords)) {
      page.ignoredWords = {};
    }
  });
  saveWorkspaceState();

  const originalSyncWordsFromSentences = syncWordsFromSentences;
  syncWordsFromSentences = function (page) {
    originalSyncWordsFromSentences(page);
    Object.keys(page.ignoredWords || {}).forEach((word) => {
      delete page.words[word];
      delete page.manualWords?.[word];
    });
  };

  const originalAddSentence = addSentence;
  addSentence = function (pageId, text) {
    const added = originalAddSentence(pageId, text);
    if (!added) return false;

    const page = getPage(pageId);
    if (!page) return true;
    Object.keys(page.ignoredWords || {}).forEach((word) => {
      delete page.words[word];
    });
    saveWorkspaceState();
    renderActivePage();
    return true;
  };

  const originalAddStandaloneWord = addStandaloneWord;
  addStandaloneWord = function (pageId, value) {
    const page = getPage(pageId);
    const word = String(value || "").trim();
    if (page?.ignoredWords && word) delete page.ignoredWords[word];

    const added = originalAddStandaloneWord(pageId, value);
    if (added) saveWorkspaceState();
    return added;
  };

  function deleteWorkspaceWord(pageId, word) {
    const page = getPage(pageId);
    if (!page || !word) return;

    if (!page.ignoredWords || typeof page.ignoredWords !== "object") {
      page.ignoredWords = {};
    }

    delete page.words[word];
    if (page.manualWords) delete page.manualWords[word];
    page.ignoredWords[word] = true;
    saveWorkspaceState();
    renderActivePage();
  }

  const originalBindCustomPageEvents = bindCustomPageEvents;
  bindCustomPageEvents = function (page) {
    originalBindCustomPageEvents(page);

    const host = document.getElementById("custom-page-host");
    if (!host) return;

    host.querySelectorAll(".workspace-word-row").forEach((row) => {
      if (row.querySelector(".delete-word-button")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete-word-button danger-button";
      button.textContent = "×";
      button.title = "単語を削除";
      button.setAttribute("aria-label", `${row.dataset.word || "word"} を削除`);
      button.addEventListener("click", () => deleteWorkspaceWord(page.id, row.dataset.word));
      row.appendChild(button);
    });
  };
})();
