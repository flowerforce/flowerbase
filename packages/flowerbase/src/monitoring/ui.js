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
  const eventCount = document.getElementById('eventCount');
  const wsStatus = document.getElementById('wsStatus');
  const clock = document.getElementById('clock');
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
  const functionList = document.getElementById('functionList');
  const functionSelected = document.getElementById('functionSelected');
  const functionSearch = document.getElementById('functionSearch');
  const functionUserInput = document.getElementById('functionUserInput');
  const functionUserList = document.getElementById('functionUserList');
  const functionRunMode = document.getElementById('functionRunMode');
  const functionEditor = document.getElementById('functionEditor');
  const functionCode = document.getElementById('functionCode');
  const restoreFunction = document.getElementById('restoreFunction');
  const functionEditorStatus = document.getElementById('functionEditorStatus');
  const functionArgs = document.getElementById('functionArgs');
  const invokeFunction = document.getElementById('invokeFunction');
  const functionResult = document.getElementById('functionResult');
  const refreshFunctions = document.getElementById('refreshFunctions');
  const functionHistory = document.getElementById('functionHistory');
  const clearEvents = document.getElementById('clearEvents');
  const tabButtons = document.querySelectorAll('[data-tab]');
  const tabPanels = document.querySelectorAll('[data-panel]');
  const HISTORY_LIMIT = 30;

  const api = async (path, options) => {
    const res = await fetch('__MONIT_BASE__/api' + path, {
      headers: { 'Content-Type': 'application/json' },
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

  state.customLimit = Number(customLimit.value || 25) || 25;

  const formatLine = (event) => {
    const time = formatTime(event.ts);
    const type = (event.type || 'log').toLowerCase();
    const msg = event.message || '';
    return time + '  ' + type.padEnd(12, ' ') + '  ' + msg;
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
    const recent = filtered.slice(-350);
    eventsList.innerHTML = '';
    recent.forEach((event) => {
      const row = document.createElement('div');
      row.className = 'event-row';
      row.dataset.id = event.id;
      const typeClass = event.type === 'error' ? 'error' : (event.type === 'warn' ? 'warn' : '');
      row.innerHTML = '<div>' + formatTime(event.ts) + '</div>' +
        '<div class="event-type ' + typeClass + '">' + (event.type || '-') + '</div>' +
        '<div>' + (event.message || '') + '</div>';
      row.addEventListener('click', () => showDetail(event));
      eventsList.appendChild(row);
    });
    eventCount.textContent = state.events.length;
  };

  const showDetail = (event) => {
    state.selectedId = event.id;
    state.selectedEvent = event;
    eventDetail.textContent = JSON.stringify(event, null, 2);
    const functionData = getFunctionEventData(event);
    if (functionData && eventFunctionButton) {
      eventFunctionButton.classList.remove('is-hidden');
      eventFunctionButton.textContent = 'use in invoke · ' + functionData.name;
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
    const ws = new WebSocket(scheme + '://' + location.host + '__MONIT_BASE__/ws');
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
    merged.sort((a, b) => {
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
      const hasAuth = !!(auth && auth._id);
      const row = document.createElement('div');
      row.className = 'user-row' + (state.selectedUserId === userId ? ' active' : '');
      row.dataset.id = userId;
      row.innerHTML = '<div class="user-meta">' +
        '<div class="code">' + primaryEmail + '</div>' +
        '<div class="hint">' + status + '</div>' +
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
      setEditorStatus('Select a function first', true);
      return;
    }
    try {
      setEditorStatus('loading...');
      const data = await api('/functions/' + encodeURIComponent(name));
      const baseCode = data && data.code ? data.code : '';
      state.functionCodeCache[name] = baseCode;
      functionCode.value = baseCode;
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
    }
    setEditorStatus('override cleared');
  };

  const buildFunctionUserOptions = (authItems, customItems) => {
    const merged = buildMergedUsers(authItems, customItems);
    return merged.map((entry) => {
      const auth = entry.auth || {};
      const custom = entry.custom || {};
      const id = String(entry.id || '');
      const email = auth.email || custom.email || custom.name || id || 'unknown';
      const label = email && id && email !== id ? email + ' · ' + id : (email || id || 'unknown');
      return { entry, id, label };
    });
  };

  const renderFunctionUserOptions = (options) => {
    if (!functionUserList) return;
    functionUserList.innerHTML = '';
    state.functionUserMap = {};
    options.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.label;
      functionUserList.appendChild(item);
      state.functionUserMap[option.label.toLowerCase()] = option.entry;
      if (option.id) {
        state.functionUserMap[String(option.id).toLowerCase()] = option.entry;
      }
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
      setSelectedFunctionUser(null);
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
    eventDetail.textContent = 'select an event to inspect payload';
    if (eventFunctionButton) {
      eventFunctionButton.classList.add('is-hidden');
      eventFunctionButton.textContent = 'use in invoke';
    }
    renderEvents();
  });

  refreshUsers.addEventListener('click', loadUsers);
  refreshFunctions.addEventListener('click', loadFunctions);

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

  createUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = newUserEmail.value.trim();
    const password = newUserPassword.value.trim();
    if (!email || !password) return;
    await api('/users', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    newUserEmail.value = '';
    newUserPassword.value = '';
    loadUsers();
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
    functionSelected.textContent = 'selected: ' + name;
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
      functionSelected.textContent = 'selected: ' + functionData.name;
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
      functionSelected.textContent = 'selected: ' + entry.name;
      functionArgs.value = JSON.stringify(entry.args || [], null, 2);
      if (functionRunMode && typeof entry.runAsSystem === 'boolean') {
        functionRunMode.value = entry.runAsSystem ? 'system' : 'user';
      }
      if (entry.user && (entry.user.email || entry.user.id)) {
        const label = entry.user.email || entry.user.id;
        if (functionUserInput) functionUserInput.value = label;
        setSelectedFunctionUser({
          id: entry.user.id || label,
          auth: {
            _id: entry.user.id || label,
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
      const userId = selectedUser
        ? String(selectedUser.id || (selectedUser.auth && selectedUser.auth._id) || '')
        : '';
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
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      setActiveTab(tab);
    });
  });
  connectWs();
  loadUsers();
  loadFunctions();
})();
