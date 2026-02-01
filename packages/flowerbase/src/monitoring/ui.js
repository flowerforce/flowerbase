(function () {
  const state = {
    events: [],
    selectedId: null,
    authUsers: [],
    customUsers: [],
    mergedUsers: [],
    mergedUserMap: {},
    userQuery: '',
    userIdField: 'id',
    functions: [],
    selectedFunction: null,
    functionQuery: '',
    selectedUserId: null,
    __userSearchTimer: null,
    customPage: 1,
    customPages: 1,
    customLimit: 25
  };
  const eventsList = document.getElementById('eventsList');
  const eventDetail = document.getElementById('eventDetail');
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
  const functionArgs = document.getElementById('functionArgs');
  const invokeFunction = document.getElementById('invokeFunction');
  const functionResult = document.getElementById('functionResult');
  const refreshFunctions = document.getElementById('refreshFunctions');
  const clearEvents = document.getElementById('clearEvents');
  const tabButtons = document.querySelectorAll('[data-tab]');
  const tabPanels = document.querySelectorAll('[data-panel]');

  const api = async (path, options) => {
    const res = await fetch('__MONIT_BASE__/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.status);
    }
    return res.json();
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
    eventDetail.textContent = JSON.stringify(event, null, 2);
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

  const loadFunctions = async () => {
    try {
      const data = await api('/functions');
      state.functions = data.items || [];
      renderFunctions(state.functions);
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
    eventDetail.textContent = 'select an event to inspect payload';
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
    functionSelected.textContent = 'selected: ' + name;
    functionResult.textContent = '';
    functionList.querySelectorAll('.function-row').forEach((row) => {
      row.classList.toggle('active', row.dataset.name === name);
    });
  });

  functionSearch.addEventListener('input', () => {
    state.functionQuery = functionSearch.value.trim();
    renderFunctions(state.functions);
  });

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
      const data = await api('/functions/invoke', {
        method: 'POST',
        body: JSON.stringify({ name, arguments: args })
      });
      functionResult.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      functionResult.textContent = 'Error: ' + err.message;
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
      tabButtons.forEach((item) => item.classList.remove('active'));
      tabPanels.forEach((panel) => panel.classList.remove('active'));
      button.classList.add('active');
      const panel = document.querySelector('[data-panel="' + tab + '"]');
      if (panel) panel.classList.add('active');
    });
  });
  connectWs();
  loadUsers();
  loadFunctions();
})();
