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
