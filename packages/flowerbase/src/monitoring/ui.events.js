(function () {
  const root = window.MONIT;
  if (!root) return;
  const state = root.state;
  const dom = root.dom;
  const { utils, helpers } = root;

  if (state.events === undefined) state.events = [];
  if (state.selectedId === undefined) state.selectedId = null;
  if (state.selectedEvent === undefined) state.selectedEvent = null;

  dom.eventsList = document.getElementById('eventsList');
  dom.eventDetail = document.getElementById('eventDetail');
  dom.eventFunctionButton = document.getElementById('eventFunctionButton');
  dom.searchInput = document.getElementById('searchInput');
  dom.typeFilter = document.getElementById('typeFilter');
  dom.wsStatus = document.getElementById('wsStatus');
  dom.clearEvents = document.getElementById('clearEvents');

  const {
    eventsList,
    eventDetail,
    eventFunctionButton,
    searchInput,
    typeFilter,
    wsStatus,
    clearEvents
  } = dom;
  const { formatTime, highlightJson } = utils;
  const { setActiveTab } = helpers;

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
    if (!eventsList || !searchInput || !typeFilter) return;
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
            if (root.users && root.users.goToUser) {
              root.users.goToUser(userId);
            }
          });
        }
      }
      row.addEventListener('click', () => showDetail(event));
      eventsList.appendChild(row);
    });
  };

  const showDetail = (event) => {
    if (!eventDetail) return;
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
    if (!wsStatus) return;
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

  const clearEventsState = () => {
    if (!searchInput || !typeFilter || !eventDetail) return;
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
  };

  const init = () => {
    if (searchInput) searchInput.addEventListener('input', renderEvents);
    if (typeFilter) typeFilter.addEventListener('change', renderEvents);
    if (clearEvents) clearEvents.addEventListener('click', clearEventsState);
    if (eventFunctionButton) {
      eventFunctionButton.addEventListener('click', () => {
        const functionData = getFunctionEventData(state.selectedEvent);
        if (!functionData) return;
        if (root.functions && root.functions.selectFunction) {
          root.functions.selectFunction(functionData.name, {
            args: functionData.args || [],
            activateTab: true
          });
        } else {
          setActiveTab('functions');
        }
      });
    }
  };

  root.events = {
    init,
    connectWs,
    renderEvents,
    addEvents,
    pushEvent,
    getFunctionEventData
  };
})();
