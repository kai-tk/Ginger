(() => {
  function stripWordPunctuation(token) {
    return String(token || "").replace(/[.,]+$/g, "");
  }

  const originalSplitSentence = splitSentence;

  splitSentence = function (text) {
    return originalSplitSentence(text)
      .map(stripWordPunctuation)
      .filter(Boolean);
  };

  renderSentenceHtml = function (page, text) {
    const tokens = String(text || "").split(/(\s+)/);

    return tokens.map((token) => {
      if (/^\s+$/.test(token)) return escapeWorkspaceHtml(token);
      if (!token) return "";

      const word = stripWordPunctuation(token);
      const punctuation = token.slice(word.length);
      const meaning = page.words[word] || "";
      const emptyClass = meaning ? "" : " ruby-empty";

      if (!word) return escapeWorkspaceHtml(token);

      return `<ruby class="workspace-ruby" data-word="${escapeWorkspaceHtml(word)}"><span class="base-word">${escapeWorkspaceHtml(word)}</span><rt class="workspace-ruby-text${emptyClass}">${escapeWorkspaceHtml(meaning)}</rt></ruby>${escapeWorkspaceHtml(punctuation)}`;
    }).join("");
  };

  function migratePagePunctuation(page) {
    if (!page || typeof page !== "object") return;

    const nextWords = {};
    Object.entries(page.words || {}).forEach(([rawWord, meaning]) => {
      const word = stripWordPunctuation(rawWord);
      if (!word) return;
      if (!(word in nextWords) || (!nextWords[word] && meaning)) {
        nextWords[word] = meaning || "";
      }
    });

    const nextManualWords = {};
    Object.keys(page.manualWords || {}).forEach((rawWord) => {
      const word = stripWordPunctuation(rawWord);
      if (word) nextManualWords[word] = true;
    });

    page.words = nextWords;
    page.manualWords = nextManualWords;

    page.sentences.forEach((sentence) => {
      splitSentence(sentence.text).forEach((word) => {
        if (!(word in page.words)) page.words[word] = "";
      });
    });
  }

  workspaceState.pages.forEach(migratePagePunctuation);
  saveWorkspaceState();
})();
