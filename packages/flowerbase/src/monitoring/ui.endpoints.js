(function () {
  const root = window.MONIT;
  if (!root) return;
  const state = root.state;
  const dom = root.dom;
  const { utils, helpers } = root;

  if (state.endpoints === undefined) state.endpoints = [];
  if (state.selectedEndpoint === undefined) state.selectedEndpoint = null;
  if (state.selectedEndpointKey === undefined) state.selectedEndpointKey = '';
  if (state.endpointSearch === undefined) state.endpointSearch = '';
  if (state.endpointQuery === undefined) state.endpointQuery = '';
  if (state.endpointHeaders === undefined) state.endpointHeaders = '';
  if (state.endpointBody === undefined) state.endpointBody = '';
  if (state.endpointResult === undefined) state.endpointResult = 'invoke an endpoint to see the response';
  if (state.endpointFunctionMap === undefined) state.endpointFunctionMap = {};
  if (state.endpointHistory === undefined) state.endpointHistory = [];
  if (state.selectedEndpointHistoryIndex === undefined) state.selectedEndpointHistoryIndex = null;
  if (state.endpointActiveTab === undefined) state.endpointActiveTab = 'query';

  dom.endpointSearch = document.getElementById('endpointSearch');
  dom.endpointList = document.getElementById('endpointList');
  dom.endpointHistory = document.getElementById('endpointHistory');
  dom.endpointHint = document.getElementById('endpointHint');
  dom.endpointMeta = document.getElementById('endpointMeta');
  dom.endpointFunctionButton = document.getElementById('endpointFunctionButton');
  dom.endpointMethod = document.getElementById('endpointMethod');
  dom.endpointQuery = document.getElementById('endpointQuery');
  dom.endpointHeaders = document.getElementById('endpointHeaders');
  dom.endpointBody = document.getElementById('endpointBody');
  dom.endpointResult = document.getElementById('endpointResult');
  dom.refreshEndpoints = document.getElementById('refreshEndpoints');
  dom.invokeEndpoint = document.getElementById('invokeEndpoint');
  dom.endpointTabButtons = document.querySelectorAll('[data-endpoint-tab]');
  dom.endpointTabPanels = document.querySelectorAll('[data-endpoint-panel]');

  const {
    endpointSearch,
    endpointList,
    endpointHistory,
    endpointHint,
    endpointMeta,
    endpointFunctionButton,
    endpointMethod,
    endpointQuery,
    endpointHeaders,
    endpointBody,
    endpointResult,
    refreshEndpoints,
    invokeEndpoint,
    endpointTabButtons,
    endpointTabPanels
  } = dom;
  const { api, parseOptionalJsonValue, highlightJson, escapeHtml, formatTime, safeStringify } = utils;
  const { setActiveTab } = helpers;

  const ENDPOINT_RESULT_PLACEHOLDER = state.endpointResult;
  const HISTORY_LIMIT = 30;

  const updateEndpointTabIndicators = () => {
    if (!endpointTabButtons || !endpointTabButtons.forEach) return;
    const queryFilled = !!(endpointQuery && endpointQuery.value.trim());
    const headersFilled = !!(endpointHeaders && endpointHeaders.value.trim());
    const bodyFilled = !!(endpointBody && endpointBody.value.trim());
    endpointTabButtons.forEach((button) => {
      const tab = button.dataset.endpointTab;
      const hasContent = (
        (tab === 'query' && queryFilled) ||
        (tab === 'headers' && headersFilled) ||
        (tab === 'body' && bodyFilled)
      );
      button.classList.toggle('has-content', hasContent);
    });
  };

  const setEndpointResultContent = (text, highlight = false) => {
    if (!endpointResult) return;
    if (highlight) {
      endpointResult.classList.add('json-highlight');
      endpointResult.innerHTML = highlightJson(text || '');
    } else {
      endpointResult.classList.remove('json-highlight');
      endpointResult.textContent = text || '';
    }
  };

  const formatEndpointJson = (value) => {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return safeStringify(value);
    }
  };

  const getEndpointKey = (endpoint) => {
    if (!endpoint) return '';
    const method = (endpoint.http_method || 'POST').toUpperCase();
    const route = endpoint.route || '';
    return method + ':' + route;
  };

  const setEndpointDetail = (endpoint) => {
    if (!endpointMeta) return;
    if (!endpoint) {
      endpointMeta.textContent = 'select an endpoint to inspect';
      endpointMeta.classList.remove('json-highlight');
      if (endpointHint) endpointHint.textContent = 'select an endpoint';
      if (endpointFunctionButton) {
        endpointFunctionButton.classList.add('is-hidden');
        endpointFunctionButton.dataset.functionName = '';
      }
      setEndpointResultContent(ENDPOINT_RESULT_PLACEHOLDER, false);
      if (endpointMethod) endpointMethod.value = 'POST';
      state.selectedEndpoint = null;
      state.selectedEndpointKey = '';
      return;
    }
    const method = (endpoint.http_method || 'POST').toUpperCase();
    const route = endpoint.route || '';
    const functionName = endpoint.function_name || 'unknown';
    const status = endpoint.disabled ? 'disabled' : 'active';
    const jsonPayload = JSON.stringify(endpoint, null, 2) || '';
    endpointMeta.classList.add('json-highlight');
    endpointMeta.innerHTML = highlightJson(jsonPayload);
    if (endpointHint) endpointHint.textContent = status;
    if (endpointMethod) endpointMethod.value = method;
    if (endpointFunctionButton) {
      if (functionName && functionName !== 'unknown') {
        endpointFunctionButton.dataset.functionName = functionName;
        endpointFunctionButton.classList.remove('is-hidden');
      } else {
        endpointFunctionButton.dataset.functionName = '';
        endpointFunctionButton.classList.add('is-hidden');
      }
    }
  };

  const setEndpointTab = (tab) => {
    const nextTab = tab || 'query';
    state.endpointActiveTab = nextTab;
    if (endpointTabButtons && endpointTabButtons.forEach) {
      endpointTabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.endpointTab === nextTab);
      });
    }
    if (endpointTabPanels && endpointTabPanels.forEach) {
      endpointTabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.endpointPanel === nextTab);
      });
    }
  };

  const renderEndpointHistory = () => {
    if (!endpointHistory) return;
    endpointHistory.innerHTML = '';
    const items = state.endpointHistory || [];
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'no history yet';
      endpointHistory.appendChild(empty);
      return;
    }
    items.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'history-row' + (state.selectedEndpointHistoryIndex === index ? ' active' : '');
      row.dataset.index = String(index);
      const method = (entry.method || 'POST').toUpperCase();
      const route = entry.route || 'unknown';
      const statusLabel = entry.error
        ? 'error'
        : (typeof entry.statusCode === 'number' ? ('status ' + entry.statusCode) : '');
      const hintParts = [formatTime(entry.ts)];
      if (statusLabel) hintParts.unshift(statusLabel);
      row.innerHTML = '<div class="history-meta">' +
        '<div class="code">' + escapeHtml(method + ' ' + route) + '</div>' +
        '<div class="hint">' + escapeHtml(hintParts.join(' · ')) + '</div>' +
        '</div>' +
        '<div class="hint"></div>';
      endpointHistory.appendChild(row);
    });
  };

  const addEndpointHistory = (entry) => {
    state.endpointHistory.unshift(entry);
    if (state.endpointHistory.length > HISTORY_LIMIT) {
      state.endpointHistory.splice(HISTORY_LIMIT);
    }
    renderEndpointHistory();
  };

  const applyEndpointHistoryEntry = (entry, index) => {
    if (!entry) return;
    const method = (entry.method || 'POST').toUpperCase();
    const route = entry.route || '';
    const endpoint = (state.endpoints || []).find((item) => {
      if (!item) return false;
      const entryKey = method + ':' + route;
      return getEndpointKey(item) === entryKey;
    });
    if (endpoint) {
      applyEndpointSelection(endpoint);
    }
    state.selectedEndpointHistoryIndex = index;
    if (endpointMethod) endpointMethod.value = method;
    if (endpointQuery) endpointQuery.value = formatEndpointJson(entry.query);
    if (endpointHeaders) endpointHeaders.value = formatEndpointJson(entry.headers);
    if (endpointBody) endpointBody.value = formatEndpointJson(entry.body);
    setEndpointResultContent(entry.result || ENDPOINT_RESULT_PLACEHOLDER, true);
    updateEndpointTabIndicators();
    renderEndpointHistory();
  };

  const renderEndpoints = () => {
    if (!endpointList) return;
    endpointList.innerHTML = '';
    const query = (state.endpointSearch || '').toLowerCase();
    const endpoints = state.endpoints || [];
    endpoints.forEach((endpoint) => {
      const route = endpoint.route || '';
      const method = (endpoint.http_method || 'POST').toUpperCase();
      const functionName = endpoint.function_name || 'unknown';
      if (
        query &&
        !route.toLowerCase().includes(query) &&
        !method.toLowerCase().includes(query) &&
        !functionName.toLowerCase().includes(query)
      ) {
        return;
      }
      const row = document.createElement('div');
      row.className = 'endpoint-row';
      const key = getEndpointKey(endpoint);
      if (state.selectedEndpointKey === key) {
        row.classList.add('active');
      }
      if (endpoint.disabled) {
        row.classList.add('disabled');
      }
      row.dataset.endpointKey = key;
      row.dataset.route = route;
      row.dataset.method = method;
      row.innerHTML =
        '<div class="endpoint-meta">' +
        '<div class="code">' + escapeHtml(route) + '</div>' +
        '<div class="hint">' + escapeHtml(method + ' · ' + functionName) + '</div>' +
        '</div>';
      endpointList.appendChild(row);
    });
    if (!endpointList.children.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = query ? 'no endpoints match' : 'no endpoints configured';
      endpointList.appendChild(empty);
    }
  };

  const applyEndpointSelection = (endpoint) => {
    if (!endpoint) {
      setEndpointDetail(null);
      renderEndpoints();
      return;
    }
    const previousKey = state.selectedEndpointKey;
    state.selectedEndpoint = endpoint;
    state.selectedEndpointKey = getEndpointKey(endpoint);
    setEndpointDetail(endpoint);
    if (previousKey && previousKey !== state.selectedEndpointKey) {
      if (endpointQuery) endpointQuery.value = '';
      if (endpointHeaders) endpointHeaders.value = '';
      if (endpointBody) endpointBody.value = '';
    }
    setEndpointResultContent(ENDPOINT_RESULT_PLACEHOLDER, false);
    updateEndpointTabIndicators();
    state.selectedEndpointHistoryIndex = null;
    renderEndpoints();
    renderEndpointHistory();
  };

  const loadEndpoints = async () => {
    try {
      const data = await api('/endpoints');
      state.endpoints = data.items || [];
      const map = {};
      (state.endpoints || []).forEach((endpoint) => {
        if (!endpoint || !endpoint.function_name) return;
        const fnName = endpoint.function_name;
        if (!map[fnName]) {
          map[fnName] = [];
        }
        if (endpoint.route) {
          map[fnName].push(endpoint.route);
        }
      });
      state.endpointFunctionMap = map;
      setEndpointDetail(null);
      renderEndpoints();
      renderEndpointHistory();
      if (root.functions && root.functions.renderFunctions && state.functions && state.functions.length) {
        root.functions.renderFunctions(state.functions);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEndpointForFunction = async (functionName) => {
    if (!functionName) return;
    if (!state.endpoints || !state.endpoints.length) {
      await loadEndpoints();
    }
    const endpoint = (state.endpoints || []).find((item) => item.function_name === functionName);
    setActiveTab('endpoints');
    if (endpointSearch) {
      endpointSearch.value = '';
      state.endpointSearch = '';
    }
    if (endpoint) {
      applyEndpointSelection(endpoint);
      return;
    }
    state.endpointSearch = functionName;
    if (endpointSearch) endpointSearch.value = functionName;
    setEndpointDetail(null);
    renderEndpoints();
  };

  const invokeEndpointAction = async () => {
    if (!state.selectedEndpoint) {
      setEndpointResultContent('Select an endpoint first', false);
      return;
    }
    let query;
    let headers;
    let payloadValue;
    try {
      query = parseOptionalJsonValue(endpointQuery ? endpointQuery.value : '', 'Query');
      headers = parseOptionalJsonValue(endpointHeaders ? endpointHeaders.value : '', 'Headers');
      payloadValue = parseOptionalJsonValue(endpointBody ? endpointBody.value : '', 'Body');
    } catch (err) {
      setEndpointResultContent('Error: ' + err.message, false);
      return;
    }
    const method = endpointMethod
      ? endpointMethod.value || (state.selectedEndpoint.http_method || 'POST')
      : (state.selectedEndpoint.http_method || 'POST');
    try {
      const data = await api('/endpoints/invoke', {
        method: 'POST',
        body: JSON.stringify({
          route: state.selectedEndpoint.route,
          functionName: state.selectedEndpoint.function_name,
          method,
          query,
          headers,
          payload: payloadValue
        })
      });
      const headerLines = data.headers
        ? Object.entries(data.headers).map(([key, value]) => `${key}: ${value}`)
        : [];
      const bodyText =
        typeof data.body === 'object'
          ? JSON.stringify(data.body, null, 2)
          : String(data.body ?? '');
      const sections = [
        `status ${data.statusCode}`,
        headerLines.length ? headerLines.join('\n') : '',
        bodyText
      ].filter(Boolean);
      setEndpointResultContent(sections.join('\n\n'), true);
      addEndpointHistory({
        ts: Date.now(),
        route: state.selectedEndpoint.route,
        method,
        query,
        headers,
        body: payloadValue,
        statusCode: data.statusCode,
        result: sections.join('\n\n')
      });
    } catch (err) {
      const payload = err && err.payload && typeof err.payload === 'object' ? err.payload : null;
      const message = payload
        ? payload.error || payload.message || err.message || 'Error'
        : err.message || 'Error';
      const resultText = 'Error: ' + message;
      setEndpointResultContent(resultText, true);
      addEndpointHistory({
        ts: Date.now(),
        route: state.selectedEndpoint.route,
        method,
        query,
        headers,
        body: payloadValue,
        error: message,
        result: resultText
      });
    }
  };

  const init = () => {
    if (refreshEndpoints) refreshEndpoints.addEventListener('click', loadEndpoints);

    if (endpointSearch) {
      endpointSearch.addEventListener('input', () => {
        state.endpointSearch = endpointSearch.value.trim();
        renderEndpoints();
      });
    }

    if (endpointList) {
      endpointList.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest('.endpoint-row') : null;
        if (!target) return;
        const key = target.dataset.endpointKey;
        if (!key) return;
        const endpoint = (state.endpoints || []).find((item) => getEndpointKey(item) === key);
        if (!endpoint) return;
        applyEndpointSelection(endpoint);
      });
    }

    if (endpointHistory) {
      endpointHistory.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest('.history-row') : null;
        if (!target) return;
        const index = Number(target.dataset.index);
        if (Number.isNaN(index)) return;
        const entry = (state.endpointHistory || [])[index];
        if (!entry) return;
        applyEndpointHistoryEntry(entry, index);
      });
    }

    if (invokeEndpoint) {
      invokeEndpoint.addEventListener('click', invokeEndpointAction);
    }

    if (endpointTabButtons && endpointTabButtons.forEach) {
      endpointTabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          setEndpointTab(button.dataset.endpointTab || 'query');
        });
      });
      setEndpointTab(state.endpointActiveTab || 'query');
    }

    if (endpointQuery) {
      endpointQuery.addEventListener('input', updateEndpointTabIndicators);
    }
    if (endpointHeaders) {
      endpointHeaders.addEventListener('input', updateEndpointTabIndicators);
    }
    if (endpointBody) {
      endpointBody.addEventListener('input', updateEndpointTabIndicators);
    }

    if (endpointFunctionButton) {
      endpointFunctionButton.addEventListener('click', () => {
        const fnName = endpointFunctionButton.dataset.functionName;
        if (!fnName) return;
        if (root.functions && root.functions.selectFunction) {
          root.functions.selectFunction(fnName, { activateTab: true });
        } else {
          setActiveTab('functions');
        }
      });
    }
  };

  root.endpoints = {
    init,
    loadEndpoints,
    openEndpointForFunction
  };
})();
