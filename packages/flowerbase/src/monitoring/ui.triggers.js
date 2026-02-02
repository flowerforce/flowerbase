(function () {
  const root = window.MONIT;
  if (!root) return;
  const state = root.state;
  const dom = root.dom;
  const { utils, helpers } = root;

  if (state.triggers === undefined) state.triggers = [];
  if (state.selectedTrigger === undefined) state.selectedTrigger = null;
  if (state.triggerFunctionMap === undefined) state.triggerFunctionMap = {};

  dom.triggerList = document.getElementById('triggerList');
  dom.triggerDetail = document.getElementById('triggerDetail');
  dom.triggerFunctionButton = document.getElementById('triggerFunctionButton');
  dom.refreshTriggers = document.getElementById('refreshTriggers');

  const { triggerList, triggerDetail, triggerFunctionButton, refreshTriggers } = dom;
  const { api, highlightJson } = utils;
  const { setActiveTab } = helpers;

  const buildTriggerFunctionMap = (items) => {
    const map = {};
    (items || []).forEach((entry) => {
      const content = entry && entry.content ? entry.content : null;
      const handler = content && content.event_processors ? content.event_processors.FUNCTION : null;
      const fnName = handler && handler.config ? handler.config.function_name : null;
      const triggerName = (content && content.name) || entry.fileName || 'trigger';
      if (typeof fnName === 'string' && fnName) {
        map[fnName] = triggerName;
      }
    });
    state.triggerFunctionMap = map;
  };

  const renderTriggers = (items) => {
    if (!triggerList) return;
    triggerList.innerHTML = '';
    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'no triggers yet';
      triggerList.appendChild(empty);
      return;
    }
    items.forEach((entry) => {
      const content = entry && entry.content ? entry.content : null;
      const name = (content && content.name) || entry.fileName || 'trigger';
      const type = content && content.type ? content.type : 'unknown';
      const handler = content && content.event_processors ? content.event_processors.FUNCTION : null;
      const fnName = handler && handler.config ? handler.config.function_name : null;
      const hint = fnName ? (type + ' · ' + fnName) : type;
      const row = document.createElement('div');
      row.className = 'trigger-row' + (state.selectedTrigger === entry ? ' active' : '');
      row.dataset.name = name;
      row.innerHTML = '<div class="code">' + name + '</div>' +
        '<div class="hint">' + hint + '</div>';
      triggerList.appendChild(row);
    });
  };

  const showTriggerDetail = (entry) => {
    state.selectedTrigger = entry;
    const content = entry && entry.content ? entry.content : null;
    const handler = content && content.event_processors ? content.event_processors.FUNCTION : null;
    const fnName = handler && handler.config ? handler.config.function_name : null;
    if (triggerList) {
      triggerList.querySelectorAll('.trigger-row').forEach((row) => {
        const name = row.dataset.name;
        const currentName = (content && content.name) || entry.fileName || 'trigger';
        row.classList.toggle('active', name === currentName);
      });
    }
    if (triggerDetail) {
      triggerDetail.classList.add('json-highlight');
      triggerDetail.innerHTML = highlightJson(JSON.stringify(entry, null, 2) || '');
    }
    if (triggerFunctionButton) {
      if (fnName) {
        triggerFunctionButton.classList.remove('is-hidden');
        triggerFunctionButton.dataset.functionName = fnName;
      } else {
        triggerFunctionButton.classList.add('is-hidden');
        triggerFunctionButton.dataset.functionName = '';
      }
    }
  };

  const loadTriggers = async () => {
    try {
      const data = await api('/triggers');
      state.triggers = data.items || [];
      buildTriggerFunctionMap(state.triggers);
      renderTriggers(state.triggers);
      if (root.functions && root.functions.renderFunctions) {
        root.functions.renderFunctions(state.functions);
      }
      return state.triggers;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const openTriggerByName = async (triggerName) => {
    if (!triggerName) return;
    setActiveTab('triggers');
    const entries = state.triggers && state.triggers.length ? state.triggers : await loadTriggers();
    const entry = (entries || []).find((item) => {
      const content = item && item.content ? item.content : null;
      const name = (content && content.name) || item.fileName || 'trigger';
      return name === triggerName;
    });
    if (entry) {
      showTriggerDetail(entry);
    }
  };

  const init = () => {
    if (refreshTriggers) refreshTriggers.addEventListener('click', loadTriggers);

    if (triggerList) {
      triggerList.addEventListener('click', (event) => {
        const target = (event.target && event.target.closest)
          ? event.target.closest('.trigger-row')
          : null;
        if (!target) return;
        const name = target.dataset.name;
        const entry = (state.triggers || []).find((item) => {
          const content = item && item.content ? item.content : null;
          const triggerName = (content && content.name) || item.fileName || 'trigger';
          return triggerName === name;
        });
        if (!entry) return;
        showTriggerDetail(entry);
      });
    }

    if (triggerFunctionButton) {
      triggerFunctionButton.addEventListener('click', () => {
        const fnName = triggerFunctionButton.dataset.functionName;
        if (!fnName) return;
        if (root.functions && root.functions.selectFunction) {
          root.functions.selectFunction(fnName, { activateTab: true });
        } else {
          setActiveTab('functions');
        }
      });
    }
  };

  root.triggers = {
    init,
    loadTriggers,
    openTriggerByName
  };
})();
