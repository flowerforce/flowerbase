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

  dom.endpointSearch = document.getElementById('endpointSearch');
  dom.endpointList = document.getElementById('endpointList');
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

  const {
    endpointSearch,
    endpointList,
    endpointHint,
    endpointMeta,
    endpointFunctionButton,
    endpointMethod,
    endpointQuery,
    endpointHeaders,
    endpointBody,
    endpointResult,
    refreshEndpoints,
    invokeEndpoint
  } = dom;
  const { api, parseOptionalJsonValue, highlightJson, escapeHtml } = utils;
  const { setActiveTab } = helpers;

  const ENDPOINT_RESULT_PLACEHOLDER = state.endpointResult;

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
      if (endpointResult) endpointResult.textContent = ENDPOINT_RESULT_PLACEHOLDER;
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
    state.selectedEndpoint = endpoint;
    state.selectedEndpointKey = getEndpointKey(endpoint);
    setEndpointDetail(endpoint);
    if (endpointResult) {
      endpointResult.textContent = ENDPOINT_RESULT_PLACEHOLDER;
    }
    renderEndpoints();
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
      if (endpointResult) endpointResult.textContent = 'Select an endpoint first';
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
      if (endpointResult) endpointResult.textContent = 'Error: ' + err.message;
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
      if (endpointResult) {
        endpointResult.textContent = sections.join('\n\n');
      }
    } catch (err) {
      const payload = err && err.payload && typeof err.payload === 'object' ? err.payload : null;
      const message = payload
        ? payload.error || payload.message || err.message || 'Error'
        : err.message || 'Error';
      if (endpointResult) {
        endpointResult.textContent = 'Error: ' + message;
      }
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

    if (invokeEndpoint) {
      invokeEndpoint.addEventListener('click', invokeEndpointAction);
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
