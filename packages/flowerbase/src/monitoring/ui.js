(function () {
  const state = {
    events: [],
    selectedId: null,
    selectedEvent: null,
    authUsers: [],
    customUsers: [],
    mergedUsers: [],
    mergedUserMap: {},
    userQuery: '',
    userIdField: 'id',
    functions: [],
    selectedFunction: null,
    functionQuery: '',
    functionHistory: [],
    functionCodeCache: {},
    selectedHistoryIndex: null,
    selectedFunctionUser: null,
    functionUserMap: {},
    functionUserQuery: '',
    __functionUserTimer: null,
    collections: [],
    selectedCollection: null,
    collectionSearch: '',
    collectionMode: 'query',
    collectionHistory: [],
    selectedCollectionHistoryIndex: null,
    collectionPage: 1,
    collectionHasMore: false,
    collectionTotal: 0,
    collectionPageSize: 50,
    collectionLoading: false,
    collectionTotalsLoading: false,
    collectionResultView: 'json',
    collectionResultPayload: null,
    collectionResultHighlight: false,
    selectedCollectionUser: null,
    collectionUserMap: {},
    collectionUserQuery: '',
    __collectionUserTimer: null,
    selectedUserId: null,
    __userSearchTimer: null,
    customPage: 1,
    customPages: 1,
    customLimit: 25
  };
  const eventsList = document.getElementById('eventsList');
  const eventDetail = document.getElementById('eventDetail');
  const eventFunctionButton = document.getElementById('eventFunctionButton');
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const wsStatus = document.getElementById('wsStatus');
  const clock = document.getElementById('clock');
  const ramStat = document.getElementById('ramStat');
  const cpuStat = document.getElementById('cpuStat');
  const mergedUsers = document.getElementById('mergedUsers');
  const userDetail = document.getElementById('userDetail');
  const userSearch = document.getElementById('userSearch');
  const customPrev = document.getElementById('customPrev');
  const customNext = document.getElementById('customNext');
  const customPage = document.getElementById('customPage');
  const customPages = document.getElementById('customPages');
  const customLimit = document.getElementById('customLimit');
  const refreshUsers = document.getElementById('refreshUsers');
  const createUserForm = document.getElementById('createUserForm');
  const newUserEmail = document.getElementById('newUserEmail');
  const newUserPassword = document.getElementById('newUserPassword');
  const createUserError = document.getElementById('createUserError');
  const functionList = document.getElementById('functionList');
  const functionSelected = document.getElementById('functionSelected');
  const functionSearch = document.getElementById('functionSearch');
  const functionUserInput = document.getElementById('functionUserInput');
  const functionUserList = document.getElementById('functionUserList');
  const functionRunMode = document.getElementById('functionRunMode');
  const functionEditor = document.getElementById('functionEditor');
  const functionCode = document.getElementById('functionCode');
  const functionHighlight = document.getElementById('functionHighlight');
  const functionGutter = document.getElementById('functionGutter');
  const restoreFunction = document.getElementById('restoreFunction');
  const functionEditorStatus = document.getElementById('functionEditorStatus');
  const functionArgs = document.getElementById('functionArgs');
  const invokeFunction = document.getElementById('invokeFunction');
  const functionResult = document.getElementById('functionResult');
  const refreshFunctions = document.getElementById('refreshFunctions');
  const functionHistory = document.getElementById('functionHistory');
  const refreshCollections = document.getElementById('refreshCollections');
  const collectionSearch = document.getElementById('collectionSearch');
  const collectionList = document.getElementById('collectionList');
  const collectionHistory = document.getElementById('collectionHistory');
  const collectionRules = document.getElementById('collectionRules');
  const collectionSelected = document.getElementById('collectionSelected');
  const collectionIo = document.getElementById('collectionIo');
  const collectionUserInput = document.getElementById('collectionUserInput');
  const collectionUserList = document.getElementById('collectionUserList');
  const collectionRunMode = document.getElementById('collectionRunMode');
  const collectionMode = document.getElementById('collectionMode');
  const collectionSort = document.getElementById('collectionSort');
  const collectionQuery = document.getElementById('collectionQuery');
  const collectionQueryHighlight = document.getElementById('collectionQueryHighlight');
  const collectionAggregate = document.getElementById('collectionAggregate');
  const collectionAggregateHighlight = document.getElementById('collectionAggregateHighlight');
  const runCollectionQuery = document.getElementById('runCollectionQuery');
  const collectionResult = document.getElementById('collectionResult');
  const collectionPrev = document.getElementById('collectionPrev');
  const collectionNext = document.getElementById('collectionNext');
  const collectionPage = document.getElementById('collectionPage');
  const collectionPages = document.getElementById('collectionPages');
  const collectionTotal = document.getElementById('collectionTotal');
  const collectionViewJson = document.getElementById('collectionViewJson');
  const collectionViewTable = document.getElementById('collectionViewTable');
  const collectionTabButtons = document.querySelectorAll('[data-collection-tab]');
  const collectionTabPanels = document.querySelectorAll('[data-collection-panel]');
  const clearEvents = document.getElementById('clearEvents');
  const tabButtons = document.querySelectorAll('[data-tab]');
  const tabPanels = document.querySelectorAll('[data-panel]');
  const HISTORY_LIMIT = 30;

  const api = async (path, options) => {
    const headers = { 'Content-Type': 'application/json' };
    const res = await fetch('__MONIT_BASE__/api' + path, {
      headers,
      ...options
    });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson
      ? await res.json().catch(() => null)
      : await res.text();
    if (!res.ok) {
      let message = '';
      if (payload && typeof payload === 'object') {
        message = payload.error || payload.message || '';
      } else if (typeof payload === 'string') {
        message = payload;
      }
      if (!message) message = String(res.status);
      const error = new Error(message);
      error.payload = payload;
      throw error;
    }
    return payload;
  };

  const formatTime = (ts) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const formatDateTime = (value) => {
    if (!value) return '';
    let date;
    if (typeof value === 'number') {
      date = new Date(value);
    } else if (typeof value === 'string') {
      date = new Date(value);
    } else if (value instanceof Date) {
      date = value;
    } else {
      return '';
    }
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const parseJsonObject = (raw, label) => {
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(label + ' must be a JSON object');
    }
    return parsed;
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
    collectionTabButtons.forEach((item) => {
      item.classList.toggle('active', item.dataset.collectionTab === value);
    });
    collectionTabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.collectionPanel === value);
    });
  };

  state.customLimit = Number(customLimit.value || 25) || 25;

  const escapeHtml = (value) => {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const safeStringify = (value) => {
    try {
      const serialized = JSON.stringify(value);
      return serialized === undefined ? String(value) : serialized;
    } catch (err) {
      return String(value);
    }
  };

  const tokenRegex = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*|\b\d+(?:\.\d+)?\b|\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|class|extends|async|await|import|export|default)\b|\b(?:true|false|null|undefined)\b/g;

  const classifyToken = (token) => {
    if (!token) return 'keyword';
    if (token.startsWith('//') || token.startsWith('/*')) return 'comment';
    const first = token[0];
    if (first === '"' || first === "'" || first === '`') return 'string';
    if (/^\d/.test(token)) return 'number';
    if (/^(true|false|null|undefined)$/.test(token)) return 'literal';
    return 'keyword';
  };

  const highlightCode = (code) => {
    if (!code) return ' ';
    let output = '';
    let lastIndex = 0;
    tokenRegex.lastIndex = 0;
    let match;
    while ((match = tokenRegex.exec(code))) {
      const token = match[0];
      output += escapeHtml(code.slice(lastIndex, match.index));
      const type = classifyToken(token);
      output += '<span class="token ' + type + '">' + escapeHtml(token) + '</span>';
      lastIndex = match.index + token.length;
    }
    output += escapeHtml(code.slice(lastIndex));
    return output || ' ';
  };

  const highlightJson = (text) => {
    if (!text) return ' ';
    const regex = /"(?:\\.|[^"\\])*"(?=\\s*:)|"(?:\\.|[^"\\])*"|(-?\\d+(?:\\.\\d+)?(?:[eE][+\\-]?\\d+)?)|\\btrue\\b|\\bfalse\\b|\\bnull\\b/g;
    let output = '';
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text))) {
      const token = match[0];
      output += escapeHtml(text.slice(lastIndex, match.index));
      let type = 'literal';
      if (token[0] === '"') {
        const tail = text.slice(match.index + token.length);
        type = /^\s*:/.test(tail) ? 'key' : 'string';
      } else if (/^\d|-/.test(token)) {
        type = 'number';
      } else if (/^(true|false|null)$/.test(token)) {
        type = 'literal';
      }
      output += '<span class="token ' + type + '">' + escapeHtml(token) + '</span>';
      lastIndex = match.index + token.length;
    }
    output += escapeHtml(text.slice(lastIndex));
    return output || ' ';
  };

  const TABLE_TRUNCATE_LIMIT = 200;

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
    const header = columns.map((key) => '<th>' + escapeHtml(key) + '</th>').join('');
    const body = items.map((row) => {
      const cells = columns.map((key) => {
        const value = useValueColumn ? row : (row && typeof row === 'object' ? row[key] : undefined);
        const fullValue = formatCellFullValue(value);
        const displayValue = formatCellValue(value);
        const truncated = fullValue.length > TABLE_TRUNCATE_LIMIT;
        return '<td class="' + (truncated ? 'truncated' : '') + '" data-full="' +
          escapeHtml(fullValue) + '">' + escapeHtml(displayValue) + '</td>';
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

  const syncFunctionEditorScroll = () => {
    if (!functionCode) return;
    if (functionHighlight) {
      functionHighlight.scrollTop = functionCode.scrollTop;
      functionHighlight.scrollLeft = functionCode.scrollLeft;
    }
    if (functionGutter) {
      functionGutter.scrollTop = functionCode.scrollTop;
    }
  };

  const updateFunctionEditor = () => {
    if (!functionCode) return;
    const code = functionCode.value || '';
    if (functionHighlight) {
      functionHighlight.innerHTML = highlightCode(code);
    }
    if (functionGutter) {
      const lines = Math.max(1, code.split('\n').length);
      let out = '';
      for (let i = 1; i <= lines; i += 1) {
        out += i + (i === lines ? '' : '\n');
      }
      functionGutter.textContent = out;
    }
    syncFunctionEditorScroll();
  };

  const formatLine = (event) => {
    const time = formatTime(event.ts);
    const type = (event.type || 'log').toLowerCase();
    const msg = event.message || '';
    return time + '  ' + type.padEnd(12, ' ') + '  ' + msg;
  };

  const getEventUserId = (event) => {
    if (!event || typeof event !== 'object') return '';
    if (typeof event.userId === 'string') return event.userId;
    if (event.user && typeof event.user === 'object') {
      if (typeof event.user.id === 'string') return event.user.id;
      if (typeof event.user._id === 'string') return event.user._id;
      if (typeof event.user.userId === 'string') return event.user.userId;
    }
    const data = event.data;
    if (!data || typeof data !== 'object') return '';
    if (typeof data.userId === 'string') return data.userId;
    if (typeof data.user_id === 'string') return data.user_id;
    if (data.user && typeof data.user === 'object') {
      if (typeof data.user.id === 'string') return data.user.id;
      if (typeof data.user._id === 'string') return data.user._id;
      if (typeof data.user.userId === 'string') return data.user.userId;
    }
    if (data.user_data && typeof data.user_data === 'object') {
      if (typeof data.user_data.id === 'string') return data.user_data.id;
      if (typeof data.user_data._id === 'string') return data.user_data._id;
    }
    return '';
  };

  const goToUser = (userId) => {
    if (!userId || !userSearch) return;
    state.selectedUserId = String(userId);
    state.userQuery = state.selectedUserId;
    state.customPage = 1;
    userSearch.value = state.userQuery;
    setActiveTab('users');
    loadUsers();
  };

  const getFunctionEventData = (event) => {
    if (!event || !event.type || event.type !== 'function') return null;
    const data = event.data || {};
    let name = null;
    if (data && typeof data === 'object') {
      if (typeof data.function === 'string') name = data.function;
      if (!name && typeof data.name === 'string') name = data.name;
    }
    if (!name && typeof event.message === 'string') {
      const match = event.message.match(/^invoke\s+(.+)$/i);
      if (match) name = match[1].trim();
    }
    if (!name) return null;
    let args = null;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.arguments)) args = data.arguments;
      else if (Array.isArray(data.args)) args = data.args;
      else if (data.arguments !== undefined) args = data.arguments;
      else if (data.args !== undefined) args = data.args;
    }
    if (!Array.isArray(args)) {
      args = args === null || args === undefined ? [] : [args];
    }
    return { name, args };
  };

  const matchesQuery = (event, query) => {
    if (!query) return true;
    const blob = JSON.stringify(event).toLowerCase();
    return blob.includes(query);
  };

  const renderEvents = () => {
    const query = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;
    const filtered = state.events.filter((event) => {
      if (type && event.type !== type) return false;
      return matchesQuery(event, query);
    });
    const recent = filtered.slice(-350).reverse();
    eventsList.innerHTML = '';
    recent.forEach((event) => {
      const userId = getEventUserId(event);
      const row = document.createElement('div');
      row.className = 'event-row';
      row.dataset.id = event.id;
      const typeClass = event.type === 'error' ? 'error' : (event.type === 'warn' ? 'warn' : '');
      row.innerHTML = '<div>' + formatTime(event.ts) + '</div>' +
        '<div class="event-type ' + typeClass + '">' + (event.type || '-') + '</div>' +
        '<div class="event-user" title="' + (userId || '-') + '">' + (userId || '-') + '</div>' +
        '<div>' + (event.message || '') + '</div>';
      if (userId) {
        const userCell = row.querySelector('.event-user');
        if (userCell) {
          userCell.classList.add('is-link');
          userCell.addEventListener('click', (clickEvent) => {
            clickEvent.stopPropagation();
            goToUser(userId);
          });
        }
      }
      row.addEventListener('click', () => showDetail(event));
      eventsList.appendChild(row);
    });
  };

  const showDetail = (event) => {
    state.selectedId = event.id;
    state.selectedEvent = event;
    const text = JSON.stringify(event, null, 2) || '';
    eventDetail.classList.add('json-highlight');
    eventDetail.innerHTML = highlightJson(text);
    const functionData = getFunctionEventData(event);
    if (functionData && eventFunctionButton) {
      eventFunctionButton.classList.remove('is-hidden');
      eventFunctionButton.textContent = 'use in invoke';
    } else if (eventFunctionButton) {
      eventFunctionButton.classList.add('is-hidden');
      eventFunctionButton.textContent = 'use in invoke';
    }
  };

  const addEvents = (events) => {
    if (!Array.isArray(events)) return;
    state.events = events;
    renderEvents();
  };

  const pushEvent = (event) => {
    state.events.push(event);
    renderEvents();
  };

  const connectWs = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = scheme + '://' + location.host + '__MONIT_BASE__/ws';
    const ws = new WebSocket(wsUrl);
    wsStatus.textContent = 'WS: connecting';
    wsStatus.classList.remove('ok', 'warn');
    ws.onopen = () => {
      wsStatus.textContent = 'WS: online';
      wsStatus.classList.add('ok');
    };
    ws.onclose = () => {
      wsStatus.textContent = 'WS: offline';
      wsStatus.classList.remove('ok');
      wsStatus.classList.add('warn');
      setTimeout(connectWs, 2500);
    };
    ws.onerror = () => {
      wsStatus.textContent = 'WS: error';
      wsStatus.classList.add('warn');
    };
    ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data);
        if (payload.type === 'init') {
          addEvents(payload.events || []);
        } else if (payload.type === 'event' && payload.event) {
          pushEvent(payload.event);
        }
      } catch (err) {
        console.error(err);
      }
    };
  };

  const buildMergedUsers = (authItems, customItems) => {
    const idField = state.userIdField || 'id';
    const authMap = {};
    const customMap = {};
    (authItems || []).forEach((user) => {
      const id = String(user._id || user.id || '');
      if (id) authMap[id] = user;
    });
    (customItems || []).forEach((user) => {
      const id = String(user[idField] || user._id || user.id || '');
      if (id) customMap[id] = user;
    });
    const merged = [];
    Object.keys(authMap).forEach((id) => {
      merged.push({
        id,
        auth: authMap[id],
        custom: customMap[id]
      });
    });
    Object.keys(customMap).forEach((id) => {
      if (authMap[id]) return;
      merged.push({
        id,
        auth: null,
        custom: customMap[id]
      });
    });
    const getCreatedAt = (entry) => {
      const auth = entry && entry.auth ? entry.auth : null;
      const custom = entry && entry.custom ? entry.custom : null;
      const raw = (auth && auth.createdAt) || (custom && custom.createdAt);
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'string') {
        const ts = Date.parse(raw);
        if (!Number.isNaN(ts)) return ts;
      }
      return null;
    };
    merged.sort((a, b) => {
      const aTs = getCreatedAt(a);
      const bTs = getCreatedAt(b);
      if (aTs !== null || bTs !== null) {
        const aScore = aTs === null ? -Infinity : aTs;
        const bScore = bTs === null ? -Infinity : bTs;
        if (aScore !== bScore) return bScore - aScore;
      }
      const aLabel = (a.auth && a.auth.email) || (a.custom && a.custom.email) || String(a.id || '');
      const bLabel = (b.auth && b.auth.email) || (b.custom && b.custom.email) || String(b.id || '');
      return aLabel.localeCompare(bLabel);
    });
    return merged;
  };

  const renderUsers = (authItems, customItems, pagination) => {
    mergedUsers.innerHTML = '';
    const merged = buildMergedUsers(authItems, customItems);

    state.mergedUserMap = {};
    userDetail.textContent = 'select a user to inspect';
    merged.forEach((entry) => {
      const userId = String(entry.id || '');
      if (userId) {
        state.mergedUserMap[userId] = entry;
      }
    });

    merged.forEach((entry) => {
      const auth = entry.auth || null;
      const custom = entry.custom || null;
      const userId = String(entry.id || '');
      const primaryEmail = (auth && auth.email) || (custom && custom.email) || (custom && custom.name) || userId || 'unknown';
      const status = (auth && auth.status) || (auth && auth.email ? 'unknown' : 'no-auth');
      const createdAt = (auth && auth.createdAt) || (custom && custom.createdAt);
      const createdLabel = formatDateTime(createdAt);
      const hint = createdLabel ? status + ' · ' + createdLabel : status;
      const hasAuth = !!(auth && auth._id);
      const row = document.createElement('div');
      row.className = 'user-row' + (state.selectedUserId === userId ? ' active' : '');
      row.dataset.id = userId;
      row.innerHTML = '<div class="user-meta">' +
        '<div class="code">' + primaryEmail + '</div>' +
        '<div class="hint">' + hint + '</div>' +
        '</div>' +
        '<div class="user-actions">' +
        (hasAuth ? ('<button data-action="toggle" data-id="' + auth._id + '">' + (auth.status === 'disabled' ? 'enable' : 'disable') + '</button>' +
          '<button data-action="password" data-id="' + auth._id + '" class="secondary">password</button>') : '') +
        '</div>';
      mergedUsers.appendChild(row);
    });

    if (pagination) {
      state.customPage = pagination.page || 1;
      state.customPages = pagination.pages || 1;
      customPage.textContent = String(state.customPage);
      customPages.textContent = String(state.customPages);
    }
  };

  const loadUsers = async () => {
    try {
      const search = state.userQuery ? '&q=' + encodeURIComponent(state.userQuery) : '';
      const query = '?scope=all&authLimit=200&customPage=' +
        state.customPage + '&customLimit=' + state.customLimit + search;
      const data = await api('/users' + query);
      state.authUsers = (data.auth && data.auth.items) || [];
      state.customUsers = (data.custom && data.custom.items) || [];
      state.customPages = data.custom && data.custom.pagination ? data.custom.pagination.pages || 1 : 1;
      if (data.meta && data.meta.userIdField) {
        state.userIdField = data.meta.userIdField;
      }
      renderUsers(
        state.authUsers,
        state.customUsers,
        data.custom && data.custom.pagination
      );
      if (collectionUserList && !state.collectionUserQuery) {
        const options = buildCollectionUserOptions(state.authUsers, state.customUsers);
        renderCollectionUserOptions(options);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const renderFunctions = (items) => {
    const query = (state.functionQuery || '').toLowerCase();
    const filtered = (items || []).filter((fn) => {
      if (!query) return true;
      return JSON.stringify(fn).toLowerCase().includes(query);
    });
    functionList.innerHTML = '';
    filtered.forEach((fn) => {
      const row = document.createElement('div');
      row.className = 'function-row' + (state.selectedFunction === fn.name ? ' active' : '');
      row.dataset.name = fn.name;
      const runMode = fn.run_as_system ? 'system' : 'user';
      const visibility = fn.private ? 'private' : 'public';
      row.innerHTML = '<div class="code">' + fn.name + '</div>' +
        '<div class="hint">' + visibility + ' · ' + runMode + '</div>';
      functionList.appendChild(row);
    });
  };

  const formatArgsPreview = (args) => {
    try {
      let preview = JSON.stringify(args);
      if (preview.length > 80) {
        preview = preview.slice(0, 80) + '...';
      }
      return preview;
    } catch (err) {
      return '[unserializable]';
    }
  };

  const renderHistory = () => {
    if (!functionHistory) return;
    functionHistory.innerHTML = '';
    if (!state.functionHistory.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'no history yet';
      functionHistory.appendChild(empty);
      return;
    }
    state.functionHistory.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'history-row' + (state.selectedHistoryIndex === index ? ' active' : '');
      row.dataset.index = String(index);
      const runMode = entry.runAsSystem === false ? 'user' : 'system';
      const userLabel = entry.user && (entry.user.email || entry.user.id)
        ? (entry.user.email || entry.user.id)
        : '';
      const metaParts = [];
      metaParts.push(formatTime(entry.ts));
      metaParts.push(runMode);
      if (userLabel) metaParts.push(userLabel);
      row.innerHTML = '<div class="history-meta">' +
        '<div class="code">' + entry.name + '</div>' +
        '<div class="hint">' + metaParts.join(' · ') + ' · ' + formatArgsPreview(entry.args) + '</div>' +
        '</div>' +
        '<div class="hint"></div>';
      functionHistory.appendChild(row);
    });
  };

  const loadFunctionHistory = async () => {
    try {
      const data = await api('/functions/history');
      const items = data.items || [];
      state.functionHistory = items.slice(0, HISTORY_LIMIT);
      renderHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const setRunModeForFunction = (name) => {
    if (!functionRunMode) return;
    const fn = (state.functions || []).find((item) => item.name === name);
    if (!fn || typeof fn.run_as_system !== 'boolean') return;
    functionRunMode.value = fn.run_as_system ? 'system' : 'user';
  };

  const setEditorStatus = (text, isError) => {
    if (!functionEditorStatus) return;
    functionEditorStatus.textContent = text || '';
    functionEditorStatus.classList.toggle('error', !!isError);
  };

  const loadFunctionCode = async () => {
    if (!functionCode) return;
    const name = state.selectedFunction;
    if (!name) {
      functionCode.value = '';
      updateFunctionEditor();
      setEditorStatus('Select a function first', true);
      return;
    }
    try {
      setEditorStatus('loading...');
      const data = await api('/functions/' + encodeURIComponent(name));
      const baseCode = data && data.code ? data.code : '';
      state.functionCodeCache[name] = baseCode;
      functionCode.value = baseCode;
      updateFunctionEditor();
      setEditorStatus('loaded');
    } catch (err) {
      setEditorStatus('Error: ' + err.message, true);
    }
  };

  const clearFunctionOverride = () => {
    const name = state.selectedFunction;
    if (!name) return;
    if (functionCode) {
      functionCode.value = state.functionCodeCache[name] || '';
      updateFunctionEditor();
    }
    setEditorStatus('override cleared');
  };

  const buildFunctionUserOptions = (authItems, customItems) => {
    const merged = buildMergedUsers(authItems, customItems);
    return merged.map((entry) => {
      const auth = entry.auth || {};
      const custom = entry.custom || {};
      const id = String(entry.id || auth._id || '');
      const email = auth.email || custom.email || custom.name || id || 'unknown';
      const label = email && id && email !== id ? email + ' · ' + id : (email || id || 'unknown');
      return { entry, id, label, value: id };
    });
  };

  const renderFunctionUserOptions = (options) => {
    if (!functionUserList) return;
    functionUserList.innerHTML = '';
    state.functionUserMap = {};
    options.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.value || option.id || option.label;
      if (option.label) {
        item.label = option.label;
      }
      functionUserList.appendChild(item);
      const entry = option.entry || {};
      const auth = entry.auth || {};
      const keys = new Set();
      if (option.id) keys.add(String(option.id));
      if (entry.id) keys.add(String(entry.id));
      if (auth._id) keys.add(String(auth._id));
      keys.forEach((key) => {
        if (!key) return;
        state.functionUserMap[String(key).toLowerCase()] = option.entry;
      });
    });
  };

  const setSelectedFunctionUser = (entry, label) => {
    state.selectedFunctionUser = entry || null;
  };

  const resolveFunctionUserFromInput = () => {
    if (!functionUserInput) return;
    const value = functionUserInput.value.trim();
    if (!value) {
      setSelectedFunctionUser(null);
      return;
    }
    const entry = state.functionUserMap[value.toLowerCase()];
    if (entry) {
      setSelectedFunctionUser(entry, value);
    } else {
      const parts = value.split('·').map((item) => item.trim()).filter(Boolean);
      const tail = parts.length ? parts[parts.length - 1] : '';
      const tailEntry = tail ? state.functionUserMap[tail.toLowerCase()] : null;
      if (tailEntry) {
        if (functionUserInput) functionUserInput.value = tail;
        setSelectedFunctionUser(tailEntry, tail);
      } else {
        setSelectedFunctionUser(null);
      }
    }
  };

  const searchFunctionUsers = async (query) => {
    try {
      const search = query ? '&q=' + encodeURIComponent(query) : '';
      const data = await api('/users?scope=all&authLimit=50&customLimit=50&customPage=1' + search);
      if (data.meta && data.meta.userIdField) {
        state.userIdField = data.meta.userIdField;
      }
      const authItems = (data.auth && data.auth.items) || [];
      const customItems = (data.custom && data.custom.items) || [];
      const options = buildFunctionUserOptions(authItems, customItems);
      renderFunctionUserOptions(options);
      resolveFunctionUserFromInput();
    } catch (err) {
      console.error(err);
    }
  };

  const buildCollectionUserOptions = (authItems, customItems) => {
    return buildFunctionUserOptions(authItems, customItems);
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
      const type = typeof item === 'object' && item && item.type ? item.type : 'collection';
      const row = document.createElement('div');
      row.className = 'collection-row' + (state.selectedCollection === name ? ' active' : '');
      row.dataset.name = name;
      row.innerHTML = '<div class="collection-meta">' +
        '<div class="code">' + name + '</div>' +
        '<div class="hint">' + type + '</div>' +
        '</div>' +
        '<div class="hint"></div>';
      collectionList.appendChild(row);
    });
  };

  const loadCollections = async () => {
    try {
      const data = await api('/collections');
      state.collections = data.items || [];
      renderCollections(state.collections);
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
      const hintParts = [mode, runLabel, formatTime(entry.ts)];
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
      setCollectionRules(data, true);
    } catch (err) {
      setCollectionRules('Error: ' + err.message, false);
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

  const loadFunctions = async () => {
    try {
      const data = await api('/functions');
      state.functions = data.items || [];
      renderFunctions(state.functions);
      loadFunctionHistory();
    } catch (err) {
      console.error(err);
    }
  };

  searchInput.addEventListener('input', renderEvents);
  typeFilter.addEventListener('change', renderEvents);
  clearEvents.addEventListener('click', () => {
    searchInput.value = '';
    typeFilter.value = '';
    state.events = [];
    state.selectedEvent = null;
    eventDetail.classList.remove('json-highlight');
    eventDetail.textContent = 'select an event to inspect payload';
    if (eventFunctionButton) {
      eventFunctionButton.classList.add('is-hidden');
      eventFunctionButton.textContent = 'use in invoke';
    }
    renderEvents();
  });

  refreshUsers.addEventListener('click', loadUsers);
  refreshFunctions.addEventListener('click', loadFunctions);
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

  updateCollectionModeView();

  mergedUsers.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target) return;
    if (target.tagName === 'BUTTON') {
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!id) return;
      if (action === 'toggle') {
        const disabled = target.textContent === 'disable';
        await api('/users/' + id + '/status', {
          method: 'PATCH',
          body: JSON.stringify({ disabled })
        });
        loadUsers();
      }
      if (action === 'password') {
        const password = prompt('New password for user ' + id);
        if (!password) return;
        await api('/users/' + id + '/password', {
          method: 'PATCH',
          body: JSON.stringify({ password })
        });
        loadUsers();
      }
      return;
    }
    const row = target.closest('.user-row');
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;
    state.selectedUserId = id;
    mergedUsers.querySelectorAll('.user-row').forEach((item) => {
      item.classList.toggle('active', item.dataset.id === id);
    });
    const entry = state.mergedUserMap[id];
    if (entry) {
      userDetail.textContent = JSON.stringify(entry, null, 2);
    } else {
      userDetail.textContent = 'User not found in cache';
    }
  });

  customPrev.addEventListener('click', () => {
    if (state.customPage <= 1) return;
    state.customPage -= 1;
    loadUsers();
  });

  customNext.addEventListener('click', () => {
    if (state.customPage >= state.customPages) return;
    state.customPage += 1;
    loadUsers();
  });

  customLimit.addEventListener('change', () => {
    state.customLimit = Number(customLimit.value || 25);
    state.customPage = 1;
    loadUsers();
  });

  if (functionCode) {
    functionCode.addEventListener('input', () => {
      updateFunctionEditor();
    });
    functionCode.addEventListener('scroll', () => {
      syncFunctionEditorScroll();
    });
    functionCode.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const indent = '  ';
      const value = functionCode.value || '';
      const start = functionCode.selectionStart || 0;
      const end = functionCode.selectionEnd || 0;
      const hasSelection = start !== end;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      if (!hasSelection && !event.shiftKey) {
        const nextValue = value.slice(0, start) + indent + value.slice(end);
        functionCode.value = nextValue;
        const cursor = start + indent.length;
        functionCode.selectionStart = cursor;
        functionCode.selectionEnd = cursor;
        updateFunctionEditor();
        return;
      }

      const lineEndIndex = value.indexOf('\n', end);
      const blockEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
      const block = value.slice(lineStart, blockEnd);
      const lines = block.split('\n');
      if (!event.shiftKey) {
        const newLines = lines.map((line) => indent + line);
        const newBlock = newLines.join('\n');
        const nextValue = value.slice(0, lineStart) + newBlock + value.slice(blockEnd);
        functionCode.value = nextValue;
        functionCode.selectionStart = start + indent.length;
        functionCode.selectionEnd = end + indent.length * lines.length;
        updateFunctionEditor();
        return;
      }

      const removedCounts = lines.map((line) => {
        if (line.startsWith(indent)) return indent.length;
        if (line.startsWith('\t')) return 1;
        if (line.startsWith(' ')) return 1;
        return 0;
      });
      const newLines = lines.map((line, index) => {
        const remove = removedCounts[index];
        return remove > 0 ? line.slice(remove) : line;
      });
      const newBlock = newLines.join('\n');
      const nextValue = value.slice(0, lineStart) + newBlock + value.slice(blockEnd);
      functionCode.value = nextValue;
      const removedTotal = removedCounts.reduce((acc, count) => acc + count, 0);
      const removedFirst = removedCounts[0] || 0;
      const nextStart = Math.max(lineStart, start - removedFirst);
      const nextEnd = Math.max(nextStart, end - removedTotal);
      functionCode.selectionStart = nextStart;
      functionCode.selectionEnd = nextEnd;
      updateFunctionEditor();
    });
  }

  createUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = newUserEmail.value.trim();
    const password = newUserPassword.value.trim();
    if (createUserError) {
      createUserError.textContent = '';
      createUserError.classList.add('is-hidden');
    }
    if (!email || !password) return;
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      newUserEmail.value = '';
      newUserPassword.value = '';
      loadUsers();
    } catch (error) {
      if (!createUserError) return;
      let message = 'Failed to create user';
      if (error && typeof error === 'object') {
        const err = error;
        if (typeof err.message === 'string' && err.message) {
          message = err.message;
        }
        if (err.payload && typeof err.payload === 'object') {
          const payload = err.payload;
          if (typeof payload.error === 'string' && payload.error) {
            message = payload.error;
          } else if (typeof payload.message === 'string' && payload.message) {
            message = payload.message;
          }
        }
      }
      createUserError.textContent = message;
      createUserError.classList.remove('is-hidden');
    }
  });

  userSearch.addEventListener('input', () => {
    state.userQuery = userSearch.value.trim();
    state.customPage = 1;
    if (state.__userSearchTimer) {
      clearTimeout(state.__userSearchTimer);
    }
    state.__userSearchTimer = setTimeout(() => {
      loadUsers();
    }, 250);
  });

  functionList.addEventListener('click', (event) => {
    const target = (event.target && event.target.closest)
      ? event.target.closest('.function-row')
      : null;
    if (!target) return;
    const name = target.dataset.name;
    if (!name) return;
    state.selectedFunction = name;
    state.selectedHistoryIndex = null;
    functionSelected.textContent = name;
    functionResult.textContent = '';
    setRunModeForFunction(name);
    loadFunctionCode();
    functionList.querySelectorAll('.function-row').forEach((row) => {
      row.classList.toggle('active', row.dataset.name === name);
    });
    renderHistory();
  });

  functionSearch.addEventListener('input', () => {
    state.functionQuery = functionSearch.value.trim();
    renderFunctions(state.functions);
  });

  if (restoreFunction) {
    restoreFunction.addEventListener('click', () => {
      clearFunctionOverride();
    });
  }

  if (functionUserInput) {
    functionUserInput.addEventListener('input', () => {
      state.functionUserQuery = functionUserInput.value.trim();
      resolveFunctionUserFromInput();
      if (state.__functionUserTimer) {
        clearTimeout(state.__functionUserTimer);
      }
      if (!state.functionUserQuery || state.functionUserQuery.length < 2) {
        renderFunctionUserOptions([]);
        return;
      }
      state.__functionUserTimer = setTimeout(() => {
        searchFunctionUsers(state.functionUserQuery);
      }, 250);
    });
    functionUserInput.addEventListener('change', resolveFunctionUserFromInput);
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

  const setActiveTab = (tab) => {
    tabButtons.forEach((item) => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
  };

  if (eventFunctionButton) {
    eventFunctionButton.addEventListener('click', () => {
      const functionData = getFunctionEventData(state.selectedEvent);
      if (!functionData) return;
      state.selectedFunction = functionData.name;
      state.selectedHistoryIndex = null;
      functionSelected.textContent = functionData.name;
      functionArgs.value = JSON.stringify(functionData.args || [], null, 2);
      functionResult.textContent = '';
      setRunModeForFunction(functionData.name);
      loadFunctionCode();
      renderFunctions(state.functions);
      renderHistory();
      setActiveTab('functions');
    });
  }

  if (functionHistory) {
    functionHistory.addEventListener('click', (event) => {
      const target = (event.target && event.target.closest)
        ? event.target.closest('.history-row')
        : null;
      if (!target) return;
      const index = Number(target.dataset.index);
      const entry = state.functionHistory[index];
      if (!entry) return;
      state.selectedFunction = entry.name;
      state.selectedHistoryIndex = index;
      functionSelected.textContent = entry.name;
      functionArgs.value = JSON.stringify(entry.args || [], null, 2);
      if (functionRunMode && typeof entry.runAsSystem === 'boolean') {
        functionRunMode.value = entry.runAsSystem ? 'system' : 'user';
      }
      if (entry.user && entry.user.id) {
        const label = entry.user.id;
        if (functionUserInput) functionUserInput.value = label;
        setSelectedFunctionUser({
          id: entry.user.id,
          auth: {
            _id: entry.user.id,
            email: entry.user.email || undefined
          },
          custom: {}
        }, label);
      } else {
        if (functionUserInput) functionUserInput.value = '';
        setSelectedFunctionUser(null);
      }
      functionResult.textContent = '';
      loadFunctionCode();
      renderFunctions(state.functions);
      renderHistory();
    });
  }

  invokeFunction.addEventListener('click', async () => {
    const name = state.selectedFunction;
    if (!name) {
      functionResult.textContent = 'Select a function first';
      return;
    }
    let args = [];
    try {
      const raw = functionArgs.value.trim();
      args = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(args)) {
        throw new Error('Arguments must be an array');
      }
    } catch (err) {
      functionResult.textContent = 'Invalid JSON arguments: ' + err.message;
      return;
    }
    try {
      const runAsSystem = !functionRunMode || functionRunMode.value === 'system';
      const selectedUser = state.selectedFunctionUser;
      const fallbackUserId = functionUserInput ? functionUserInput.value.trim() : '';
      const userId = selectedUser
        ? String(selectedUser.id || (selectedUser.auth && selectedUser.auth._id) || '')
        : fallbackUserId;
      const liveCode = functionCode ? functionCode.value || '' : '';
      const overrideCode = liveCode.trim() ? liveCode : undefined;
      const data = await api('/functions/invoke', {
        method: 'POST',
        body: JSON.stringify({
          name,
          arguments: args,
          runAsSystem,
          userId: userId || undefined,
          code: overrideCode || undefined
        })
      });
      functionResult.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      const payload = err && err.payload && typeof err.payload === 'object'
        ? err.payload
        : null;
      if (payload) {
        const baseMessage = payload.error || payload.message || err.message || 'Error';
        const stack = typeof payload.stack === 'string' ? payload.stack : '';
        functionResult.textContent = stack ? (baseMessage + '\n' + stack) : ('Error: ' + baseMessage);
      } else {
        functionResult.textContent = 'Error: ' + err.message;
      }
    } finally {
      loadFunctionHistory();
    }
  });

  const updateClock = () => {
    clock.textContent = new Date().toLocaleString();
  };
  setInterval(updateClock, 1000);
  updateClock();
  updateFunctionEditor();
  updateCollectionPager();
  setCollectionTab('query');
  setCollectionResultView('json');
  updateCollectionQueryHighlight();
  updateCollectionAggregateHighlight();
  const updateStats = async () => {
    if (!ramStat || !cpuStat) return;
    try {
      const data = await api('/stats');
      if (!data) return;
      const ramMb = typeof data.ramMb === 'number' ? data.ramMb : null;
      const cpu = typeof data.cpuPercent === 'number' ? data.cpuPercent : null;
      ramStat.textContent = ramMb !== null ? `RAM ${ramMb.toFixed(1)}MB` : 'RAM --';
      cpuStat.textContent = cpu !== null ? `CPU ${cpu.toFixed(1)}%` : 'CPU --';
    } catch (err) {
      ramStat.textContent = 'RAM --';
      cpuStat.textContent = 'CPU --';
    }
  };
  setInterval(updateStats, 2000);
  updateStats();
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      setActiveTab(tab);
    });
  });
  collectionTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.collectionTab;
      setCollectionTab(tab);
    });
  });
  connectWs();
  loadUsers();
  loadFunctions();
  loadCollections();
  loadCollectionHistory();
})();
