// Employee Interface Controller
let currentEmpPosition = null;
let currentWorkplace = null;
let todayRecord = null;
let currentSchedule = null;
let cameraStream = null;
let capturedPhotoData = null;
let activeCheckAction = 'check-in'; // 'check-in' or 'check-out'

const EmployeeUI = {
  activeTab: 'attendance',

  async init() {
    this.renderTabs();
    this.startDigitalClock();
    await this.loadTodayData();
    this.requestGeolocation();
  },

  startDigitalClock() {
    const updateTime = () => {
      const clockEl = document.getElementById('emp-digital-clock');
      const dateEl = document.getElementById('emp-current-date');
      if (clockEl || dateEl) {
        const now = new Date();
        if (clockEl) {
          let hours = now.getHours();
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');
          const period = hours >= 12 ? 'م' : 'ص';
          hours = hours % 12 || 12;
          const hoursStr = String(hours).padStart(2, '0');
          clockEl.textContent = `${hoursStr}:${minutes}:${seconds} ${period}`;
        }
        if (dateEl) {
          const locale = currentLang === 'ar' ? 'ar-EG' : 'en-US';
          dateEl.textContent = now.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  },

  renderTabs() {
    const nav = document.getElementById('employee-subnav');
    if (!nav) return;

    // Subnavigation: Attendance, Leaderboard, History, Leaves, Finances, Profile
    const tabs = [
      { id: 'attendance', icon: 'clock', label: 'الحضور (Attendance)' },
      { id: 'leaderboard', icon: 'award', label: 'مؤشر الالتزام (Score)' },
      { id: 'history', icon: 'calendar', label: 'سجل الحضور (History)' },
      { id: 'leaves', icon: 'calendar-check', label: 'الإجازات والأذونات (Leaves)' },
      { id: 'finances', icon: 'wallet-cards', label: 'المرتب والسلف (Payroll)' },
      { id: 'profile', icon: 'user', label: 'الملف الشخصي (Profile)' }
    ];

    nav.innerHTML = tabs.map(tab => `
      <button onclick="EmployeeUI.switchTab('${tab.id}')"
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
          this.activeTab === tab.id
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }">
        <i data-lucide="${tab.icon}" class="w-4 h-4"></i>
        <span>${tab.label}</span>
      </button>
    `).join('');

    if (window.lucide) lucide.createIcons();
  },

  switchTab(tabId) {
    this.activeTab = tabId;
    this.renderTabs();
    const container = document.getElementById('employee-content');
    if (!container) return;

    if (tabId === 'attendance') {
      this.renderAttendanceTab();
    } else if (tabId === 'leaderboard') {
      this.renderLeaderboardTab();
    } else if (tabId === 'history') {
      this.renderHistoryTab();
    } else if (tabId === 'leaves') {
      this.renderLeavesTab();
    } else if (tabId === 'finances') {
      this.renderFinancesTab();
    } else if (tabId === 'profile') {
      this.renderProfileTab();
    }
  },

  async loadTodayData() {
    try {
      const res = await API.getMyToday();
      todayRecord = res.record;
      currentWorkplace = res.workplace;
      currentSchedule = res.schedule;
      window.companySettings = res.settings;
      this.notConfigured = res.notConfigured;
      this.scheduleMode = res.schedule_mode || 'normal';
      this.shifts = res.shifts || [];
      this.assignedShiftId = res.assigned_shift_id || null;
      this.isOffDay = !!res.is_off_day;
      this.offDayReason = res.off_day_reason || null;
      if (this.activeTab === 'attendance') {
        this.renderAttendanceTab();
      }
    } catch (err) {
      console.error('Error loading today data:', err);
    }
  },

  requestGeolocation() {
    const statusContainer = document.getElementById('emp-gps-status-card');
    if (statusContainer) {
      statusContainer.innerHTML = `
        <div class="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>جاري تحديد موقعك الجغرافي عبر الـ GPS...</span>
        </div>
      `;
    }

    if (!navigator.geolocation) {
      showToast('المتصفح لا يدعم تحديد الموقع الجغرافي (Geolocation)', 'danger');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentEmpPosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        };
        this.updateGpsCard();
      },
      (err) => {
        console.warn('Geolocation error:', err);
        currentEmpPosition = null;
        this.updateGpsCard(err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  },

  openGpsEnableModal() {
    const modal = document.getElementById('gps-helper-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-right text-xs space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <i data-lucide="navigation" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">تشغيل وتفعيل الـ GPS</h3>
                <span class="text-[11px] text-slate-400">إرشادات تفعيل إشارة الموقع الجغرافي</span>
              </div>
            </div>
            <button onclick="document.getElementById('gps-helper-modal').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Live status box -->
          <div id="gps-modal-live-status" class="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex items-center gap-3 text-blue-700 dark:text-blue-300 font-semibold">
            <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
            <span>جاري محاولة الاتصال بالـ GPS والتقاط إحداثياتك...</span>
          </div>

          <!-- Quick 3-Step Visual Guide -->
          <div class="space-y-2.5 pt-1">
            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-3">
              <span class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 font-black flex items-center justify-center flex-shrink-0 text-xs">1</span>
              <div>
                <strong class="font-bold text-slate-900 dark:text-white block text-xs">إذا ظهرت لك رسالة المتصفح:</strong>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  اضغط فوراً على خيار <strong class="text-emerald-600 dark:text-emerald-400 font-bold">"سماح" (Allow)</strong> للموافقة على تحديد موقعك.
                </p>
              </div>
            </div>

            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-3">
              <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 font-black flex items-center justify-center flex-shrink-0 text-xs">2</span>
              <div>
                <strong class="font-bold text-slate-900 dark:text-white block text-xs">على الموبايل (تشغيل الموقع):</strong>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  اسحب شريط الإشعارات من أعلى الشاشة وتأكد من تشغيل أيقونة <strong class="text-blue-600 dark:text-blue-400 font-bold">"الموقع / Location"</strong> لتكون مفعّلة.
                </p>
              </div>
            </div>

            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-3">
              <span class="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 font-black flex items-center justify-center flex-shrink-0 text-xs">3</span>
              <div>
                <strong class="font-bold text-slate-900 dark:text-white block text-xs">إذا كان الموقع محظوراً بالمتصفح (Locked 🔒):</strong>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  اضغط على أيقونة 🔒 بجوار رابط الموقع في شريط العنوان بالأعلى، واضبط <strong>"الموقع / Location"</strong> على <strong>"سماح / Allow"</strong>.
                </p>
              </div>
            </div>
          </div>

          <!-- Big Action Button -->
          <div class="pt-2">
            <button type="button" onclick="EmployeeUI.forceRetryGps()" class="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all">
              <i data-lucide="map-pin" class="w-4 h-4"></i>
              <span>فحص وتشغيل الموقع الآن ⚡</span>
            </button>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    // Trigger browser geolocation prompt immediately
    this.forceRetryGps();
  },

  forceRetryGps() {
    const liveStatus = document.getElementById('gps-modal-live-status');
    if (liveStatus) {
      liveStatus.className = 'p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex items-center gap-3 text-blue-700 dark:text-blue-300 font-semibold';
      liveStatus.innerHTML = `
        <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
        <span>جاري طلب الإذن والتقاط إشارة الموقع من الجهاز...</span>
      `;
    }

    if (!navigator.geolocation) {
      if (liveStatus) {
        liveStatus.className = 'p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-600 font-bold';
        liveStatus.innerHTML = `<span>المتصفح لا يدعم خدمة تحديد الموقع الجغرافي.</span>`;
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentEmpPosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        };
        if (liveStatus) {
          liveStatus.className = 'p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 text-emerald-700 dark:text-emerald-300 font-bold';
          liveStatus.innerHTML = `
            <i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-500 flex-shrink-0"></i>
            <span>تم تفعيل وتحديد موقعك بنجاح! دقة الإشارة: ${currentEmpPosition.accuracy} متر.</span>
          `;
          if (window.lucide) lucide.createIcons();
        }
        showToast('تم التقاط إشارة الـ GPS بنجاح!', 'success');
        this.updateGpsCard();
        setTimeout(() => {
          const m = document.getElementById('gps-helper-modal');
          if (m) m.innerHTML = '';
        }, 1200);
      },
      (err) => {
        console.warn('Geolocation retry error:', err);
        currentEmpPosition = null;
        if (liveStatus) {
          liveStatus.className = 'p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 font-medium text-xs';
          liveStatus.innerHTML = `
            <i data-lucide="alert-circle" class="w-5 h-5 text-rose-500 flex-shrink-0"></i>
            <div>
              <strong class="font-bold block">لم يتم الحصول على الموقع بعد:</strong>
              <span>${err.code === 1 ? 'تم رفض الإذن. يرجى تفعيله من إعدادات المتصفح أو القفل 🔒 بالأعلى.' : 'تأكد من تشغيل الـ GPS من شريط إشعارات الهاتف.'}</span>
            </div>
          `;
          if (window.lucide) lucide.createIcons();
        }
        this.updateGpsCard(err.message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  },

  updateGpsCard(errorMsg = null) {
    const statusContainer = document.getElementById('emp-gps-status-card');
    const checkInBtn = document.getElementById('emp-checkin-submit-btn');
    const checkOutBtn = document.getElementById('emp-checkout-submit-btn');

    if (!statusContainer) return;

    if (errorMsg || !currentEmpPosition) {
      statusContainer.innerHTML = `
        <div class="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-950 dark:text-amber-200 space-y-3">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i data-lucide="map-pin-off" class="w-5 h-5 animate-pulse"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                <h4 class="font-extrabold text-sm text-amber-900 dark:text-amber-100">تنبيه: الموقع الجغرافي (GPS) غير مفعل حالياً</h4>
              </div>
              <p class="text-xs mt-1 text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                لتسجيل الحضور أو الانصراف، يجب فتح الـ GPS في هاتفك والموافقة على إذن الموقع للتأكد من تواجدك في مقر العمل.
              </p>
            </div>
          </div>
          <div class="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button type="button" onclick="EmployeeUI.openGpsEnableModal()" class="flex-1 py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all">
              <i data-lucide="navigation" class="w-4 h-4"></i>
              <span>📍 تشغيل وتفعيل الـ GPS فوراً</span>
            </button>
            <button type="button" onclick="EmployeeUI.requestGeolocation()" class="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
              <span>فحص مجدد</span>
            </button>
          </div>
        </div>
      `;
      if (checkInBtn) checkInBtn.disabled = true;
      if (checkOutBtn) checkOutBtn.disabled = true;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Distance computation
    let distance = null;
    let isInside = false;
    let allowedRadius = 150;

    if (currentWorkplace) {
      allowedRadius = currentWorkplace.allowed_radius_meters;
      distance = calculateDistanceMeters(
        currentEmpPosition.latitude,
        currentEmpPosition.longitude,
        currentWorkplace.latitude,
        currentWorkplace.longitude
      );
      isInside = distance <= allowedRadius;
    }

    const accuracyWarning = currentEmpPosition.accuracy > 150;

    if (isInside) {
      statusContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 live-indicator"></span>
              <span class="font-bold text-sm">${t('gps_verified')}</span>
            </div>
            <button onclick="EmployeeUI.requestGeolocation()" class="text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1">
              <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i> تحديث
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/60 text-xs">
            <div>
              <span class="text-slate-500 dark:text-slate-400 block">${t('distance_from_workplace')}:</span>
              <span class="font-bold text-emerald-700 dark:text-emerald-300 text-sm">${distance} ${t('meters')}</span>
            </div>
            <div>
              <span class="text-slate-500 dark:text-slate-400 block">${t('accuracy')}:</span>
              <span class="font-bold text-slate-700 dark:text-slate-300">${currentEmpPosition.accuracy} ${t('meters')}</span>
            </div>
          </div>
          ${accuracyWarning ? `
            <p class="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
              <i data-lucide="alert-circle" class="w-3.5 h-3.5"></i>
              دقة تحديد الموقع ضعيفة، حاول الوقوف في مكان مفتوح وإعادة المحاولة.
            </p>
          ` : ''}
        </div>
      `;
      const canCheckIn = this.scheduleMode !== 'shifts' || !!this.selectedShiftId;
      if (checkInBtn) checkInBtn.disabled = !canCheckIn;
      if (checkOutBtn) checkOutBtn.disabled = false;
    } else {
      statusContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300">
          <div class="flex items-start gap-3">
            <i data-lucide="alert-octagon" class="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5"></i>
            <div class="flex-1">
              <h4 class="font-bold text-sm">${t('gps_outside')}</h4>
              <p class="text-xs mt-1 text-rose-700 dark:text-rose-400 font-medium leading-relaxed">
                لا يمكنك تسجيل الحضور لأنك خارج نطاق موقع العمل. أنت على بعد <strong class="text-rose-900 dark:text-white font-bold">${distance} متر</strong> تقريباً (النطاق المسموح به: ${allowedRadius} متر).
              </p>
              <div class="flex items-center gap-3 mt-3">
                <button onclick="EmployeeUI.requestGeolocation()" class="px-3 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/60 hover:bg-rose-200 text-rose-900 dark:text-rose-200 text-xs font-bold flex items-center gap-1">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> إعادة الفحص
                </button>
                <span class="text-xs text-slate-500 dark:text-slate-400">دقة الـ GPS: ${currentEmpPosition.accuracy}م</span>
              </div>
            </div>
          </div>
        </div>
      `;
      if (checkInBtn) checkInBtn.disabled = true;
      if (checkOutBtn) checkOutBtn.disabled = true;
    }

    if (window.lucide) lucide.createIcons();
  },

  // 1. Attendance Tab
  renderAttendanceTab() {
    const container = document.getElementById('employee-content');
    if (!container) return;

    const user = API.getCurrentUser() || {};

    if (this.notConfigured) {
      container.innerHTML = `
        <div class="max-w-2xl mx-auto space-y-6">
          <div class="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/10">
            <h2 class="text-2xl font-extrabold">${t('greeting_morning')}، ${user.full_name || ''} 👋</h2>
            <p id="emp-current-date" class="text-blue-100 text-xs mt-1"></p>
          </div>

          <div class="p-8 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-center space-y-3">
            <div class="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 mx-auto flex items-center justify-center">
              <i data-lucide="alert-triangle" class="w-7 h-7"></i>
            </div>
            <h3 class="font-bold text-base">لم يتم إعداد نظام الحضور بالكامل من قِبل الإدارة.</h3>
            <p class="text-xs text-amber-700 dark:text-amber-400 max-w-md mx-auto leading-relaxed">
              يجب على مدير النظام تحديد موقع مقر العمل ومواعيد العمل أولاً قبل أن تتمكن من تسجيل الحضور.
            </p>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const isShiftsMode = this.scheduleMode === 'shifts';
    const displayShiftName = (todayRecord && todayRecord.shift_name) || (isShiftsMode && !todayRecord ? 'نظام الورديات' : null);
    const startTime = (todayRecord && todayRecord.scheduled_start) || (currentSchedule && currentSchedule.start_time) || '09:00';
    const endTime = (todayRecord && todayRecord.scheduled_end) || (currentSchedule && currentSchedule.end_time) || '17:00';
    const isCheckedIn = todayRecord && todayRecord.check_in_time;
    const isCheckedOut = todayRecord && todayRecord.check_out_time;

    container.innerHTML = `
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- Greeting Card -->
        <div class="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 rounded-3xl p-5 sm:p-6 md:p-8 text-white shadow-xl shadow-blue-500/10 relative overflow-hidden">
          <div class="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-white/10 blur-2xl"></div>
          <div class="relative z-10 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md mb-2">
                <i data-lucide="sparkles" class="w-3 h-3 text-amber-300"></i> مرحباً بك
              </span>
              <h2 class="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">
                ${t('greeting_morning')}، ${user.full_name || 'زميلنا العزيز'} 👋
              </h2>
              <p id="emp-current-date" class="text-blue-100 text-xs sm:text-sm mt-1"></p>
            </div>
            <div class="text-center sm:text-left bg-white/15 backdrop-blur-md px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl border border-white/20 flex-shrink-0">
              <span class="text-[10px] sm:text-[11px] text-blue-200 block uppercase tracking-wider">${t('current_time')}</span>
              <span id="emp-digital-clock" class="text-base sm:text-xl md:text-2xl font-mono font-bold tracking-tight whitespace-nowrap block">--:--:--</span>
            </div>
          </div>

          <!-- Schedule Badge -->
          <div class="mt-6 pt-5 border-t border-white/20 flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm text-blue-100">
            <div class="flex items-center gap-2">
              <i data-lucide="calendar" class="w-4 h-4 text-amber-300"></i>
              <span>${displayShiftName ? `<b class="text-white bg-white/20 px-2 py-0.5 rounded-lg ml-1 font-mono">${displayShiftName}</b>: ` : `${t('work_schedule')}: `}<strong class="text-white">${formatTime12(startTime)} — ${formatTime12(endTime)}</strong></span>
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="map-pin" class="w-4 h-4 text-emerald-300"></i>
              <span>${currentWorkplace ? currentWorkplace.name : 'المقر الرئيسي'}</span>
            </div>
          </div>
        </div>

        ${this.isOffDay ? `
        <!-- Off-Day Vacation Notice Banner -->
        <div class="p-4 sm:p-5 rounded-3xl bg-amber-500/10 dark:bg-amber-500/15 border-2 border-amber-500/30 text-amber-950 dark:text-amber-200 flex items-start gap-3.5 shadow-sm text-right">
          <div class="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i data-lucide="palmtree" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <h4 class="font-extrabold text-sm text-amber-900 dark:text-amber-100">
                اليوم عطلة رسمية للمنشأة (${this.offDayReason || 'عطلة أسبوعية'}) 🌴
              </h4>
            </div>
            <p class="text-xs mt-1 text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
              اليوم غير مسجل كعمل إلزامي، ولن يُحتسب عليك أي غياب أو تأخير. إذا كان لديك عمل إضافي بتكليف من الإدارة يمكنك تسجيل الحضور.
            </p>
          </div>
        </div>
        ` : ''}

        <!-- Attendance Score Card -->
        <div id="emp-score-card"></div>

        <!-- Geolocation Check Card -->
        <div id="emp-gps-status-card" class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800">
          <div class="flex items-center gap-3 text-slate-500">
            <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span>جاري تحديد موقعك الجغرافي...</span>
          </div>
        </div>

        <!-- Attendance Action Card -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 text-center glass-card">
          ${!isCheckedIn ? `
            <div class="max-w-md mx-auto space-y-5">
              <div class="w-20 h-20 mx-auto rounded-3xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <i data-lucide="fingerprint" class="w-10 h-10"></i>
              </div>
              <div>
                <h3 class="text-xl font-bold text-slate-900 dark:text-white">تسجيل الحضور اليومي</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  ${t('camera_disclaimer')}
                </p>
              </div>

              <!-- Multi-Shift Selector Container -->
              ${(isShiftsMode && Array.isArray(this.shifts) && this.shifts.length > 0) ? `
                <div id="emp-shift-selector-container">
                  ${this.getShiftSelectionHtml()}
                </div>
              ` : ''}

              <button id="emp-checkin-submit-btn" disabled
                onclick="EmployeeUI.openCameraModal('check-in')"
                class="hero-btn-checkin w-full py-4 px-6 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg flex items-center justify-center gap-3">
                <i data-lucide="camera" class="w-6 h-6"></i>
                <span>${t('check_in_btn')}</span>
              </button>
            </div>
          ` : !isCheckedOut ? `
            <div class="max-w-md mx-auto space-y-5">
              <!-- 1. Pulsing Green Radar Badge -->
              <div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-bold shadow-sm shadow-emerald-500/10">
                <span class="relative flex h-3 w-3">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span>أنت على رأس العمل الآن ✓</span>
              </div>

              <!-- 2. Live Shift Timer Card -->
              <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/25 shadow-lg shadow-emerald-950/30 text-center relative overflow-hidden">
                <div class="text-[11px] font-bold text-emerald-400/90 uppercase tracking-wider flex items-center justify-center gap-1.5 mb-1">
                  <i data-lucide="timer" class="w-4 h-4 text-emerald-400 animate-pulse"></i>
                  <span>مدة العمل المباشرة اليوم</span>
                </div>
                <div id="live-shift-timer-display" class="live-timer-neon text-3xl sm:text-4xl font-black text-emerald-400 tracking-widest my-1">
                  00:00:00
                </div>
                <span class="text-[10px] text-slate-400 block font-mono">بدء الحضور: ${formatTime12(todayRecord.check_in_time)}</span>
              </div>

              <!-- 3. Shift Progress Bar -->
              <div class="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/50 space-y-2 text-right">
                <div class="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span class="flex items-center gap-1.5">
                    <i data-lucide="hourglass" class="w-3.5 h-3.5 text-cyan-400"></i>
                    <span>مسار دوام الوردية</span>
                  </span>
                  <span id="shift-progress-percent" class="font-mono text-emerald-400 text-xs">0%</span>
                </div>
                <div class="w-full h-2.5 rounded-full shift-progress-track overflow-hidden p-0.5">
                  <div id="shift-progress-bar-fill" class="h-full rounded-full shift-progress-fill transition-all duration-700" style="width: 0%"></div>
                </div>
                <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>${formatTime12(todayRecord.scheduled_start || startTime || todayRecord.check_in_time)}</span>
                  <span id="shift-time-remaining" class="text-amber-300 font-sans font-bold">جاري الحساب...</span>
                  <span>${formatTime12(todayRecord.scheduled_end || endTime || '17:00')}</span>
                </div>
              </div>

              <!-- Today's Record Details -->
              <div class="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-right text-xs">
                ${todayRecord.shift_name ? `
                  <div class="col-span-2 pb-2 mb-1 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span class="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1.5">
                      <i data-lucide="layers" class="w-3.5 h-3.5"></i> الوردية: <b>${todayRecord.shift_name}</b>
                    </span>
                    <span class="font-mono text-slate-400 text-[11px]">
                      ${formatTime12(todayRecord.scheduled_start || startTime)} — ${formatTime12(todayRecord.scheduled_end || endTime)}
                    </span>
                  </div>
                ` : ''}
                <div>
                  <span class="text-slate-500 dark:text-slate-400 block">${t('check_in_time_lbl')}</span>
                  <span class="text-base font-bold text-slate-800 dark:text-white font-mono">${formatTime12(todayRecord.check_in_time)}</span>
                </div>
                <div>
                  <span class="text-slate-500 dark:text-slate-400 block">${t('status_lbl')}</span>
                  <div class="mt-1">${getStatusBadge(todayRecord.status)}</div>
                </div>
                ${todayRecord.late_minutes > 0 ? `
                  <div class="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700/80 space-y-2">
                    <div class="flex items-center justify-between text-amber-600 dark:text-amber-400 font-bold">
                      <span>تأخير: ${todayRecord.late_minutes} دقيقة</span>
                      ${todayRecord.estimated_deduction > 0 ? `<span class="text-rose-500 font-extrabold text-xs">الخصم المطبق: ${todayRecord.estimated_deduction} ج.م</span>` : ''}
                    </div>
                    <a href="${getWhatsAppLink(user.phone, `صباح الخير، تم تسجيل حضوري اليوم متأخراً ${todayRecord.late_minutes} دقيقة${todayRecord.estimated_deduction > 0 ? ` - الخصم المطبق ${todayRecord.estimated_deduction} ج.م` : ''}.`)}"
                       target="_blank"
                       class="w-full py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-emerald-500/30 shadow-sm">
                      <i data-lucide="message-circle" class="w-4 h-4"></i>
                      <span>إشعار التأخير عبر واتساب 📲</span>
                    </a>
                  </div>
                ` : ''}
              </div>

              <!-- Check-Out Section -->
              <div class="pt-2">
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  عند نهاية يومك العمل، اضغط أدناه لتسجيل الانصراف وتوثيق ساعات العمل.
                </p>
                <button id="emp-checkout-submit-btn" disabled
                  onclick="EmployeeUI.handleCheckOutClick()"
                  class="hero-btn-checkout w-full py-4 px-6 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg flex items-center justify-center gap-3">
                  <i data-lucide="log-out" class="w-5 h-5"></i>
                  <span>${t('check_out_btn')}</span>
                </button>
              </div>
            </div>
          ` : `
            <!-- Fully Completed Today -->
            <div class="max-w-md mx-auto space-y-5">
              <div class="w-16 h-16 mx-auto rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                <i data-lucide="badge-check" class="w-9 h-9"></i>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-white">اكتمل دوام اليوم بنجاح ✓</h3>
              <p class="text-sm text-slate-500 dark:text-slate-400">
                لقد سجلت الحضور والانصراف لهذا اليوم. نتمنى لك يوماً سعيداً!
              </p>

              <div class="grid grid-cols-3 gap-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-center text-xs">
                <div>
                  <span class="text-slate-500 block">الحضور</span>
                  <strong class="text-slate-800 dark:text-white text-sm font-mono">${formatTime12(todayRecord.check_in_time)}</strong>
                </div>
                <div>
                  <span class="text-slate-500 block">الانصراف</span>
                  <strong class="text-slate-800 dark:text-white text-sm font-mono">${formatTime12(todayRecord.check_out_time)}</strong>
                </div>
                <div>
                  <span class="text-slate-500 block">ساعات العمل</span>
                  <strong class="text-blue-600 dark:text-blue-400 text-sm">${todayRecord.worked_hours} ساعة</strong>
                </div>
              </div>
            </div>
          `}
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    this.updateGpsCard();
    this.loadEmployeeScoreCard();
    if (isCheckedIn && !isCheckedOut) {
      this.startLiveShiftTimer(todayRecord.check_in_time, todayRecord.scheduled_start || startTime, todayRecord.scheduled_end || endTime);
    } else {
      this.stopLiveShiftTimer();
    }
  },

  startLiveShiftTimer(checkInTime, schedStart, schedEnd) {
    this.stopLiveShiftTimer();
    if (!checkInTime) return;

    const parseToDate = (timeStr) => {
      if (!timeStr) return new Date();
      const parts = String(timeStr).trim().split(':').map(Number);
      const d = new Date();
      d.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
      return d;
    };

    const inDate = parseToDate(checkInTime);
    const startDate = parseToDate(schedStart || checkInTime);
    let endDate = parseToDate(schedEnd || '17:00:00');
    if (endDate <= startDate) {
      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
    }

    const update = () => {
      const now = new Date();
      const elapsedMs = Math.max(0, now.getTime() - inDate.getTime());
      const totalSecs = Math.floor(elapsedMs / 1000);
      const hrs = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
      const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
      const secs = String(totalSecs % 60).padStart(2, '0');

      const timerEl = document.getElementById('live-shift-timer-display');
      if (timerEl) {
        timerEl.textContent = `${hrs}:${mins}:${secs}`;
      }

      const fillEl = document.getElementById('shift-progress-bar-fill');
      const pctEl = document.getElementById('shift-progress-percent');
      const remEl = document.getElementById('shift-time-remaining');

      if (fillEl && pctEl) {
        const totalShiftMs = Math.max(1000, endDate.getTime() - startDate.getTime());
        const shiftElapsedMs = Math.max(0, now.getTime() - startDate.getTime());
        const pct = Math.min(100, Math.max(0, Math.round((shiftElapsedMs / totalShiftMs) * 100)));
        fillEl.style.width = pct + '%';
        pctEl.textContent = pct + '%';

        if (remEl) {
          const remMs = endDate.getTime() - now.getTime();
          if (remMs <= 0) {
            remEl.textContent = 'اكتملت ساعات الوردية ✓';
            remEl.className = 'text-emerald-400 font-sans font-bold text-xs';
          } else {
            const remMin = Math.floor(remMs / (60 * 1000));
            const remHrs = Math.floor(remMin / 60);
            const rMin = remMin % 60;
            const remText = remHrs > 0 ? `متبقي ${remHrs} س و ${rMin} د` : `متبقي ${rMin} دقيقة`;
            remEl.textContent = remText;
            remEl.className = 'text-amber-300 font-sans font-bold text-xs';
          }
        }
      }
    };

    update();
    this._liveTimerInterval = setInterval(update, 1000);
  },

  stopLiveShiftTimer() {
    if (this._liveTimerInterval) {
      clearInterval(this._liveTimerInterval);
      this._liveTimerInterval = null;
    }
  },

  getShiftSelectionHtml() {
    const user = API.getCurrentUser() || {};
    const shifts = Array.isArray(this.shifts) ? this.shifts : [];
    if (shifts.length === 0) return '';

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const timeToMins = (t) => {
      if (!t) return 0;
      const parts = t.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    // 1. Check if employee is pre-assigned to a specific shift
    const assigned = shifts.find(s =>
      (this.assignedShiftId && s.id === this.assignedShiftId) ||
      (user.shift_id && s.id === user.shift_id) ||
      (Array.isArray(s.assigned_employee_ids) && s.assigned_employee_ids.includes(user.id))
    );

    if (assigned) {
      this.selectedShiftId = assigned.id;
      const startMins = timeToMins(assigned.start_time);
      const earlyCheckin = assigned.early_checkin_minutes !== undefined ? assigned.early_checkin_minutes : 60;
      const unlockMins = startMins - earlyCheckin;
      const endMins = timeToMins(assigned.end_time);

      if (currentMins < unlockMins) {
        this.selectedShiftId = null;
        const waitMins = unlockMins - currentMins;
        return `
          <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500/30 text-right space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
                <i data-lucide="clock" class="w-4 h-4 text-amber-600"></i> الوردية المخصصة لك: <b>${assigned.name}</b>
              </span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">لم يبدأ الحضور بعد</span>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              يبدأ تسجيل حضور ورديتك (${formatTime12(assigned.start_time)} - ${formatTime12(assigned.end_time)}) في تمام الساعة <b class="text-amber-700 dark:text-amber-300 font-bold">${formatTime12(String(Math.floor(unlockMins/60)).padStart(2,'0') + ':' + String(unlockMins%60).padStart(2,'0'))}</b> (متبقي ${waitMins} دقيقة) وفقاً للوقت المحدد من الإدارة.
            </p>
          </div>
        `;
      }

      return `
        <div class="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-right space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
              <i data-lucide="layers" class="w-4 h-4"></i> الوردية المخصصة لك اليوم:
            </span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white font-mono">مخصصة لك</span>
          </div>
          <div class="font-black text-sm text-slate-800 dark:text-white">${assigned.name}</div>
          <div class="text-xs font-mono text-purple-600 dark:text-purple-400">
            من ${formatTime12(assigned.start_time)} إلى ${formatTime12(assigned.end_time)} (سماح: ${assigned.grace_period_minutes || 0} د)
          </div>
        </div>
      `;
    }

    // 2. Unassigned: calculate unlock window for each shift
    const unlockedShifts = [];
    const upcomingShifts = [];

    shifts.forEach(s => {
      const startMins = timeToMins(s.start_time);
      const earlyCheckin = s.early_checkin_minutes !== undefined ? s.early_checkin_minutes : 60;
      const unlockMins = startMins - earlyCheckin;
      const endMins = timeToMins(s.end_time);

      if (currentMins >= unlockMins && currentMins < endMins) {
        unlockedShifts.push({ ...s, unlockMins, endMins });
      } else if (currentMins < unlockMins) {
        upcomingShifts.push({ ...s, unlockMins, endMins, waitMins: unlockMins - currentMins });
      }
    });

    const formatMinsClock = (m) => {
      const hh = Math.floor(m / 60) % 24;
      const mm = m % 60;
      return formatTime12(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`);
    };

    let upcomingNoticeHtml = '';
    if (upcomingShifts.length > 0) {
      upcomingNoticeHtml = `
        <div class="mt-2.5 p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-right space-y-1.5 text-xs">
          <div class="flex items-center gap-1.5 font-bold text-blue-800 dark:text-blue-300 text-[11px]">
            <i data-lucide="info" class="w-3.5 h-3.5 text-blue-500"></i>
            <span>مواعيد فتح تسجيل الحضور للورديات القادمة اليوم:</span>
          </div>
          ${upcomingShifts.map(up => `
            <div class="text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between pr-2">
              <span><b>${up.name}</b> (${formatTime12(up.start_time)} - ${formatTime12(up.end_time)})</span>
              <span class="font-bold text-blue-600 dark:text-blue-400">يُتاح الحضور: ${formatMinsClock(up.unlockMins)} (بعد ${up.waitMins} د)</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Case A: Exactly 1 shift is unlocked right now
    if (unlockedShifts.length === 1) {
      this.selectedShiftId = unlockedShifts[0].id;
      return `
        <div class="space-y-2 text-right">
          <div class="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-right space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <i data-lucide="check-circle" class="w-4 h-4"></i> الوردية المتاحة حالياً للحضور:
              </span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white font-mono">نشطة الآن</span>
            </div>
            <div class="font-black text-sm text-slate-800 dark:text-white">${unlockedShifts[0].name}</div>
            <div class="text-xs font-mono text-emerald-600 dark:text-emerald-400">
              من ${formatTime12(unlockedShifts[0].start_time)} إلى ${formatTime12(unlockedShifts[0].end_time)}
            </div>
          </div>
          ${upcomingNoticeHtml}
        </div>
      `;
    }

    // Case B: Multiple shifts unlocked (e.g. shift handover window)
    if (unlockedShifts.length > 1) {
      if (!this.selectedShiftId || !unlockedShifts.find(s => s.id === this.selectedShiftId)) {
        this.selectedShiftId = unlockedShifts[0].id;
      }

      return `
        <div class="text-right space-y-2 pt-1">
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <i data-lucide="layers" class="w-4 h-4 text-purple-600"></i>
            <span>اختر الوردية / الفترة التي ستحضر فيها الآن: *</span>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${unlockedShifts.map(s => {
              const isSelected = this.selectedShiftId === s.id;
              return `
                <button type="button" onclick="EmployeeUI.selectShift(${s.id})"
                  class="p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-2 border-purple-600 bg-purple-50 dark:bg-purple-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-purple-300 bg-white dark:bg-slate-800/60'
                  }">
                  <div class="flex items-center justify-between w-full">
                    <span class="font-bold text-xs ${isSelected ? 'text-purple-700 dark:text-purple-300' : 'text-slate-800 dark:text-white'}">${s.name}</span>
                    ${isSelected ? '<span class="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px]">✓</span>' : ''}
                  </div>
                  <div class="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                    ${formatTime12(s.start_time)} — ${formatTime12(s.end_time)}
                  </div>
                </button>
              `;
            }).join('')}
          </div>
          ${upcomingNoticeHtml}
        </div>
      `;
    }

    // Case C: No shifts currently unlocked
    this.selectedShiftId = null;
    if (upcomingShifts.length > 0) {
      const nextShift = upcomingShifts[0];
      return `
        <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-right space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <i data-lucide="clock" class="w-4 h-4 text-amber-600"></i> الوردية القادمة: <b>${nextShift.name}</b>
            </span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">لم يبدأ الحضور بعد</span>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            يبدأ تسجيل حضور <b>${nextShift.name}</b> (${formatTime12(nextShift.start_time)} - ${formatTime12(nextShift.end_time)}) في تمام الساعة <b class="text-amber-700 dark:text-amber-300 font-bold">${formatMinsClock(nextShift.unlockMins)}</b> (متبقي ${nextShift.waitMins} دقيقة) وفقاً لوقت الحضور المحدد من الإدارة.
          </p>
        </div>
      `;
    }

    // Case D: All shifts for today have finished
    return `
      <div class="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right space-y-1">
        <span class="text-xs font-bold text-slate-600 dark:text-slate-300 block">انتهت مواعيد جميع ورديات اليوم</span>
        <span class="text-[11px] text-slate-500 block">لقد انتهت فترات العمل المحددة لليوم وفق جدول الشيفتات.</span>
      </div>
    `;
  },

  selectShift(id) {
    this.selectedShiftId = id;
    const container = document.getElementById('emp-shift-selector-container');
    if (container) {
      container.innerHTML = this.getShiftSelectionHtml();
      if (window.lucide) lucide.createIcons();
    }
    this.updateGpsCard();
  },

  // Handle Checkout Click: checks if photo is required
  handleCheckOutClick() {
    const isPhotoRequired = window.companySettings && window.companySettings.require_checkout_photo;
    if (isPhotoRequired) {
      this.openCameraModal('check-out');
    } else {
      this.submitCheckOutWithoutPhoto();
    }
  },

  async submitCheckOutWithoutPhoto() {
    if (!currentEmpPosition) {
      showToast('يرجى تمكين إذن الـ GPS لتسجيل الانصراف', 'danger');
      return;
    }

    try {
      showToast('جاري تسجيل الانصراف...', 'info');
      const res = await API.checkOut(
        currentEmpPosition.latitude,
        currentEmpPosition.longitude,
        currentEmpPosition.accuracy,
        null
      );
      showToast(res.message, 'success');
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([60, 40, 80]); } catch (_) {}
      }
      await this.loadTodayData();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  // Camera Verification Modal Flow
  openCameraModal(action = 'check-in') {
    activeCheckAction = action;
    capturedPhotoData = null;

    const modal = document.getElementById('camera-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const video = document.getElementById('camera-video');
    const previewImg = document.getElementById('camera-preview-img');
    const snapshotBtn = document.getElementById('camera-snap-btn');
    const retakeBtn = document.getElementById('camera-retake-btn');
    const confirmBtn = document.getElementById('camera-confirm-btn');

    // Update modal title and confirm text based on action
    const titleEl = document.querySelector('#camera-modal [data-i18n="camera_title"]');
    if (titleEl) {
      titleEl.textContent = action === 'check-out' ? 'التقط صورة لإثبات الانصراف' : 'التقط صورة لإثبات الحضور';
    }
    if (confirmBtn) {
      confirmBtn.innerHTML = action === 'check-out'
        ? `<i data-lucide="log-out" class="w-5 h-5"></i><span>تأكيد وإرسال الانصراف</span>`
        : `<i data-lucide="check" class="w-5 h-5"></i><span>تأكيد وإرسال الحضور</span>`;
      confirmBtn.disabled = false;
    }

    if (previewImg) previewImg.classList.add('hidden');
    if (video) video.classList.remove('hidden');
    if (snapshotBtn) snapshotBtn.classList.remove('hidden');
    if (retakeBtn) retakeBtn.classList.add('hidden');
    if (confirmBtn) confirmBtn.classList.add('hidden');

    this.startCameraStream();
    if (window.lucide) lucide.createIcons();
  },

  closeCameraModal() {
    const modal = document.getElementById('camera-modal');
    if (modal) modal.classList.add('hidden');
    this.stopCameraStream();
  },

  async startCameraStream() {
    const video = document.getElementById('camera-video');
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        if (video) {
          video.srcObject = cameraStream;
          video.play();
        }
      } else {
        throw new Error('الكاميرا غير مدعومة');
      }
    } catch (err) {
      console.warn('Camera access error, fallback to file capture:', err);
      showToast('تعذر فتح الكاميرا المباشرة، يمكنك استخدام خيار التقاط الصورة المباشر من الجهاز', 'warning');
      const fallbackInput = document.getElementById('camera-fallback-input');
      if (fallbackInput) fallbackInput.classList.remove('hidden');
    }
  },

  stopCameraStream() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
  },

  takeSnapshot() {
    const video = document.getElementById('camera-video');
    const previewImg = document.getElementById('camera-preview-img');
    const snapshotBtn = document.getElementById('camera-snap-btn');
    const retakeBtn = document.getElementById('camera-retake-btn');
    const confirmBtn = document.getElementById('camera-confirm-btn');

    if (!video) return;

    // Intelligent resizing: max 640px to ensure fast upload (<50KB) and prevent hanging
    const maxDim = 640;
    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Mirror image for realistic selfie preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Compress JPEG to 0.70 for ultra-fast instant transfer (~40KB)
    capturedPhotoData = canvas.toDataURL('image/jpeg', 0.70);

    this.stopCameraStream();
    video.classList.add('hidden');
    if (previewImg) {
      previewImg.src = capturedPhotoData;
      previewImg.classList.remove('hidden');
    }

    if (snapshotBtn) snapshotBtn.classList.add('hidden');
    if (retakeBtn) retakeBtn.classList.remove('hidden');
    if (confirmBtn) confirmBtn.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  retakeSnapshot() {
    capturedPhotoData = null;
    const video = document.getElementById('camera-video');
    const previewImg = document.getElementById('camera-preview-img');
    const snapshotBtn = document.getElementById('camera-snap-btn');
    const retakeBtn = document.getElementById('camera-retake-btn');
    const confirmBtn = document.getElementById('camera-confirm-btn');

    if (previewImg) previewImg.classList.add('hidden');
    if (video) video.classList.remove('hidden');
    if (snapshotBtn) snapshotBtn.classList.remove('hidden');
    if (retakeBtn) retakeBtn.classList.add('hidden');
    if (confirmBtn) confirmBtn.classList.add('hidden');

    this.startCameraStream();
  },

  handleFallbackFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 640;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        capturedPhotoData = canvas.toDataURL('image/jpeg', 0.70);

        const previewImg = document.getElementById('camera-preview-img');
        const video = document.getElementById('camera-video');
        const snapshotBtn = document.getElementById('camera-snap-btn');
        const retakeBtn = document.getElementById('camera-retake-btn');
        const confirmBtn = document.getElementById('camera-confirm-btn');

        if (video) video.classList.add('hidden');
        if (previewImg) {
          previewImg.src = capturedPhotoData;
          previewImg.classList.remove('hidden');
        }
        if (snapshotBtn) snapshotBtn.classList.add('hidden');
        if (retakeBtn) retakeBtn.classList.remove('hidden');
        if (confirmBtn) confirmBtn.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  async confirmAndSubmitAttendance() {
    if (!capturedPhotoData) {
      showToast('يرجى التقاط الصورة أولاً', 'danger');
      return;
    }
    if (!currentEmpPosition) {
      showToast('إحداثيات الـ GPS مطلوبة للتحقق من موقع العمل', 'danger');
      return;
    }

    const confirmBtn = document.getElementById('camera-confirm-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> جاري التوثيق...`;
    }

    try {
      if (activeCheckAction === 'check-in') {
        const res = await API.checkIn(
          currentEmpPosition.latitude,
          currentEmpPosition.longitude,
          currentEmpPosition.accuracy,
          capturedPhotoData,
          this.selectedShiftId || null
        );
        showToast(res.message, 'success');
      } else {
        const res = await API.checkOut(
          currentEmpPosition.latitude,
          currentEmpPosition.longitude,
          currentEmpPosition.accuracy,
          capturedPhotoData
        );
        showToast(res.message, 'success');
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([60, 40, 80]); } catch (_) {}
      }

      this.closeCameraModal();
      await this.loadTodayData();
    } catch (err) {
      showToast(err.message, 'danger');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> تأكيد وإرسال`;
      }
    }
  },

  // ========================================================
  // GAMIFICATION: MY SCORE CARD & LEADERBOARD TAB
  // ========================================================
  async loadEmployeeScoreCard() {
    const cardEl = document.getElementById('emp-score-card');
    if (!cardEl) return;

    try {
      const res = await API.getMyScore();
      const score = Math.round(res.score !== undefined ? res.score : 100);
      const tier = res.tier || { name: 'ملتزم ومتميز', color: 'blue' };
      const metrics = res.metrics || { onTimeDays: 0, lateDays: 0, absentDays: 0, totalLateMinutes: 0 };

      const tierBadgeBg = tier.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                          tier.color === 'blue' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                          tier.color === 'amber' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                          'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';

      const circleStroke = score >= 90 ? '#10b981' : score >= 75 ? '#3b82f6' : score >= 60 ? '#f59e0b' : '#ef4444';
      const circleText = score >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
                         score >= 75 ? 'text-blue-600 dark:text-blue-400' :
                         score >= 60 ? 'text-amber-600 dark:text-amber-400' :
                         'text-rose-600 dark:text-rose-400';

      cardEl.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div class="flex items-center gap-3.5">
              <!-- Circular Commitment Indicator -->
              <div class="relative inline-flex items-center justify-center w-14 h-14 flex-shrink-0">
                <svg class="transform -rotate-90 w-14 h-14" viewBox="0 0 36 36">
                  <path class="text-slate-200 dark:text-slate-800" stroke-width="3.5" stroke="currentColor" fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path stroke="${circleStroke}" stroke-dasharray="${score}, 100" stroke-width="3.5" stroke-linecap="round" fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span class="absolute font-mono font-bold text-xs ${circleText}">${score}%</span>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tierBadgeBg}">
                    ${tier.name}
                  </span>
                  <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold">مؤشر التزامك للشهر الحالي</span>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
                  <span>في الموعد: <strong class="text-emerald-600 dark:text-emerald-400">${metrics.onTimeDays} يوم</strong></span>
                  <span>•</span>
                  <span>تأخير: <strong class="${metrics.lateDays > 0 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}">${metrics.lateDays} يوم</strong></span>
                  <span>•</span>
                  <span>غياب: <strong class="${metrics.absentDays > 0 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}">${metrics.absentDays} يوم</strong></span>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end sm:justify-start">
              <button onclick="EmployeeUI.switchTab('leaderboard')"
                class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all">
                <i data-lucide="bar-chart-2" class="w-4 h-4 text-emerald-500"></i>
                <span>مؤشر الالتزام</span>
              </button>
            </div>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.warn('Error loading employee score card:', e);
    }
  },

  async renderLeaderboardTab(selectedMonth = null) {
    const container = document.getElementById('employee-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="award" class="w-5 h-5 text-emerald-500"></i> مؤشر التزام الزملاء بالشركة
            </h2>
            <p class="text-xs text-slate-500">مؤشر هادئ ومحفز لقياس التزام وانضباط زملاء العمل بمواعيد الحضور</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap" id="emp-leaderboard-actions-bar">
            <div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>

        <div id="emp-leaderboard-main-container" class="space-y-6">
          <div class="p-12 text-center text-slate-400">جاري تحميل مؤشر الالتزام...</div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    try {
      const monthsRes = await API.getAvailableMonths();
      const months = monthsRes.months || [];
      const currentMonth = monthsRes.currentMonth || '';
      const targetMonth = selectedMonth || currentMonth;

      const actionsBar = document.getElementById('emp-leaderboard-actions-bar');
      if (actionsBar) {
        actionsBar.innerHTML = `
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300">الشهر:</label>
            <select id="emp-leaderboard-month-select" onchange="EmployeeUI.renderLeaderboardTab(this.value)"
              class="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500">
              ${months.map(m => `
                <option value="${m.value}" ${m.value === targetMonth ? 'selected' : ''}>
                  📅 ${m.label}
                </option>
              `).join('')}
            </select>
          </div>
        `;
      }

      const [res, myScoreRes] = await Promise.all([
        API.getLeaderboard(targetMonth).catch(() => ({ leaderboard: [] })),
        API.getMyScore(targetMonth).catch(() => ({}))
      ]);
      const list = res.leaderboard || [];
      const currentUserId = API.getCurrentUser()?.id;

      const myScore = Math.round(myScoreRes.score !== undefined ? myScoreRes.score : 100);
      const myTier = myScoreRes.tier || { name: 'ملتزم ومتميز', color: 'blue' };
      const myMetrics = myScoreRes.metrics || {
        onTimeDays: 0,
        lateDays: 0,
        absentDays: 0,
        totalLateMinutes: 0,
        totalAbsenceDeductions: 0,
        totalLateDeductions: 0,
        absentDaysList: [],
        lateDaysList: [],
        onTimeDaysList: []
      };

      const myCircleStroke = myScore >= 90 ? '#10b981' : myScore >= 75 ? '#3b82f6' : myScore >= 60 ? '#f59e0b' : '#ef4444';
      const myCircleText = myScore >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
                           myScore >= 75 ? 'text-blue-600 dark:text-blue-400' :
                           myScore >= 60 ? 'text-amber-600 dark:text-amber-400' :
                           'text-rose-600 dark:text-rose-400';

      const mainContainer = document.getElementById('emp-leaderboard-main-container');
      if (!mainContainer) return;

      if (list.length === 0) {
        mainContainer.innerHTML = `
          <div class="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
            لا توجد سجلات للموظفين في شهر ${targetMonth}.
          </div>
        `;
        return;
      }

      mainContainer.innerHTML = `
        <!-- Personal Monthly Commitment & Deductions Breakdown Card -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-4">
              <div class="relative inline-flex items-center justify-center w-16 h-16 flex-shrink-0">
                <svg class="transform -rotate-90 w-16 h-16" viewBox="0 0 36 36">
                  <path class="text-slate-200 dark:text-slate-800" stroke-width="3.5" stroke="currentColor" fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path stroke="${myCircleStroke}" stroke-dasharray="${myScore}, 100" stroke-width="3.5" stroke-linecap="round" fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span class="absolute font-mono font-bold text-sm ${myCircleText}">${myScore}%</span>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-base font-black text-slate-900 dark:text-white">إحصائيات وسجل التزامي لشهر ${targetMonth}</h3>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    myTier.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                    myTier.color === 'blue' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                    myTier.color === 'amber' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                    'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                  }">
                    ${myTier.name}
                  </span>
                </div>
                <p class="text-xs text-slate-400 mt-1">يُحسب التقييم من بداية الشهر حتى اليوم، ويبدأ بنسبة 100% ويقل مع الغياب والتأخير</p>
              </div>
            </div>

            <div class="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 w-fit">
              <i data-lucide="shield-check" class="w-4 h-4 flex-shrink-0"></i>
              <span>🌴 أيام العطلة الأسبوعية معفاة تماماً ولا تُسجل كغياب</span>
            </div>
          </div>

          <!-- 3 Detailed Breakdown Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- 1. Absence Card -->
            <div class="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <i data-lucide="user-x" class="w-4 h-4"></i> خصم الغياب
                </span>
                <span class="font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                  ${myMetrics.totalAbsenceDeductions > 0 ? `-${myMetrics.totalAbsenceDeductions} ج.م` : '0 ج.م'}
                </span>
              </div>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">
                عدد أيام الغياب: <strong class="text-rose-600 dark:text-rose-400 font-mono">${myMetrics.absentDays}</strong> يوم
              </span>

              ${myMetrics.absentDaysList && myMetrics.absentDaysList.length > 0 ? `
                <div class="pt-2 border-t border-rose-200/50 dark:border-rose-900/30 space-y-1 max-h-32 overflow-y-auto">
                  <span class="text-[10px] text-slate-400 block font-bold">الأيام التي تم تسجيل غياب فيها:</span>
                  ${myMetrics.absentDaysList.map(a => `
                    <div class="flex items-center justify-between p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 text-[11px] font-mono">
                      <span class="text-slate-700 dark:text-slate-300 font-semibold">📅 ${a.date}</span>
                      <span class="text-rose-600 font-bold">-${a.deduction} ج.م</span>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold pt-1">
                  ✓ سجل ناصع بدون أي غياب مسجل 🎉
                </div>
              `}
            </div>

            <!-- 2. Delay Card -->
            <div class="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                  <i data-lucide="clock" class="w-4 h-4"></i> خصم التأخير
                </span>
                <span class="font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                  ${myMetrics.totalLateDeductions > 0 ? `-${myMetrics.totalLateDeductions} ج.م` : '0 ج.م'}
                </span>
              </div>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">
                عدد الأيام: <strong class="text-amber-600 dark:text-amber-400 font-mono">${myMetrics.lateDays}</strong> يوم (${myMetrics.totalLateMinutes} دقيقة)
              </span>

              ${myMetrics.lateDaysList && myMetrics.lateDaysList.length > 0 ? `
                <div class="pt-2 border-t border-amber-200/50 dark:border-amber-900/30 space-y-1 max-h-32 overflow-y-auto">
                  <span class="text-[10px] text-slate-400 block font-bold">الأيام التي سُجل فيها تأخير:</span>
                  ${myMetrics.lateDaysList.map(l => `
                    <div class="flex items-center justify-between p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 text-[11px] font-mono">
                      <span class="text-slate-700 dark:text-slate-300">📅 ${l.date} (${l.lateMinutes}د)</span>
                      <span class="text-amber-600 font-bold">-${l.deduction} ج.م</span>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold pt-1">
                  ✓ حضور كامل في الموعد بدون أي تأخير ✨
                </div>
              `}
            </div>

            <!-- 3. On-Time Card -->
            <div class="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                  <i data-lucide="check-circle-2" class="w-4 h-4"></i> الحضور في الموعد
                </span>
                <span class="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                  ${myMetrics.onTimeDays} يوم
                </span>
              </div>
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block font-semibold">
                حضور منضبط بالكامل خلال فترة السماح
              </span>
              <div class="pt-2 text-[11px] text-emerald-700 dark:text-emerald-300/80 font-medium leading-relaxed">
                الانضباط اليومي يحافظ على مؤشر التقييم عند 100% ويؤهلك للحصول على مكافأة تميز شهرية 🎁
              </div>
            </div>
          </div>
        </div>

        <!-- Full List of Colleagues (Calm & Professional) -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="users" class="w-4 h-4 text-emerald-500"></i> مؤشرات التزام الزملاء لشهر ${targetMonth}
            </h3>
            <span class="text-xs font-bold text-slate-400 font-mono">${list.length} زميل</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-400 uppercase font-semibold">
                <tr>
                  <th class="py-3 px-3">الزميل</th>
                  <th class="py-3 px-3 text-center">نسبة الالتزام</th>
                  <th class="py-3 px-3 text-center">الحالة</th>
                  <th class="py-3 px-3 text-center">في الموعد</th>
                  <th class="py-3 px-3 text-center">التأخير</th>
                  <th class="py-3 px-3 text-center">الغياب</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                ${list.map(item => {
                  const emp = item.employee;
                  const tier = item.tier || {};
                  const isMe = emp.id === currentUserId;
                  const s = Math.round(item.score || 0);
                  const circleStroke = s >= 90 ? '#10b981' : s >= 75 ? '#3b82f6' : s >= 60 ? '#f59e0b' : '#ef4444';
                  const circleText = s >= 90 ? 'text-emerald-600 dark:text-emerald-400' : s >= 75 ? 'text-blue-600 dark:text-blue-400' : s >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

                  return `
                    <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${isMe ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}">
                      <td class="py-3 px-3">
                        <div class="flex items-center gap-3">
                          <div class="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                            ${emp.profile_photo ? `<img src="${emp.profile_photo}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center font-bold text-slate-500">${emp.full_name.charAt(0)}</div>`}
                          </div>
                          <div class="min-w-0">
                            <span class="font-bold text-slate-900 dark:text-white block truncate flex items-center gap-1.5">
                              ${emp.full_name}
                              ${isMe ? '<span class="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-bold">أنت</span>' : ''}
                            </span>
                            <span class="text-[10px] text-slate-400 font-mono block">${emp.job_title || 'موظف'} • ${emp.department_name || ''}</span>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        <div class="inline-flex items-center justify-center">
                          <div class="relative inline-flex items-center justify-center w-11 h-11 flex-shrink-0">
                            <svg class="transform -rotate-90 w-11 h-11" viewBox="0 0 36 36">
                              <path class="text-slate-200 dark:text-slate-800" stroke-width="3.5" stroke="currentColor" fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <path stroke="${circleStroke}" stroke-dasharray="${s}, 100" stroke-width="3.5" stroke-linecap="round" fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            </svg>
                            <span class="absolute font-mono font-bold text-[11px] ${circleText}">${s}%</span>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          tier.color === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20' :
                          tier.color === 'blue' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-500/20' :
                          tier.color === 'amber' ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-500/20' :
                          'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                        }">
                          ${tier.name || 'ملتزم'}
                        </span>
                      </td>
                      <td class="py-3 px-3 text-center font-bold font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        ${item.onTimeDays} يوم
                      </td>
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        ${item.lateDays > 0 ? `
                          <span class="font-bold text-amber-600 dark:text-amber-400 font-mono text-[11px]">${item.lateDays} يوم (${item.totalLateMinutes}د)</span>
                        ` : `<span class="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">0</span>`}
                      </td>
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        ${item.absentDays > 0 ? `
                          <span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-600 font-bold font-mono text-[11px]">${item.absentDays} يوم</span>
                        ` : `<span class="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">0</span>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('Error rendering employee leaderboard tab:', err);
      showToast(err.message || 'فشل في تحميل مؤشر الالتزام', 'danger');
    }
  },

  // 2. My History Tab
  async renderHistoryTab() {
    const container = document.getElementById('employee-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-white">${t('my_history')}</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">سجل كامل بجميع أيام حضورك وانصرافك السابقة</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="EmployeeUI.loadHistoryData()" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1.5">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> تحديث
            </button>
          </div>
        </div>

        <div id="emp-history-table-container" class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div class="p-8 text-center text-slate-500">جاري تحميل السجل...</div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    await this.loadHistoryData();
  },

  async loadHistoryData() {
    const container = document.getElementById('emp-history-table-container');
    if (!container) return;

    try {
      const res = await API.getHistory();
      const records = res.records || [];

      if (records.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-500">لا توجد سجلات حضور سابقة.</div>`;
        return;
      }

      container.innerHTML = `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-sm">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th class="py-3 px-4">التاريخ</th>
                <th class="py-3 px-4">وقت الحضور</th>
                <th class="py-3 px-4">وقت الانصراف</th>
                <th class="py-3 px-4">الحالة</th>
                <th class="py-3 px-4">التأخير</th>
                <th class="py-3 px-4">ساعات العمل</th>
                <th class="py-3 px-4">المسافة</th>
                <th class="py-3 px-4">الصورة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${records.map(r => `
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td class="py-3.5 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">${r.date}</td>
                  <td class="py-3.5 px-4 font-mono">${formatTime12(r.check_in_time)}</td>
                  <td class="py-3.5 px-4 font-mono">${formatTime12(r.check_out_time)}</td>
                  <td class="py-3.5 px-4">${getStatusBadge(r.status)}</td>
                  <td class="py-3.5 px-4 ${r.late_minutes > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}">
                    ${r.late_minutes > 0 ? `${r.late_minutes} د` : '-'}
                  </td>
                  <td class="py-3.5 px-4 font-bold text-slate-700 dark:text-slate-300">
                    ${r.worked_hours > 0 ? `${r.worked_hours} س` : '-'}
                  </td>
                  <td class="py-3.5 px-4 text-xs text-slate-500">
                    ${r.check_in_distance ? `${r.check_in_distance}م` : '-'}
                  </td>
                  <td class="py-3.5 px-4">
                    ${r.check_in_photo ? `
                      <button onclick="EmployeeUI.viewPhoto('${r.check_in_photo}', '${r.date}')" class="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center gap-1">
                        <i data-lucide="image" class="w-3.5 h-3.5"></i> عرض
                      </button>
                    ` : '-'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="p-8 text-center text-rose-500">فشل في تحميل السجل: ${err.message}</div>`;
    }
  },

  // 3. My Summary Tab
  async renderSummaryTab() {
    const container = document.getElementById('employee-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6 max-w-4xl mx-auto">
        <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-white">${t('my_summary')}</h3>
            <p class="text-xs text-slate-500">إحصاءات الدوام، الغياب، والتأخيرات والخصومات المقدرة للشهر الحالي</p>
          </div>
        </div>

        <div id="emp-summary-cards" class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-6 text-center text-slate-500 col-span-4">جاري تحميل الملخص...</div>
        </div>
      </div>
    `;

    try {
      const res = await API.getMonthlySummary();
      const s = (res.summaries && res.summaries[0]) || {};

      const cardsContainer = document.getElementById('emp-summary-cards');
      if (!cardsContainer) return;

      cardsContainer.innerHTML = `
        <div class="p-5 rounded-3xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200">
          <span class="text-xs text-blue-600 dark:text-blue-400 font-semibold block">أيام الحضور</span>
          <span class="text-3xl font-extrabold mt-1 block">${s.presentDays || 0}</span>
          <span class="text-[11px] text-blue-500 mt-1 block">من أصل ${s.totalWorkingDays || 0} يوم عمل</span>
        </div>

        <div class="p-5 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200">
          <span class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold block">في الموعد</span>
          <span class="text-3xl font-extrabold mt-1 block">${s.onTimeDays || 0}</span>
          <span class="text-[11px] text-emerald-500 mt-1 block">نسبة انضباط ممتازة</span>
        </div>

        <div class="p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200">
          <span class="text-xs text-amber-600 dark:text-amber-400 font-semibold block">أيام التأخير</span>
          <span class="text-3xl font-extrabold mt-1 block">${s.lateDays || 0}</span>
          <span class="text-[11px] text-amber-500 mt-1 block">إجمالي: ${s.totalLateMinutes || 0} دقيقة</span>
        </div>

        <div class="p-5 rounded-3xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200">
          <span class="text-xs text-rose-600 dark:text-rose-400 font-semibold block">أيام الغياب</span>
          <span class="text-3xl font-extrabold mt-1 block">${s.absentDays || 0}</span>
          <span class="text-[11px] text-rose-500 mt-1 block">${s.halfDays ? `+ ${s.halfDays} نصف يوم` : 'لا يوجد نصف يوم'}</span>
        </div>

        <div class="p-5 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-indigo-900 dark:text-indigo-200">
          <span class="text-xs text-indigo-600 dark:text-indigo-400 font-semibold block">ساعات العمل المنجزة</span>
          <span class="text-2xl font-black mt-1 block font-mono">${s.totalWorkedHours || 0} <span class="text-xs font-normal">ساعة</span></span>
        </div>

        <div class="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
          <span class="text-xs text-slate-500 font-semibold block">المرتب الأساسي للشهر</span>
          <span class="text-2xl font-black mt-1 block font-mono">${(s.baseSalary || 3000).toLocaleString('ar-EG')} <span class="text-xs font-normal">ج.م</span></span>
        </div>

        <div class="p-5 rounded-3xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200">
          <span class="text-xs text-rose-600 dark:text-rose-400 font-semibold block">إجمالي الخصومات (تأخير وغياب)</span>
          <span class="text-2xl font-black mt-1 block text-rose-600 dark:text-rose-400 font-mono">-${(s.totalDeductions || 0).toLocaleString('ar-EG')} <span class="text-xs font-normal">ج.م</span></span>
        </div>

        <div class="p-5 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200">
          <span class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold block">صافي القبض المستحق</span>
          <span class="text-2xl font-black mt-1 block text-emerald-600 dark:text-emerald-400 font-mono">${(s.netSalary !== undefined ? s.netSalary : Math.max(0, (s.baseSalary || 3000) - (s.totalDeductions || 0))).toLocaleString('ar-EG')} <span class="text-xs font-normal">ج.م</span></span>
        </div>
      `;
    } catch (err) {
      console.error(err);
    }
  },

  // 4. Corrections Tab
  async renderCorrectionsTab() {
    const container = document.getElementById('employee-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6 max-w-4xl mx-auto">
        <div class="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-white">${t('my_corrections')}</h3>
            <p class="text-xs text-slate-500">تقديم طلب للمدير لتصحيح نسيان تسجيل الحضور أو الانصراف أو مشاكل الـ GPS</p>
          </div>
          <button onclick="EmployeeUI.openNewCorrectionModal()" class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-2">
            <i data-lucide="plus" class="w-4 h-4"></i> تقديم طلب تصحيح جديد
          </button>
        </div>

        <div id="emp-corrections-list" class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div class="p-8 text-center text-slate-500">جاري تحميل الطلبات...</div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    await this.loadCorrectionsList();
  },

  async loadCorrectionsList() {
    const container = document.getElementById('emp-corrections-list');
    if (!container) return;

    try {
      const res = await API.getCorrections();
      const list = res.requests || [];

      if (list.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-500">لا توجد طلبات تصحيح مقدمة حتى الآن.</div>`;
        return;
      }

      const reasonLabels = {
        forgot_checkin: 'نسيان تسجيل الحضور',
        forgot_checkout: 'نسيان تسجيل الانصراف',
        gps_issue: 'مشكلة في إشارة الـ GPS',
        internet_issue: 'انقطاع الاتصال بالإنترنت',
        other: 'سبب آخر'
      };

      container.innerHTML = `
        <div class="divide-y divide-slate-100 dark:divide-slate-800">
          ${list.map(c => `
            <div class="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-slate-900 dark:text-white">${reasonLabels[c.reason_type] || c.reason_type}</span>
                  <span class="text-xs font-mono text-slate-500">(${c.date})</span>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-400">${c.reason_details || 'بدون تفاصيل إضافية'}</p>
                <div class="text-[11px] text-slate-500 flex items-center gap-3 pt-1">
                  ${c.requested_check_in ? `<span>الحضور المطلوب: <strong>${c.requested_check_in}</strong></span>` : ''}
                  ${c.requested_check_out ? `<span>الانصراف المطلوب: <strong>${c.requested_check_out}</strong></span>` : ''}
                </div>
                ${c.review_notes ? `
                  <div class="mt-2 text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-xl text-slate-700 dark:text-slate-300">
                    <strong>رد الإدارة:</strong> ${c.review_notes}
                  </div>
                ` : ''}
              </div>
              <div>
                ${c.status === 'pending' ? '<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">قيد المراجعة</span>' :
                  c.status === 'approved' ? '<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">تمت الموافقة ✓</span>' :
                  '<span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">تم الرفض ✗</span>'}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="p-8 text-center text-rose-500">فشل في تحميل الطلبات: ${err.message}</div>`;
    }
  },

  openNewCorrectionModal() {
    const modal = document.getElementById('new-correction-modal');
    if (modal) modal.classList.remove('hidden');
    const dateInput = document.getElementById('corr-date-input');
    if (dateInput) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateInput.value = yesterday.toISOString().split('T')[0];
    }
  },

  closeNewCorrectionModal() {
    const modal = document.getElementById('new-correction-modal');
    if (modal) modal.classList.add('hidden');
  },

  async submitNewCorrection(event) {
    event.preventDefault();
    const date = document.getElementById('corr-date-input').value;
    const checkIn = document.getElementById('corr-in-input').value;
    const checkOut = document.getElementById('corr-out-input').value;
    const reasonType = document.getElementById('corr-type-select').value;
    const details = document.getElementById('corr-details-input').value;

    try {
      const res = await API.submitCorrection({
        date,
        requested_check_in: checkIn || null,
        requested_check_out: checkOut || null,
        reason_type: reasonType,
        reason_details: details
      });
      showToast(res.message, 'success');
      this.closeNewCorrectionModal();
      this.loadCorrectionsList();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  // 5. Profile Tab (Editable Name & Avatar)
  tempEmployeeAvatar: null,

  handleProfileAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('يرجى اختيار ملف صورة صالح', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 400;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);

        EmployeeUI.tempEmployeeAvatar = compressedBase64;
        const preview = document.getElementById('emp-profile-avatar-preview');
        if (preview) preview.src = compressedBase64;
        showToast('تم تحميل الصورة بنجاح! اضغط "حفظ التعديلات" لتطبيقها', 'info');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  async saveProfile(event) {
    event.preventDefault();
    const fullNameInput = document.getElementById('emp-edit-fullname');
    const phoneInput = document.getElementById('emp-edit-phone');
    const emailInput = document.getElementById('emp-edit-email');
    const passInput = document.getElementById('emp-edit-password');
    const confirmPassInput = document.getElementById('emp-edit-confirm-password');

    const fullName = fullNameInput ? fullNameInput.value.trim() : '';
    if (!fullName) {
      showToast('الاسم الكامل حقل إلزامي', 'warning');
      return;
    }

    const data = {
      full_name: fullName,
      phone: phoneInput ? phoneInput.value.trim() : null,
      email: emailInput ? emailInput.value.trim() : (API.getCurrentUser() || {}).email
    };

    if (passInput && passInput.value.trim().length > 0) {
      if (passInput.value.trim().length < 6) {
        showToast('كلمة المرور يجب أن لا تقل عن 6 خانات', 'danger');
        return;
      }
      if (passInput.value !== confirmPassInput.value) {
        showToast('كلمتا المرور غير متطابقتين', 'danger');
        return;
      }
      data.password = passInput.value.trim();
      data.confirm_password = confirmPassInput.value.trim();
    }

    if (this.tempEmployeeAvatar) {
      data.profile_photo = this.tempEmployeeAvatar;
    }

    try {
      const res = await API.updateProfile(data);
      showToast(res.message || 'تم تحديث بياناتك الشخصية وصورتك بنجاح!', 'success');

      // Refresh currentUser
      const meRes = await API.getMe();
      if (meRes && meRes.user) {
        API.setCurrentUser(meRes.user);
        App.currentUser = meRes.user;
        const avatarEl = document.getElementById('header-user-avatar');
        const nameEl = document.getElementById('header-user-name');
        if (avatarEl) avatarEl.src = meRes.user.profile_photo || '/uploads/avatar.svg';
        if (nameEl) nameEl.textContent = meRes.user.full_name || '';
      }
      this.tempEmployeeAvatar = null;
      this.renderProfileTab();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  renderProfileTab() {
    const container = document.getElementById('employee-content');
    if (!container) return;

    const u = API.getCurrentUser() || {};

    container.innerHTML = `
      <div class="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="user-cog" class="w-5 h-5 text-emerald-500"></i> الملف الشخصي وتعديل البيانات
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">يمكنك تعديل اسمك الكامل وصورتك الشخصية ورقم الهاتف وكلمة المرور</p>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            ${u.department_name || 'القسم العام'}
          </span>
        </div>

        <!-- Form for editing profile -->
        <form onsubmit="EmployeeUI.saveProfile(event)" class="space-y-5">
          <!-- Avatar section -->
          <div class="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <div class="relative group flex-shrink-0">
              <img id="emp-profile-avatar-preview" src="${u.profile_photo || '/uploads/avatar.svg'}" class="w-24 h-24 rounded-2xl object-cover bg-slate-100 dark:bg-slate-700 border-2 border-white dark:border-slate-600 shadow-md" />
              <label for="emp-avatar-input" class="absolute inset-0 bg-slate-900/60 rounded-2xl opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[11px] font-bold cursor-pointer transition-opacity">
                <i data-lucide="camera" class="w-5 h-5 mb-1"></i>
                تغيير الصورة
              </label>
              <input type="file" id="emp-avatar-input" accept="image/*" class="hidden" onchange="EmployeeUI.handleProfileAvatarUpload(event)" />
            </div>
            <div class="text-center sm:text-right flex-1 min-w-0">
              <h4 class="text-base font-extrabold text-slate-900 dark:text-white">${u.full_name}</h4>
              <p class="text-xs text-slate-500 font-mono mt-0.5">${u.employee_code} • ${u.job_title || 'موظف'}</p>
              <div class="mt-3 flex items-center justify-center sm:justify-start gap-2">
                <label for="emp-avatar-input" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-xs">
                  <i data-lucide="upload" class="w-3.5 h-3.5 text-emerald-500"></i>
                  <span>تغيير الصورة الشخصية</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Name & Phone Fields -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                الاسم الكامل *
              </label>
              <input type="text" id="emp-edit-fullname" required value="${(u.full_name || '').replace(/"/g, '&quot;')}"
                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                رقم الهاتف (اختياري)
              </label>
              <input type="text" id="emp-edit-phone" value="${(u.phone || '').replace(/"/g, '&quot;')}" placeholder="010..."
                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              البريد الإلكتروني (لتسجيل الدخول) *
            </label>
            <input type="email" id="emp-edit-email" required value="${(u.email || '').replace(/"/g, '&quot;')}"
              class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
          </div>

          <!-- Password change (optional) -->
          <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
            <span class="text-xs font-bold text-amber-700 dark:text-amber-400 block">تغيير كلمة المرور (اختياري)</span>
            <p class="text-[11px] text-slate-500">اترك الحقول فارغة إذا كنت ترغب بالاحتفاظ بكلمة مرورك الحالية.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="password" id="emp-edit-password" minlength="6" placeholder="كلمة المرور الجديدة"
                class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
              <input type="password" id="emp-edit-confirm-password" minlength="6" placeholder="تأكيد كلمة المرور"
                class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
            </div>
          </div>

          <!-- Read-only organizational info -->
          <div class="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span class="text-slate-400 block font-medium">الرقم الوظيفي:</span>
              <span class="font-bold text-slate-800 dark:text-slate-200 font-mono">${u.employee_code || '-'}</span>
            </div>
            <div>
              <span class="text-slate-400 block font-medium">المسمى الوظيفي:</span>
              <span class="font-bold text-slate-800 dark:text-slate-200">${u.job_title || 'موظف'}</span>
            </div>
            <div>
              <span class="text-slate-400 block font-medium">تاريخ التعيين:</span>
              <span class="font-bold text-slate-800 dark:text-slate-200 font-mono">${u.hire_date || '-'}</span>
            </div>
            <div>
              <span class="text-slate-400 block font-medium">جدول الدوام:</span>
              <span class="font-bold text-slate-800 dark:text-slate-200">${u.schedule_name || 'الدوام القياسي'}</span>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <button type="submit" class="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-500/20 transition-all">
              <i data-lucide="check" class="w-4 h-4"></i>
              <span>حفظ التعديلات</span>
            </button>
          </div>
        </form>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  // 5. Leaves & Permissions Tab (الإجازات والأذونات الرسمية)
  async renderLeavesTab() {
    const container = document.getElementById('employee-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="calendar-check" class="w-5 h-5 text-blue-500"></i> نظام الإجازات والأذونات الرسمية
            </h2>
            <p class="text-xs text-slate-500">متابعة رصيد إجازاتك السنوية، تقديم طلبات الإجازات والأذونات، ومتابعة ردود الإدارة</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button onclick="EmployeeUI.openLeaveRequestModal()"
              class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all">
              <i data-lucide="plus" class="w-4 h-4"></i> طلب إجازة 🌴
            </button>
            <button onclick="EmployeeUI.openPermissionRequestModal()"
              class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all">
              <i data-lucide="clock" class="w-4 h-4"></i> طلب إذن خروج ⏱️
            </button>
          </div>
        </div>

        <div id="emp-leaves-balance-cards" class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center animate-pulse">
            <span class="text-xs text-slate-400">جاري التحميل...</span>
          </div>
        </div>

        <!-- Leaves Section -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="plane" class="w-4 h-4 text-emerald-500"></i> سجل طلبات الإجازات
            </h3>
            <span id="emp-leaves-count" class="text-xs font-bold text-slate-400"></span>
          </div>
          <div id="emp-leaves-list" class="space-y-2.5">
            <div class="p-6 text-center text-xs text-slate-400">جاري تحميل سجل الإجازات...</div>
          </div>
        </div>

        <!-- Permissions Section -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="timer" class="w-4 h-4 text-indigo-500"></i> سجل طلبات الأذونات (التأخير والانصراف المبكر)
            </h3>
            <span id="emp-permissions-count" class="text-xs font-bold text-slate-400"></span>
          </div>
          <div id="emp-permissions-list" class="space-y-2.5">
            <div class="p-6 text-center text-xs text-slate-400">جاري تحميل سجل الأذونات...</div>
          </div>
        </div>
      </div>

      <!-- Container for Leave & Permission Modals -->
      <div id="leave-action-modal"></div>
    `;
    if (window.lucide) lucide.createIcons();

    try {
      const [balRes, leavesRes, permsRes] = await Promise.all([
        API.getLeaveBalance(),
        API.getLeaves(),
        API.getPermissions()
      ]);

      const bal = balRes.balance || { annual_total: 21, annual_used: 0, annual_remaining: 21, sick_used: 0, casual_used: 0, permissions_this_month: 0, permission_hours_this_month: 0 };
      const leaves = leavesRes.requests || [];
      const perms = permsRes.requests || [];

      // Render Balance Cards
      const balContainer = document.getElementById('emp-leaves-balance-cards');
      if (balContainer) {
        balContainer.innerHTML = `
          <div class="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 text-right">
            <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">الرصيد السنوي المتبقي</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900 dark:text-white">${bal.annual_remaining}</span>
              <span class="text-xs text-slate-400">/ ${bal.annual_total} يوم</span>
            </div>
          </div>
          <div class="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 text-right">
            <span class="text-[11px] font-bold text-blue-600 dark:text-blue-400 block mb-1">الإجازات السنوية المستهلكة</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900 dark:text-white">${bal.annual_used}</span>
              <span class="text-xs text-slate-400">أيام</span>
            </div>
          </div>
          <div class="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 text-right">
            <span class="text-[11px] font-bold text-amber-600 dark:text-amber-400 block mb-1">مرضية وعارضة</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900 dark:text-white">${(bal.sick_used || 0) + (bal.casual_used || 0)}</span>
              <span class="text-xs text-slate-400">أيام</span>
            </div>
          </div>
          <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border border-indigo-500/20 text-right">
            <span class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1">أذونات هذا الشهر</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900 dark:text-white">${bal.permissions_this_month}</span>
              <span class="text-xs text-slate-400">(${bal.permission_hours_this_month} ساعة)</span>
            </div>
          </div>
        `;
      }

      // Render Leaves List
      const leavesCountEl = document.getElementById('emp-leaves-count');
      if (leavesCountEl) leavesCountEl.textContent = `${leaves.length} طلب`;
      const leavesListEl = document.getElementById('emp-leaves-list');
      if (leavesListEl) {
        if (leaves.length === 0) {
          leavesListEl.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">لا توجد طلبات إجازة مسجلة بعد.</div>`;
        } else {
          const typeNames = { annual: 'إجازة سنوية اعتيادية', sick: 'إجازة مرضية', casual: 'إجازة عارضة / طارئة', unpaid: 'إجازة بدون راتب' };
          const typeColors = { annual: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60', sick: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60', casual: 'text-purple-600 bg-purple-50 dark:bg-purple-950/60', unpaid: 'text-rose-600 bg-rose-50 dark:bg-rose-950/60' };
          const statusBadges = {
            pending: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">قيد المراجعة ⏳</span>',
            approved: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">معتمدة ✓</span>',
            rejected: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">مرفوضة ✕</span>'
          };

          leavesListEl.innerHTML = leaves.map(l => `
            <div class="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div class="space-y-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2.5 py-0.5 rounded-lg font-bold text-[11px] ${typeColors[l.leave_type] || 'text-blue-600 bg-blue-50'}">
                    ${typeNames[l.leave_type] || l.leave_type}
                  </span>
                  <span class="font-extrabold text-slate-800 dark:text-white">
                    ${l.days_count} ${l.days_count === 1 ? 'يوم' : 'أيام'}
                  </span>
                  <span class="text-slate-400 font-mono text-[11px]">(${l.start_date} ← ${l.end_date})</span>
                </div>
                ${l.reason ? `<p class="text-slate-600 dark:text-slate-300 text-xs mt-1">السبب: ${l.reason}</p>` : ''}
                ${l.review_notes ? `<p class="text-blue-600 dark:text-blue-400 text-[11px] font-medium">ملاحظات الإدارة: ${l.review_notes}</p>` : ''}
              </div>
              <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                ${statusBadges[l.status] || l.status}
                ${l.status === 'pending' ? `
                  <button onclick="EmployeeUI.cancelLeaveRequest(${l.id})" class="px-2 py-1 text-rose-500 hover:text-rose-600 font-bold text-[11px] hover:underline" title="إلغاء الطلب">
                    إلغاء
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('');
        }
      }

      // Render Permissions List
      const permsCountEl = document.getElementById('emp-permissions-count');
      if (permsCountEl) permsCountEl.textContent = `${perms.length} طلب`;
      const permsListEl = document.getElementById('emp-permissions-list');
      if (permsListEl) {
        if (perms.length === 0) {
          permsListEl.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">لا توجد طلبات أذونات مسجلة بعد.</div>`;
        } else {
          const permTypes = { late_arrival: 'إذن تأخير صباحي بعذر', early_departure: 'إذن انصراف مبكر', during_day: 'إذن خروج وعودة أثناء الدوام' };
          const statusBadges = {
            pending: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">قيد المراجعة ⏳</span>',
            approved: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">معتمد ✓</span>',
            rejected: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">مرفوض ✕</span>'
          };

          permsListEl.innerHTML = perms.map(p => `
            <div class="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div class="space-y-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2.5 py-0.5 rounded-lg font-bold text-[11px] text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60">
                    ${permTypes[p.permission_type] || p.permission_type}
                  </span>
                  <span class="font-extrabold text-slate-800 dark:text-white">
                    ${p.hours_count} ساعة
                  </span>
                  <span class="text-slate-400 font-mono text-[11px]">
                    يوم ${p.date} (${formatTime12(p.start_time)} ← ${formatTime12(p.end_time)})
                  </span>
                </div>
                <p class="text-slate-600 dark:text-slate-300 text-xs mt-1">السبب: ${p.reason || '-'}</p>
                ${p.review_notes ? `<p class="text-blue-600 dark:text-blue-400 text-[11px] font-medium">ملاحظات الإدارة: ${p.review_notes}</p>` : ''}
              </div>
              <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                ${statusBadges[p.status] || p.status}
                ${p.status === 'pending' ? `
                  <button onclick="EmployeeUI.cancelPermissionRequest(${p.id})" class="px-2 py-1 text-rose-500 hover:text-rose-600 font-bold text-[11px] hover:underline" title="إلغاء الطلب">
                    إلغاء
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Error rendering leaves tab:', err);
      showToast('حدث خطأ أثناء تحميل بيانات الإجازات', 'danger');
    }
  },

  openLeaveRequestModal() {
    const modal = document.getElementById('leave-action-modal');
    if (!modal) return;

    const todayStr = new Date().toISOString().split('T')[0];
    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-right text-xs space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <i data-lucide="calendar-plus" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">طلب إجازة رسمية</h3>
                <span class="text-[11px] text-slate-400">إرسال طلب إجازة لاعتماده من الإدارة</span>
              </div>
            </div>
            <button onclick="document.getElementById('leave-action-modal').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="EmployeeUI.submitLeaveRequest(event)" class="space-y-3.5">
            <div>
              <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">نوع الإجازة:</label>
              <select id="leave-type-select" required class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold focus:ring-2 focus:ring-blue-500">
                <option value="annual">🌴 إجازة سنوية اعتيادية (تُخصم من الرصيد)</option>
                <option value="sick">🩺 إجازة مرضية (تقرير طبي)</option>
                <option value="casual">⚡ إجازة عارضة / طارئة</option>
                <option value="unpaid">💼 إجازة بدون راتب</option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">من تاريخ:</label>
                <input type="date" id="leave-start-date" required value="${todayStr}" min="${todayStr}"
                  onchange="EmployeeUI.updateLeaveDaysCalc()"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-xs" />
              </div>
              <div>
                <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">إلى تاريخ:</label>
                <input type="date" id="leave-end-date" required value="${todayStr}" min="${todayStr}"
                  onchange="EmployeeUI.updateLeaveDaysCalc()"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-xs" />
              </div>
            </div>

            <div class="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex items-center justify-between text-blue-700 dark:text-blue-300 font-bold">
              <span>إجمالي عدد الأيام المطلوبة:</span>
              <span id="leave-days-calc-badge" class="px-2.5 py-0.5 rounded-lg bg-blue-600 text-white text-xs">1 يوم</span>
            </div>

            <div>
              <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">سبب الإجازة (اختياري):</label>
              <textarea id="leave-reason" rows="2" placeholder="اكتب سبب طلب الإجازة هنا..."
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs resize-none"></textarea>
            </div>

            <div class="pt-2 flex items-center justify-end gap-2">
              <button type="button" onclick="document.getElementById('leave-action-modal').innerHTML=''" class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs">
                إلغاء
              </button>
              <button type="submit" id="leave-submit-btn" class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/25">
                <i data-lucide="send" class="w-4 h-4"></i> إرسال الطلب
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  updateLeaveDaysCalc() {
    const s = document.getElementById('leave-start-date');
    const e = document.getElementById('leave-end-date');
    const badge = document.getElementById('leave-days-calc-badge');
    if (!s || !e || !badge) return;
    try {
      const d1 = new Date(s.value + 'T00:00:00');
      const d2 = new Date(e.value + 'T00:00:00');
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const count = diffDays > 0 ? diffDays : 1;
      badge.textContent = `${count} ${count === 1 ? 'يوم' : 'أيام'}`;
    } catch {
      badge.textContent = '1 يوم';
    }
  },

  async submitLeaveRequest(event) {
    event.preventDefault();
    const btn = document.getElementById('leave-submit-btn');
    const leave_type = document.getElementById('leave-type-select').value;
    const start_date = document.getElementById('leave-start-date').value;
    const end_date = document.getElementById('leave-end-date').value;
    const reason = document.getElementById('leave-reason').value;

    if (btn) btn.disabled = true;

    try {
      const res = await API.submitLeave({ leave_type, start_date, end_date, reason });
      if (res.success) {
        showToast(res.message || 'تم تقديم طلب الإجازة بنجاح', 'success');
        document.getElementById('leave-action-modal').innerHTML = '';
        this.renderLeavesTab();
      } else {
        showToast(res.error || 'فشل في تقديم الطلب', 'danger');
      }
    } catch (err) {
      showToast(err.message || 'فشل في تقديم الطلب', 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async cancelLeaveRequest(id) {
    if (!confirm('هل أنت متأكد من رغبتك في إلغاء طلب الإجازة هذا؟')) return;
    try {
      const res = await API.deleteLeave(id);
      if (res.success) {
        showToast('تم إلغاء طلب الإجازة', 'info');
        this.renderLeavesTab();
      } else {
        showToast(res.error || 'فشل في إلغاء الطلب', 'danger');
      }
    } catch (err) {
      showToast(err.message || 'فشل في إلغاء الطلب', 'danger');
    }
  },

  openPermissionRequestModal() {
    const modal = document.getElementById('leave-action-modal');
    if (!modal) return;

    const todayStr = new Date().toISOString().split('T')[0];
    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-right text-xs space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <i data-lucide="clock" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">طلب إذن خروج أو تأخير</h3>
                <span class="text-[11px] text-slate-400">طلب إذن ساعتين أو خروج طارئ أثناء الدوام</span>
              </div>
            </div>
            <button onclick="document.getElementById('leave-action-modal').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="EmployeeUI.submitPermissionRequest(event)" class="space-y-3.5">
            <div>
              <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">نوع الإذن:</label>
              <select id="perm-type-select" required class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold focus:ring-2 focus:ring-indigo-500">
                <option value="late_arrival">🌅 إذن تأخير صباحي بعذر</option>
                <option value="early_departure">🚪 إذن انصراف مبكر</option>
                <option value="during_day">⚡ إذن خروج وعودة أثناء الدوام</option>
              </select>
            </div>

            <div>
              <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">تاريخ الإذن:</label>
              <input type="date" id="perm-date" required value="${todayStr}" min="${todayStr}"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-xs" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">من الساعة:</label>
                <input type="time" id="perm-start-time" required value="09:00"
                  onchange="EmployeeUI.updatePermHoursCalc()"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-xs font-mono" />
              </div>
              <div>
                <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">إلى الساعة:</label>
                <input type="time" id="perm-end-time" required value="11:00"
                  onchange="EmployeeUI.updatePermHoursCalc()"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-xs font-mono" />
              </div>
            </div>

            <div class="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-indigo-700 dark:text-indigo-300 font-bold">
              <span>مدة الإذن المقدرة:</span>
              <span id="perm-hours-calc-badge" class="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white text-xs">2 ساعة</span>
            </div>

            <div>
              <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">سبب الإذن (إلزامي):</label>
              <textarea id="perm-reason" required rows="2" placeholder="مثال: ظرف عائلي طارئ / مراجعة مصلحة حكومية..."
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs resize-none"></textarea>
            </div>

            <div class="pt-2 flex items-center justify-end gap-2">
              <button type="button" onclick="document.getElementById('leave-action-modal').innerHTML=''" class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs">
                إلغاء
              </button>
              <button type="submit" id="perm-submit-btn" class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/25">
                <i data-lucide="send" class="w-4 h-4"></i> إرسال الطلب
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  updatePermHoursCalc() {
    const s = document.getElementById('perm-start-time');
    const e = document.getElementById('perm-end-time');
    const badge = document.getElementById('perm-hours-calc-badge');
    if (!s || !e || !badge) return;
    try {
      const [h1, m1] = s.value.split(':').map(Number);
      const [h2, m2] = e.value.split(':').map(Number);
      const diffMins = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
      const hours = diffMins > 0 ? (diffMins / 60).toFixed(1) : '1.0';
      badge.textContent = `${hours} ساعة`;
    } catch {
      badge.textContent = '1 ساعة';
    }
  },

  async submitPermissionRequest(event) {
    event.preventDefault();
    const btn = document.getElementById('perm-submit-btn');
    const permission_type = document.getElementById('perm-type-select').value;
    const date = document.getElementById('perm-date').value;
    const start_time = document.getElementById('perm-start-time').value;
    const end_time = document.getElementById('perm-end-time').value;
    const reason = document.getElementById('perm-reason').value;

    if (btn) btn.disabled = true;

    try {
      const res = await API.submitPermission({ permission_type, date, start_time, end_time, reason });
      if (res.success) {
        showToast(res.message || 'تم تقديم طلب الإذن بنجاح', 'success');
        document.getElementById('leave-action-modal').innerHTML = '';
        this.renderLeavesTab();
      } else {
        showToast(res.error || 'فشل في إرسال طلب الإذن', 'danger');
      }
    } catch (err) {
      showToast(err.message || 'فشل في إرسال طلب الإذن', 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async cancelPermissionRequest(id) {
    if (!confirm('هل أنت متأكد من رغبتك في إلغاء طلب الإذن هذا؟')) return;
    try {
      const res = await API.deletePermission(id);
      if (res.success) {
        showToast('تم إلغاء طلب الإذن', 'info');
        this.renderLeavesTab();
      } else {
        showToast(res.error || 'فشل في إلغاء الطلب', 'danger');
      }
    } catch (err) {
      showToast(err.message || 'فشل في إلغاء الطلب', 'danger');
    }
  },

  // 6. Finances & Payroll Tab (المرتب والسلف وقسيمة الراتب)
  async renderFinancesTab(selectedMonth = null) {
    const container = document.getElementById('employee-content');
    if (!container) return;

    const user = API.getCurrentUser() || {};
    const todayMonth = new Date().toISOString().substring(0, 7);
    const targetMonth = selectedMonth || todayMonth;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="wallet-cards" class="w-5 h-5 text-emerald-500"></i> كشف المرتب والسلف والمكافآت
            </h2>
            <p class="text-xs text-slate-500">متابعة حسابك المالي، طلبات السلف، المكافآت التقديرية، وطباعة قسيمة الراتب الرسمية</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap" id="emp-finances-actions-bar">
            <div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>

        <div id="emp-finances-main-container">
          <div class="p-12 text-center text-slate-400">جاري تحميل بيانات المرتب والسلف...</div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    try {
      const monthsRes = await API.getAvailableMonths();
      const months = monthsRes.months || [];

      const actionsBar = document.getElementById('emp-finances-actions-bar');
      if (actionsBar) {
        actionsBar.innerHTML = `
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300">الشهر:</label>
            <select id="emp-finance-month-select" onchange="EmployeeUI.renderFinancesTab(this.value)"
              class="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500">
              ${months.map(m => `
                <option value="${m.value}" ${m.value === targetMonth ? 'selected' : ''}>
                  📅 ${m.label}
                </option>
              `).join('')}
            </select>
          </div>
          <button onclick="EmployeeUI.openRequestAdvanceModal('${targetMonth}')"
            class="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all">
            <i data-lucide="plus" class="w-4 h-4"></i> طلب سلفة
          </button>
          <button onclick="EmployeeUI.printMyPayslip('${targetMonth}')"
            class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all">
            <i data-lucide="printer" class="w-4 h-4"></i> طباعة قسيمة الراتب 📄
          </button>
        `;
      }

      const res = await API.getEmployeeMonthDetails(user.id, targetMonth);
      const emp = res.employee || {};
      const stats = res.stats || {};
      const bonuses = res.bonuses || [];
      const advances = res.advances || [];

      const baseSalary = stats.baseSalary || parseFloat(emp.base_salary || 3000);
      const totalBonuses = stats.totalBonuses || 0;
      const totalLateDeductions = stats.totalLateDeductions || 0;
      const totalAbsenceDeductions = stats.totalAbsenceDeductions || 0;
      const totalDeductions = stats.totalDeductions || (totalLateDeductions + totalAbsenceDeductions);
      const totalAdvances = stats.totalAdvances || 0;
      const netSalary = stats.netSalary !== undefined ? stats.netSalary : Math.max(0, baseSalary + totalBonuses - totalDeductions - totalAdvances);

      const mainContainer = document.getElementById('emp-finances-main-container');
      if (!mainContainer) return;

      mainContainer.innerHTML = `
        <div class="space-y-6">
          <!-- 1. Financial Overview Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div class="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-right">
              <span class="text-xs text-slate-500 dark:text-slate-400 font-bold block">المرتب الأساسي</span>
              <span class="text-xl font-black text-slate-900 dark:text-white mt-1 block font-mono">${baseSalary.toLocaleString('ar-EG')} ج.م</span>
              <span class="text-[10px] text-slate-400 mt-0.5 block">الراتب الشهري الثابت</span>
            </div>

            <div class="p-4 rounded-3xl bg-purple-500/10 border border-purple-500/20 shadow-sm text-right">
              <span class="text-xs text-purple-600 dark:text-purple-400 font-bold block">المكافآت والحوافز</span>
              <span class="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 block font-mono">+${totalBonuses.toLocaleString('ar-EG')} ج.م</span>
              <span class="text-[10px] text-purple-400 mt-0.5 block font-semibold">${bonuses.length} مكافأة معتمدة 🎁</span>
            </div>

            <div class="p-4 rounded-3xl bg-rose-500/10 border border-rose-500/20 shadow-sm text-right">
              <span class="text-xs text-rose-500 font-bold block">الخصومات (تأخير+غياب)</span>
              <span class="text-xl font-black text-rose-500 mt-1 block font-mono">-${totalDeductions.toLocaleString('ar-EG')} ج.م</span>
              <span class="text-[10px] text-rose-400 mt-0.5 block font-mono">تأخير: ${stats.lateDays || 0}ي • غياب: ${stats.absentDays || 0}ي</span>
            </div>

            <div class="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 shadow-sm text-right">
              <span class="text-xs text-amber-600 dark:text-amber-400 font-bold block">السلف والمسحوبات</span>
              <span class="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 block font-mono">-${totalAdvances.toLocaleString('ar-EG')} ج.م</span>
              <span class="text-[10px] text-amber-500 mt-0.5 block font-semibold">سلف معتمدة ومخصومة 💸</span>
            </div>

            <div class="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 shadow-sm text-right col-span-2 sm:col-span-1">
              <span class="text-xs text-emerald-600 dark:text-emerald-400 font-bold block">صافي القبض المتوقع</span>
              <span class="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block font-mono">${netSalary.toLocaleString('ar-EG')} ج.م</span>
              <span class="text-[10px] text-emerald-500 mt-0.5 block font-semibold">المبلغ المستحق للصرف</span>
            </div>
          </div>

          <!-- 2. Salary Advances Hub -->
          <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <i data-lucide="hand-coins" class="w-4 h-4 text-amber-500"></i> سجل طلبات السلف لشهر ${targetMonth}
                </h3>
                <p class="text-[11px] text-slate-400 mt-0.5">يمكنك تقديم طلب سلفة ومتابعة حالة موافقة الإدارة عليها</p>
              </div>
              <button onclick="EmployeeUI.openRequestAdvanceModal('${targetMonth}')"
                class="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-amber-500/20 transition-all">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> تقديم طلب سلفة جديد
              </button>
            </div>

            ${advances.length === 0 ? `
              <div class="p-8 text-center text-slate-400 text-xs">لا توجد سلف مسجلة لحسابك في هذا الشهر.</div>
            ` : `
              <div class="overflow-x-auto">
                <table class="w-full text-right text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-semibold uppercase">
                    <tr>
                      <th class="py-2.5 px-3">التاريخ</th>
                      <th class="py-2.5 px-3">المبلغ</th>
                      <th class="py-2.5 px-3">السبب</th>
                      <th class="py-2.5 px-3 text-center">حالة الطلب</th>
                      <th class="py-2.5 px-3">ملاحظات الإدارة</th>
                      <th class="py-2.5 px-3 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    ${advances.map(a => {
                      const badge = a.status === 'approved'
                        ? '<span class="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold font-sans">تمت الموافقة ✓</span>'
                        : (a.status === 'rejected'
                          ? '<span class="px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-bold font-sans">مرفوضة ✗</span>'
                          : '<span class="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-600 text-xs font-bold font-sans animate-pulse">قيد المراجعة ⏳</span>');
                      return `
                        <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td class="py-3 px-3 text-slate-700 dark:text-slate-300">${a.date}</td>
                          <td class="py-3 px-3 font-bold text-amber-600 dark:text-amber-400 text-sm">${parseFloat(a.amount).toLocaleString('ar-EG')} ج.م</td>
                          <td class="py-3 px-3 font-sans text-slate-800 dark:text-slate-200 font-medium">${a.reason || 'سلفة على الراتب'}</td>
                          <td class="py-3 px-3 text-center font-sans">${badge}</td>
                          <td class="py-3 px-3 font-sans text-slate-500 text-[11px]">${a.review_notes || '—'}</td>
                          <td class="py-3 px-3 text-center">
                            ${a.status === 'pending' ? `
                              <button onclick="EmployeeUI.cancelAdvanceRequest(${a.id}, '${targetMonth}')" class="text-rose-500 hover:text-rose-700 text-xs font-bold font-sans hover:underline">
                                إلغاء الطلب
                              </button>
                            ` : `<span class="text-slate-400 font-sans text-[11px]">—</span>`}
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- 3. Bonuses & Incentives Showcase -->
          <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <i data-lucide="gift" class="w-4 h-4 text-purple-500"></i> المكافآت والحوافز التقديرية لشهر ${targetMonth}
                </h3>
                <p class="text-[11px] text-slate-400 mt-0.5">المكافآت التي منحتها لك إدارة الشركة تقديراً لجهودك وكفاءتك</p>
              </div>
              <span class="text-xs text-purple-600 dark:text-purple-400 font-bold font-mono">${bonuses.length} مكافأة</span>
            </div>

            ${bonuses.length === 0 ? `
              <div class="p-8 text-center text-slate-400 text-xs">لا توجد مكافآت مسجلة في هذا الشهر. نتمنى لك التوفيق والتميز دائماً! ✨</div>
            ` : `
              <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${bonuses.map(b => `
                  <div class="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/30 dark:bg-purple-950/20 flex items-center justify-between">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-lg">🎁</span>
                        <span class="font-bold text-slate-900 dark:text-white text-xs">${b.reason}</span>
                      </div>
                      <span class="text-[10px] text-slate-400 font-mono mt-1 block">${b.date} • بواسطة: ${b.creator_name || 'الإدارة'}</span>
                      ${b.notes ? `<p class="text-[11px] text-purple-700 dark:text-purple-300 mt-1">${b.notes}</p>` : ''}
                    </div>
                    <div class="text-left font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
                      +${parseFloat(b.amount).toLocaleString('ar-EG')} ج.م
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      const mainContainer = document.getElementById('emp-finances-main-container');
      if (mainContainer) mainContainer.innerHTML = `<div class="p-6 text-center text-rose-500">${err.message}</div>`;
    }
  },

  // Modal: Employee Submits Advance Request
  openRequestAdvanceModal(month = null) {
    const modal = document.getElementById('advances-modal');
    if (!modal) return;

    const todayDate = new Date().toISOString().substring(0, 10);
    const targetMonth = month || todayDate.substring(0, 7);

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="hand-coins" class="w-5 h-5 text-amber-500"></i> تقديم طلب سلفة مالية
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">سيتم إرسال الطلب للمدير للمراجعة واعتماده لخصمه من كشف الراتب</p>
            </div>
            <button onclick="document.getElementById('advances-modal').innerHTML=''" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="EmployeeUI.submitRequestAdvance(event, '${targetMonth}')" class="space-y-3.5 pt-4">
            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">المبلغ المطلوب (ج.م) *</label>
              <input type="number" id="emp-adv-amount" step="1" min="50" required placeholder="مثال: 500"
                class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-amber-600 text-sm" />
            </div>

            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">سبب طلب السلفة *</label>
              <input type="text" id="emp-adv-reason" required placeholder="مثال: ظرف أسري طارئ، مصاريف شخصية، التزامات شهرية"
                class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">شهر الخصم المطلوب</label>
                <input type="month" id="emp-adv-month" required value="${targetMonth}"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono" />
              </div>
              <div>
                <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">تاريخ الطلب</label>
                <input type="date" id="emp-adv-date" required value="${todayDate}"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono" />
              </div>
            </div>

            <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300">
              <p class="leading-relaxed text-[11px]">📌 بمجرد إرسال الطلب، سيتلقى المدير إشعاراً فورياً لدراسة الطلب والموافقة عليه وإدراجه بمسير الراتب.</p>
            </div>

            <div class="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onclick="document.getElementById('advances-modal').innerHTML=''"
                class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">إلغاء</button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/25">
                <i data-lucide="send" class="w-4 h-4"></i> إرسال الطلب للمدير
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async submitRequestAdvance(event, currentMonth) {
    event.preventDefault();
    const amount = document.getElementById('emp-adv-amount').value;
    const reason = document.getElementById('emp-adv-reason').value;
    const month = document.getElementById('emp-adv-month').value;
    const date = document.getElementById('emp-adv-date').value;

    try {
      const res = await API.submitAdvance({ amount, reason, month, date });
      showToast(res.message || 'تم إرسال طلب السلفة إلى الإدارة بنجاح', 'success');
      document.getElementById('advances-modal').innerHTML = '';
      await this.renderFinancesTab(month);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async cancelAdvanceRequest(advanceId, month) {
    if (!confirm('هل تريد بالتأكيد إلغاء طلب السلفة؟')) return;
    try {
      const res = await API.deleteAdvance(advanceId);
      showToast(res.message || 'تم إلغاء طلب السلفة بنجاح', 'success');
      await this.renderFinancesTab(month);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async printMyPayslip(month) {
    try {
      const u = API.getCurrentUser() || {};
      showToast('جاري استخراج قسيمة الراتب...', 'info');
      const res = await API.getEmployeeMonthDetails(u.id, month);
      if (window.Tafqeet && window.Tafqeet.showPayslipModal) {
        window.Tafqeet.showPayslipModal(res, false);
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  viewPhoto(photoUrl, title) {
    const modal = document.getElementById('photo-modal');
    if (!modal) return;
    const img = document.getElementById('photo-modal-img');
    const titleEl = document.getElementById('photo-modal-title');
    if (img) img.src = photoUrl;
    if (titleEl) titleEl.textContent = `إثبات حضور يوم ${title}`;
    modal.classList.remove('hidden');
  }
};
