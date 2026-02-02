(function () {
  const root = window.MONIT;
  if (!root) return;
  const state = root.state;
  const dom = root.dom;
  const { utils, helpers } = root;

  if (state.functions === undefined) state.functions = [];
  if (state.selectedFunction === undefined) state.selectedFunction = null;
  if (state.functionQuery === undefined) state.functionQuery = '';
  if (state.functionHistory === undefined) state.functionHistory = [];
  if (state.functionCodeCache === undefined) state.functionCodeCache = {};
  if (state.selectedHistoryIndex === undefined) state.selectedHistoryIndex = null;
  if (state.selectedFunctionUser === undefined) state.selectedFunctionUser = null;
  if (state.functionUserMap === undefined) state.functionUserMap = {};
  if (state.functionUserQuery === undefined) state.functionUserQuery = '';
  if (state.__functionUserTimer === undefined) state.__functionUserTimer = null;

  dom.functionList = document.getElementById('functionList');
  dom.functionSelected = document.getElementById('functionSelected');
  dom.functionSearch = document.getElementById('functionSearch');
  dom.functionUserInput = document.getElementById('functionUserInput');
  dom.functionUserList = document.getElementById('functionUserList');
  dom.functionRunMode = document.getElementById('functionRunMode');
  dom.functionEditor = document.getElementById('functionEditor');
  dom.functionCode = document.getElementById('functionCode');
  dom.functionHighlight = document.getElementById('functionHighlight');
  dom.functionGutter = document.getElementById('functionGutter');
  dom.restoreFunction = document.getElementById('restoreFunction');
  dom.functionArgs = document.getElementById('functionArgs');
  dom.invokeFunction = document.getElementById('invokeFunction');
  dom.functionResult = document.getElementById('functionResult');
  dom.refreshFunctions = document.getElementById('refreshFunctions');
  dom.functionHistory = document.getElementById('functionHistory');

  const {
    functionList,
    functionSelected,
    functionSearch,
    functionUserInput,
    functionUserList,
    functionRunMode,
    functionEditor,
    functionCode,
    functionHighlight,
    functionGutter,
    restoreFunction,
    functionArgs,
    invokeFunction,
    functionResult,
    refreshFunctions,
    functionHistory
  } = dom;
  const { api, formatTime, highlightCode, escapeHtml } = utils;
  const { setActiveTab } = helpers;

  const HISTORY_LIMIT = 30;

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
      const modifiedTag = entry.codeModified ? '<span class="modified-pill">modified</span>' : '';
      row.innerHTML = '<div class="history-meta">' +
        '<div class="code">' + entry.name + '</div>' +
        '<div class="hint">' + metaParts.join(' · ') + ' · ' + formatArgsPreview(entry.args) +
        (modifiedTag ? (' · ' + modifiedTag) : '') + '</div>' +
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

  const setFunctionSelectedLabel = (name, modified) => {
    if (!functionSelected) return;
    if (!name) {
      functionSelected.textContent = 'select a function';
      return;
    }
    if (modified) {
      functionSelected.innerHTML =
        escapeHtml(name) + ' <span class="modified-pill">modified</span>';
    } else {
      functionSelected.textContent = name;
    }
  };

  const isFunctionCodeModified = (name) => {
    if (!name || !functionCode) return false;
    const base = state.functionCodeCache[name];
    if (typeof base !== 'string') return false;
    return functionCode.value !== base;
  };

  const updateFunctionModifiedState = () => {
    const name = state.selectedFunction;
    const modified = isFunctionCodeModified(name);
    setFunctionSelectedLabel(name, modified);
    if (restoreFunction) {
      restoreFunction.disabled = !modified;
    }
  };

  const loadFunctionCode = async () => {
    if (!functionCode) return;
    const name = state.selectedFunction;
    if (!name) {
      functionCode.value = '';
      updateFunctionEditor();
      updateFunctionModifiedState();
      return;
    }
    try {
      const data = await api('/functions/' + encodeURIComponent(name));
      const baseCode = data && data.code ? data.code : '';
      state.functionCodeCache[name] = baseCode;
      functionCode.value = baseCode;
      updateFunctionEditor();
    } catch (err) {
      console.error(err);
    }
    updateFunctionModifiedState();
  };

  const applyFunctionOverride = (code) => {
    if (!functionCode) return;
    functionCode.value = code || '';
    updateFunctionEditor();
    updateFunctionModifiedState();
  };

  const clearFunctionOverride = () => {
    const name = state.selectedFunction;
    if (!name) return;
    if (functionCode) {
      functionCode.value = state.functionCodeCache[name] || '';
      updateFunctionEditor();
    }
    updateFunctionModifiedState();
  };

  const buildFunctionUserOptions = (authItems, customItems) => {
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

  const setSelectedFunctionUser = (entry) => {
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

  const renderFunctions = (items) => {
    if (!functionList) return;
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
      const triggerName = state.triggerFunctionMap ? state.triggerFunctionMap[fn.name] : null;
      const metaParts = [visibility, runMode];
      const triggerTag = triggerName
        ? ' · <span class="trigger-link" data-trigger="' + escapeHtml(triggerName) + '">isTrigger</span>'
        : '';
      const endpointRoutes = state.endpointFunctionMap ? state.endpointFunctionMap[fn.name] : null;
      const endpointTitle = endpointRoutes && endpointRoutes.length
        ? ('endpoints: ' + endpointRoutes.join(', '))
        : '';
      const endpointTag = endpointRoutes && endpointRoutes.length
        ? ' · <span class="endpoint-link" title="' + escapeHtml(endpointTitle) + '">isEndpoint</span>'
        : '';
      row.innerHTML = '<div class="code">' + fn.name + '</div>' +
        '<div class="hint">' + metaParts.join(' · ') + triggerTag + endpointTag + '</div>';
      functionList.appendChild(row);
    });
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

  const selectFunction = (name, options = {}) => {
    if (!name) return;
    state.selectedFunction = name;
    state.selectedHistoryIndex = null;
    setFunctionSelectedLabel(name, false);
    if (options.args !== undefined && functionArgs) {
      functionArgs.value = JSON.stringify(options.args || [], null, 2);
    }
    if (functionResult) functionResult.textContent = '';
    setRunModeForFunction(name);
    loadFunctionCode();
    renderFunctions(state.functions);
    renderHistory();
    if (options.activateTab) {
      setActiveTab('functions');
    }
  };

  const refreshUserOptions = (authItems, customItems) => {
    if (!functionUserList || state.functionUserQuery) return;
    const options = buildFunctionUserOptions(authItems, customItems);
    renderFunctionUserOptions(options);
  };

  const init = () => {
    if (refreshFunctions) refreshFunctions.addEventListener('click', loadFunctions);

    if (functionCode) {
      functionCode.addEventListener('input', () => {
        updateFunctionEditor();
        updateFunctionModifiedState();
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

    if (functionList) {
      functionList.addEventListener('click', async (event) => {
        const target = (event.target && event.target.closest)
          ? event.target.closest('.function-row')
          : null;
        if (event.target && event.target.classList && event.target.classList.contains('trigger-link')) {
          const triggerName = event.target.dataset ? event.target.dataset.trigger : null;
          if (triggerName && root.triggers && root.triggers.openTriggerByName) {
            root.triggers.openTriggerByName(triggerName);
          }
          event.stopPropagation();
          return;
        }
        if (event.target && event.target.classList && event.target.classList.contains('endpoint-link')) {
          const fnName = target ? target.dataset.name : null;
          if (fnName && root.endpoints && root.endpoints.openEndpointForFunction) {
            await root.endpoints.openEndpointForFunction(fnName);
          }
          event.stopPropagation();
          return;
        }
        if (!target) return;
        const name = target.dataset.name;
        if (!name) return;
        state.selectedFunction = name;
        state.selectedHistoryIndex = null;
        setFunctionSelectedLabel(name, false);
        if (functionResult) functionResult.textContent = '';
        setRunModeForFunction(name);
        loadFunctionCode();
        functionList.querySelectorAll('.function-row').forEach((row) => {
          row.classList.toggle('active', row.dataset.name === name);
        });
        renderHistory();
      });
    }

    if (functionSearch) {
      functionSearch.addEventListener('input', () => {
        state.functionQuery = functionSearch.value.trim();
        renderFunctions(state.functions);
      });
    }

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
        setFunctionSelectedLabel(entry.name, false);
        if (functionArgs) {
          functionArgs.value = JSON.stringify(entry.args || [], null, 2);
        }
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
        if (functionResult) functionResult.textContent = '';
        const loadPromise = loadFunctionCode();
        if (entry.code) {
          Promise.resolve(loadPromise).then(() => {
            applyFunctionOverride(entry.code);
          });
        } else {
          updateFunctionModifiedState();
        }
        renderFunctions(state.functions);
        renderHistory();
      });
    }

    if (invokeFunction) {
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
    }

    updateFunctionEditor();
    updateFunctionModifiedState();
  };

  root.functions = {
    init,
    loadFunctions,
    renderFunctions,
    loadFunctionHistory,
    selectFunction,
    refreshUserOptions
  };
})();
