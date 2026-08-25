(() => {
  // Existing data has always been stored as an array. Treat the current array order
  // as chronological order when migrating older pages that do not have timestamps.
  workspaceState.pages.forEach((page) => {
    if (!Array.isArray(page.sentences)) return;
    page.sentences.forEach((sentence, index) => {
      if (!Number.isFinite(sentence.createdAt)) {
        sentence.createdAt = index;
      }
    });
  });
  saveWorkspaceState();

  const originalAddSentence = addSentence;
  addSentence = function (pageId, text) {
    const page = getPage(pageId);
    const beforeLength = page?.sentences?.length ?? 0;
    const added = originalAddSentence(pageId, text);
    if (!added || !page || page.sentences.length <= beforeLength) return added;

    const sentence = page.sentences[page.sentences.length - 1];
    sentence.createdAt = Date.now();
    saveWorkspaceState();
    return added;
  };

  renderSentenceList = function (page) {
    if (!page.sentences.length) {
      return `<div class="workspace-empty">上の入力欄から文章を追加してね。</div>`;
    }

    const sentences = page.sentences
      .map((sentence, index) => ({ sentence, index }))
      .sort((a, b) => {
        const aTime = Number.isFinite(a.sentence.createdAt) ? a.sentence.createdAt : a.index;
        const bTime = Number.isFinite(b.sentence.createdAt) ? b.sentence.createdAt : b.index;
        return aTime - bTime || a.index - b.index;
      })
      .map(({ sentence }) => sentence);

    return sentences.map((sentence) => `
      <article class="workspace-sentence-card" data-sentence-id="${escapeWorkspaceHtml(sentence.id)}">
        <div class="workspace-sentence-display">${renderSentenceHtml(page, sentence.text)}</div>
        <div class="workspace-sentence-actions">
          <button type="button" class="edit-sentence">Edit</button>
          <button type="button" class="delete-sentence danger-button">Delete</button>
        </div>
      </article>`).join("");
  };
})();
