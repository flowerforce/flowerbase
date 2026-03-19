(function () {
  const existing = window.MONIT || {};
  const state = existing.state || {};
  const dom = existing.dom || {};

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
      minute: '2-digit',
      second: '2-digit'
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

  const parseOptionalJsonValue = (raw, label) => {
    if (!raw) return undefined;
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(label + ' must be valid JSON: ' + message);
    }
  };

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

  const highlightJsonText = (text) => {
    if (!text) return ' ';
    const regex = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)|\btrue\b|\bfalse\b|\bnull\b/g;
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

  const renderJsonPrimitive = (value) => {
    if (typeof value === 'string') {
      return '<span class="token string">' + escapeHtml(JSON.stringify(value)) + '</span>';
    }
    if (typeof value === 'number') {
      return '<span class="token number">' + escapeHtml(String(value)) + '</span>';
    }
    if (typeof value === 'boolean' || value === null) {
      return '<span class="token literal">' + escapeHtml(String(value)) + '</span>';
    }
    return '<span class="token literal">' + escapeHtml(safeStringify(value)) + '</span>';
  };

  const renderJsonKey = (key) => {
    return '<span class="token key">' + escapeHtml(JSON.stringify(key)) + '</span><span class="json-punct">: </span>';
  };

  const renderJsonLine = (depth, content, className) => {
    return '<span class="json-line ' + (className || '') + '" style="--json-depth:' + depth + ';">' + content + '</span>';
  };

  const getJsonSummaryLabel = (value) => {
    if (Array.isArray(value)) {
      const size = value.length;
      return size + ' item' + (size === 1 ? '' : 's');
    }
    const size = Object.keys(value || {}).length;
    return size + ' key' + (size === 1 ? '' : 's');
  };

  const renderJsonNode = (value, depth, keyHtml, withComma) => {
    if (Array.isArray(value) || (value && typeof value === 'object')) {
      const isArray = Array.isArray(value);
      const items = isArray
        ? value.map((item, index) => ({ key: String(index), value: item }))
        : Object.keys(value).map((key) => ({ key, value: value[key] }));
      const openChar = isArray ? '[' : '{';
      const closeChar = isArray ? ']' : '}';
      if (!items.length) {
        return renderJsonLine(
          depth,
          '<span class="json-toggle-spacer"></span>' +
            (keyHtml || '') +
            '<span class="json-brace">' + openChar + closeChar + '</span>' +
            (withComma ? '<span class="json-punct">,</span>' : ''),
          'json-single'
        );
      }
      const children = items
        .map((entry, index) =>
          renderJsonNode(
            entry.value,
            depth + 1,
            isArray ? '' : renderJsonKey(entry.key),
            index < items.length - 1
          )
        )
        .join('');
      const summary = escapeHtml(getJsonSummaryLabel(value));
      return (
        '<span class="json-node">' +
          renderJsonLine(
            depth,
            '<button type="button" class="json-toggle" data-json-toggle aria-expanded="true" title="Collapse">▾</button>' +
              (keyHtml || '') +
              '<span class="json-brace">' + openChar + '</span>' +
              '<span class="json-summary">' +
                '<span class="json-ellipsis"> … </span>' +
                '<span class="token literal">' + summary + '</span> ' +
                '<span class="json-brace">' + closeChar + '</span>' +
                (withComma ? '<span class="json-punct">,</span>' : '') +
              '</span>',
            'json-open'
          ) +
          '<span class="json-children">' + children + '</span>' +
          renderJsonLine(
            depth,
            '<span class="json-toggle-spacer"></span><span class="json-brace">' + closeChar + '</span>' +
              (withComma ? '<span class="json-punct">,</span>' : ''),
            'json-close'
          ) +
        '</span>'
      );
    }
    return renderJsonLine(
      depth,
      '<span class="json-toggle-spacer"></span>' +
        (keyHtml || '') +
        renderJsonPrimitive(value) +
        (withComma ? '<span class="json-punct">,</span>' : ''),
      'json-single'
    );
  };

  const renderCollapsibleJson = (text) => {
    if (!text) return ' ';
    const parsed = JSON.parse(text);
    return '<span class="json-tree">' + renderJsonNode(parsed, 0, '', false) + '</span>';
  };

  const highlightJson = (text, options) => {
    if (!text) return ' ';
    const collapsible = !!(options && options.collapsible);
    if (!collapsible) return highlightJsonText(text);
    try {
      return renderCollapsibleJson(text);
    } catch (err) {
      return highlightJsonText(text);
    }
  };

  const bindJsonToggleHandlers = () => {
    if (state.__jsonToggleBound) return;
    state.__jsonToggleBound = true;
    document.addEventListener('click', (event) => {
      const toggle = event.target && event.target.closest
        ? event.target.closest('[data-json-toggle]')
        : null;
      if (!toggle) return;
      const node = toggle.closest('.json-node');
      if (!node) return;
      event.preventDefault();
      const collapsed = node.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('title', collapsed ? 'Expand' : 'Collapse');
    });
  };

  bindJsonToggleHandlers();

  const getJsonViewerStore = () => {
    if (!state.__jsonViewerStore || typeof state.__jsonViewerStore.get !== 'function') {
      state.__jsonViewerStore = new WeakMap();
    }
    return state.__jsonViewerStore;
  };

  const getCodeMirrorLib = () => {
    if (typeof window === 'undefined') return null;
    const codeMirror = window.CodeMirror;
    if (!codeMirror || typeof codeMirror !== 'function') return null;
    return codeMirror;
  };

  const clearJsonViewer = (element, placeholder) => {
    if (!element) return;
    const store = getJsonViewerStore();
    const editor = store.get(element);
    if (editor && typeof editor.getWrapperElement === 'function') {
      const wrapper = editor.getWrapperElement();
      if (wrapper && wrapper.parentNode === element) {
        wrapper.parentNode.removeChild(wrapper);
      }
      store.delete(element);
    }
    element.classList.remove('cm-json-host');
    element.classList.remove('json-highlight');
    element.textContent = placeholder || '';
  };

  const renderJsonViewer = (element, value, options) => {
    if (!element) return;
    const opts = options || {};
    let text = '';
    let mode = { name: 'javascript', json: true };

    if (typeof value === 'string') {
      text = value;
      const trimmed = text.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          if (opts.pretty !== false) {
            text = JSON.stringify(parsed, null, 2);
          }
        } catch (err) {
          mode = 'text/plain';
        }
      } else {
        mode = 'text/plain';
      }
    } else if (value === undefined || value === null) {
      text = '';
      mode = 'text/plain';
    } else {
      try {
        text = JSON.stringify(value, null, 2);
      } catch (err) {
        text = safeStringify(value);
        mode = 'text/plain';
      }
    }

    const CodeMirrorLib = getCodeMirrorLib();
    if (!CodeMirrorLib) {
      element.classList.add('json-highlight');
      element.innerHTML = highlightJson(text || '', { collapsible: opts.collapsible !== false });
      return;
    }

    const store = getJsonViewerStore();
    let editor = store.get(element);
    if (!editor) {
      editor = CodeMirrorLib((node) => {
        element.innerHTML = '';
        element.appendChild(node);
      }, {
        lineNumbers: true,
        lineWrapping: false,
        readOnly: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        mode
      });
      store.set(element, editor);
    }

    const collapsible = opts.collapsible !== false;
    editor.setOption('lineNumbers', opts.lineNumbers !== false);
    editor.setOption('readOnly', opts.readOnly === false ? false : true);
    editor.setOption('foldGutter', collapsible);
    editor.setOption('gutters', collapsible
      ? ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
      : ['CodeMirror-linenumbers']);
    editor.setOption('mode', mode);
    editor.setValue(text || '');
    if (typeof editor.clearHistory === 'function') editor.clearHistory();
    if (typeof editor.refresh === 'function') editor.refresh();

    element.classList.remove('json-highlight');
    element.classList.add('cm-json-host');
  };

  const setActiveTab = (tab) => {
    if (!dom.tabButtons || !dom.tabPanels) return;
    dom.tabButtons.forEach((item) => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });
    dom.tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
  };

  window.MONIT = {
    ...existing,
    state,
    dom,
    utils: {
      api,
      formatTime,
      formatDateTime,
      parseJsonObject,
      parseOptionalJsonValue,
      escapeHtml,
      safeStringify,
      highlightCode,
      highlightJson,
      renderJsonViewer,
      clearJsonViewer
    },
    helpers: {
      setActiveTab
    },
    pages: existing.pages || {},
    events: existing.events || {},
    users: existing.users || {},
    functions: existing.functions || {},
    triggers: existing.triggers || {},
    collections: existing.collections || {},
    endpoints: existing.endpoints || {}
  };
})();
