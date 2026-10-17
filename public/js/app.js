// Main App Bootstrap & Router Coordinator
const App = {
  currentUser: null,

  async init() {
    this.setupTheme();
    this.setupLanguage();
    this.setupListeners();
    try {
      await this.checkAuth();
    } finally {
      this.hideSplashScreen();
    }
  },

  hideSplashScreen() {
    const splash = document.getElementById('app-splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.pointerEvents = 'none';
      setTimeout(() => {
        if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
      }, 400);
    }
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
    this.setupSupportPasteListener();
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

      if (res.user?.subscription?.expired) {
        this.showSubscriptionExpiredModal(res.user);
        return;
      }
      this.closeSubscriptionExpiredModal();
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

      if (res.subscription_expired || res.user?.subscription?.expired) {
        this.showSubscriptionExpiredModal(res.user);
        showToast('لقد نفذت المدة المجانية - يرجى تجديد الاشتراك للمتابعة', 'warning', 6000);
        return;
      }
      this.closeSubscriptionExpiredModal();
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
    const phone = (document.getElementById('reg-mgr-phone')?.value || '').trim();
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
        phone: phone,
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

    // Update Header packages button for managers
    const pkgBtn = document.getElementById('header-packages-btn');
    if (pkgBtn) {
      if (user.role === 'manager') {
        pkgBtn.classList.remove('hidden');
        const remaining = (user.subscription && (user.subscription.remainingDays !== undefined ? user.subscription.remainingDays : user.subscription.daysRemaining)) ?? 0;
        pkgBtn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i> <span class="hidden md:inline">الباقات (${remaining} يوم)</span>`;
      } else {
        pkgBtn.classList.add('hidden');
      }
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
          <div class="text-[10px] text-slate-400 font-mono mt-1">${formatDateTime12(n.created_at)}</div>
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
  },

  showSubscriptionExpiredModal(user) {
    const modal = document.getElementById('subscription-expired-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeSubscriptionExpiredModal() {
    const modal = document.getElementById('subscription-expired-modal');
    if (modal) modal.classList.add('hidden');
  },

  openSupportModal(prefill = {}) {
    const modal = document.getElementById('support-modal');
    if (!modal) return;
    const user = this.currentUser || API.getCurrentUser() || {};
    const nameInput = document.getElementById('supp-name');
    const phoneInput = document.getElementById('supp-phone');
    const companyInput = document.getElementById('supp-company');

    if (nameInput && !nameInput.value) nameInput.value = prefill.name || user.full_name || '';
    if (phoneInput && !phoneInput.value) phoneInput.value = prefill.phone || user.phone || '';
    if (companyInput && !companyInput.value) companyInput.value = prefill.company || user.company_name || '';

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  supportImageBase64: null,

  handleSupportImageChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('يرجى اختيار ملف صورة صالح (JPG, PNG, WebP)', 'warning');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      showToast('حجم الصورة كبير جداً، الحد الأقصى 12 ميجابايت', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      this.supportImageBase64 = event.target.result;
      this.renderSupportImagePreview(file.name, file.size);
    };
    reader.readAsDataURL(file);
  },

  renderSupportImagePreview(name = 'لقطة شاشة مرفقة', size = 0) {
    const containers = document.querySelectorAll('#supp-image-preview-container');
    const previews = document.querySelectorAll('#supp-image-preview');
    const nameEls = document.querySelectorAll('#supp-image-name');

    previews.forEach(p => { p.src = this.supportImageBase64; });
    containers.forEach(c => { c.classList.remove('hidden'); });

    const sizeStr = size > 0 ? ` (${(size / 1024).toFixed(1)} KB)` : '';
    nameEls.forEach(n => { n.textContent = `📎 ${name}${sizeStr}`; });

    if (window.lucide) lucide.createIcons();
  },

  removeSupportImage() {
    this.supportImageBase64 = null;
    const containers = document.querySelectorAll('#supp-image-preview-container');
    const previews = document.querySelectorAll('#supp-image-preview');
    const inputs = document.querySelectorAll('#supp-image-file');
    const nameEls = document.querySelectorAll('#supp-image-name');

    previews.forEach(p => { p.src = ''; });
    containers.forEach(c => { c.classList.add('hidden'); });
    inputs.forEach(i => { i.value = ''; });
    nameEls.forEach(n => { n.textContent = ''; });
  },

  setupSupportPasteListener() {
    if (this._supportPasteBound) return;
    this._supportPasteBound = true;

    window.addEventListener('paste', (e) => {
      // Only process if support modal is open or support form is visible
      const modalOpen = !document.getElementById('support-modal')?.classList.contains('hidden');
      const suppPage = document.getElementById('supp-message');
      if (!modalOpen && !suppPage) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              this.supportImageBase64 = event.target.result;
              this.renderSupportImagePreview(`screenshot_${Date.now()}.png`, blob.size);
              showToast('تم التقاط الصورة من الحافظة ولصقها بنجاح 📋🖼️', 'info');
            };
            reader.readAsDataURL(blob);
            break;
          }
        }
      }
    });
  },

  closeSupportModal() {
    const modal = document.getElementById('support-modal');
    if (modal) modal.classList.add('hidden');
    this.removeSupportImage();
  },

  async submitSupportTicket(e) {
    e.preventDefault();
    const name = document.getElementById('supp-name')?.value.trim();
    const phone = document.getElementById('supp-phone')?.value.trim();
    const company = document.getElementById('supp-company')?.value.trim();
    const subject = document.getElementById('supp-subject')?.value.trim();
    const message = document.getElementById('supp-message')?.value.trim();
    const submitBtn = document.getElementById('supp-submit-btn');

    if (!name || !phone || !message) {
      showToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> جاري الإرسال...`;
    }

    try {
      const user = this.currentUser || API.getCurrentUser() || {};
      const res = await API.submitSupportTicket({
        sender_name: name,
        sender_phone: phone,
        sender_email: user.email || null,
        company_name: company || user.company_name || null,
        role: user.role || 'guest',
        subject: subject,
        message: message,
        attachment_photo: this.supportImageBase64 || null
      });

      showToast(res.message || 'تم إرسال تذكرتك بنجاح، سيتواصل معك فريق الدعم الفني قريباً', 'success');
      this.closeSupportModal();
      this.removeSupportImage();
      const msgEl = document.getElementById('supp-message');
      if (msgEl) msgEl.value = '';
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> <span>إرسال التذكرة</span>`;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  async openPackagesModal() {
    const modal = document.getElementById('packages-modal');
    if (!modal) return;

    const user = this.currentUser || API.getCurrentUser() || {};
    const statusContainer = document.getElementById('packages-current-status');
    if (statusContainer) {
      const sub = user.subscription;
      if (sub) {
        const isLifetime = !!(sub.isLifetime || sub.plan === 'lifetime' || user.subscription_plan === 'lifetime' || user.subscription_plan === 'open');
        const remaining = (sub.remainingDays !== undefined ? sub.remainingDays : (sub.daysRemaining !== undefined ? sub.daysRemaining : (sub.days_remaining !== undefined ? sub.days_remaining : 0)));
        const isExpired = !isLifetime && (sub.expired !== undefined ? sub.expired : (sub.isExpired !== undefined ? sub.isExpired : (remaining <= 0)));
        const statusBadge = isLifetime 
          ? `<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5"><i data-lucide="crown" class="w-3.5 h-3.5"></i> نشطة (اشتراك دائم ومفتوح ♾️)</span>`
          : (isExpired 
            ? `<span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-600 border border-rose-500/30">منتهية الصلاحية</span>`
            : `<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">نشطة (${remaining} يوم متبقي)</span>`);

        statusContainer.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-lg">
              <i data-lucide="shield-check" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="font-bold text-slate-800 dark:text-white text-sm">حالة اشتراك المنظومة: ${user.company_name || 'حسابك'}</div>
              <div class="text-[11px] text-slate-500">تاريخ الانتهاء: ${isLifetime ? '<span class="font-bold text-amber-500">دائم مدى الحياة (غير مقيد بأيام)</span>' : (sub.expiresAt ? formatDateTime12(sub.expiresAt) : 'غير محدد')}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${statusBadge}
          </div>
        `;
      } else {
        statusContainer.innerHTML = `
          <div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <i data-lucide="info" class="w-4 h-4 text-blue-500"></i>
            <span>تواصل معنا عبر واتساب للاشتراك وتفعيل منظومة شركتك فوراً</span>
          </div>
        `;
      }
    }

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closePackagesModal() {
    const modal = document.getElementById('packages-modal');
    if (modal) modal.classList.add('hidden');
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
