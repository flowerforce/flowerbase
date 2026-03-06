(function () {
  const root = window.MONIT;
  if (!root) return;
  const dom = root.dom;
  const { utils, helpers } = root;

  dom.clock = document.getElementById('clock');
  dom.ramStat = document.getElementById('ramStat');
  dom.cpuStat = document.getElementById('cpuStat');
  dom.tabButtons = document.querySelectorAll('[data-tab]');
  dom.tabPanels = document.querySelectorAll('[data-panel]');

  const { clock, ramStat, cpuStat, tabButtons } = dom;
  const { api } = utils;
  const { setActiveTab } = helpers;

  const RESIZE_MIN_PANE = 220;
  const RESIZE_MIN_STACK = 140;
  const RESIZE_MIN_RATIO = 0.2;
  const RESIZE_MAX_RATIO = 0.8;

  const getSplitDefault = (container) => {
    if (container.classList.contains('functions-grid')) return '30%';
    if (container.classList.contains('triggers-grid')) return '30%';
    if (container.classList.contains('collections-grid')) return '30%';
    return '66%';
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const getHorizontalResizeBounds = (containerWidth, handleWidth) => {
    const minByPixels = RESIZE_MIN_PANE;
    const maxByPixels = Math.max(minByPixels, containerWidth - RESIZE_MIN_PANE - handleWidth);
    const minByRatio = containerWidth * RESIZE_MIN_RATIO;
    const maxByRatio = containerWidth * RESIZE_MAX_RATIO;
    const min = Math.max(minByPixels, minByRatio);
    const max = Math.min(maxByPixels, maxByRatio);
    if (max < min) return { min: max, max };
    return {
      min,
      max
    };
  };

  const getVerticalResizeBounds = (totalHeight) => {
    const minByPixels = RESIZE_MIN_STACK;
    const maxByPixels = Math.max(minByPixels, totalHeight - RESIZE_MIN_STACK);
    const minByRatio = totalHeight * RESIZE_MIN_RATIO;
    const maxByRatio = totalHeight * RESIZE_MAX_RATIO;
    const min = Math.max(minByPixels, minByRatio);
    const max = Math.min(maxByPixels, maxByRatio);
    if (max < min) return { min: max, max };
    return {
      min,
      max
    };
  };

  const bindSplitResize = (container, handle, leftPane, rightPane) => {
    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();

      document.body.classList.add('is-resizing');
      if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);

      const onPointerMove = (moveEvent) => {
        const bounds = container.getBoundingClientRect();
        const handleWidth = handle.getBoundingClientRect().width || 10;
        if (!bounds.width) return;

        const limits = getHorizontalResizeBounds(bounds.width, handleWidth);
        const offsetX = moveEvent.clientX - bounds.left - (handleWidth / 2);
        const nextLeft = clamp(offsetX, limits.min, limits.max);
        container.style.setProperty('--split-left-size', nextLeft + 'px');
      };

      const onPointerUp = (upEvent) => {
        document.body.classList.remove('is-resizing');
        if (handle.releasePointerCapture) {
          try {
            handle.releasePointerCapture(upEvent.pointerId);
          } catch (err) {
            // no-op: pointer might already be released
          }
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const bounds = container.getBoundingClientRect();
      const handleWidth = handle.getBoundingClientRect().width || 10;
      const current = leftPane.getBoundingClientRect().width;
      const limits = getHorizontalResizeBounds(bounds.width, handleWidth);
      const nextLeft = clamp(current + (direction * 24), limits.min, limits.max);
      container.style.setProperty('--split-left-size', nextLeft + 'px');
      rightPane.offsetHeight;
    });
  };

  const bindStackResize = (handle, topPane, bottomPane) => {
    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();

      document.body.classList.add('is-resizing');
      if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);

      const topStart = topPane.getBoundingClientRect().height;
      const bottomStart = bottomPane.getBoundingClientRect().height;
      const total = topStart + bottomStart;

      const onPointerMove = (moveEvent) => {
        const topBounds = topPane.getBoundingClientRect();
        const positionY = moveEvent.clientY - topBounds.top;
        const handleHalf = (handle.getBoundingClientRect().height || 8) / 2;
        const limits = getVerticalResizeBounds(total);
        const boundedTop = clamp(positionY - handleHalf, limits.min, limits.max);
        const boundedBottom = Math.max(limits.min, total - boundedTop);

        topPane.style.flex = '0 0 ' + boundedTop + 'px';
        bottomPane.style.flex = '0 0 ' + boundedBottom + 'px';
      };

      const onPointerUp = (upEvent) => {
        document.body.classList.remove('is-resizing');
        if (handle.releasePointerCapture) {
          try {
            handle.releasePointerCapture(upEvent.pointerId);
          } catch (err) {
            // no-op: pointer might already be released
          }
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    handle.addEventListener('pointerdown', onPointerDown);
  };

  const initResizableSections = () => {
    document.querySelectorAll('.split-grid').forEach((container) => {
      if (container.dataset.resizableInit === '1') return;
      const panes = Array.from(container.children).filter((element) =>
        !element.classList.contains('split-resizer')
      );
      if (panes.length !== 2) return;

      const [leftPane, rightPane] = panes;
      const handle = document.createElement('div');
      handle.className = 'split-resizer';
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('title', 'Resize columns');

      container.classList.add('resizable-split-grid');
      leftPane.classList.add('split-pane-left');
      rightPane.classList.add('split-pane-right');
      container.style.setProperty('--split-left-size', getSplitDefault(container));
      container.insertBefore(handle, rightPane);
      bindSplitResize(container, handle, leftPane, rightPane);
      container.dataset.resizableInit = '1';
    });

    document.querySelectorAll('.column-stack').forEach((container) => {
      if (container.dataset.stackResizableInit === '1') return;
      const panels = Array.from(container.children).filter((element) =>
        element.classList && element.classList.contains('subpanel')
      );
      if (panels.length < 2) return;

      container.classList.add('resizable-stack');
      panels.forEach((panel) => panel.classList.add('stack-pane'));

      for (let index = 0; index < panels.length - 1; index += 1) {
        const topPane = panels[index];
        const bottomPane = panels[index + 1];
        const handle = document.createElement('div');
        handle.className = 'stack-resizer';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'horizontal');
        handle.setAttribute('title', 'Resize sections');
        container.insertBefore(handle, bottomPane);
        bindStackResize(handle, topPane, bottomPane);
      }

      container.dataset.stackResizableInit = '1';
    });
  };

  const initModules = () => {
    if (root.events && root.events.init) root.events.init();
    if (root.users && root.users.init) root.users.init();
    if (root.functions && root.functions.init) root.functions.init();
    if (root.triggers && root.triggers.init) root.triggers.init();
    if (root.collections && root.collections.init) root.collections.init();
    if (root.endpoints && root.endpoints.init) root.endpoints.init();
  };

  const updateClock = () => {
    if (!clock) return;
    clock.textContent = new Date().toLocaleString();
  };

  const updateStats = async () => {
    if (!ramStat || !cpuStat) return;
    try {
      const data = await api('/stats');
      if (!data) return;
      const ramMb = typeof data.ramMb === 'number' ? data.ramMb : null;
      const cpu = typeof data.cpuPercent === 'number' ? data.cpuPercent : null;
      ramStat.textContent = ramMb !== null ? `RAM ${ramMb.toFixed(1)}MB` : 'RAM --';
      cpuStat.textContent = cpu !== null ? `CPU ${cpu.toFixed(1)}%` : 'CPU --';
    } catch (err) {
      ramStat.textContent = 'RAM --';
      cpuStat.textContent = 'CPU --';
    }
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      setActiveTab(tab);
    });
  });

  initResizableSections();
  initModules();

  updateClock();
  setInterval(updateClock, 1000);

  updateStats();
  setInterval(updateStats, 2000);

  if (root.events && root.events.connectWs) root.events.connectWs();
  if (root.users && root.users.loadUsers) root.users.loadUsers();
  if (root.functions && root.functions.loadFunctions) root.functions.loadFunctions();
  if (root.endpoints && root.endpoints.loadEndpoints) root.endpoints.loadEndpoints();
  if (root.triggers && root.triggers.loadTriggers) root.triggers.loadTriggers();
  if (root.collections && root.collections.loadCollections) root.collections.loadCollections();
  if (root.collections && root.collections.loadCollectionHistory) root.collections.loadCollectionHistory();
})();
