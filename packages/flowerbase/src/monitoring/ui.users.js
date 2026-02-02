(function () {
  const root = window.MONIT;
  if (!root) return;
  const state = root.state;
  const dom = root.dom;
  const { utils, helpers } = root;

  if (state.authUsers === undefined) state.authUsers = [];
  if (state.customUsers === undefined) state.customUsers = [];
  if (state.mergedUsers === undefined) state.mergedUsers = [];
  if (state.mergedUserMap === undefined) state.mergedUserMap = {};
  if (state.userQuery === undefined) state.userQuery = '';
  if (state.userIdField === undefined) state.userIdField = 'id';
  if (state.selectedUserId === undefined) state.selectedUserId = null;
  if (state.__userSearchTimer === undefined) state.__userSearchTimer = null;
  if (state.customPage === undefined) state.customPage = 1;
  if (state.customPages === undefined) state.customPages = 1;
  if (state.customLimit === undefined) state.customLimit = 25;

  dom.mergedUsers = document.getElementById('mergedUsers');
  dom.userDetail = document.getElementById('userDetail');
  dom.userSearch = document.getElementById('userSearch');
  dom.customPrev = document.getElementById('customPrev');
  dom.customNext = document.getElementById('customNext');
  dom.customPage = document.getElementById('customPage');
  dom.customPages = document.getElementById('customPages');
  dom.customLimit = document.getElementById('customLimit');
  dom.refreshUsers = document.getElementById('refreshUsers');
  dom.createUserForm = document.getElementById('createUserForm');
  dom.newUserEmail = document.getElementById('newUserEmail');
  dom.newUserPassword = document.getElementById('newUserPassword');
  dom.createUserError = document.getElementById('createUserError');

  const {
    mergedUsers,
    userDetail,
    userSearch,
    customPrev,
    customNext,
    customPage,
    customPages,
    customLimit,
    refreshUsers,
    createUserForm,
    newUserEmail,
    newUserPassword,
    createUserError
  } = dom;
  const { api, formatDateTime, highlightJson } = utils;
  const { setActiveTab } = helpers;

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
    const getCreatedAt = (entry) => {
      const auth = entry && entry.auth ? entry.auth : null;
      const custom = entry && entry.custom ? entry.custom : null;
      const raw = (auth && auth.createdAt) || (custom && custom.createdAt);
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'string') {
        const ts = Date.parse(raw);
        if (!Number.isNaN(ts)) return ts;
      }
      return null;
    };
    merged.sort((a, b) => {
      const aTs = getCreatedAt(a);
      const bTs = getCreatedAt(b);
      if (aTs !== null || bTs !== null) {
        const aScore = aTs === null ? -Infinity : aTs;
        const bScore = bTs === null ? -Infinity : bTs;
        if (aScore !== bScore) return bScore - aScore;
      }
      const aLabel = (a.auth && a.auth.email) || (a.custom && a.custom.email) || String(a.id || '');
      const bLabel = (b.auth && b.auth.email) || (b.custom && b.custom.email) || String(b.id || '');
      return aLabel.localeCompare(bLabel);
    });
    return merged;
  };

  const renderUsers = (authItems, customItems, pagination) => {
    if (!mergedUsers || !userDetail) return;
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
      const primaryEmail =
        (auth && auth.email) || (custom && custom.email) || (custom && custom.name) || userId || 'unknown';
      const status = (auth && auth.status) || (auth && auth.email ? 'unknown' : 'no-auth');
      const createdAt = (auth && auth.createdAt) || (custom && custom.createdAt);
      const createdLabel = formatDateTime(createdAt);
      const hint = createdLabel ? status + ' · ' + createdLabel : status;
      const hasAuth = !!(auth && auth._id);
      const row = document.createElement('div');
      const isDisabled = auth && auth.status === 'disabled';
      row.className = 'user-row' +
        (state.selectedUserId === userId ? ' active' : '') +
        (isDisabled ? ' disabled' : '');
      row.dataset.id = userId;
      row.innerHTML = '<div class="user-meta">' +
        '<div class="code">' + primaryEmail + '</div>' +
        '<div class="hint">' + hint + '</div>' +
        '</div>' +
        '<div class="user-actions">' +
        (hasAuth
          ? ('<button data-action="toggle" data-id="' + auth._id + '">' +
            (auth.status === 'disabled' ? 'enable' : 'disable') +
            '</button>' +
            '<button data-action="password" data-id="' + auth._id + '" class="secondary">password</button>')
          : '') +
        '</div>';
      mergedUsers.appendChild(row);
    });

    if (pagination && customPage && customPages) {
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
      if (root.functions && root.functions.refreshUserOptions) {
        root.functions.refreshUserOptions(state.authUsers, state.customUsers);
      }
      if (root.collections && root.collections.refreshUserOptions) {
        root.collections.refreshUserOptions(state.authUsers, state.customUsers);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const goToUser = (userId) => {
    if (!userId || !userSearch) return;
    state.selectedUserId = String(userId);
    state.userQuery = state.selectedUserId;
    state.customPage = 1;
    userSearch.value = state.userQuery;
    setActiveTab('users');
    loadUsers();
  };

  const init = () => {
    if (customLimit) {
      state.customLimit = Number(customLimit.value || 25) || 25;
      customLimit.addEventListener('change', () => {
        state.customLimit = Number(customLimit.value || 25);
        state.customPage = 1;
        loadUsers();
      });
    }

    if (mergedUsers) {
      mergedUsers.addEventListener('click', async (event) => {
        const target = event.target;
        if (!target) return;
        if (target.tagName === 'BUTTON') {
          const action = target.dataset.action;
          const id = target.dataset.id;
          if (!id) return;
          if (action === 'toggle') {
            const disabled = target.textContent === 'disable';
            if (disabled) {
              const ok = confirm('Disable user ' + id + '?');
              if (!ok) return;
            }
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
          userDetail.classList.add('json-highlight');
          userDetail.innerHTML = highlightJson(JSON.stringify(entry, null, 2) || '');
        } else {
          userDetail.classList.remove('json-highlight');
          userDetail.textContent = 'User not found in cache';
        }
      });
    }

    if (customPrev) {
      customPrev.addEventListener('click', () => {
        if (state.customPage <= 1) return;
        state.customPage -= 1;
        loadUsers();
      });
    }

    if (customNext) {
      customNext.addEventListener('click', () => {
        if (state.customPage >= state.customPages) return;
        state.customPage += 1;
        loadUsers();
      });
    }

    if (refreshUsers) {
      refreshUsers.addEventListener('click', loadUsers);
    }

    if (createUserForm) {
      createUserForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = newUserEmail.value.trim();
        const password = newUserPassword.value.trim();
        if (createUserError) {
          createUserError.textContent = '';
          createUserError.classList.add('is-hidden');
        }
        if (!email || !password) return;
        try {
          await api('/users', {
            method: 'POST',
            body: JSON.stringify({ email, password })
          });
          newUserEmail.value = '';
          newUserPassword.value = '';
          loadUsers();
        } catch (error) {
          if (!createUserError) return;
          let message = 'Failed to create user';
          if (error && typeof error === 'object') {
            const err = error;
            if (typeof err.message === 'string' && err.message) {
              message = err.message;
            }
            if (err.payload && typeof err.payload === 'object') {
              const payload = err.payload;
              if (typeof payload.error === 'string' && payload.error) {
                message = payload.error;
              } else if (typeof payload.message === 'string' && payload.message) {
                message = payload.message;
              }
            }
          }
          createUserError.textContent = message;
          createUserError.classList.remove('is-hidden');
        }
      });
    }

    if (userSearch) {
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
    }
  };

  root.users = {
    init,
    loadUsers,
    buildMergedUsers,
    goToUser
  };
})();
