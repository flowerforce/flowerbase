export const MONITOR_UI_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>flowerbase monit</title>
    <style>
      :root {
        --bg: #0a0f0b;
        --bg-2: #0e1510;
        --fg: #c7ffdb;
        --muted: #6f8a77;
        --accent: #31e981;
        --warn: #ffb84d;
        --err: #ff5f5f;
        --border: #1a2f22;
        --panel: #0b120d;
        --panel-2: #0d1711;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        height: 100%;
      }
      body {
        margin: 0;
        font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        color: var(--fg);
        background: radial-gradient(1200px 600px at 15% -10%, #12301c 0%, transparent 60%),
          radial-gradient(1200px 600px at 110% 10%, #0f2a1a 0%, transparent 55%),
          linear-gradient(180deg, var(--bg), #070b08 60%);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background: repeating-linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.03) 0px,
          rgba(255, 255, 255, 0.03) 1px,
          transparent 2px,
          transparent 4px
        );
        pointer-events: none;
        mix-blend-mode: soft-light;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(90deg, rgba(15, 30, 20, 0.9), rgba(8, 14, 10, 0.6));
        position: sticky;
        top: 0;
        z-index: 10;
        backdrop-filter: blur(6px);
      }
      .brand {
        display: flex;
        align-items: baseline;
        gap: 12px;
      }
      .brand .logo {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 1px;
        color: var(--accent);
      }
      .brand .title {
        font-size: 14px;
        text-transform: uppercase;
        color: var(--muted);
      }
      .status {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 12px;
        color: var(--muted);
      }
      .pill {
        padding: 4px 8px;
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--fg);
        background: rgba(11, 22, 14, 0.8);
      }
      .pill.ok {
        color: var(--accent);
        border-color: rgba(49, 233, 129, 0.4);
      }
      .pill.warn {
        color: var(--warn);
        border-color: rgba(255, 184, 77, 0.4);
      }
      main {
        padding: 16px;
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .tab-button {
        border: 1px solid var(--border);
        background: rgba(12, 20, 14, 0.9);
        color: var(--muted);
        padding: 6px 12px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-size: 11px;
        cursor: pointer;
      }
      .tab-button.active {
        color: var(--accent);
        border-color: rgba(49, 233, 129, 0.5);
        background: rgba(49, 233, 129, 0.12);
      }
      .tab-panels {
        display: flex;
        flex-direction: column;
        gap: 16px;
        flex: 1;
        min-height: 0;
      }
      .tab-panel {
        display: none;
      }
      .tab-panel.active {
        display: flex;
        flex-direction: column;
        flex: 1;
        height: 100%;
        min-height: 0;
      }
      .split-grid {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
        gap: 12px;
        align-items: start;
        flex: 1;
        min-height: 0;
      }
      .functions-grid {
        grid-template-columns: minmax(220px, 30%) minmax(0, 1fr);
      }
      .users-grid {
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      }
      .column-stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
        height: 100%;
      }
      .right-column {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
        height: 100%;
      }
      .list-panel,
      .detail-panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .list-panel {
        flex: 1;
      }
      .detail-panel {
        flex: 1;
      }
      .panel {
        background: linear-gradient(180deg, rgba(12, 20, 14, 0.95), rgba(8, 14, 10, 0.95));
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 14px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--muted);
      }
      .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }
      .controls .wide-input {
        flex: 1;
        min-width: 280px;
      }
      input, select, textarea, button {
        font-family: inherit;
        font-size: 12px;
      }
      input, select, textarea {
        background: var(--panel);
        border: 1px solid var(--border);
        color: var(--fg);
        padding: 6px 8px;
        border-radius: 6px;
      }
      textarea {
        width: 100%;
        min-height: 120px;
        resize: vertical;
      }
      button {
        background: rgba(49, 233, 129, 0.16);
        border: 1px solid rgba(49, 233, 129, 0.5);
        color: var(--accent);
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
      }
      button.secondary {
        color: var(--muted);
        border-color: var(--border);
        background: rgba(18, 26, 20, 0.6);
      }
      button.danger {
        color: var(--err);
        border-color: rgba(255, 95, 95, 0.5);
        background: rgba(255, 95, 95, 0.1);
      }
      .events-list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px;
        font-size: 12px;
      }
      .event-row {
        display: grid;
        grid-template-columns: 86px 90px 1fr;
        gap: 8px;
        padding: 4px 6px;
        border-bottom: 1px dashed rgba(26, 47, 34, 0.6);
        cursor: pointer;
      }
      .event-row:last-child {
        border-bottom: none;
      }
      .event-row:hover {
        background: rgba(49, 233, 129, 0.08);
      }
      .event-type {
        color: var(--accent);
      }
      .event-type.error {
        color: var(--err);
      }
      .event-type.warn {
        color: var(--warn);
      }
      .event-detail {
        margin-top: 10px;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px;
        flex: 1;
        min-height: 0;
        overflow: auto;
        font-size: 11px;
        color: var(--muted);
        white-space: pre-wrap;
      }
      .subpanel {
        margin-top: 0;
        padding: 10px;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 8px;
      }
      .subpanel-title {
        font-size: 12px;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .user-list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        font-size: 12px;
      }
      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 8px;
        font-size: 11px;
        color: var(--muted);
      }
      .pager-controls {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .pager-controls button {
        padding: 4px 8px;
      }
      .user-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        padding: 6px;
        border-bottom: 1px dashed rgba(26, 47, 34, 0.6);
        cursor: pointer;
      }
      .user-row.active {
        background: rgba(49, 233, 129, 0.14);
        border-color: rgba(49, 233, 129, 0.45);
      }
      .user-row:hover {
        background: rgba(49, 233, 129, 0.08);
      }
      .function-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px;
        border-bottom: 1px dashed rgba(26, 47, 34, 0.6);
        cursor: pointer;
      }
      .function-row.active {
        background: rgba(49, 233, 129, 0.12);
        border-color: rgba(49, 233, 129, 0.35);
      }
      .function-row:hover {
        background: rgba(49, 233, 129, 0.08);
      }
      .user-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .user-actions {
        display: flex;
        flex-direction: row;
        gap: 4px;
      }
      .list-panel .user-list,
      .list-panel .events-list {
        flex: 1;
        min-height: 0;
      }
      .detail-panel .event-detail {
        flex: 1;
        min-height: 0;
        margin-top: 0;
      }
      .function-panel {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        gap: 10px;
      }
      .function-result {
        flex: 1;
        min-height: 0;
      }
      .function-panel textarea,
      .function-panel button,
      .function-panel .hint,
      .function-panel .event-detail {
        margin: 0;
      }
      .hint {
        color: var(--muted);
        font-size: 11px;
      }
      .code {
        color: var(--accent);
      }
      @media (max-width: 1100px) {
        .split-grid {
          grid-template-columns: 1fr;
        }
        .users-grid {
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">
        <div class="logo">flowerbase</div>
        <div class="title">monit</div>
      </div>
      <div class="status">
        <span id="clock" class="pill"></span>
        <span id="wsStatus" class="pill">WS: offline</span>
        <span class="pill">events <span id="eventCount">0</span></span>
      </div>
    </header>
    <main>
      <div class="tabs">
        <button class="tab-button active" data-tab="events">events</button>
        <button class="tab-button" data-tab="users">users</button>
        <button class="tab-button" data-tab="functions">functions</button>
      </div>
      <div class="tab-panels">
        <section class="panel tab-panel active" data-panel="events">
          <div class="panel-header">
            <span>Events</span>
            <span class="hint">last 24h cache</span>
          </div>
          <div class="split-grid">
            <div class="column-stack">
              <div class="controls">
                <input id="searchInput" type="text" placeholder="search events or payload" />
                <select id="typeFilter">
                  <option value="">all types</option>
                  <option value="auth">auth</option>
                  <option value="function">function</option>
                  <option value="trigger">trigger</option>
                  <option value="http_endpoint">http_endpoint</option>
                  <option value="api">api</option>
                  <option value="aws">aws</option>
                  <option value="rules">rules</option>
                  <option value="log">log</option>
                  <option value="error">error</option>
                </select>
                <button id="clearEvents" class="secondary">clear view</button>
              </div>
              <div id="eventsList" class="events-list"></div>
            </div>
            <div class="subpanel detail-panel">
              <div class="subpanel-title">event detail</div>
              <div id="eventDetail" class="event-detail">select an event to inspect payload</div>
            </div>
          </div>
        </section>
        <section class="panel tab-panel" data-panel="users">
          <div class="panel-header">
            <span>Users</span>
            <button id="refreshUsers" class="secondary">refresh</button>
          </div>
          <div class="controls">
            <input id="userSearch" class="wide-input" type="text" placeholder="search users (email, id, status)" />
          </div>
          <div class="split-grid users-grid">
            <div class="column-stack">
              <div class="subpanel list-panel">
                <div class="subpanel-title">users</div>
                <div id="mergedUsers" class="user-list"></div>
                <div class="pager">
                  <div class="pager-controls">
                    <button id="customPrev" class="secondary">prev</button>
                    <button id="customNext" class="secondary">next</button>
                  </div>
                  <div>
                    page <span id="customPage">1</span>/<span id="customPages">1</span>
                  </div>
                  <div class="pager-controls">
                    <label for="customLimit">size</label>
                    <select id="customLimit">
                      <option value="10">10</option>
                      <option value="25" selected>25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div class="right-column">
              <div class="subpanel detail-panel">
                <div class="subpanel-title">user detail</div>
                <pre id="userDetail" class="event-detail">select a user to inspect</pre>
              </div>
              <div class="subpanel">
                <div class="subpanel-title">create user</div>
                <form id="createUserForm">
                  <input id="newUserEmail" type="email" placeholder="email" required />
                  <input id="newUserPassword" type="password" placeholder="password" required />
                  <button type="submit">create</button>
                </form>
                <div class="hint">uses local-userpass provider</div>
              </div>
            </div>
          </div>
        </section>
        <section class="panel tab-panel" data-panel="functions">
          <div class="panel-header">
            <span>Functions</span>
            <button id="refreshFunctions" class="secondary">refresh</button>
          </div>
          <div class="split-grid functions-grid">
            <div class="column-stack">
              <div class="controls">
                <input id="functionSearch" class="wide-input" type="text" placeholder="search functions" />
              </div>
              <div class="subpanel list-panel">
                <div class="subpanel-title">functions</div>
                <div id="functionList" class="user-list"></div>
              </div>
            </div>
            <div class="right-column">
              <div class="subpanel function-panel">
                <div class="subpanel-title">invoke</div>
                <div class="hint" id="functionSelected">select a function</div>
                <textarea id="functionArgs" placeholder='[ "arg1", { "foo": "bar" } ]'></textarea>
                <button id="invokeFunction">invoke</button>
                <div class="hint">arguments must be valid JSON array</div>
                <pre id="functionResult" class="event-detail function-result"></pre>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
    <script>
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
    </script>
  </body>
</html>
`;
