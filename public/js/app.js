// Main App Bootstrap & Router Coordinator
const App = {
  currentUser: null,

  async init() {
    this.setupTheme();
    this.setupLanguage();
    this.setupListeners();
    await this.checkAuth();
  },

  setupTheme() {
    const savedTheme = localStorage.getItem('wf_theme') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    this.updateThemeButtonIcon();
  },

  toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('wf_theme', isDark ? 'dark' : 'light');
    this.updateThemeButtonIcon();
  },

  updateThemeButtonIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    const iconEl = document.getElementById('theme-toggle-icon');
    if (iconEl) {
      iconEl.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
      if (window.lucide) lucide.createIcons();
    }
  },

  setupLanguage() {
    const savedLang = localStorage.getItem('wf_lang') || 'ar';
    setLanguage(savedLang);
  },

  toggleLanguage() {
    const newLang = currentLang === 'ar' ? 'en' : 'ar';
    setLanguage(newLang);
  },

  setupListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }
  },

  async checkAuth() {
    const token = API.getToken();
    if (!token) {
      this.showLoginView();
      return;
    }

    try {
      const res = await API.getMe();
      this.currentUser = res.user;
      API.setCurrentUser(res.user);
      this.showAppView();
    } catch (err) {
      console.warn('Session expired or invalid:', err);
      this.logout();
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const idInput = document.getElementById('login-identifier');
    const passInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');

    const identifier = idInput.value.trim();
    const password = passInput.value;

    if (!identifier || !password) {
      showToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> ${t('logging_in')}`;

    try {
      const res = await API.login(identifier, password);
      API.setToken(res.token);
      API.setCurrentUser(res.user);
      this.currentUser = res.user;
      showToast(`مرحباً بك ${res.user.full_name}`, 'success');
      this.showAppView();
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>${t('login_button')}</span> <i data-lucide="arrow-left" class="w-4 h-4"></i>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  quickLogin(email, password) {
    document.getElementById('login-identifier').value = email;
    document.getElementById('login-password').value = password;
    const form = document.getElementById('login-form');
    if (form) {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  },

  openRegisterManagerModal() {
    const modal = document.getElementById('register-manager-modal');
    if (modal) {
      modal.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    }
  },

  closeRegisterManagerModal() {
    const modal = document.getElementById('register-manager-modal');
    if (modal) modal.classList.add('hidden');
  },

  async handleRegisterManager(e) {
    e.preventDefault();
    const name = document.getElementById('reg-mgr-name').value.trim();
    const company = document.getElementById('reg-mgr-company').value.trim();
    const email = document.getElementById('reg-mgr-email').value.trim();
    const pass = document.getElementById('reg-mgr-pass').value;
    const confirmPass = document.getElementById('reg-mgr-confirm-pass').value;
    const submitBtn = document.getElementById('reg-mgr-btn');

    if (!name || !email || !pass) {
      showToast('يرجى ملء جميع الحقول الإلزامية', 'warning');
      return;
    }
    if (pass !== confirmPass) {
      showToast('كلمة المرور وتأكيدها غير متطابقين', 'danger');
      return;
    }
    if (pass.length < 6) {
      showToast('كلمة المرور يجب أن لا تقل عن 6 أحرف', 'warning');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> جاري إنشاء الحساب...`;

    try {
      const res = await API.registerManager({
        full_name: name,
        email: email,
        password: pass,
        company_name: company
      });
      API.setToken(res.token);
      API.setCurrentUser(res.user);
      this.currentUser = res.user;
      this.closeRegisterManagerModal();
      showToast('تم إنشاء حساب المدير بنجاح! يبدأ حسابك فارغاً، ابدأ بإعداد المنظومة وإضافة الموظفين.', 'success');
      this.showAppView();
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>إنشاء الحساب وبدء الإعداد</span> <i data-lucide="arrow-left" class="w-4 h-4"></i>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  openProfile() {
    const user = this.currentUser || API.getCurrentUser() || {};
    if (user.role === 'manager') {
      ManagerUI.switchSection('profile');
    } else {
      EmployeeUI.switchTab('profile');
    }
  },

  logout() {
    API.setToken(null);
    API.setCurrentUser(null);
    this.currentUser = null;
    if (EmployeeUI.stopCameraStream) EmployeeUI.stopCameraStream();
    if (ManagerUI.stopLivePolling) ManagerUI.stopLivePolling();
    this.showLoginView();
    showToast('تم تسجيل الخروج بنجاح', 'info');
  },

  showLoginView() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('app-view').classList.add('hidden');
    if (window.lucide) lucide.createIcons();
  },

  showAppView() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');

    // Update Header user info
    const user = this.currentUser || API.getCurrentUser() || {};
    const avatarEl = document.getElementById('header-user-avatar');
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');

    if (avatarEl) avatarEl.src = user.profile_photo || '/uploads/avatar.svg';
    if (nameEl) nameEl.textContent = user.full_name || '';
    if (roleEl) {
      roleEl.textContent = user.role === 'manager' ? 'المدير العام (Manager)' : (user.job_title || 'موظف');
    }

    // Role-based views display
    const managerLayout = document.getElementById('manager-layout');
    const employeeLayout = document.getElementById('employee-layout');

    if (user.role === 'manager') {
      if (managerLayout) managerLayout.classList.remove('hidden');
      if (employeeLayout) employeeLayout.classList.add('hidden');
      ManagerUI.init();
    } else {
      if (managerLayout) managerLayout.classList.add('hidden');
      if (employeeLayout) employeeLayout.classList.remove('hidden');
      EmployeeUI.init();
    }

    this.loadNotifications();
    if (window.lucide) lucide.createIcons();
  },

  async loadNotifications() {
    try {
      const res = await API.getNotifications();
      const countEl = document.getElementById('notif-badge');
      if (countEl) {
        if (res.unreadCount > 0) {
          countEl.textContent = res.unreadCount;
          countEl.classList.remove('hidden');
        } else {
          countEl.classList.add('hidden');
        }
      }
      window.latestNotifications = res.notifications || [];
    } catch (err) {
      console.warn('Notifications load error:', err);
    }
  },

  async toggleNotificationsDropdown() {
    const modal = document.getElementById('notif-modal');
    if (!modal) return;

    if (!modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
      return;
    }

    modal.classList.remove('hidden');

    // Immediately remove notification badge number on opening
    const countEl = document.getElementById('notif-badge');
    if (countEl) {
      countEl.classList.add('hidden');
      countEl.textContent = '0';
    }

    // Call markAllNotificationsRead in background so server also marks them read
    API.markAllNotificationsRead().catch(() => {});

    // Render list
    this.renderNotificationsList();
  },

  renderNotificationsList() {
    const listContainer = document.getElementById('notif-list-container');
    if (!listContainer) return;
    const notifs = window.latestNotifications || [];

    if (notifs.length === 0) {
      listContainer.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">لا توجد إشعارات حالياً.</div>`;
      return;
    }

    const typeIcons = {
      success: 'check-circle',
      danger: 'alert-octagon',
      warning: 'alert-triangle',
      info: 'info'
    };

    listContainer.innerHTML = notifs.map(n => `
      <div class="p-3 rounded-2xl flex items-start gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 group">
        <i data-lucide="${typeIcons[n.type] || 'info'}" class="w-4 h-4 flex-shrink-0 text-emerald-500 mt-0.5"></i>
        <div class="flex-1">
          <div class="font-bold text-slate-900 dark:text-white">${n.title}</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">${n.message}</div>
          <div class="text-[10px] text-slate-400 font-mono mt-1">${n.created_at}</div>
        </div>
        <button onclick="App.deleteNotification(${n.id})" class="p-1 text-slate-300 hover:text-rose-500 transition-colors" title="حذف هذا الإشعار">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  },

  async clearAllNotifications() {
    try {
      await API.clearAllNotifications();
      window.latestNotifications = [];
      const countEl = document.getElementById('notif-badge');
      if (countEl) {
        countEl.classList.add('hidden');
        countEl.textContent = '0';
      }
      this.renderNotificationsList();
      showToast('تم مسح جميع الإشعارات بنجاح', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async deleteNotification(id) {
    try {
      await API.deleteNotification(id);
      window.latestNotifications = (window.latestNotifications || []).filter(n => n.id !== id);
      this.renderNotificationsList();
      showToast('تم حذف الإشعار', 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async markAllNotificationsRead() {
    try {
      await API.markAllNotificationsRead();
      const countEl = document.getElementById('notif-badge');
      if (countEl) countEl.classList.add('hidden');
      await this.loadNotifications();
      this.renderNotificationsList();
      showToast('تم تحديد جميع الإشعارات كمقروءة', 'info');
    } catch (err) {
      console.error(err);
    }
  }
};

window.renderCurrentView = function () {
  const user = API.getCurrentUser();
  if (user && user.role === 'manager') {
    ManagerUI.renderSidebar();
    ManagerUI.switchSection(ManagerUI.activeSection);
  } else if (user) {
    EmployeeUI.renderTabs();
    EmployeeUI.switchTab(EmployeeUI.activeTab);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
