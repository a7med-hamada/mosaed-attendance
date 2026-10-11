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
        const locale = currentLang === 'ar' ? 'ar-SA' : 'en-US';
        if (clockEl) {
          clockEl.textContent = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        }
        if (dateEl) {
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

    // Required: Attendance, History, Profile
    const tabs = [
      { id: 'attendance', icon: 'clock', label: 'الحضور (Attendance)' },
      { id: 'history', icon: 'calendar', label: 'سجل الحضور (History)' },
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
    } else if (tabId === 'history') {
      this.renderHistoryTab();
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

  updateGpsCard(errorMsg = null) {
    const statusContainer = document.getElementById('emp-gps-status-card');
    const checkInBtn = document.getElementById('emp-checkin-submit-btn');
    const checkOutBtn = document.getElementById('emp-checkout-submit-btn');

    if (!statusContainer) return;

    if (errorMsg || !currentEmpPosition) {
      statusContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <i data-lucide="alert-triangle" class="w-6 h-6 flex-shrink-0 text-amber-600 mt-0.5"></i>
          <div>
            <h4 class="font-bold text-sm">تعذر الحصول على إذن الموقع الجغرافي</h4>
            <p class="text-xs mt-1 text-amber-700 dark:text-amber-400">
              يرجى تفعيل صلاحية الوصول للموقع (GPS) في المتصفح للسماح بتسجيل الحضور في مقر العمل.
            </p>
            <button onclick="EmployeeUI.requestGeolocation()" class="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> إعادة المحاولة
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
      if (checkInBtn) checkInBtn.disabled = false;
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

    const startTime = (currentSchedule && currentSchedule.start_time) || '09:00';
    const endTime = (currentSchedule && currentSchedule.end_time) || '17:00';
    const isCheckedIn = todayRecord && todayRecord.check_in_time;
    const isCheckedOut = todayRecord && todayRecord.check_out_time;

    container.innerHTML = `
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- Greeting Card -->
        <div class="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-blue-500/10 relative overflow-hidden">
          <div class="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-white/10 blur-2xl"></div>
          <div class="relative z-10 flex items-center justify-between">
            <div>
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md mb-2">
                <i data-lucide="sparkles" class="w-3 h-3 text-amber-300"></i> مرحباً بك
              </span>
              <h2 class="text-2xl md:text-3xl font-extrabold tracking-tight">
                ${t('greeting_morning')}، ${user.full_name || 'زميلنا العزيز'} 👋
              </h2>
              <p id="emp-current-date" class="text-blue-100 text-sm mt-1"></p>
            </div>
            <div class="text-left bg-white/15 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20">
              <span class="text-[11px] text-blue-200 block uppercase tracking-wider">${t('current_time')}</span>
              <span id="emp-digital-clock" class="text-xl md:text-2xl font-mono font-bold tracking-tight">--:--:--</span>
            </div>
          </div>

          <!-- Schedule Badge -->
          <div class="mt-6 pt-5 border-t border-white/20 flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm text-blue-100">
            <div class="flex items-center gap-2">
              <i data-lucide="calendar" class="w-4 h-4 text-amber-300"></i>
              <span>${t('work_schedule')}: <strong class="text-white">${startTime} — ${endTime}</strong></span>
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="map-pin" class="w-4 h-4 text-emerald-300"></i>
              <span>${currentWorkplace ? currentWorkplace.name : 'المقر الرئيسي'}</span>
            </div>
          </div>
        </div>

        <!-- Geolocation Check Card -->
        <div id="emp-gps-status-card" class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800">
          <div class="flex items-center gap-3 text-slate-500">
            <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span>جاري تحديد موقعك الجغرافي...</span>
          </div>
        </div>

        <!-- Attendance Action Card -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 text-center">
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

              <button id="emp-checkin-submit-btn" disabled
                onclick="EmployeeUI.openCameraModal('check-in')"
                class="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg shadow-lg shadow-blue-500/25 transition-all transform active:scale-98 flex items-center justify-center gap-3">
                <i data-lucide="camera" class="w-6 h-6"></i>
                <span>${t('check_in_btn')}</span>
              </button>
            </div>
          ` : !isCheckedOut ? `
            <div class="max-w-md mx-auto space-y-6">
              <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-sm font-bold">
                <i data-lucide="check-circle" class="w-4 h-4"></i>
                <span>${t('checked_in_success')}</span>
              </div>

              <!-- Today's Record Details -->
              <div class="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-right text-xs">
                <div>
                  <span class="text-slate-500 dark:text-slate-400 block">${t('check_in_time_lbl')}</span>
                  <span class="text-base font-bold text-slate-800 dark:text-white">${todayRecord.check_in_time}</span>
                </div>
                <div>
                  <span class="text-slate-500 dark:text-slate-400 block">${t('status_lbl')}</span>
                  <div class="mt-1">${getStatusBadge(todayRecord.status)}</div>
                </div>
                ${todayRecord.late_minutes > 0 ? `
                  <div class="col-span-2 text-amber-600 dark:text-amber-400 pt-2 border-t border-slate-200 dark:border-slate-700 font-medium">
                    تأخير: ${todayRecord.late_minutes} دقيقة
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
                  class="w-full py-4 px-6 rounded-2xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold text-lg shadow-lg transition-all transform active:scale-98 flex items-center justify-center gap-3">
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
                  <strong class="text-slate-800 dark:text-white text-sm">${todayRecord.check_in_time}</strong>
                </div>
                <div>
                  <span class="text-slate-500 block">الانصراف</span>
                  <strong class="text-slate-800 dark:text-white text-sm">${todayRecord.check_out_time}</strong>
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
          capturedPhotoData
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
                  <td class="py-3.5 px-4 font-mono">${r.check_in_time || '-'}</td>
                  <td class="py-3.5 px-4 font-mono">${r.check_out_time || '-'}</td>
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

  // 5. Profile Tab
  renderProfileTab() {
    const container = document.getElementById('employee-content');
    if (!container) return;

    const u = API.getCurrentUser() || {};

    container.innerHTML = `
      <div class="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
        <div class="flex items-center gap-4">
          <img src="${u.profile_photo || '/uploads/avatar.svg'}" class="w-20 h-20 rounded-2xl object-cover bg-slate-100" />
          <div>
            <h3 class="text-xl font-bold text-slate-900 dark:text-white">${u.full_name}</h3>
            <p class="text-sm text-slate-500">${u.job_title || 'موظف'} • ${u.employee_code}</p>
            <span class="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              ${u.department_name || 'القسم العام'}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-sm">
          <div>
            <span class="text-xs text-slate-500 block">البريد الإلكتروني:</span>
            <span class="font-medium text-slate-800 dark:text-slate-200">${u.email}</span>
          </div>
          <div>
            <span class="text-xs text-slate-500 block">رقم الهاتف:</span>
            <span class="font-medium text-slate-800 dark:text-slate-200">${u.phone || '-'}</span>
          </div>
          <div>
            <span class="text-xs text-slate-500 block">تاريخ التعيين:</span>
            <span class="font-medium text-slate-800 dark:text-slate-200">${u.hire_date || '-'}</span>
          </div>
          <div>
            <span class="text-xs text-slate-500 block">جدول الدوام المعين:</span>
            <span class="font-medium text-slate-800 dark:text-slate-200">${u.schedule_name || 'الدوام القياسي (09:00 - 17:00)'}</span>
          </div>
        </div>
      </div>
    `;
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
