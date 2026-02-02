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

  const highlightJson = (text) => {
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
      highlightJson
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
