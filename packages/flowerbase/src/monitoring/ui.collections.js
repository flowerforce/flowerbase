(function () {
  const root = window.MONIT;
  if (!root) return;
  const state = root.state;
  const dom = root.dom;
  const { utils } = root;

  if (state.collections === undefined) state.collections = [];
  if (state.selectedCollection === undefined) state.selectedCollection = null;
  if (state.collectionSearch === undefined) state.collectionSearch = '';
  if (state.collectionMode === undefined) state.collectionMode = 'query';
  if (state.collectionHistory === undefined) state.collectionHistory = [];
  if (state.selectedCollectionHistoryIndex === undefined) state.selectedCollectionHistoryIndex = null;
  if (state.collectionPage === undefined) state.collectionPage = 1;
  if (state.collectionHasMore === undefined) state.collectionHasMore = false;
  if (state.collectionTotal === undefined) state.collectionTotal = 0;
  if (state.collectionPageSize === undefined) state.collectionPageSize = 50;
  if (state.collectionLoading === undefined) state.collectionLoading = false;
  if (state.collectionTotalsLoading === undefined) state.collectionTotalsLoading = false;
  if (state.collectionResultView === undefined) state.collectionResultView = 'json';
  if (state.collectionResultPayload === undefined) state.collectionResultPayload = null;
  if (state.collectionResultHighlight === undefined) state.collectionResultHighlight = false;
  if (state.selectedCollectionUser === undefined) state.selectedCollectionUser = null;
  if (state.collectionUserMap === undefined) state.collectionUserMap = {};
  if (state.collectionUserQuery === undefined) state.collectionUserQuery = '';
  if (state.__collectionUserTimer === undefined) state.__collectionUserTimer = null;
  if (state.collectionRulesMap === undefined) state.collectionRulesMap = {};

  dom.refreshCollections = document.getElementById('refreshCollections');
  dom.collectionSearch = document.getElementById('collectionSearch');
  dom.collectionList = document.getElementById('collectionList');
  dom.collectionHistory = document.getElementById('collectionHistory');
  dom.collectionRules = document.getElementById('collectionRules');
  dom.collectionSelected = document.getElementById('collectionSelected');
  dom.collectionIo = document.getElementById('collectionIo');
  dom.collectionUserInput = document.getElementById('collectionUserInput');
  dom.collectionUserList = document.getElementById('collectionUserList');
  dom.collectionRunMode = document.getElementById('collectionRunMode');
  dom.collectionMode = document.getElementById('collectionMode');
  dom.collectionSort = document.getElementById('collectionSort');
  dom.collectionQuery = document.getElementById('collectionQuery');
  dom.collectionQueryHighlight = document.getElementById('collectionQueryHighlight');
  dom.collectionAggregate = document.getElementById('collectionAggregate');
  dom.collectionAggregateHighlight = document.getElementById('collectionAggregateHighlight');
  dom.runCollectionQuery = document.getElementById('runCollectionQuery');
  dom.collectionResult = document.getElementById('collectionResult');
  dom.collectionPrev = document.getElementById('collectionPrev');
  dom.collectionNext = document.getElementById('collectionNext');
  dom.collectionPage = document.getElementById('collectionPage');
  dom.collectionPages = document.getElementById('collectionPages');
  dom.collectionTotal = document.getElementById('collectionTotal');
  dom.collectionViewJson = document.getElementById('collectionViewJson');
  dom.collectionViewTable = document.getElementById('collectionViewTable');
  dom.collectionTabButtons = document.querySelectorAll('[data-collection-tab]');
  dom.collectionTabPanels = document.querySelectorAll('[data-collection-panel]');

  const {
    refreshCollections,
    collectionSearch,
    collectionList,
    collectionHistory,
    collectionRules,
    collectionSelected,
    collectionIo,
    collectionUserInput,
    collectionUserList,
    collectionRunMode,
    collectionMode,
    collectionSort,
    collectionQuery,
    collectionQueryHighlight,
    collectionAggregate,
    collectionAggregateHighlight,
    runCollectionQuery,
    collectionResult,
    collectionPrev,
    collectionNext,
    collectionPage,
    collectionPages,
    collectionTotal,
    collectionViewJson,
    collectionViewTable,
    collectionTabButtons,
    collectionTabPanels
  } = dom;
  const { api, parseJsonObject, highlightJson, safeStringify } = utils;

  const TABLE_TRUNCATE_LIMIT = 200;

  const getRulesTabButton = () => {
    if (!collectionTabButtons || !collectionTabButtons.forEach) return null;
    let rulesButton = null;
    collectionTabButtons.forEach((button) => {
      if (button.dataset && button.dataset.collectionTab === 'rules') {
        rulesButton = button;
      }
    });
    return rulesButton;
  };

  const setRulesTabEnabled = (enabled) => {
    const rulesButton = getRulesTabButton();
    if (!rulesButton) return;
    rulesButton.disabled = !enabled;
    rulesButton.classList.toggle('is-disabled', !enabled);
  };

  const updateCollectionPager = () => {
    if (state.collectionLoading) {
      if (collectionPage) collectionPage.textContent = '...';
      if (state.collectionTotalsLoading) {
        if (collectionPages) collectionPages.textContent = '...';
        if (collectionTotal) collectionTotal.textContent = '...';
      }
      if (collectionPrev) collectionPrev.disabled = true;
      if (collectionNext) collectionNext.disabled = true;
      if (state.collectionTotalsLoading) return;
    }
    if (collectionPage) {
      collectionPage.textContent = String(state.collectionPage || 1);
    }
    const totalPages = Math.max(
      1,
      Math.ceil((state.collectionTotal || 0) / Math.max(state.collectionPageSize || 1, 1))
    );
    if (collectionPages) {
      collectionPages.textContent = String(totalPages);
    }
    if (collectionTotal) {
      collectionTotal.textContent = String(state.collectionTotal || 0);
    }
    if (collectionPrev) {
      collectionPrev.disabled = state.collectionPage <= 1;
    }
    if (collectionNext) {
      collectionNext.disabled = !state.collectionHasMore;
    }
  };

  const setCollectionResultView = (view) => {
    state.collectionResultView = view === 'table' ? 'table' : 'json';
    if (collectionViewJson) {
      collectionViewJson.classList.toggle('active', state.collectionResultView === 'json');
    }
    if (collectionViewTable) {
      collectionViewTable.classList.toggle('active', state.collectionResultView === 'table');
    }
    renderCollectionResult();
  };

  const showTablePopover = (cell) => {
    if (!cell || !cell.dataset) return;
    const text = cell.dataset.full || '';
    if (!text) return;
    const existing = document.querySelector('.table-popover');
    if (existing) existing.remove();
    const popover = document.createElement('div');
    popover.className = 'table-popover';
    popover.textContent = formatPopoverText(text);
    document.body.appendChild(popover);
    const rect = cell.getBoundingClientRect();
    const padding = 10;
    const maxLeft = window.innerWidth - popover.offsetWidth - padding;
    const maxTop = window.innerHeight - popover.offsetHeight - padding;
    const left = Math.max(padding, Math.min(rect.left, maxLeft));
    const top = Math.max(padding, Math.min(rect.bottom + 6, maxTop));
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  };

  const formatPopoverText = (text) => {
    if (!text) return '';
    const trimmed = text.trim();
    if (!trimmed) return text;
    const looksJsonObject = trimmed.startsWith('{') && trimmed.endsWith('}');
    const looksJsonArray = trimmed.startsWith('[') && trimmed.endsWith(']');
    if (looksJsonObject || looksJsonArray) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch (err) {
        return text;
      }
    }
    return text;
  };

  const shouldShowTablePopover = (cell) => {
    if (!cell || !cell.dataset) return false;
    const text = cell.dataset.full || '';
    if (!text) return false;
    const overflow =
      cell.scrollWidth > cell.clientWidth || cell.scrollHeight > cell.clientHeight;
    return overflow || text.length > TABLE_TRUNCATE_LIMIT;
  };

  const getTargetElement = (target) => {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target.parentElement) return target.parentElement;
    return null;
  };

  const hideTablePopover = () => {
    const existing = document.querySelector('.table-popover');
    if (existing) existing.remove();
  };

  const setCollectionTab = (tab) => {
    const value = tab || 'query';
    if (value === 'rules') {
      const rulesButton = getRulesTabButton();
      if (rulesButton && rulesButton.disabled) {
        return setCollectionTab('query');
      }
    }
    collectionTabButtons.forEach((item) => {
      item.classList.toggle('active', item.dataset.collectionTab === value);
    });
    collectionTabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.collectionPanel === value);
    });
  };

  const updateCollectionQueryHighlight = () => {
    if (!collectionQuery || !collectionQueryHighlight) return;
    const text = collectionQuery.value || '';
    collectionQueryHighlight.innerHTML = highlightJson(text || '');
    collectionQueryHighlight.scrollTop = collectionQuery.scrollTop;
    collectionQueryHighlight.scrollLeft = collectionQuery.scrollLeft;
  };

  const updateCollectionAggregateHighlight = () => {
    if (!collectionAggregate || !collectionAggregateHighlight) return;
    const text = collectionAggregate.value || '';
    collectionAggregateHighlight.innerHTML = highlightJson(text || '');
    collectionAggregateHighlight.scrollTop = collectionAggregate.scrollTop;
    collectionAggregateHighlight.scrollLeft = collectionAggregate.scrollLeft;
  };

  const formatCellValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
      return value.length > TABLE_TRUNCATE_LIMIT
        ? value.slice(0, TABLE_TRUNCATE_LIMIT) + '…'
        : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return safeStringify(value);
  };

  const formatCellFullValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return safeStringify(value);
  };

  const renderCollectionTable = (payload) => {
    if (!collectionResult) return;
    hideTablePopover();
    collectionResult.classList.remove('json-highlight');
    if (typeof payload === 'string') {
      collectionResult.classList.remove('table-view');
      collectionResult.textContent = payload;
      return;
    }
    const items = payload && typeof payload === 'object' && Array.isArray(payload.items)
      ? payload.items
      : [];
    if (!items.length) {
      collectionResult.classList.add('table-view');
      collectionResult.innerHTML = '<div class="hint">no rows</div>';
      return;
    }
    const columns = [];
    const seen = new Set();
    items.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      Object.keys(row).forEach((key) => {
        if (seen.has(key)) return;
        seen.add(key);
        columns.push(key);
      });
    });
    const useValueColumn = columns.length === 0;
    if (useValueColumn) {
      columns.push('value');
    }
    const header = columns.map((key) => '<th>' + utils.escapeHtml(key) + '</th>').join('');
    const body = items.map((row) => {
      const cells = columns.map((key) => {
        const value = useValueColumn ? row : (row && typeof row === 'object' ? row[key] : undefined);
        const fullValue = formatCellFullValue(value);
        const displayValue = formatCellValue(value);
        const truncated = fullValue.length > TABLE_TRUNCATE_LIMIT;
        return '<td class="' + (truncated ? 'truncated' : '') + '" data-full="' +
          utils.escapeHtml(fullValue) + '">' + utils.escapeHtml(displayValue) + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
    collectionResult.classList.add('table-view');
    collectionResult.innerHTML =
      '<div class="data-table-wrapper"><table class="data-table"><thead><tr>' +
      header + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  };

  const renderCollectionResult = () => {
    if (!collectionResult) return;
    hideTablePopover();
    const payload = state.collectionResultPayload;
    const highlight = state.collectionResultHighlight;
    if (payload === null || payload === undefined) {
      collectionResult.classList.remove('table-view', 'json-highlight');
      collectionResult.textContent = '';
      return;
    }
    if (state.collectionResultView === 'table') {
      renderCollectionTable(payload);
      return;
    }
    collectionResult.classList.remove('table-view');
    if (highlight) {
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      collectionResult.classList.add('json-highlight');
      collectionResult.innerHTML = highlightJson(text || '');
      return;
    }
    collectionResult.classList.remove('json-highlight');
    collectionResult.textContent = typeof payload === 'string' ? payload : String(payload ?? '');
  };

  const setCollectionResult = (value, highlight) => {
    state.collectionResultPayload = value;
    state.collectionResultHighlight = !!highlight;
    renderCollectionResult();
  };

  const setCollectionRules = (value, highlight) => {
    if (!collectionRules) return;
    if (highlight) {
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      collectionRules.classList.add('json-highlight');
      collectionRules.innerHTML = highlightJson(text || '');
      return;
    }
    collectionRules.classList.remove('json-highlight');
    collectionRules.textContent = typeof value === 'string' ? value : String(value ?? '');
  };

  const updateCollectionModeView = () => {
    const mode = collectionMode ? collectionMode.value : (state.collectionMode || 'query');
    if (collectionIo && collectionIo.dataset) {
      collectionIo.dataset.mode = mode;
    }
    document.querySelectorAll('[data-collection-mode]').forEach((panel) => {
      const panelMode = panel.dataset ? panel.dataset.collectionMode : null;
      panel.classList.toggle('is-hidden', panelMode !== mode);
    });
  };

  const renderCollections = (items) => {
    if (!collectionList) return;
    collectionList.innerHTML = '';
    const query = (state.collectionSearch || '').toLowerCase();
    (items || []).forEach((item) => {
      const name = typeof item === 'string' ? item : item.name;
      if (!name) return;
      if (query && !name.toLowerCase().includes(query)) return;
      const hasRules = state.collectionRulesMap ? state.collectionRulesMap[name] : undefined;
      const noRulesTag = hasRules === false ? 'no-rules' : '';
      const row = document.createElement('div');
      row.className = 'collection-row' + (state.selectedCollection === name ? ' active' : '');
      row.dataset.name = name;
      row.innerHTML = '<div class="collection-meta">' +
        '<div class="code">' + name + '</div>' +
        '</div>' +
        '<div class="hint">' + noRulesTag + '</div>';
      collectionList.appendChild(row);
    });
  };

  const loadCollectionRulesMap = async (items) => {
    const map = {};
    const names = (items || [])
      .map((item) => (typeof item === 'string' ? item : item && item.name))
      .filter((name) => typeof name === 'string' && name.length);
    await Promise.all(names.map(async (name) => {
      try {
        const data = await api('/collections/' + encodeURIComponent(name) + '/rules');
        map[name] = !(data === null || data === undefined);
      } catch {
        map[name] = undefined;
      }
    }));
    state.collectionRulesMap = map;
    renderCollections(state.collections);
  };

  const loadCollections = async () => {
    try {
      const data = await api('/collections');
      state.collections = data.items || [];
      renderCollections(state.collections);
      loadCollectionRulesMap(state.collections);
    } catch (err) {
      console.error(err);
    }
  };

  const renderCollectionHistory = () => {
    if (!collectionHistory) return;
    collectionHistory.innerHTML = '';
    const items = state.collectionHistory || [];
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'no history yet';
      collectionHistory.appendChild(empty);
      return;
    }
    items.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'history-row' + (state.selectedCollectionHistoryIndex === index ? ' active' : '');
      row.dataset.index = String(index);
      const mode = entry.mode || 'query';
      const runLabel = entry.runAsSystem ? 'system' : 'user';
      const userLabel = entry.user && (entry.user.email || entry.user.id) ? (entry.user.email || entry.user.id) : '';
      const hintParts = [mode, runLabel, utils.formatTime(entry.ts)];
      if (userLabel && runLabel === 'user') {
        hintParts.splice(2, 0, userLabel);
      }
      const collectionName = entry.collection || 'unknown';
      row.innerHTML = '<div class="history-meta">' +
        '<div class="code">' + collectionName + '</div>' +
        '<div class="hint">' + hintParts.join(' · ') + '</div>' +
        '</div>' +
        '<div class="hint"></div>';
      collectionHistory.appendChild(row);
    });
  };

  const loadCollectionHistory = async () => {
    try {
      const data = await api('/collections/history');
      state.collectionHistory = data.items || [];
      renderCollectionHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const applyCollectionHistoryEntry = (entry, index) => {
    if (!entry) return;
    const collectionName = entry.collection || null;
    state.selectedCollectionHistoryIndex = index;
    state.selectedCollection = collectionName;
    if (collectionSelected) collectionSelected.textContent = collectionName || 'select a collection';
    if (collectionMode && entry.mode) {
      collectionMode.value = entry.mode;
      state.collectionMode = entry.mode;
      updateCollectionModeView();
    }
    if (collectionRunMode) {
      collectionRunMode.value = entry.runAsSystem ? 'system' : 'user';
    }
    if (collectionSort) {
      collectionSort.value = entry.sort ? JSON.stringify(entry.sort) : '';
    }
    if (typeof entry.page === 'number' && entry.page > 0) {
      state.collectionPage = entry.page;
    } else {
      state.collectionPage = 1;
    }
    state.collectionHasMore = false;
    state.collectionTotal = 0;
    if (collectionQuery) {
      collectionQuery.value = entry.query ? JSON.stringify(entry.query, null, 2) : '';
      updateCollectionQueryHighlight();
    }
    if (collectionAggregate) {
      collectionAggregate.value = entry.pipeline ? JSON.stringify(entry.pipeline, null, 2) : '';
      updateCollectionAggregateHighlight();
    }
    if (entry.user && entry.user.id) {
      if (collectionUserInput) collectionUserInput.value = entry.user.id;
      setSelectedCollectionUser({
        id: entry.user.id,
        auth: {
          _id: entry.user.id,
          email: entry.user.email || undefined
        },
        custom: {}
      });
    } else {
      if (collectionUserInput) collectionUserInput.value = '';
      setSelectedCollectionUser(null);
    }
    renderCollections(state.collections);
    renderCollectionHistory();
    updateCollectionPager();
    loadCollectionRules();
  };

  const loadCollectionRules = async () => {
    if (!collectionRules) return;
    const name = state.selectedCollection;
    if (!name) {
      setCollectionRules('select a collection', false);
      setCollectionResult('', false);
      setRulesTabEnabled(false);
      setCollectionTab('query');
      return;
    }
    try {
      const runAsSystem = !collectionRunMode || collectionRunMode.value === 'system';
      const selectedUser = state.selectedCollectionUser;
      const fallbackUserId = collectionUserInput ? collectionUserInput.value.trim() : '';
      const userId = selectedUser
        ? String(selectedUser.id || (selectedUser.auth && selectedUser.auth._id) || '')
        : fallbackUserId;
      const params = [];
      if (userId) params.push('userId=' + encodeURIComponent(userId));
      if (collectionRunMode) params.push('runAsSystem=' + (runAsSystem ? 'true' : 'false'));
      const query = params.length ? ('?' + params.join('&')) : '';
      const data = await api('/collections/' + encodeURIComponent(name) + '/rules' + query);
      if (data === null || data === undefined) {
        setCollectionRules('no rules configured', false);
        if (state.collectionRulesMap) state.collectionRulesMap[name] = false;
        setRulesTabEnabled(false);
        setCollectionTab('query');
      } else {
        setCollectionRules(data, true);
        if (state.collectionRulesMap) state.collectionRulesMap[name] = true;
        setRulesTabEnabled(true);
      }
      renderCollections(state.collections);
    } catch (err) {
      setCollectionRules('Error: ' + err.message, false);
      setRulesTabEnabled(true);
    }
  };

  const runCollectionAction = async (options = {}) => {
    if (!collectionResult) return;
    const name = state.selectedCollection;
    if (!name) {
      setCollectionResult('Select a collection first', false);
      return;
    }
    const keepPage = options && options.keepPage;
    const recordHistory = !keepPage;
    if (!keepPage) {
      state.collectionPage = 1;
    }
    const shouldRefreshTotals = !keepPage || !state.collectionTotal;
    state.collectionHasMore = false;
    if (shouldRefreshTotals) {
      state.collectionTotal = 0;
    }
    state.collectionLoading = true;
    state.collectionTotalsLoading = shouldRefreshTotals;
    updateCollectionPager();
    const runAsSystem = !collectionRunMode || collectionRunMode.value === 'system';
    const selectedUser = state.selectedCollectionUser;
    const fallbackUserId = collectionUserInput ? collectionUserInput.value.trim() : '';
    const userId = selectedUser
      ? String(selectedUser.id || (selectedUser.auth && selectedUser.auth._id) || '')
      : fallbackUserId;
    const mode = collectionMode ? collectionMode.value : 'query';
    try {
      const sortRaw = collectionSort ? collectionSort.value.trim() : '';
      const sort = parseJsonObject(sortRaw, 'Sort');
      if (mode === 'aggregate') {
        const raw = collectionAggregate ? collectionAggregate.value.trim() : '';
        const pipeline = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(pipeline)) {
          throw new Error('Aggregate pipeline must be a JSON array');
        }
        const data = await api('/collections/aggregate', {
          method: 'POST',
          body: JSON.stringify({
            collection: name,
            pipeline,
            sort: sort || undefined,
            runAsSystem,
            userId: userId || undefined,
            page: state.collectionPage,
            recordHistory
          })
        });
        state.collectionHasMore = !!data.hasMore;
        if (typeof data.page === 'number') {
          state.collectionPage = data.page;
        }
        if (shouldRefreshTotals) {
          if (typeof data.total === 'number') {
            state.collectionTotal = data.total;
          } else if (typeof data.count === 'number') {
            state.collectionTotal = data.count;
          }
          if (typeof data.pageSize === 'number') {
            state.collectionPageSize = data.pageSize;
          }
        }
        updateCollectionPager();
        setCollectionTab('query');
        setCollectionResult(data, true);
      } else {
        const raw = collectionQuery ? collectionQuery.value.trim() : '';
        const query = parseJsonObject(raw, 'Query') || {};
        const data = await api('/collections/query', {
          method: 'POST',
          body: JSON.stringify({
            collection: name,
            query,
            sort: sort || undefined,
            runAsSystem,
            userId: userId || undefined,
            page: state.collectionPage,
            recordHistory
          })
        });
        state.collectionHasMore = !!data.hasMore;
        if (typeof data.page === 'number') {
          state.collectionPage = data.page;
        }
        if (shouldRefreshTotals) {
          if (typeof data.total === 'number') {
            state.collectionTotal = data.total;
          } else if (typeof data.count === 'number') {
            state.collectionTotal = data.count;
          }
          if (typeof data.pageSize === 'number') {
            state.collectionPageSize = data.pageSize;
          }
        }
        updateCollectionPager();
        setCollectionTab('query');
        setCollectionResult(data, true);
      }
    } catch (err) {
      const payload = err && err.payload && typeof err.payload === 'object'
        ? err.payload
        : null;
      if (payload) {
        const baseMessage = payload.error || payload.message || err.message || 'Error';
        const stack = typeof payload.stack === 'string' ? payload.stack : '';
        setCollectionTab('query');
        setCollectionResult(stack ? (baseMessage + '\n' + stack) : ('Error: ' + baseMessage), false);
      } else {
        setCollectionTab('query');
        setCollectionResult('Error: ' + err.message, false);
      }
    } finally {
      state.collectionLoading = false;
      state.collectionTotalsLoading = false;
      updateCollectionPager();
      if (recordHistory) {
        loadCollectionHistory();
      }
    }
  };

  const buildCollectionUserOptions = (authItems, customItems) => {
    const builder = root.users && root.users.buildMergedUsers
      ? root.users.buildMergedUsers
      : (() => []);
    const merged = builder(authItems, customItems);
    return merged.map((entry) => {
      const auth = entry.auth || {};
      const custom = entry.custom || {};
      const id = String(entry.id || auth._id || '');
      const email = auth.email || custom.email || custom.name || id || 'unknown';
      const label = email && id && email !== id ? email + ' · ' + id : (email || id || 'unknown');
      return { entry, id, label, value: id };
    });
  };

  const renderCollectionUserOptions = (options) => {
    if (!collectionUserList) return;
    collectionUserList.innerHTML = '';
    state.collectionUserMap = {};
    options.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.value || option.id || option.label;
      if (option.label) {
        item.label = option.label;
      }
      collectionUserList.appendChild(item);
      const entry = option.entry || {};
      const auth = entry.auth || {};
      const keys = new Set();
      if (option.id) keys.add(String(option.id));
      if (entry.id) keys.add(String(entry.id));
      if (auth._id) keys.add(String(auth._id));
      keys.forEach((key) => {
        if (!key) return;
        state.collectionUserMap[String(key).toLowerCase()] = option.entry;
      });
    });
  };

  const setSelectedCollectionUser = (entry) => {
    state.selectedCollectionUser = entry || null;
  };

  const resolveCollectionUserFromInput = () => {
    if (!collectionUserInput) return;
    const value = collectionUserInput.value.trim();
    if (!value) {
      setSelectedCollectionUser(null);
      return;
    }
    const entry = state.collectionUserMap[value.toLowerCase()];
    if (entry) {
      setSelectedCollectionUser(entry);
    } else {
      const parts = value.split('·').map((item) => item.trim()).filter(Boolean);
      const tail = parts.length ? parts[parts.length - 1] : '';
      const tailEntry = tail ? state.collectionUserMap[tail.toLowerCase()] : null;
      if (tailEntry) {
        if (collectionUserInput) collectionUserInput.value = tail;
        setSelectedCollectionUser(tailEntry);
      } else {
        setSelectedCollectionUser(null);
      }
    }
  };

  const searchCollectionUsers = async (query) => {
    try {
      const search = query ? '&q=' + encodeURIComponent(query) : '';
      const data = await api('/users?scope=all&authLimit=50&customLimit=50&customPage=1' + search);
      if (data.meta && data.meta.userIdField) {
        state.userIdField = data.meta.userIdField;
      }
      const authItems = (data.auth && data.auth.items) || [];
      const customItems = (data.custom && data.custom.items) || [];
      const options = buildCollectionUserOptions(authItems, customItems);
      renderCollectionUserOptions(options);
      resolveCollectionUserFromInput();
    } catch (err) {
      console.error(err);
    }
  };

  const refreshUserOptions = (authItems, customItems) => {
    if (!collectionUserList || state.collectionUserQuery) return;
    const options = buildCollectionUserOptions(authItems, customItems);
    renderCollectionUserOptions(options);
  };

  const init = () => {
    if (refreshCollections) {
      refreshCollections.addEventListener('click', loadCollections);
    }

    if (collectionSearch) {
      collectionSearch.addEventListener('input', () => {
        state.collectionSearch = collectionSearch.value.trim();
        renderCollections(state.collections);
      });
    }

    if (collectionViewJson) {
      collectionViewJson.addEventListener('click', () => {
        setCollectionResultView('json');
      });
    }

    if (collectionViewTable) {
      collectionViewTable.addEventListener('click', () => {
        setCollectionResultView('table');
      });
    }

    if (collectionResult) {
      collectionResult.addEventListener('click', (event) => {
        const element = getTargetElement(event.target);
        const target = element ? element.closest('td') : null;
        if (!target) return;
        if (shouldShowTablePopover(target)) {
          showTablePopover(target);
          event.stopPropagation();
          return;
        }
        hideTablePopover();
      });
    }

    document.addEventListener('click', (event) => {
      const element = getTargetElement(event.target);
      if (element && element.closest('.table-popover')) {
        return;
      }
      hideTablePopover();
    });

    if (collectionQuery) {
      collectionQuery.addEventListener('input', updateCollectionQueryHighlight);
      collectionQuery.addEventListener('scroll', updateCollectionQueryHighlight);
    }
    if (collectionAggregate) {
      collectionAggregate.addEventListener('input', updateCollectionAggregateHighlight);
      collectionAggregate.addEventListener('scroll', updateCollectionAggregateHighlight);
    }

    if (collectionList) {
      collectionList.addEventListener('click', (event) => {
        const target = (event.target && event.target.closest)
          ? event.target.closest('.collection-row')
          : null;
        if (!target) return;
        const name = target.dataset.name;
        if (!name) return;
        state.selectedCollection = name;
        state.collectionPage = 1;
        state.collectionHasMore = false;
        state.collectionTotal = 0;
        state.selectedCollectionHistoryIndex = null;
        if (collectionSelected) collectionSelected.textContent = name;
        renderCollections(state.collections);
        renderCollectionHistory();
        updateCollectionPager();
        setCollectionTab('query');
        loadCollectionRules();
      });
    }

    if (collectionRunMode) {
      collectionRunMode.addEventListener('change', () => {
        loadCollectionRules();
      });
    }

    if (collectionMode) {
      collectionMode.addEventListener('change', () => {
        state.collectionMode = collectionMode.value;
        state.collectionPage = 1;
        state.collectionHasMore = false;
        state.collectionLoading = false;
        updateCollectionPager();
        updateCollectionModeView();
      });
    }

    if (runCollectionQuery) {
      runCollectionQuery.addEventListener('click', () => {
        runCollectionAction();
      });
    }

    if (collectionPrev) {
      collectionPrev.addEventListener('click', () => {
        if (state.collectionPage <= 1) return;
        state.collectionPage -= 1;
        runCollectionAction({ keepPage: true });
      });
    }

    if (collectionNext) {
      collectionNext.addEventListener('click', () => {
        if (!state.collectionHasMore) return;
        state.collectionPage += 1;
        runCollectionAction({ keepPage: true });
      });
    }

    if (collectionHistory) {
      collectionHistory.addEventListener('click', (event) => {
        const target = (event.target && event.target.closest)
          ? event.target.closest('.history-row')
          : null;
        if (!target) return;
        const index = Number(target.dataset.index);
        const entry = state.collectionHistory[index];
        if (!entry) return;
        applyCollectionHistoryEntry(entry, index);
      });
    }

    if (collectionUserInput) {
      collectionUserInput.addEventListener('input', () => {
        state.collectionUserQuery = collectionUserInput.value.trim();
        resolveCollectionUserFromInput();
        if (state.__collectionUserTimer) {
          clearTimeout(state.__collectionUserTimer);
        }
        if (!state.collectionUserQuery || state.collectionUserQuery.length < 2) {
          renderCollectionUserOptions([]);
          loadCollectionRules();
          return;
        }
        state.__collectionUserTimer = setTimeout(() => {
          searchCollectionUsers(state.collectionUserQuery);
        }, 250);
      });
      collectionUserInput.addEventListener('change', () => {
        resolveCollectionUserFromInput();
        loadCollectionRules();
      });
    }

    collectionTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.collectionTab;
        setCollectionTab(tab);
      });
    });

    updateCollectionModeView();
    updateCollectionPager();
    setCollectionTab('query');
    setCollectionResultView('json');
    updateCollectionQueryHighlight();
    updateCollectionAggregateHighlight();
    setRulesTabEnabled(false);
  };

  root.collections = {
    init,
    loadCollections,
    loadCollectionHistory,
    refreshUserOptions
  };
})();
