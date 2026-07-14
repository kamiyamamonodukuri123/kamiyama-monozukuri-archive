(function () {
  const roleLabels = {
    STUDENT: '学生',
    TEACHER: '教員',
    STAFF: '学校スタッフ',
    ALUMNI: '卒業生',
    OTHER: 'その他の学校関係者',
    ADMIN: '管理者'
  };

  function normalizeUser(user) {
    if (!user) return null;
    return Object.assign({}, user, {
      roleCode: user.role,
      role: roleLabels[user.role] || user.role,
      avatar: user.avatarUrl || null
    });
  }

  async function request(path, options) {
    const opts = Object.assign({ credentials: 'same-origin' }, options || {});
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      opts.body = JSON.stringify(opts.body);
    }
    const response = await fetch(path, opts);
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json') ? await response.json() : {};
    if (!response.ok) throw new Error(payload.error || '通信に失敗しました。');
    if (payload.user) payload.user = normalizeUser(payload.user);
    return payload;
  }

  window.kmApi = {
    normalizeUser,
    session: () => request('/api/auth/session'),
    register: (input) => request('/api/auth/register', { method: 'POST', body: input }),
    login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    updateProfile: (input) => request('/api/profile', { method: 'PATCH', body: input }),
    updateAvatar: (dataUrl) => request('/api/profile/avatar', { method: 'POST', body: { dataUrl } }),
    getWorks: (params) => request('/api/works?' + new URLSearchParams(params || {}).toString()),
    getDraft: () => request('/api/works/draft'),
    saveDraft: (input) => request('/api/works/draft', { method: 'POST', body: input }),
    publishWork: (input) => request('/api/works', { method: 'POST', body: input }),
    getEvents: (manage) => request('/api/events' + (manage ? '?manage=1' : '')),
    eventAccess: () => request('/api/events/access'),
    unlockEvents: (passkey) => request('/api/events/access', { method: 'POST', body: { passkey } }),
    createEvent: (input) => request('/api/events', { method: 'POST', body: input }),
    updateEvent: (id, input) => request('/api/events/' + encodeURIComponent(id), { method: 'PATCH', body: input }),
    deleteEvent: (id) => request('/api/events/' + encodeURIComponent(id), { method: 'DELETE' }),
    getNotifications: () => request('/api/notifications')
  };
})();
