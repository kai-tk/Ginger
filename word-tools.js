(() => {
  const originalRenderWordList = renderWordList;
  const originalBindCustomPageEvents = bindCustomPageEvents;

  function getSortedWordEntries(page) {
    const entries = Object.entries(page.words);
    const sort = page.wordSort || "az";

    if (sort === "az") {
      entries.sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    } else if (sort === "za") {
      entries.sort(([a], [b]) => b.localeCompare(a, undefined, { sensitivity: "base" }));
    }

    return entries;
  }

  renderWordList = function (page) {
    const entries = getSortedWordEntries(page);
    if (!entries.length) {
      return `<div class="workspace-empty">文章を追加すると、ここに単語が自動で並ぶよ。</div>`;
    }

    const rows = entries.map(([word, meaning]) => `
      <div
        class="workspace-word-row"
        data-word="${escapeWorkspaceHtml(word)}"
        data-meaning-filled="${meaning.trim() ? "true" : "false"}"
      >
        <div class="workspace-word">${escapeWorkspaceHtml(word)}</div>
        <input
          class="workspace-meaning-input"
          type="text"
          value="${escapeWorkspaceHtml(meaning)}"
          placeholder="意味"
          aria-label="${escapeWorkspaceHtml(word)} meaning"
        />
      </div>`).join("");

    return `
      <div class="workspace-word-tools">
        <input
          id="word-filter-input"
          class="workspace-word-filter-input"
          type="search"
          placeholder="Filter words..."
          aria-label="Filter words"
        />
        <div class="workspace-word-tool-row">
          <select id="word-status-filter" aria-label="Filter by meaning status">
            <option value="all">All</option>
            <option value="empty">Meaning empty</option>
            <option value="filled">Meaning filled</option>
          </select>
          <select id="word-sort-select" aria-label="Sort words">
            <option value="az"${(page.wordSort || "az") === "az" ? " selected" : ""}>A → Z</option>
            <option value="za"${page.wordSort === "za" ? " selected" : ""}>Z → A</option>
            <option value="original"${page.wordSort === "original" ? " selected" : ""}>Added order</option>
          </select>
        </div>
        <div id="word-filter-count" class="workspace-word-filter-count"></div>
      </div>
      <div id="workspace-word-rows">${rows}</div>`;
  };

  function applyWordFilters(host) {
    const query = (host.querySelector("#word-filter-input")?.value || "").trim().toLowerCase();
    const status = host.querySelector("#word-status-filter")?.value || "all";
    const rows = [...host.querySelectorAll(".workspace-word-row")];
    let visible = 0;

    rows.forEach((row) => {
      const word = (row.dataset.word || "").toLowerCase();
      const filled = row.dataset.meaningFilled === "true";
      const passText = !query || word.includes(query);
      const passStatus =
        status === "all" ||
        (status === "filled" && filled) ||
        (status === "empty" && !filled);
      const show = passText && passStatus;
      row.hidden = !show;
      if (show) visible++;
    });

    const count = host.querySelector("#word-filter-count");
    if (count) {
      count.textContent = visible === rows.length
        ? `${rows.length} words`
        : `${visible} / ${rows.length} words`;
    }
  }

  bindCustomPageEvents = function (page) {
    originalBindCustomPageEvents(page);

    const host = document.getElementById("custom-page-host");
    if (!host) return;

    const filterInput = host.querySelector("#word-filter-input");
    const statusFilter = host.querySelector("#word-status-filter");
    const sortSelect = host.querySelector("#word-sort-select");

    filterInput?.addEventListener("input", () => applyWordFilters(host));
    statusFilter?.addEventListener("change", () => applyWordFilters(host));

    sortSelect?.addEventListener("change", () => {
      page.wordSort = sortSelect.value;
      saveWorkspaceState();
      renderActivePage();
    });

    // Keep filtering state correct when a meaning is edited.
    host.querySelectorAll(".workspace-meaning-input").forEach((meaningInput) => {
      const row = meaningInput.closest(".workspace-word-row");
      meaningInput.addEventListener("input", () => {
        row.dataset.meaningFilled = meaningInput.value.trim() ? "true" : "false";
        applyWordFilters(host);
      });
    });

    applyWordFilters(host);
  };
})();
