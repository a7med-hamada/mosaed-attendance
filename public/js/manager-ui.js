// Manager / Admin Portal Controller
let managerLiveTimer = null;
let currentSettingsData = null;
let currentWorkplaceData = null;
let currentScheduleData = null;
let isLiveAutoRefresh = true;

const ManagerUI = {
  activeSection: 'dashboard',

  async init() {
    this.renderSidebar();
    await this.switchSection(this.activeSection);
  },

  renderSidebar() {
    const nav = document.getElementById('manager-nav-list');
    if (!nav) return;

    const isEn = window.I18n && window.I18n.currentLang === 'en';
    const sections = [
      { id: 'dashboard', icon: 'layout-dashboard', label: isEn ? 'Dashboard' : 'لوحة التحكم' },
      { id: 'employees', icon: 'users', label: isEn ? 'Employees' : 'الموظفون' },
      { id: 'attendance', icon: 'clock', label: isEn ? 'Attendance' : 'سجل الحضور' },
      { id: 'adjust_attendance', icon: 'shield-alert', label: isEn ? 'Adjust Attendance' : 'تعديل وإضافة الحضور 🔐' },
      { id: 'leaderboard', icon: 'award', label: isEn ? 'Commitment Score' : 'مؤشر تقييم الالتزام' },
      { id: 'leaves', icon: 'calendar-check', label: isEn ? 'Leaves & Permissions' : 'الإجازات والأذونات' },
      { id: 'hours', icon: 'calendar-clock', label: isEn ? 'Working Hours' : 'مواعيد العمل' },
      { id: 'workplace', icon: 'map-pin', label: isEn ? 'Workplace' : 'موقع العمل' },
      { id: 'archive', icon: 'coins', label: isEn ? 'Payroll & Monthly Archive' : 'مسير الرواتب والخصومات' },
      { id: 'reports', icon: 'file-text', label: isEn ? 'Reports' : 'التقارير' },
      { id: 'settings', icon: 'sliders', label: isEn ? 'Settings' : 'الإعدادات' },
      { id: 'packages', icon: 'sparkles', label: isEn ? 'Subscription Plans' : 'باقات الاشتراك 💎' },
      { id: 'support', icon: 'headphones', label: isEn ? 'Technical Support' : 'الدعم الفني 🎧' },
      { id: 'profile', icon: 'user-cog', label: isEn ? 'Profile' : 'الملف الشخصي' }
    ];

    nav.innerHTML = sections.map(s => `
      <li class="flex-shrink-0 lg:flex-shrink w-auto lg:w-full">
        <button onclick="ManagerUI.switchSection('${s.id}')"
          class="flex items-center gap-3 px-3.5 py-2.5 lg:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all w-full text-right ${
            this.activeSection === s.id
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
          }">
          <i data-lucide="${s.icon}" class="w-4.5 h-4.5 flex-shrink-0"></i>
          <span class="truncate">${s.label}</span>
        </button>
      </li>
    `).join('');

    if (window.lucide) lucide.createIcons();
  },

  async switchSection(sectionId) {
    this.activeSection = sectionId;
    this.renderSidebar();
    this.stopLivePolling();

    const container = document.getElementById('manager-content');
    if (!container) return;

    if (sectionId === 'dashboard') {
      await this.renderDashboard();
    } else if (sectionId === 'employees') {
      await this.renderEmployeesSection();
    } else if (sectionId === 'attendance') {
      await this.renderAttendanceSection();
    } else if (sectionId === 'adjust_attendance') {
      await this.renderAttendanceAdjustmentSection();
    } else if (sectionId === 'leaderboard') {
      await this.renderLeaderboardSection();
    } else if (sectionId === 'leaves') {
      await this.renderLeavesSection();
    } else if (sectionId === 'hours') {
      await this.renderWorkingHoursSection();
    } else if (sectionId === 'workplace') {
      await this.renderWorkplaceSection();
    } else if (sectionId === 'archive') {
      await this.renderMonthlyArchiveSection();
    } else if (sectionId === 'reports') {
      await this.renderReportsSection();
    } else if (sectionId === 'settings') {
      await this.renderSettingsSection();
    } else if (sectionId === 'packages') {
      await this.renderPackagesSection();
    } else if (sectionId === 'support') {
      await this.renderSupportSection();
    } else if (sectionId === 'profile') {
      await this.renderProfileSection();
    }
  },

  stopLivePolling() {
    if (managerLiveTimer) {
      clearInterval(managerLiveTimer);
      managerLiveTimer = null;
    }
  },

  // ========================================================
  // 1. DASHBOARD WITH FIRST-TIME SETUP CHECKLIST
  // ========================================================
  async renderDashboard() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Checklist Container -->
        <div id="mgr-setup-checklist-card"></div>

        <!-- Employee of the Month Spotlight Banner -->
        <div id="mgr-employee-of-month-banner"></div>

        <!-- Dashboard Header & Real-time Auto-refresh -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-500 live-indicator"></span>
              لوحة التحكم والمتابعة الحية
            </h2>
            <p id="mgr-today-label" class="text-xs text-slate-500 mt-0.5"></p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button onclick="ManagerUI.openMorningBriefingModal()" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 whitespace-nowrap transition-all">
              <i data-lucide="message-circle" class="w-4 h-4"></i> تقرير الصباح للواتساب 📲
            </button>
            <button onclick="ManagerUI.openAddEmployeeModal()" class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 whitespace-nowrap">
              <i data-lucide="user-plus" class="w-4 h-4"></i> + إضافة موظف
            </button>
            <label class="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl whitespace-nowrap">
              <input type="checkbox" id="live-auto-refresh-check" ${isLiveAutoRefresh ? 'checked' : ''} onchange="ManagerUI.toggleAutoRefresh(this.checked)" class="rounded text-blue-600 focus:ring-blue-500" />
              <span>تحديث تلقائي (8ث)</span>
            </label>
          </div>
        </div>

        <!-- 8 Stat Metrics Cards -->
        <div id="mgr-metrics-grid" class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-6 text-center text-slate-400 col-span-4">جاري تحميل المؤشرات...</div>
        </div>

        <!-- Today's Attendance Table -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <h3 class="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
              <i data-lucide="users" class="w-4 h-4 text-blue-600"></i> حضور الموظفين اليوم
            </h3>
            <div class="flex items-center gap-2">
              <input type="text" id="live-search-input" oninput="ManagerUI.filterLiveTable()" placeholder="بحث بالاسم..." class="px-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
            </div>
          </div>

          <div id="mgr-live-table-container" class="overflow-x-auto">
            <div class="p-8 text-center text-slate-500">جاري تحميل بيانات الحضور...</div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    this.loadEmployeeOfMonthBanner();
    await this.loadLiveFeed();

    if (isLiveAutoRefresh) {
      managerLiveTimer = setInterval(() => this.loadLiveFeed(true), 8000);
    }
  },

  async loadEmployeeOfMonthBanner() {
    const bannerContainer = document.getElementById('mgr-employee-of-month-banner');
    if (!bannerContainer) return;

    try {
      const res = await API.getLeaderboard();
      const top = res.employeeOfTheMonth;
      if (!top || !top.employee) {
        bannerContainer.innerHTML = '';
        return;
      }
      const emp = top.employee;
      const score = Math.round(top.score || 0);

      bannerContainer.innerHTML = `
        <div class="relative overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm transition-all mb-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-3.5">
              <div class="relative flex-shrink-0">
                ${emp.profile_photo ? `
                  <img src="${emp.profile_photo}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover ring-2 ring-emerald-500/20 shadow-sm" />
                ` : `
                  <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xl flex items-center justify-center ring-2 ring-emerald-500/20">
                    ${(emp.full_name || 'م').charAt(0)}
                  </div>
                `}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                    <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-500"></i> الموظف الأكثر التزاماً لهذا الشهر
                  </span>
                  <span class="text-[11px] text-slate-400 font-mono">(${res.month})</span>
                </div>
                <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1 truncate">${emp.full_name}</h3>
                <p class="text-xs text-slate-500 truncate">${emp.job_title || 'موظف'} • ${emp.department_name || 'الشركة'} • <span class="font-mono">${emp.employee_code}</span></p>
              </div>
            </div>

            <div class="flex items-center gap-3 flex-wrap md:flex-nowrap">
              <!-- Circular Commitment Indicator -->
              <div class="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div class="relative inline-flex items-center justify-center w-12 h-12 flex-shrink-0">
                  <svg class="transform -rotate-90 w-12 h-12" viewBox="0 0 36 36">
                    <path class="text-slate-200 dark:text-slate-700" stroke-width="3.5" stroke="currentColor" fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path class="${score >= 90 ? 'text-emerald-500' : 'text-blue-500'}" stroke-dasharray="${score}, 100" stroke-width="3.5" stroke-linecap="round" stroke="currentColor" fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <span class="absolute font-mono font-bold text-xs ${score >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}">${score}%</span>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 block font-semibold">نسبة الالتزام</span>
                  <span class="text-xs font-bold text-slate-800 dark:text-slate-200">${top.onTimeDays} يوم بالموعد</span>
                </div>
              </div>

              <div class="flex items-center gap-2 w-full sm:w-auto">
                ${score >= 90 ? `
                  <button onclick="ManagerUI.openAddBonusModal(${emp.id}, '${res.month}', 'مكافأة تميز في الالتزام', 500)"
                    class="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all whitespace-nowrap">
                    <i data-lucide="gift" class="w-4 h-4"></i> منح مكافأة تميز
                  </button>
                ` : ''}
                <button onclick="ManagerUI.switchSection('leaderboard')"
                  class="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all whitespace-nowrap">
                  <i data-lucide="bar-chart-2" class="w-4 h-4 text-blue-500"></i> مؤشر الالتزام
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.warn('Error loading employee of month banner:', e);
    }
  },

  toggleAutoRefresh(enabled) {
    isLiveAutoRefresh = enabled;
    this.stopLivePolling();
    if (enabled) {
      managerLiveTimer = setInterval(() => this.loadLiveFeed(true), 8000);
    }
  },

  async loadLiveFeed(silent = false) {
    try {
      const res = await API.getLiveToday();
      const m = res.metrics;
      const records = res.records || [];
      const checklist = res.checklist || {};
      window.lastLiveRecords = records;

      // Render Setup Checklist
      this.renderChecklistCard(checklist);

      const dateLabel = document.getElementById('mgr-today-label');
      if (dateLabel) {
        dateLabel.textContent = `التاريخ: ${res.today} • نسبة الحضور: ${m.attendanceRate}%`;
      }

      // Render 8 Metrics Cards
      const metricsGrid = document.getElementById('mgr-metrics-grid');
      if (metricsGrid) {
        metricsGrid.innerHTML = `
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold block">إجمالي الموظفين</span>
            <div class="flex items-baseline justify-between mt-1">
              <span class="text-2xl font-extrabold text-slate-900 dark:text-white">${m.totalEmployees}</span>
              <span class="text-xs font-bold text-blue-600 dark:text-blue-400">${m.attendanceRate}% حضور</span>
            </div>
          </div>

          <div class="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
            <span class="text-xs text-blue-600 dark:text-blue-400 font-semibold block">الحاضرون اليوم</span>
            <span class="text-2xl font-extrabold text-blue-700 dark:text-blue-300 mt-1 block">${m.presentCount}</span>
          </div>

          <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
            <span class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold block">في الموعد</span>
            <span class="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 block">${m.onTimeCount}</span>
          </div>

          <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
            <span class="text-xs text-amber-600 dark:text-amber-400 font-semibold block">المتأخرون</span>
            <span class="text-2xl font-extrabold text-amber-700 dark:text-amber-300 mt-1 block">${m.lateCount}</span>
          </div>

          <div class="p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900">
            <span class="text-xs text-orange-600 dark:text-orange-400 font-semibold block">نصف يوم</span>
            <span class="text-2xl font-extrabold text-orange-700 dark:text-orange-300 mt-1 block">${m.halfDayCount}</span>
          </div>

          <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
            <span class="text-xs text-rose-600 dark:text-rose-400 font-semibold block">الغائبون</span>
            <span class="text-2xl font-extrabold text-rose-700 dark:text-rose-300 mt-1 block">${m.absentCount}</span>
          </div>

          <div class="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900">
            <span class="text-xs text-indigo-600 dark:text-indigo-400 font-semibold block">على رأس العمل الآن</span>
            <span class="text-2xl font-extrabold text-indigo-700 dark:text-indigo-300 mt-1 block">${m.workingNowCount}</span>
          </div>

          <div class="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900">
            <span class="text-xs text-purple-600 dark:text-purple-400 font-semibold block">تم الانصراف</span>
            <span class="text-2xl font-extrabold text-purple-700 dark:text-purple-300 mt-1 block">${m.checkedOutCount}</span>
          </div>
        `;
      }

      this.renderLiveTable(records);
    } catch (err) {
      if (!silent) showToast(err.message, 'danger');
    }
  },

  renderChecklistCard(checklist) {
    const card = document.getElementById('mgr-setup-checklist-card');
    if (!card) return;

    if (checklist.isFullyConfigured) {
      card.innerHTML = '';
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');

    card.innerHTML = `
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-850 rounded-3xl p-6 border border-blue-200/80 dark:border-blue-900 shadow-sm">
        <div class="flex items-center justify-between pb-4 border-b border-blue-200/50 dark:border-slate-800">
          <div>
            <h3 class="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="list-checks" class="w-5 h-5 text-blue-600"></i> إعداد النظام (Setup Checklist)
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">أكمل الخطوات التالية لتفعيل تسجيل الحضور لموظفيك:</p>
          </div>
          <span class="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 px-3 py-1 rounded-full">
            قيد الإعداد
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-4 text-xs font-semibold">
          <div class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 flex items-center gap-2.5 shadow-xs">
            <span class="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">✓</span>
            <span>إنشاء حساب المدير</span>
          </div>

          <div onclick="ManagerUI.switchSection('employees')" class="p-3 rounded-2xl bg-white dark:bg-slate-900 border ${checklist.hasEmployees ? 'border-emerald-200 text-emerald-700 dark:text-emerald-400' : 'border-amber-300 text-amber-800 dark:text-amber-300'} flex items-center justify-between gap-2 shadow-xs cursor-pointer hover:border-blue-500 transition-colors">
            <div class="flex items-center gap-2">
              <span class="w-5 h-5 rounded-full ${checklist.hasEmployees ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'} flex items-center justify-center text-xs font-bold">${checklist.hasEmployees ? '✓' : '2'}</span>
              <span>إضافة الموظفين</span>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">${checklist.employeeCount || 0}</span>
          </div>

          <div onclick="ManagerUI.switchSection('workplace')" class="p-3 rounded-2xl bg-white dark:bg-slate-900 border ${checklist.hasWorkplace ? 'border-emerald-200 text-emerald-700 dark:text-emerald-400' : 'border-amber-300 text-amber-800 dark:text-amber-300'} flex items-center gap-2.5 shadow-xs cursor-pointer hover:border-blue-500 transition-colors">
            <span class="w-5 h-5 rounded-full ${checklist.hasWorkplace ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'} flex items-center justify-center text-xs font-bold">${checklist.hasWorkplace ? '✓' : '3'}</span>
            <span>تحديد موقع العمل</span>
          </div>

          <div onclick="ManagerUI.switchSection('hours')" class="p-3 rounded-2xl bg-white dark:bg-slate-900 border ${checklist.hasSchedule ? 'border-emerald-200 text-emerald-700 dark:text-emerald-400' : 'border-amber-300 text-amber-800 dark:text-amber-300'} flex items-center gap-2.5 shadow-xs cursor-pointer hover:border-blue-500 transition-colors">
            <span class="w-5 h-5 rounded-full ${checklist.hasSchedule ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'} flex items-center justify-center text-xs font-bold">${checklist.hasSchedule ? '✓' : '4'}</span>
            <span>تحديد مواعيد العمل</span>
          </div>

          <div onclick="ManagerUI.switchSection('settings')" class="p-3 rounded-2xl bg-white dark:bg-slate-900 border ${checklist.hasRules ? 'border-emerald-200 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 text-slate-700 dark:text-slate-300'} flex items-center gap-2.5 shadow-xs cursor-pointer hover:border-blue-500 transition-colors">
            <span class="w-5 h-5 rounded-full ${checklist.hasRules ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'} flex items-center justify-center text-xs font-bold">${checklist.hasRules ? '✓' : '5'}</span>
            <span>تحديد قواعد الحضور</span>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  renderLiveTable(records) {
    const container = document.getElementById('mgr-live-table-container');
    if (!container) return;

    if (!records || records.length === 0) {
      container.innerHTML = `
        <div class="p-12 text-center space-y-4">
          <div class="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center mx-auto">
            <i data-lucide="users" class="w-8 h-8"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-800 dark:text-white">لا يوجد موظفون حتى الآن</h3>
            <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              حسابك كمدير جديد يبدأ بدون موظفين. ابدأ بإضافة الموظفين يدوياً وتحديد بياناتهم.
            </p>
          </div>
          <button onclick="ManagerUI.openAddEmployeeModal()" class="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 inline-flex items-center gap-2">
            <i data-lucide="user-plus" class="w-4 h-4"></i> + إضافة موظف
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto lg:overflow-x-visible">
        <table class="w-full text-right text-xs min-w-[600px] lg:min-w-0">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th class="py-3 px-4">الموظف</th>
              <th class="py-3 px-4">الحضور والموقع</th>
              <th class="py-3 px-4">الانصراف والموقع</th>
              <th class="py-3 px-4">الحالة</th>
              <th class="py-3 px-4 text-center">التوثيق والمعاينة</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${records.map(r => `
              <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                <td class="py-3 px-4">
                  <div class="flex items-center gap-3">
                    <img src="${r.profile_photo || '/uploads/avatar.svg'}" class="w-8 h-8 rounded-full object-cover bg-slate-100 dark:bg-slate-800" />
                    <div>
                      <span class="font-bold text-slate-800 dark:text-slate-200 block">${r.full_name}</span>
                      <span class="text-[10px] text-slate-400 font-mono">${r.employee_code}</span>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4">
                  ${r.check_in_time ? `
                    <div>
                      <span class="font-mono font-bold text-slate-900 dark:text-white block">${formatTime12(r.check_in_time)}</span>
                      ${r.check_in_distance !== null && r.check_in_distance !== undefined ? `
                        <span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          📍 داخل المقر (${r.check_in_distance}م)
                        </span>
                      ` : (r.check_in_lat ? `
                        <a href="https://www.google.com/maps?q=${r.check_in_lat},${r.check_in_lng}" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline font-mono">
                          📍 فتح الخريطة
                        </a>
                      ` : '')}
                    </div>
                  ` : '<span class="text-slate-400 font-medium">—</span>'}
                </td>
                <td class="py-3 px-4">
                  ${r.check_out_time ? `
                    <div>
                      <span class="font-mono font-bold text-slate-900 dark:text-white block">${formatTime12(r.check_out_time)}</span>
                      ${r.check_out_distance !== null && r.check_out_distance !== undefined ? `
                        <span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          📍 من المقر (${r.check_out_distance}م)
                        </span>
                      ` : (r.check_out_lat ? `
                        <a href="https://www.google.com/maps?q=${r.check_out_lat},${r.check_out_lng}" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:underline font-mono">
                          📍 خريطة الانصراف
                        </a>
                      ` : '<span class="text-[11px] text-slate-400">موقع مسجل</span>')}
                      ${r.early_leave_minutes > 0 ? `
                        <span class="text-[10px] text-purple-400 font-bold block mt-0.5">انصراف مبكر: ${formatMinutesArabic(r.early_leave_minutes)}</span>
                      ` : ''}
                    </div>
                  ` : (r.check_in_time ? `
                    <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold inline-flex items-center gap-1.5 border border-emerald-500/20">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> على رأس العمل
                    </span>
                  ` : `
                    <span class="text-slate-400 font-medium">—</span>
                  `)}
                </td>
                <td class="py-3 px-4">
                  ${r.status ? getStatusBadge(r.status) : '<span class="text-slate-400 font-medium">لم يحضر بعد</span>'}
                  ${r.late_minutes > 0 ? `<span class="text-[10px] text-amber-500 font-bold block mt-0.5">تأخير: ${formatMinutesArabic(r.late_minutes)}</span>` : ''}
                </td>
                <td class="py-3 px-4 text-center">
                  ${(r.check_in_photo || r.check_out_photo || r.check_in_time) ? `
                    <button onclick="ManagerUI.openRecordInspectionModal(${JSON.stringify(r).replace(/"/g, '&quot;')})" class="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 font-bold text-xs inline-flex items-center gap-1.5 border border-blue-200/50 dark:border-blue-900/50 transition-all shadow-xs">
                      <i data-lucide="eye" class="w-3.5 h-3.5"></i> معاينة التوثيق
                    </button>
                  ` : '<span class="text-slate-400">—</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  filterLiveTable() {
    const q = document.getElementById('live-search-input').value.toLowerCase().trim();
    if (!window.lastLiveRecords) return;
    const filtered = window.lastLiveRecords.filter(r =>
      r.full_name.toLowerCase().includes(q) ||
      (r.department_name && r.department_name.toLowerCase().includes(q)) ||
      r.employee_code.toLowerCase().includes(q)
    );
    this.renderLiveTable(filtered);
  },

  // ========================================================
  // 2. DEDICATED EMPLOYEE MANAGEMENT PAGE ("الموظفون")
  // ========================================================
  async renderEmployeesSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="users" class="w-5 h-5 text-blue-600"></i> صفحة الموظفين
            </h2>
            <p class="text-xs text-slate-500">إدارة حسابات الموظفين وإضافتهم يدوياً وضبط بيانات الدخول الخاصة بهم</p>
          </div>
          <button onclick="ManagerUI.openAddEmployeeModal()" class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/25 flex items-center gap-2 self-start sm:self-auto transform active:scale-98 whitespace-nowrap">
            <i data-lucide="user-plus" class="w-4 h-4"></i> + إضافة موظف
          </button>
        </div>

        <div id="mgr-employees-table-container" class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div class="p-8 text-center text-slate-500">جاري تحميل قائمة الموظفين...</div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    await this.loadEmployeesTable();
  },

  async loadEmployeesTable() {
    const container = document.getElementById('mgr-employees-table-container');
    if (!container) return;

    try {
      const res = await API.getEmployees();
      const employees = res.employees || [];
      this.employeesList = employees;

      if (employees.length === 0) {
        container.innerHTML = `
          <div class="p-16 text-center space-y-4">
            <div class="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center mx-auto">
              <i data-lucide="user-x" class="w-8 h-8"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">لا يوجد موظفون حتى الآن</h3>
              <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                أنت المدير المسؤول عن إنشاء جميع حسابات الموظفين وتزويدهم ببيانات تسجيل الدخول.
              </p>
            </div>
            <button onclick="ManagerUI.openAddEmployeeModal()" class="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 inline-flex items-center gap-2">
              <i data-lucide="user-plus" class="w-4 h-4"></i> + إضافة موظف
            </button>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = `
        <div class="overflow-x-auto lg:overflow-x-visible">
          <table class="w-full text-right text-xs min-w-[700px] lg:min-w-0">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th class="py-3.5 px-4">اسم الموظف</th>
                <th class="py-3.5 px-4">البريد الإلكتروني</th>
                <th class="py-3.5 px-4">رقم الهاتف</th>
                <th class="py-3.5 px-4">القسم</th>
                <th class="py-3.5 px-4">المسمى الوظيفي</th>
                <th class="py-3.5 px-4 text-center">المرتب الأساسي</th>
                <th class="py-3.5 px-4 text-center">حالة الحساب</th>
                <th class="py-3.5 px-4 text-center">حضور اليوم</th>
                <th class="py-3.5 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${employees.map(e => `
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                      <img src="${e.profile_photo || '/uploads/avatar.svg'}" class="w-9 h-9 rounded-full object-cover bg-slate-100 dark:bg-slate-800 flex-shrink-0" />
                      <div>
                        <span class="font-bold text-slate-800 dark:text-slate-200 block text-xs">${e.full_name}</span>
                        <span class="text-[10px] text-slate-400 font-mono block mt-0.5">${e.employee_code}</span>
                      </div>
                    </div>
                  </td>
                  <td class="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">${e.email}</td>
                  <td class="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap font-mono">${e.phone || '—'}</td>
                  <td class="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">${e.department_name || 'عام'}</td>
                  <td class="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">${e.job_title || 'موظف'}</td>
                  <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <span class="inline-flex items-center justify-center px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold font-mono text-xs border border-emerald-500/20 whitespace-nowrap shadow-2xs">
                      ${(e.base_salary || 3000).toLocaleString('en-US')} ج.م
                    </span>
                  </td>
                  <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${e.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}">
                      ${e.is_active ? 'نشط' : 'معطل'}
                    </span>
                  </td>
                  <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    ${e.today_status ? getStatusBadge(e.today_status) : '<span class="text-slate-400 whitespace-nowrap">لم يسجل بعد</span>'}
                  </td>
                  <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5">
                      <button onclick="ManagerUI.openEmployeeStatsModal(${e.id}, '${e.full_name}')" class="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="إحصائيات الموظف (تأخير، خروج مبكر، غياب)">
                        <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
                      </button>
                      <button onclick="ManagerUI.openEditEmployeeModal(${e.id})" class="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800" title="تعديل بيانات الموظف">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                      </button>
                      <button onclick="ManagerUI.toggleEmployeeActive(${e.id}, ${e.is_active ? 0 : 1})" class="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800" title="${e.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}">
                        <i data-lucide="${e.is_active ? 'user-x' : 'user-check'}" class="w-4 h-4"></i>
                      </button>
                      <button onclick="ManagerUI.deleteEmployee(${e.id}, '${e.full_name}')" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800" title="حذف نهائي">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="p-8 text-center text-rose-500">${err.message}</div>`;
    }
  },

  async openAddEmployeeModal() {
    const modal = document.getElementById('employee-crud-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="user-plus" class="w-5 h-5 text-blue-600"></i> إضافة موظف جديد
            </h3>
            <button onclick="document.getElementById('employee-crud-modal').innerHTML=''" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="ManagerUI.submitAddEmployee(event)" class="space-y-3.5 pt-4 text-xs">
            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">اسم الموظف الكامل *</label>
              <input type="text" name="full_name" placeholder="مثال: أحمد عبد الله" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">البريد الإلكتروني لتسجيل الدخول *</label>
                <input type="email" name="email" placeholder="ahmed@company.com" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              </div>
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">رقم الهاتف (اختياري)</label>
                <input type="text" name="phone" placeholder="+96650..." class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">كلمة المرور *</label>
                <input type="password" name="password" minlength="6" placeholder="••••••••" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              </div>
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">تأكيد كلمة المرور *</label>
                <input type="password" name="confirm_password" minlength="6" placeholder="••••••••" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">المسمى الوظيفي *</label>
                <input type="text" name="job_title" placeholder="مثال: مونتير / سيلز / محاسب" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              </div>
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">الراتب الأساسي الشهري (جنيه مصري) *</label>
                <div class="relative">
                  <input type="number" name="base_salary" value="3000" min="0" step="50" required placeholder="3000" class="w-full pl-12 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold font-mono text-emerald-600 dark:text-emerald-400" />
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">ج.م</span>
                </div>
              </div>
            </div>

            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">حالة الحساب</label>
              <select name="is_active" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold">
                <option value="1">نشط (يمكنه تسجيل الدخول فوراً)</option>
                <option value="0">معطل (لا يمكنه تسجيل الدخول)</option>
              </select>
            </div>

            <p class="text-[11px] text-slate-500 pt-1">
              * سيتم تشفير كلمة المرور فوراً عبر خوارزمية Bcrypt ولن يتمكن أحد من رؤيتها.
            </p>

            <div class="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onclick="document.getElementById('employee-crud-modal').innerHTML=''" class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold">إلغاء</button>
              <button type="submit" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20">إضافة موظف</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async submitAddEmployee(e) {
    e.preventDefault();
    const form = e.target;
    if (form.password.value !== form.confirm_password.value) {
      showToast('كلمتا المرور غير متطابقتين', 'danger');
      return;
    }

    const data = {
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
      confirm_password: form.confirm_password.value,
      phone: form.phone.value.trim() || null,
      job_title: form.job_title.value.trim() || null,
      base_salary: form.base_salary ? parseFloat(form.base_salary.value) : 3000,
      is_active: parseInt(form.is_active.value, 10)
    };

    try {
      const res = await API.createEmployee(data);
      showToast(res.message, 'success');
      document.getElementById('employee-crud-modal').innerHTML = '';
      if (this.activeSection === 'employees') {
        this.loadEmployeesTable();
      } else {
        this.loadLiveFeed();
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async toggleEmployeeActive(id, newStatus) {
    try {
      await API.updateEmployee(id, { is_active: newStatus });
      showToast(newStatus ? 'تم تفعيل حساب الموظف' : 'تم تعطيل حساب الموظف', 'success');
      this.loadEmployeesTable();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async deleteEmployee(id, name) {
    if (!confirm(`هل أنت متأكد من حذف الموظف "${name}" نهائياً؟`)) return;
    try {
      const res = await API.deleteEmployee(id);
      showToast(res.message, 'success');
      this.loadEmployeesTable();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  tempEditEmployeePhoto: null,

  handleEmployeePhotoUpload(event) {
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

        ManagerUI.tempEditEmployeePhoto = compressedBase64;
        const preview = document.getElementById('edit-emp-avatar-preview');
        if (preview) preview.src = compressedBase64;
        showToast('تم اختيار وتجهيز الصورة بنجاح! اضغط حفظ التعديلات لتطبيقها', 'info');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  async openEditEmployeeModal(target) {
    const modal = document.getElementById('employee-crud-modal');
    if (!modal) return;
    this.tempEditEmployeePhoto = null;

    let emp = null;
    if (typeof target === 'object' && target !== null) {
      emp = target;
    } else {
      const id = parseInt(target, 10);
      emp = (this.employeesList || []).find(e => e.id === id);
      if (!emp) {
        try {
          const res = await API.getEmployee(id);
          emp = res.employee;
        } catch (err) {
          showToast('تعذر العثور على بيانات الموظف', 'danger');
          return;
        }
      }
    }

    if (!emp) {
      showToast('تعذر العثور على بيانات الموظف', 'danger');
      return;
    }

    let departments = [];
    try {
      const dRes = await API.getDepartments();
      departments = dRes.departments || [];
    } catch (_) {}

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="user-cog" class="w-5 h-5 text-emerald-600"></i> تعديل بيانات الموظف
              </h3>
              <span class="text-[11px] text-slate-400 font-mono mt-0.5 block">${emp.employee_code || ''} • ${emp.full_name}</span>
            </div>
            <button onclick="document.getElementById('employee-crud-modal').innerHTML=''" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="ManagerUI.submitEditEmployee(event, ${emp.id})" class="space-y-3.5 pt-4 text-xs">
            <!-- Employee Avatar Upload by Manager -->
            <div class="flex items-center gap-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <div class="relative group flex-shrink-0">
                <img id="edit-emp-avatar-preview" src="${emp.profile_photo || '/uploads/avatar.svg'}" class="w-16 h-16 rounded-2xl object-cover bg-slate-100 dark:bg-slate-700 border-2 border-white dark:border-slate-600 shadow-sm" />
                <label for="edit-emp-avatar-input" class="absolute inset-0 bg-slate-900/60 rounded-2xl opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-bold cursor-pointer transition-opacity">
                  <i data-lucide="camera" class="w-4 h-4 mb-0.5"></i>
                  تغيير
                </label>
                <input type="file" id="edit-emp-avatar-input" accept="image/*" class="hidden" onchange="ManagerUI.handleEmployeePhotoUpload(event)" />
              </div>
              <div class="flex-1 min-w-0">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 block">صورة الملف الشخصي للموظف</span>
                <p class="text-[11px] text-slate-400 mt-0.5">يمكنك تغيير صورة الموظف أو رفع صورة شخصية رسمية له</p>
                <label for="edit-emp-avatar-input" class="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                  <i data-lucide="upload" class="w-3.5 h-3.5 text-emerald-500"></i>
                  <span>تغيير صورة الموظف</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">اسم الموظف الكامل *</label>
              <input type="text" name="full_name" value="${(emp.full_name || '').replace(/"/g, '&quot;')}" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">المسمى الوظيفي *</label>
                <input type="text" name="job_title" value="${(emp.job_title || '').replace(/"/g, '&quot;')}" placeholder="مثال: مونتير / سيلز / محاسب" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 font-medium" />
              </div>
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">الراتب الأساسي الشهري (جنيه مصري) *</label>
                <div class="relative">
                  <input type="number" name="base_salary" value="${emp.base_salary || 3000}" min="0" step="50" required class="w-full pl-12 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold font-mono text-emerald-600 dark:text-emerald-400" />
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">ج.م</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">القسم</label>
                <select name="department_id" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium">
                  <option value="">-- بدون قسم (عام) --</option>
                  ${departments.map(d => `<option value="${d.id}" ${emp.department_id === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">رقم الهاتف (اختياري)</label>
                <input type="text" name="phone" value="${(emp.phone || '').replace(/"/g, '&quot;')}" placeholder="010... / +966..." class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              </div>
            </div>

            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">البريد الإلكتروني لتسجيل الدخول *</label>
              <input type="email" name="email" value="${(emp.email || '').replace(/"/g, '&quot;')}" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 font-mono" />
            </div>

            <!-- Password Change (Optional) -->
            <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2.5">
              <div class="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold text-xs">
                <i data-lucide="key" class="w-4 h-4"></i>
                <span>تغيير كلمة المرور (اختياري)</span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">
                اترك الحقل فارغاً إذا كنت لا ترغب بتغيير كلمة المرور الحالية للموظف.
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">كلمة المرور الجديدة</label>
                  <input type="password" name="password" minlength="6" placeholder="اتركه فارغاً للإبقاء على الحالية" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
                </div>
                <div>
                  <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">تأكيد كلمة المرور</label>
                  <input type="password" name="confirm_password" minlength="6" placeholder="تأكيد كلمة المرور الجديدة" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
                </div>
              </div>
            </div>

            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1">حالة الحساب</label>
              <select name="is_active" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold">
                <option value="1" ${emp.is_active ? 'selected' : ''}>نشط (يمكنه تسجيل الدخول والحضور)</option>
                <option value="0" ${!emp.is_active ? 'selected' : ''}>معطل (موقوف عن العمل ولا يمكنه الدخول)</option>
              </select>
            </div>

            <div class="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onclick="document.getElementById('employee-crud-modal').innerHTML=''" class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">إلغاء</button>
              <button type="submit" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-500/20 inline-flex items-center gap-1.5">
                <i data-lucide="check" class="w-4 h-4"></i> حفظ التعديلات
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async submitEditEmployee(e, empId) {
    e.preventDefault();
    const form = e.target;
    const pwd = form.password.value;
    const confirmPwd = form.confirm_password.value;

    if (pwd && pwd.length > 0) {
      if (pwd.length < 6) {
        showToast('يجب أن لا تقل كلمة المرور عن 6 خانات', 'danger');
        return;
      }
      if (pwd !== confirmPwd) {
        showToast('كلمتا المرور غير متطابقتين', 'danger');
        return;
      }
    }

    const payload = {
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      job_title: form.job_title.value.trim() || null,
      phone: form.phone.value.trim() || null,
      department_id: form.department_id.value ? parseInt(form.department_id.value, 10) : null,
      base_salary: form.base_salary ? parseFloat(form.base_salary.value) : 3000,
      is_active: parseInt(form.is_active.value, 10)
    };

    if (pwd && pwd.length > 0) {
      payload.password = pwd;
      payload.confirm_password = confirmPwd;
    }

    if (this.tempEditEmployeePhoto) {
      payload.profile_photo = this.tempEditEmployeePhoto;
    }

    try {
      const res = await API.updateEmployee(empId, payload);
      showToast(res.message || 'تم تحديث بيانات وصورة الموظف بنجاح', 'success');
      this.tempEditEmployeePhoto = null;
      document.getElementById('employee-crud-modal').innerHTML = '';
      if (this.activeSection === 'employees') {
        await this.loadEmployeesTable();
      } else {
        await this.loadLiveFeed();
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  // ========================================================
  // LEAVES & PERMISSIONS MANAGEMENT ("الإجازات والأذونات")
  // ========================================================
  async renderLeavesSection(currentFilter = 'all') {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6 w-full">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="calendar-check" class="w-5 h-5 text-blue-500"></i> إدارة الإجازات والأذونات الرسمية
            </h2>
            <p class="text-xs text-slate-500">مراجعة واعتماد أو رفض طلبات الإجازات والأذونات لجميع موظفي منشأتك</p>
          </div>
          <div class="flex items-center gap-2">
            <select id="mgr-leaves-status-filter" onchange="ManagerUI.renderLeavesSection(this.value)"
              class="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>جميع الطلبات</option>
              <option value="pending" ${currentFilter === 'pending' ? 'selected' : ''}>⏳ بانتظار الاعتماد فقط</option>
              <option value="approved" ${currentFilter === 'approved' ? 'selected' : ''}>✓ المعتمدة</option>
              <option value="rejected" ${currentFilter === 'rejected' ? 'selected' : ''}>✕ المرفوضة</option>
            </select>
            <button onclick="ManagerUI.renderLeavesSection('${currentFilter}')"
              class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300" title="تحديث">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- KPI Summary Cards -->
        <div id="mgr-leaves-kpi-container" class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center animate-pulse">
            <span class="text-xs text-slate-400">جاري التحميل...</span>
          </div>
        </div>

        <!-- Tab Toggle for Manager View: Leaves vs Permissions -->
        <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button id="mgr-tab-btn-leaves" onclick="ManagerUI.toggleManagerLeavesTab('leaves')"
            class="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-sm flex items-center gap-1.5 transition-all">
            <i data-lucide="plane" class="w-4 h-4"></i>
            <span>طلبات الإجازات (<span id="mgr-leaves-badge-count">0</span>)</span>
          </button>
          <button id="mgr-tab-btn-permissions" onclick="ManagerUI.toggleManagerLeavesTab('permissions')"
            class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-all">
            <i data-lucide="timer" class="w-4 h-4"></i>
            <span>طلبات الأذونات (<span id="mgr-perms-badge-count">0</span>)</span>
          </button>
        </div>

        <!-- Main Content Area: Leaves Container & Permissions Container -->
        <div id="mgr-leaves-table-container"></div>
        <div id="mgr-perms-table-container" class="hidden"></div>
      </div>

      <!-- Review Action Modal -->
      <div id="mgr-leave-review-modal"></div>
    `;
    if (window.lucide) lucide.createIcons();

    try {
      const filterParams = currentFilter !== 'all' ? { status: currentFilter } : {};
      const [leavesRes, permsRes] = await Promise.all([
        API.getLeaves(filterParams),
        API.getPermissions(filterParams)
      ]);

      const leaves = leavesRes.requests || [];
      const perms = permsRes.requests || [];

      // Calculate KPIs
      const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
      const pendingPerms = perms.filter(p => p.status === 'pending').length;
      const totalPending = pendingLeaves + pendingPerms;
      const todayStr = new Date().toISOString().split('T')[0];
      const onLeaveToday = leaves.filter(l => l.status === 'approved' && todayStr >= l.start_date && todayStr <= l.end_date).length;
      const permToday = perms.filter(p => p.status === 'approved' && p.date === todayStr).length;

      const kpiEl = document.getElementById('mgr-leaves-kpi-container');
      if (kpiEl) {
        kpiEl.innerHTML = `
          <div class="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 text-right">
            <span class="text-[11px] font-bold text-amber-600 dark:text-amber-400 block mb-1">طلبات بانتظار الاعتماد</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900 dark:text-white">${totalPending}</span>
              <span class="text-xs text-slate-400">طلب</span>
            </div>
          </div>
          <div class="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 text-right">
            <span class="text-[11px] font-bold text-blue-600 dark:text-blue-400 block mb-1">إجازات اليوم المعتمدة</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900 dark:text-white">${onLeaveToday}</span>
              <span class="text-xs text-slate-400">موظف</span>
            </div>
          </div>
          <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border border-indigo-500/20 text-right">
            <span class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1">أذونات اليوم المعتمدة</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900 dark:text-white">${permToday}</span>
              <span class="text-xs text-slate-400">إذن</span>
            </div>
          </div>
          <div class="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 text-right">
            <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">الإجازات المعتمدة (الكل)</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-slate-900 dark:text-white">${leaves.filter(l => l.status === 'approved').length}</span>
              <span class="text-xs text-slate-400">إجازة</span>
            </div>
          </div>
        `;
      }

      document.getElementById('mgr-leaves-badge-count').textContent = leaves.length;
      document.getElementById('mgr-perms-badge-count').textContent = perms.length;

      this.populateManagerLeavesTable(leaves);
      this.populateManagerPermissionsTable(perms);

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error('Error in renderLeavesSection:', err);
      showToast('حدث خطأ أثناء تحميل بيانات الإجازات', 'danger');
    }
  },

  toggleManagerLeavesTab(tab) {
    const leavesBtn = document.getElementById('mgr-tab-btn-leaves');
    const permsBtn = document.getElementById('mgr-tab-btn-permissions');
    const leavesContainer = document.getElementById('mgr-leaves-table-container');
    const permsContainer = document.getElementById('mgr-perms-table-container');

    if (tab === 'leaves') {
      leavesBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-sm flex items-center gap-1.5 transition-all';
      permsBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-all';
      leavesContainer.classList.remove('hidden');
      permsContainer.classList.add('hidden');
    } else {
      permsBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm flex items-center gap-1.5 transition-all';
      leavesBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-all';
      permsContainer.classList.remove('hidden');
      leavesContainer.classList.add('hidden');
    }
  },

  populateManagerLeavesTable(leaves) {
    const container = document.getElementById('mgr-leaves-table-container');
    if (!container) return;

    if (leaves.length === 0) {
      container.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center text-slate-400 border border-slate-200 dark:border-slate-800 text-xs">
          لا توجد طلبات إجازة مطابقة للفلتر المحدد.
        </div>
      `;
      return;
    }

    const typeNames = { annual: 'إجازة سنوية اعتيادية', sick: 'إجازة مرضية', casual: 'إجازة عارضة / طارئة', unpaid: 'إجازة بدون راتب' };
    const typeColors = { annual: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60', sick: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60', casual: 'text-purple-600 bg-purple-50 dark:bg-purple-950/60', unpaid: 'text-rose-600 bg-rose-50 dark:bg-rose-950/60' };
    const statusBadges = {
      pending: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">قيد الانتظار ⏳</span>',
      approved: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">معتمدة ✓</span>',
      rejected: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">مرفوضة ✕</span>'
    };

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="overflow-x-auto lg:overflow-x-visible w-full">
          <table class="w-full text-right text-xs min-w-[720px] lg:min-w-0">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th class="py-3 px-4">الموظف</th>
                <th class="py-3 px-4">نوع الإجازة</th>
                <th class="py-3 px-4">الفترة (من - إلى)</th>
                <th class="py-3 px-4 text-center">المدة</th>
                <th class="py-3 px-4">السبب وملاحظات</th>
                <th class="py-3 px-4 text-center">الحالة</th>
                <th class="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${leaves.map(l => `
                <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                      <img src="${l.profile_photo || '/uploads/avatar.svg'}" onerror="this.src='/uploads/avatar.svg'" class="w-8 h-8 rounded-xl object-cover bg-slate-200" />
                      <div>
                        <strong class="font-bold text-slate-800 dark:text-white block">${l.full_name}</strong>
                        <span class="text-[10px] text-slate-400 font-mono">${l.employee_code || '-'}</span>
                      </div>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <span class="px-2.5 py-1 rounded-lg font-bold text-[11px] ${typeColors[l.leave_type] || 'text-blue-600 bg-blue-50'}">
                      ${typeNames[l.leave_type] || l.leave_type}
                    </span>
                  </td>
                  <td class="py-3 px-4 font-mono font-medium text-slate-600 dark:text-slate-300">
                    ${l.start_date} ← ${l.end_date}
                  </td>
                  <td class="py-3 px-4 text-center font-extrabold text-slate-900 dark:text-white">
                    ${l.days_count} ${l.days_count === 1 ? 'يوم' : 'أيام'}
                  </td>
                  <td class="py-3 px-4 max-w-xs truncate text-slate-600 dark:text-slate-300">
                    ${l.reason || '—'}
                    ${l.review_notes ? `<span class="block text-[10px] text-blue-500 mt-0.5">ملاحظات: ${l.review_notes}</span>` : ''}
                  </td>
                  <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${statusBadges[l.status] || l.status}
                  </td>
                  <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${l.status === 'pending' ? `
                      <div class="flex items-center justify-center gap-1.5">
                        <button onclick="ManagerUI.openReviewLeaveModal(${l.id}, '${l.full_name}', ${l.days_count}, '${typeNames[l.leave_type] || l.leave_type}')"
                          class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all" title="اعتماد الإجازة">
                          <i data-lucide="check" class="w-3.5 h-3.5"></i> اعتماد
                        </button>
                        <button onclick="ManagerUI.submitReviewLeave(${l.id}, 'rejected', 'رفض من قِبل المدير')"
                          class="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-[11px] flex items-center gap-1 transition-all" title="رفض الإجازة">
                          <i data-lucide="x" class="w-3.5 h-3.5"></i> رفض
                        </button>
                        <button onclick="ManagerUI.deleteLeave(${l.id}, '${l.full_name}')"
                          class="px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-500 hover:text-rose-600 font-bold text-[11px] flex items-center gap-1 transition-all" title="حذف طلب الإجازة">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    ` : `
                      <div class="flex items-center justify-center gap-2">
                        <span class="text-[11px] text-slate-400">بواسطة ${l.approver_name || 'المدير'}</span>
                        <button onclick="ManagerUI.deleteLeave(${l.id}, '${l.full_name}')"
                          class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-[11px] font-bold flex items-center gap-1 transition-all" title="حذف الإجازة وإلغاء اعتمادها واستعادة الرصيد">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          <span>حذف الإجازة</span>
                        </button>
                      </div>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  populateManagerPermissionsTable(perms) {
    const container = document.getElementById('mgr-perms-table-container');
    if (!container) return;

    if (perms.length === 0) {
      container.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center text-slate-400 border border-slate-200 dark:border-slate-800 text-xs">
          لا توجد طلبات أذونات مطابقة للفلتر المحدد.
        </div>
      `;
      return;
    }

    const permTypes = { late_arrival: 'إذن تأخير صباحي بعذر', early_departure: 'إذن انصراف مبكر', during_day: 'إذن خروج وعودة أثناء الدوام' };
    const statusBadges = {
      pending: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">قيد الانتظار ⏳</span>',
      approved: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">معتمد ✓</span>',
      rejected: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">مرفوض ✕</span>'
    };

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="overflow-x-auto lg:overflow-x-visible w-full">
          <table class="w-full text-right text-xs min-w-[720px] lg:min-w-0">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th class="py-3 px-4">الموظف</th>
                <th class="py-3 px-4">نوع الإذن</th>
                <th class="py-3 px-4">تاريخ الإذن</th>
                <th class="py-3 px-4">الميعاد (من - إلى)</th>
                <th class="py-3 px-4 text-center">المدة</th>
                <th class="py-3 px-4">السبب</th>
                <th class="py-3 px-4 text-center">الحالة</th>
                <th class="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${perms.map(p => `
                <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                      <img src="${p.profile_photo || '/uploads/avatar.svg'}" onerror="this.src='/uploads/avatar.svg'" class="w-8 h-8 rounded-xl object-cover bg-slate-200" />
                      <div>
                        <strong class="font-bold text-slate-800 dark:text-white block">${p.full_name}</strong>
                        <span class="text-[10px] text-slate-400 font-mono">${p.employee_code || '-'}</span>
                      </div>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <span class="px-2.5 py-1 rounded-lg font-bold text-[11px] text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60">
                      ${permTypes[p.permission_type] || p.permission_type}
                    </span>
                  </td>
                  <td class="py-3 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                    ${p.date}
                  </td>
                  <td class="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                    ${formatTime12(p.start_time)} ← ${formatTime12(p.end_time)}
                  </td>
                  <td class="py-3 px-4 text-center font-extrabold text-slate-900 dark:text-white">
                    ${p.hours_count} ساعة
                  </td>
                  <td class="py-3 px-4 max-w-xs truncate text-slate-600 dark:text-slate-300">
                    ${p.reason || '—'}
                    ${p.review_notes ? `<span class="block text-[10px] text-blue-500 mt-0.5">ملاحظات: ${p.review_notes}</span>` : ''}
                  </td>
                  <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${statusBadges[p.status] || p.status}
                  </td>
                  <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${p.status === 'pending' ? `
                      <div class="flex items-center justify-center gap-1.5">
                        <button onclick="ManagerUI.submitReviewPermission(${p.id}, 'approved', 'تم اعتماد الإذن')"
                          class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all" title="اعتماد الإذن">
                          <i data-lucide="check" class="w-3.5 h-3.5"></i> اعتماد
                        </button>
                        <button onclick="ManagerUI.submitReviewPermission(${p.id}, 'rejected', 'رفض من قِبل المدير')"
                          class="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-[11px] flex items-center gap-1 transition-all" title="رفض الإذن">
                          <i data-lucide="x" class="w-3.5 h-3.5"></i> رفض
                        </button>
                        <button onclick="ManagerUI.deletePermission(${p.id}, '${p.full_name}')"
                          class="px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-500 hover:text-rose-600 font-bold text-[11px] flex items-center gap-1 transition-all" title="حذف طلب الإذن">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    ` : `
                      <div class="flex items-center justify-center gap-2">
                        <span class="text-[11px] text-slate-400">بواسطة ${p.approver_name || 'المدير'}</span>
                        <button onclick="ManagerUI.deletePermission(${p.id}, '${p.full_name}')"
                          class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-[11px] font-bold flex items-center gap-1 transition-all" title="حذف الإذن">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          <span>حذف الإذن</span>
                        </button>
                      </div>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  openReviewLeaveModal(leaveId, empName, daysCount, typeName) {
    const modal = document.getElementById('mgr-leave-review-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-right text-xs space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">اعتماد طلب الإجازة</h3>
            <button onclick="document.getElementById('mgr-leave-review-modal').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
            <div class="flex justify-between">
              <span class="text-slate-500">الموظف:</span>
              <strong class="text-slate-900 dark:text-white">${empName}</strong>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">نوع الإجازة:</span>
              <span class="font-bold text-blue-600">${typeName}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">المدة:</span>
              <span class="font-bold text-emerald-600">${daysCount} يوم</span>
            </div>
          </div>

          <div>
            <label class="font-bold text-slate-700 dark:text-slate-300 block mb-1">ملاحظات الاعتماد للموظف (اختياري):</label>
            <input type="text" id="mgr-leave-review-notes" placeholder="مثال: تمت الموافقة - إجازة سعيدة"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" />
          </div>

          <div class="pt-2 flex items-center justify-end gap-2">
            <button onclick="document.getElementById('mgr-leave-review-modal').innerHTML=''" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold">
              إلغاء
            </button>
            <button onclick="ManagerUI.submitReviewLeave(${leaveId}, 'approved')" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20">
              <i data-lucide="check" class="w-4 h-4"></i> تأكيد الاعتماد
            </button>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async submitReviewLeave(id, status, defaultNotes = null) {
    const input = document.getElementById('mgr-leave-review-notes');
    const notes = input ? input.value : defaultNotes;
    try {
      const res = await API.reviewLeave(id, status, notes);
      if (res.success) {
        showToast(res.message, status === 'approved' ? 'success' : 'info');
        const modal = document.getElementById('mgr-leave-review-modal');
        if (modal) modal.innerHTML = '';
        this.renderLeavesSection(document.getElementById('mgr-leaves-status-filter')?.value || 'all');
      } else {
        showToast(res.error || 'فشل في مراجعة الطلب', 'danger');
      }
    } catch (err) {
      showToast(err.message || 'فشل في مراجعة الطلب', 'danger');
    }
  },

  async submitReviewPermission(id, status, notes = null) {
    try {
      const res = await API.reviewPermission(id, status, notes);
      if (res.success) {
        showToast(res.message, status === 'approved' ? 'success' : 'info');
        this.renderLeavesSection(document.getElementById('mgr-leaves-status-filter')?.value || 'all');
      } else {
        showToast(res.error || 'فشل في مراجعة الطلب', 'danger');
      }
    } catch (err) {
      showToast(err.message || 'فشل في مراجعة الطلب', 'danger');
    }
  },

  async deleteLeave(id, empName) {
    const confirmMsg = empName 
      ? `هل أنت متأكد من حذف طلب الإجازة للموظف (${empName})؟\n\nتنبيه: سيتم إلغاء الإجازة فوراً واستعادة رصيد إجازات الموظف وتحديث سجلات الحضور.`
      : `هل أنت متأكد من حذف طلب الإجازة؟`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await API.deleteLeave(id);
      if (res && res.success) {
        showToast(res.message || 'تم حذف الإجازة بنجاح واستعادة الرصيد', 'success');
        this.renderLeavesSection(document.getElementById('mgr-leaves-status-filter')?.value || 'all');
      } else {
        showToast((res && res.error) || 'فشل في حذف طلب الإجازة', 'danger');
      }
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء حذف الإجازة', 'danger');
    }
  },

  async deletePermission(id, empName) {
    const confirmMsg = empName
      ? `هل أنت متأكد من حذف طلب الإذن للموظف (${empName})؟`
      : `هل أنت متأكد من حذف طلب الإذن؟`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await API.deletePermission(id);
      if (res && res.success) {
        showToast(res.message || 'تم حذف طلب الإذن بنجاح', 'success');
        this.renderLeavesSection(document.getElementById('mgr-leaves-status-filter')?.value || 'all');
      } else {
        showToast((res && res.error) || 'فشل في حذف طلب الإذن', 'danger');
      }
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء حذف طلب الإذن', 'danger');
    }
  },

  // ========================================================
  // 2.5 LEADERBOARD & ATTENDANCE SCORE SECTION (لوحة الشرف وموظف الشهر)
  // ========================================================
  async renderLeaderboardSection(selectedMonth = null) {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="award" class="w-5 h-5 text-emerald-500"></i> مؤشر تقييم الالتزام والانضباط
            </h2>
            <p class="text-xs text-slate-500">مؤشر أداء هادئ وواضح لقياس التزام موظفي الشركة بمواعيد العمل بدقة</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap" id="mgr-leaderboard-actions-bar">
            <div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>

        <div id="mgr-leaderboard-main-container" class="space-y-6">
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

      const actionsBar = document.getElementById('mgr-leaderboard-actions-bar');
      if (actionsBar) {
        actionsBar.innerHTML = `
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300">الشهر:</label>
            <select id="leaderboard-month-select" onchange="ManagerUI.renderLeaderboardSection(this.value)"
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

      const res = await API.getLeaderboard(targetMonth);
      const list = res.leaderboard || [];
      const summary = res.summary || {};
      const topEmp = res.employeeOfTheMonth;

      const mainContainer = document.getElementById('mgr-leaderboard-main-container');
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
        <!-- Summary KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span class="text-xs font-bold text-slate-500 block mb-1">الموظف الأكثر التزاماً</span>
            <div class="flex items-baseline justify-between">
              <span class="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">${topEmp ? topEmp.employee.full_name : '—'}</span>
              <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">${topEmp ? `${topEmp.score}%` : ''}</span>
            </div>
            <span class="text-[11px] text-slate-400 block mt-1">${topEmp ? `${topEmp.onTimeDays} يوم في الموعد` : '—'}</span>
          </div>

          <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span class="text-xs font-bold text-slate-500 block mb-1">متوسط التزام الشركة</span>
            <div class="flex items-baseline justify-between">
              <span class="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">${summary.avgScore || 0}%</span>
              <span class="text-xs font-bold text-emerald-500">معدل عام</span>
            </div>
            <span class="text-[11px] text-slate-400 block mt-1">لكافة أيام الشهر</span>
          </div>

          <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span class="text-xs font-bold text-slate-500 block mb-1">فائقو الالتزام (90%+)</span>
            <div class="flex items-baseline justify-between">
              <span class="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 font-mono">${summary.legendaryCount || 0}</span>
              <span class="text-xs text-slate-400">موظف</span>
            </div>
            <span class="text-[11px] text-slate-400 block mt-1">مؤهلون لمكافأة التميز</span>
          </div>

          <div class="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span class="text-xs font-bold text-slate-500 block mb-1">الموظفون في التقييم</span>
            <div class="flex items-baseline justify-between">
              <span class="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-200 font-mono">${summary.totalEmployees || 0}</span>
              <span class="text-xs text-slate-400">موظف</span>
            </div>
            <span class="text-[11px] text-slate-400 block mt-1">جميع النشطين</span>
          </div>
        </div>

        <!-- Full Attendance Commitment Table (Calm & Professional) -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="users" class="w-4 h-4 text-emerald-500"></i> مؤشرات التزام الموظفين لشهر ${targetMonth}
            </h3>
            <span class="text-xs font-bold text-slate-400 font-mono">${list.length} موظف</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-400 uppercase font-semibold">
                <tr>
                  <th class="py-3 px-3">الموظف</th>
                  <th class="py-3 px-3 text-center">نسبة الالتزام</th>
                  <th class="py-3 px-3 text-center">الحالة</th>
                  <th class="py-3 px-3 text-center">في الموعد</th>
                  <th class="py-3 px-3 text-center">التأخير</th>
                  <th class="py-3 px-3 text-center">الغياب</th>
                  <th class="py-3 px-3 text-center">مكافأة التميز</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                ${list.map(item => {
                  const emp = item.employee;
                  const tier = item.tier || {};
                  const s = Math.round(item.score || 0);
                  const circleStroke = s >= 90 ? '#10b981' : s >= 75 ? '#3b82f6' : s >= 60 ? '#f59e0b' : '#ef4444';
                  const circleText = s >= 90 ? 'text-emerald-600 dark:text-emerald-400' : s >= 75 ? 'text-blue-600 dark:text-blue-400' : s >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

                  return `
                    <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td class="py-3 px-3">
                        <div class="flex items-center gap-3">
                          <div class="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                            ${emp.profile_photo ? `<img src="${emp.profile_photo}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center font-bold text-slate-500">${emp.full_name.charAt(0)}</div>`}
                          </div>
                          <div class="min-w-0">
                            <span class="font-bold text-slate-900 dark:text-white block truncate">
                              ${emp.full_name}
                            </span>
                            <span class="text-[10px] text-slate-400 font-mono block">${emp.employee_code} • ${emp.job_title || 'موظف'} • ${emp.department_name || ''}</span>
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
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        ${s >= 90 ? `
                          <button onclick="ManagerUI.openAddBonusModal(${emp.id}, '${targetMonth}', 'مكافأة تميز في الالتزام', 300)"
                            class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center gap-1 shadow-sm transition-all whitespace-nowrap">
                            <i data-lucide="gift" class="w-3.5 h-3.5"></i>
                            <span>منح مكافأة تميز</span>
                          </button>
                        ` : '<span class="text-slate-300 dark:text-slate-700 text-xs font-bold">—</span>'}
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
      console.error('Error rendering leaderboard section:', err);
      showToast(err.message || 'فشل في تحميل مؤشر الالتزام', 'danger');
    }
  },

  // ========================================================
  // 3. WORKING HOURS SETTINGS ("مواعيد العمل")
  // ========================================================
  async renderWorkingHoursSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6 w-full">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="calendar-clock" class="w-5 h-5 text-emerald-500"></i> تحديد مواعيد وقواعد الدوام
          </h2>
          <p class="text-xs text-slate-500">ضبط وقت بدء وانتهاء العمل، فترة السماح، وحدود التأخير والغياب ونصف اليوم</p>
        </div>

        <form onsubmit="ManagerUI.saveWorkingHours(event)" class="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6 text-xs w-full">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1.5">موعد بدء العمل الرسمي (Start Time) *</label>
              <input type="time" id="sched-start-time" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm" />
            </div>
            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1.5">موعد نهاية العمل الرسمي (End Time) *</label>
              <input type="time" id="sched-end-time" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1.5">فترة سماح الحضور (Grace Period) *</label>
              <input type="number" id="sched-grace-period" min="0" max="60" value="15" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
              <span class="text-[11px] text-slate-400 mt-1 block">مثال: 15 دقيقة (09:01 - 09:15 في الموعد)</span>
            </div>

            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1.5">سماح الانصراف المبكر بالدقائق *</label>
              <input type="number" id="sched-early-leave-grace" min="0" max="180" value="15" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
              <span class="text-[11px] text-slate-400 mt-1 block">إذا انصرف قبل وقت الانصراف بهذا المقدار، يُحسب خروج مبكر</span>
            </div>

            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1.5">حد نصف اليوم (Half-Day) *</label>
              <input type="time" id="sched-half-day" value="12:00" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm" />
              <span class="text-[11px] text-slate-400 mt-1 block">حضور بعد هذا الوقت يُعتبر نصف يوم</span>
            </div>

            <div>
              <label class="block text-slate-700 dark:text-slate-300 font-bold mb-1.5">حد الغياب الآلي (Absence) *</label>
              <input type="time" id="sched-absence" value="13:00" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm" />
              <span class="text-[11px] text-slate-400 mt-1 block">تسجيل غياب آلي إذا لم يحضر بعده</span>
            </div>
          </div>

          <!-- Weekend Days Configuration -->
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
            <div class="flex items-center gap-2">
              <i data-lucide="calendar" class="w-4 h-4 text-emerald-500"></i>
              <label class="block text-slate-800 dark:text-white font-bold text-xs">أيام العطلة الأسبوعية الرسمية (Weekend Days) *</label>
            </div>
            <select id="sched-weekend-days" class="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white">
              <option value="5">الجمعة فقط (الدوام: السبت إلى الخميس)</option>
              <option value="5,6">الجمعة والسبت (الدوام: الأحد إلى الخميس)</option>
              <option value="6,0">السبت والأحد (الدوام: الاثنين إلى الجمعة)</option>
              <option value="4,5">الخميس والجمعة (الدوام: السبت إلى الأربعاء)</option>
            </select>
            <p class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 pt-1">
              <i data-lucide="shield-check" class="w-3.5 h-3.5 flex-shrink-0"></i>
              <span>أيام العطلة الأسبوعية المحددة معفاة تماماً ولا يتم احتسابها كغياب للموظفين ولا يُطبق عليها أي خصم.</span>
            </p>
          </div>

          <!-- Live Rule Explanation Card -->
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <h4 class="font-bold text-slate-800 dark:text-white">طريقة احتساب النظام تلقائياً للحضور والانصراف:</h4>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1 font-medium">
              <div class="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                09:00 - 09:15<br><strong class="font-bold">في الموعد</strong>
              </div>
              <div class="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                09:16 - 11:59<br><strong class="font-bold">متأخر</strong>
              </div>
              <div class="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300">
                12:00 أو بعدها<br><strong class="font-bold">نصف يوم</strong>
              </div>
              <div class="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                قبل نهاية الدوام<br><strong class="font-bold">انصراف مبكر</strong>
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <button type="submit" class="py-3 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-500/25 flex items-center gap-2 text-sm transition-all">
              <i data-lucide="check" class="w-4 h-4"></i> حفظ مواعيد وقواعد العمل
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    try {
      const res = await API.getSettings();
      const sched = res.schedule || {};
      const s = res.settings || {};
      document.getElementById('sched-start-time').value = sched.start_time || '09:00';
      document.getElementById('sched-end-time').value = sched.end_time || '17:00';
      document.getElementById('sched-grace-period').value = sched.grace_period_minutes || 15;
      document.getElementById('sched-early-leave-grace').value = sched.early_leave_grace_minutes || 15;
      document.getElementById('sched-half-day').value = sched.half_day_threshold || '12:00';
      document.getElementById('sched-absence').value = sched.absence_threshold || '13:00';
      const weekendEl = document.getElementById('sched-weekend-days');
      if (weekendEl) weekendEl.value = s.weekend_days || '5';
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  showApplyScopeModal({ title, onConfirm }) {
    let modalEl = document.getElementById('apply-scope-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'apply-scope-modal';
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <i data-lucide="help-circle" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">${title || 'تطبيق التعديلات الجديدة'}</h3>
                <p class="text-[11px] text-slate-400">اختر نطاق سريان المواعيد وفترات السماح الجديدة</p>
              </div>
            </div>
            <button onclick="document.getElementById('apply-scope-modal').innerHTML=''" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>

          <div class="space-y-3 pt-1">
            <label class="flex items-start gap-3 p-3.5 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 cursor-pointer hover:border-emerald-500 transition-all">
              <input type="radio" name="apply-scope-choice" value="from_month_start" checked class="mt-1 w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
              <div class="space-y-1">
                <div class="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                  <span>الخيار الأول: تطبيق بأثر رجعي من أول الشهر الحالي 🗓️</span>
                  <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">موصى به</span>
                </div>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  إعادة احتساب سجلات وخصومات الحضور لجميع الموظفين من يوم 1 في الشهر الحالي بناءً على المواعيد وفترات السماح الجديدة (إذا كان موظف قد خُصم منه تأخير وأصبح الآن ضمن فترة السماح الجديدة، يُلغى الخصم وتعود مستحقاته تلقائياً).
                </p>
              </div>
            </label>

            <label class="flex items-start gap-3 p-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer hover:border-blue-500 transition-all">
              <input type="radio" name="apply-scope-choice" value="from_today" class="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500" />
              <div class="space-y-1">
                <div class="font-bold text-slate-900 dark:text-white text-xs">
                  الخيار الثاني: تطبيق من اليوم فصاعداً فقط ⏱️
                </div>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  تطبيق المواعيد والقواعد الجديدة على تسجيلات اليوم والأيام القادمة فقط، مع إبقاء سجلات وخصومات الأيام السابقة كما هي دون أي تغيير.
                </p>
              </div>
            </label>
          </div>

          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button type="button" onclick="document.getElementById('apply-scope-modal').innerHTML=''" class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
              إلغاء
            </button>
            <button type="button" id="confirm-scope-btn" class="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all">
              <i data-lucide="check" class="w-4 h-4"></i> تأكيد وحفظ الإعدادات 💾
            </button>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    document.getElementById('confirm-scope-btn').onclick = () => {
      const selectedScope = document.querySelector('input[name="apply-scope-choice"]:checked')?.value || 'from_today';
      document.getElementById('apply-scope-modal').innerHTML = '';
      if (typeof onConfirm === 'function') onConfirm(selectedScope);
    };
  },

  async saveWorkingHours(e) {
    e.preventDefault();
    const data = {
      start_time: document.getElementById('sched-start-time').value,
      end_time: document.getElementById('sched-end-time').value,
      grace_period_minutes: parseInt(document.getElementById('sched-grace-period').value, 10),
      early_leave_grace_minutes: parseInt(document.getElementById('sched-early-leave-grace').value, 10) || 0,
      half_day_threshold: document.getElementById('sched-half-day').value,
      absence_threshold: document.getElementById('sched-absence').value,
      weekend_days: document.getElementById('sched-weekend-days')?.value || '5'
    };

    this.showApplyScopeModal({
      title: 'تطبيق مواعيد وقواعد العمل الجديدة',
      onConfirm: async (selectedScope) => {
        data.apply_scope = selectedScope;
        try {
          const res = await API.updateWorkingHours(data);
          showToast(res.message, 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        }
      }
    });
  },

  // ========================================================
  // 4. WORKPLACE LOCATION SETTINGS ("موقع العمل")
  // ========================================================
  async renderWorkplaceSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="map-pin" class="w-5 h-5 text-blue-600"></i> تحديد موقع العمل والنطاق الجغرافي
          </h2>
          <p class="text-xs text-slate-500">يجب تحديد موقع المنشأة ونصف القطر المسموح به ليتمكن الموظفون من تسجيل الحضور</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <h3 class="font-bold text-sm text-slate-800 dark:text-white">إعدادات النطاق الجغرافي</h3>

            <div>
              <label class="block text-slate-500 mb-1">اسم المنشأة</label>
              <input type="text" id="wp-company-name" placeholder="اسم الشركة أو المؤسسة" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>

            <div>
              <label class="block text-slate-500 mb-1">اسم المقر / الفرع</label>
              <input type="text" id="wp-name" value="المقر الرئيسي" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-500 mb-1">خط العرض (Latitude)</label>
                <input type="number" step="any" id="wp-lat" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono" />
              </div>
              <div>
                <label class="block text-slate-500 mb-1">خط الطول (Longitude)</label>
                <input type="number" step="any" id="wp-lng" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono" />
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-slate-500 font-bold">النطاق المسموح به (Allowed Radius)</label>
                <span id="wp-radius-val" class="font-bold text-blue-600">100 متر</span>
              </div>
              <input type="range" id="wp-radius" min="20" max="1000" step="10" value="100" oninput="ManagerUI.onRadiusSliderChange(this.value)" class="w-full" />
            </div>

            <div class="pt-2 flex flex-col gap-2">
              <button onclick="ManagerUI.useMyCurrentGpsForWorkplace()" class="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-center gap-2">
                <i data-lucide="crosshair" class="w-4 h-4 text-blue-600"></i> استخدام موقع جهازي الحالي للشركة
              </button>
              <button onclick="ManagerUI.saveWorkplaceSettings()" class="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20 flex items-center justify-center gap-2">
                <i data-lucide="save" class="w-4 h-4"></i> حفظ وتفعيل موقع العمل
              </button>
            </div>
          </div>

          <div class="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col min-h-[460px]">
            <div class="flex items-center justify-between pb-3 text-xs text-slate-500">
              <span>انقر على الخريطة أو اسحب العلامة لتحديد موقع الشركة:</span>
              <span class="text-blue-600 font-semibold">الدائرة الزرقاء تمثل النطاق المسموح به للموظف</span>
            </div>
            <div id="workplace-map" class="flex-1 rounded-2xl min-h-[400px]"></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    try {
      const res = await API.getSettings();
      const wp = res.workplace || {};
      currentWorkplaceData = wp;

      document.getElementById('wp-company-name').value = wp.company_name || '';
      document.getElementById('wp-name').value = wp.name || 'المقر الرئيسي';
      document.getElementById('wp-lat').value = wp.latitude || 30.0444;
      document.getElementById('wp-lng').value = wp.longitude || 31.2357;
      document.getElementById('wp-radius').value = wp.allowed_radius_meters || 100;
      document.getElementById('wp-radius-val').textContent = `${wp.allowed_radius_meters || 100} متر`;

      MapHelper.initWorkplaceMap(
        'workplace-map',
        wp.latitude || 30.0444,
        wp.longitude || 31.2357,
        wp.allowed_radius_meters || 100,
        (newLat, newLng) => {
          document.getElementById('wp-lat').value = newLat.toFixed(6);
          document.getElementById('wp-lng').value = newLng.toFixed(6);
        }
      );
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  onRadiusSliderChange(val) {
    document.getElementById('wp-radius-val').textContent = `${val} متر`;
    MapHelper.updateCircleRadius(val);
  },

  useMyCurrentGpsForWorkplace() {
    if (!navigator.geolocation) {
      showToast('المتصفح لا يدعم الـ GPS', 'warning');
      return;
    }
    showToast('جاري استرجاع إحداثيات موقعك الحالي...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        document.getElementById('wp-lat').value = lat.toFixed(6);
        document.getElementById('wp-lng').value = lng.toFixed(6);
        MapHelper.setWorkplaceCoordinates(lat, lng);
        showToast('تم تحديث إحداثيات موقع الشركة بموقعك الحالي بنجاح', 'success');
      },
      (err) => showToast(`فشل تحديد الموقع: ${err.message}`, 'danger'),
      { enableHighAccuracy: true }
    );
  },

  async saveWorkplaceSettings() {
    const data = {
      company_name: document.getElementById('wp-company-name').value,
      name: document.getElementById('wp-name').value,
      latitude: parseFloat(document.getElementById('wp-lat').value),
      longitude: parseFloat(document.getElementById('wp-lng').value),
      allowed_radius_meters: parseFloat(document.getElementById('wp-radius').value),
      max_gps_accuracy_meters: 150
    };

    try {
      const res = await API.updateWorkplace(data);
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  // ========================================================
  // 5. ATTENDANCE LIVE FEED & MONITORING ("الحضور")
  // ========================================================
  async renderAttendanceSection() {
    await this.renderDashboard();
  },

  // ========================================================
  // 5.5 ATTENDANCE ADJUSTMENT (إضافة وتعديل الحضور بأثر رجعي بحماية كلمة المرور)
  // ========================================================
  currentEditableRecords: [],

  async renderAttendanceAdjustmentSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    const isUnlocked = sessionStorage.getItem('manager_att_adjust_unlocked') === 'true';

    if (!isUnlocked) {
      container.innerHTML = `
        <div class="max-w-2xl mx-auto py-8">
          <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 dark:border-slate-800 space-y-6">
            <div class="text-center space-y-2">
              <div class="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3">
                <i data-lucide="shield-alert" class="w-8 h-8"></i>
              </div>
              <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                تعديل وإضافة مواعيد الحضور (صلاحية إدارية خاصة)
              </h2>
              <p class="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
                هذه الصفحة مخصصة لتوثيق حضور الموظفين بأثر رجعي أو تصحيح مواعيد الحضور والانصراف بدقة
              </p>
            </div>

            <!-- Warning Notice Box -->
            <div class="p-4 sm:p-5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border-2 border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs sm:text-sm space-y-2">
              <div class="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300 text-sm">
                <i data-lucide="alert-triangle" class="w-5 h-5 flex-shrink-0"></i>
                <span>تحذير إداري أمني هام:</span>
              </div>
              <ul class="list-disc list-inside space-y-1.5 text-xs sm:text-[13px] text-amber-900 dark:text-amber-200/90 leading-relaxed">
                <li>أي تعديل أو إضافة في مواعيد الحضور والانصراف يؤثر بصورة مباشرة على <strong>حساب الخصومات، مسير الرواتب، ونسب الالتزام الشهرية</strong>.</li>
                <li>يتطلب النظام كتابة <strong>سبب ومبرر إداري معتمد</strong> لكل عملية تعديل.</li>
                <li>جميع العمليات تُوثق تلقائياً بالثانية واسم المدير وعنوان IP في <strong>سجل الرقابة الإداري (Audit Log)</strong> ولا يمكن حذفها.</li>
              </ul>
            </div>

            <!-- Password Form -->
            <form onsubmit="event.preventDefault(); ManagerUI.verifyAdjustmentAccess();" class="space-y-4 pt-2">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  كلمة مرور حساب المدير لتأكيد الهوية:
                </label>
                <div class="relative">
                  <input type="password" id="mgr-adjust-password" required placeholder="أدخل كلمة المرور الخاصة بحسابك..."
                    class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-amber-500 outline-none" />
                  <i data-lucide="key" class="w-4 h-4 text-slate-400 absolute left-3 top-3.5"></i>
                </div>
                <div id="mgr-adjust-pwd-error" class="hidden text-xs text-rose-500 font-bold mt-1.5"></div>
              </div>

              <div class="flex items-center gap-3 pt-2">
                <button type="submit" id="mgr-adjust-submit-btn"
                  class="flex-1 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2">
                  <i data-lucide="unlock" class="w-4 h-4"></i> تأكيد الهوية والدخول 🔓
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // UNLOCKED VIEW
    container.innerHTML = `
      <div class="space-y-6">
        <!-- Top bar with Lock button -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0">
              <i data-lucide="shield-check" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base sm:text-lg font-black text-slate-900 dark:text-white">إضافة وتعديل الحضور بأثر رجعي</h2>
                <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/20">صلاحية مفعلة 🔓</span>
              </div>
              <p class="text-xs text-slate-400">إضافة سجلات لمن حضروا قبل التسجيل بالنظام وتعديل المواعيد مع توثيق الأسباب</p>
            </div>
          </div>
          <button onclick="ManagerUI.lockAdjustmentAccess()"
            class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all">
            <i data-lucide="lock" class="w-4 h-4 text-slate-400"></i> قفل الصلاحية 🔒
          </button>
        </div>

        <!-- Sub Tabs: 1) إضافة حضور بأثر رجعي | 2) تعديل السجلات القائمة -->
        <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button id="tab-btn-retroactive" onclick="ManagerUI.switchAdjustmentTab('retroactive')"
            class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-blue-600 text-white shadow-sm">
            ➕ إضافة حضور بأثر رجعي
          </button>
          <button id="tab-btn-existing" onclick="ManagerUI.switchAdjustmentTab('existing')"
            class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            ✏️ تعديل المواعيد القائمة
          </button>
        </div>

        <!-- Panel 1: Multi-Row Attendance Entry -->
        <div id="panel-retroactive" class="space-y-6">
          <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <i data-lucide="layers" class="w-4 h-4 text-blue-500"></i> إضافة وتوثيق سجلات الحضور (صفوف متعددة بتوقيتات مختلفة)
                </h3>
                <p class="text-xs text-slate-400 mt-0.5">أضف صفوف الحضور لموظفين وتواريخ متعددة دفعة واحدة، وتُحدد الحالة والتأخير والخصم تلقائياً</p>
              </div>

              <div class="flex items-center gap-2">
                <button type="button" onclick="ManagerUI.addBatchAttRow()"
                  class="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 transition-all">
                  <i data-lucide="plus" class="w-4 h-4"></i> ➕ إضافة صف حضور آخر
                </button>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-right text-xs">
                <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th class="py-2.5 px-3 min-w-[180px]">الموظف *</th>
                    <th class="py-2.5 px-3 min-w-[140px]">التاريخ *</th>
                    <th class="py-2.5 px-3 min-w-[110px]">وقت الحضور *</th>
                    <th class="py-2.5 px-3 min-w-[110px]">وقت الانصراف</th>
                    <th class="py-2.5 px-3 min-w-[160px]">السبب / المبرر (اختياري)</th>
                    <th class="py-2.5 px-2 text-center min-w-[60px]">حذف</th>
                  </tr>
                </thead>
                <tbody id="batch-att-tbody" class="divide-y divide-slate-100 dark:divide-slate-800">
                  <!-- Dynamic rows rendered here -->
                </tbody>
              </table>
            </div>

            <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" id="batch-att-waive-all" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400">إعفاء كافة الصفوف المدخلة من الخصومات والتأخير (اعتماد حضور منضبط 0 دقيقة)</span>
              </label>

              <div class="flex items-center gap-2">
                <button type="button" onclick="ManagerUI.addBatchAttRow()"
                  class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all">
                  <i data-lucide="plus" class="w-4 h-4"></i> صف آخر ➕
                </button>
                <button type="button" id="batch-att-submit-btn" onclick="ManagerUI.submitBatchManualAttendance()"
                  class="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all">
                  <i data-lucide="check-check" class="w-4 h-4"></i> حفظ وتوثيق كافة السجلات دفعة واحدة 🚀
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Panel 2: Existing Records Edit -->
        <div id="panel-existing" class="hidden space-y-4">
          <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 flex-wrap flex-1">
              <div>
                <label class="text-[11px] font-bold text-slate-400 block mb-1">التاريخ المحدد (اختياري):</label>
                <input type="date" id="filter-edit-date" class="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white" />
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-400 block mb-1">الموظف:</label>
                <select id="filter-edit-emp" class="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white">
                  <option value="">جميع الموظفين</option>
                </select>
              </div>
              <div class="pt-4 md:pt-0 flex items-center gap-1.5 flex-wrap">
                <button onclick="ManagerUI.loadRecordsToEdit()" class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all">
                  <i data-lucide="search" class="w-3.5 h-3.5"></i> بحث وفلترة
                </button>
                <button onclick="ManagerUI.showAllRecordsToEdit()" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1 transition-all" title="عرض كل الأيام المسجلة بالنظام">
                  <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500"></i> عرض كل الأيام 📋
                </button>
                <button onclick="ManagerUI.setFilterTodayToEdit()" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1 transition-all">
                  اليوم فقط 📅
                </button>
              </div>
            </div>
          </div>

          <div id="records-to-edit-table-container">
            <div class="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              جاري تحميل السجلات...
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    await this.populateAdjustmentDropdowns();
  },

  async verifyAdjustmentAccess() {
    const pwdInput = document.getElementById('mgr-adjust-password');
    const errEl = document.getElementById('mgr-adjust-pwd-error');
    const btn = document.getElementById('mgr-adjust-submit-btn');

    if (!pwdInput || !pwdInput.value) return;

    if (errEl) errEl.classList.add('hidden');
    if (btn) btn.disabled = true;

    try {
      const res = await API.verifyPassword(pwdInput.value);
      if (res && res.verified) {
        sessionStorage.setItem('manager_att_adjust_unlocked', 'true');
        showToast('تم تأكيد الهوية بنجاح، مرحباً بك في وضع التعديل الإداري 🔓', 'success');
        await this.renderAttendanceAdjustmentSection();
      } else {
        throw new Error(res.error || 'فشل التحقق من كلمة المرور');
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'كلمة المرور غير صحيحة، يرجى المحاولة مجدداً';
        errEl.classList.remove('hidden');
      }
      showToast(err.message || 'كلمة المرور غير صحيحة', 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  lockAdjustmentAccess() {
    sessionStorage.removeItem('manager_att_adjust_unlocked');
    showToast('تم قفل صفحة التعديل الإداري بنجاح 🔒', 'info');
    this.renderAttendanceAdjustmentSection();
  },

  switchAdjustmentTab(tab) {
    const btnRetro = document.getElementById('tab-btn-retroactive');
    const btnExist = document.getElementById('tab-btn-existing');
    const panelRetro = document.getElementById('panel-retroactive');
    const panelExist = document.getElementById('panel-existing');

    if (tab === 'retroactive') {
      btnRetro?.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btnRetro?.classList.remove('text-slate-600', 'dark:text-slate-400');
      btnExist?.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btnExist?.classList.add('text-slate-600', 'dark:text-slate-400');
      panelRetro?.classList.remove('hidden');
      panelExist?.classList.add('hidden');
    } else {
      btnExist?.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btnExist?.classList.remove('text-slate-600', 'dark:text-slate-400');
      btnRetro?.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btnRetro?.classList.add('text-slate-600', 'dark:text-slate-400');
      panelExist?.classList.remove('hidden');
      panelRetro?.classList.add('hidden');
      this.loadRecordsToEdit();
    }
  },

  async populateAdjustmentDropdowns() {
    try {
      const empsRes = await API.getEmployees({ limit: 100 });
      const employees = empsRes.employees || [];
      this.cachedEmployees = employees;

      const empSelect2 = document.getElementById('filter-edit-emp');

      const options = employees.map(e => `
        <option value="${e.id}">${e.full_name} (${e.employee_code || e.job_title || 'موظف'})</option>
      `).join('');

      if (empSelect2) empSelect2.innerHTML = `<option value="">جميع الموظفين</option>${options}`;

      // Initialize batch multi-rows
      this.initBatchAttendanceRows();

      // Notice: filter-edit-date is intentionally left empty so ALL days are queried by default
      const date2 = document.getElementById('filter-edit-date');
      if (date2) date2.value = '';

      // Auto-load all records immediately so nothing is hidden
      await this.loadRecordsToEdit();
    } catch (e) {
      console.warn('Error populating adjustment dropdowns:', e);
    }
  },

  initBatchAttendanceRows() {
    const tbody = document.getElementById('batch-att-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    // Start with 2 initial clean rows
    this.addBatchAttRow();
    this.addBatchAttRow();
  },

  addBatchAttRow() {
    const tbody = document.getElementById('batch-att-tbody');
    if (!tbody) return;

    const rowId = 'batch-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const today = new Date().toISOString().split('T')[0];
    const employees = this.cachedEmployees || [];

    const options = employees.map(e => `
      <option value="${e.id}">${e.full_name} (${e.employee_code || 'موظف'})</option>
    `).join('');

    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.className = 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors batch-att-row';
    tr.innerHTML = `
      <td class="py-2.5 px-3">
        <select class="batch-emp w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white">
          <option value="">-- اختر الموظف --</option>
          ${options}
        </select>
      </td>
      <td class="py-2.5 px-3">
        <input type="date" value="${today}" class="batch-date w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white" />
      </td>
      <td class="py-2.5 px-3">
        <input type="time" value="09:00" class="batch-in w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white" />
      </td>
      <td class="py-2.5 px-3">
        <input type="time" value="17:00" class="batch-out w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white" />
      </td>
      <td class="py-2.5 px-3">
        <input type="text" placeholder="اختياري" class="batch-reason w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white" />
      </td>
      <td class="py-2.5 px-2 text-center">
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors" title="حذف الصف">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
    if (window.lucide) lucide.createIcons();
  },

  async submitBatchManualAttendance() {
    const rows = document.querySelectorAll('#batch-att-tbody .batch-att-row');
    const items = [];
    const waiveAll = document.getElementById('batch-att-waive-all')?.checked;

    rows.forEach(r => {
      const empId = r.querySelector('.batch-emp')?.value;
      const date = r.querySelector('.batch-date')?.value;
      const checkin = r.querySelector('.batch-in')?.value;
      const checkout = r.querySelector('.batch-out')?.value;
      const reason = r.querySelector('.batch-reason')?.value;

      if (empId && date) {
        items.push({
          employee_id: parseInt(empId, 10),
          date,
          check_in_time: checkin || null,
          check_out_time: checkout || null,
          reason: reason ? reason.trim() : 'توثيق حضور إداري',
          waive_deductions: waiveAll
        });
      }
    });

    if (items.length === 0) {
      showToast('يرجى اختيار الموظف والتاريخ لصف حضور واحد على الأقل', 'warning');
      return;
    }

    const btn = document.getElementById('batch-att-submit-btn');
    if (btn) btn.disabled = true;

    try {
      const res = await API.batchManualAttendance(items);
      showToast(res.message || `تم بنجاح حفظ وتوثيق (${items.length}) سجلات حضور واحتساب الحالة تلقائياً ✓`, 'success');
      this.initBatchAttendanceRows();
      await this.loadRecordsToEdit();
    } catch (err) {
      showToast(err.message || 'فشل في حفظ سجلات الحضور', 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async deleteAttendanceRecord(recordId, employeeName, date) {
    if (!confirm(`تحذير:\nهل أنت متأكد من حذف سجل حضور "${employeeName}" ليوم ${date}؟\n\nهذا الإجراء سيقوم بحذف السجل وتوثيق العملية في سجل العمليات الرقابي.`)) {
      return;
    }

    try {
      const res = await API.deleteAttendance(recordId);
      showToast(res.message || 'تم حذف السجل بنجاح 🗑️', 'success');
      await this.loadRecordsToEdit();
    } catch (err) {
      showToast(err.message || 'فشل في حذف السجل', 'danger');
    }
  },

  async loadRecordsToEdit() {
    const container = document.getElementById('records-to-edit-table-container');
    if (!container) return;

    const dateVal = document.getElementById('filter-edit-date')?.value;
    const empVal = document.getElementById('filter-edit-emp')?.value;

    container.innerHTML = `<div class="p-8 text-center text-slate-400">جاري تحميل السجلات...</div>`;

    try {
      const params = {};
      if (dateVal && dateVal.trim()) {
        params.date_from = dateVal.trim();
        params.date_to = dateVal.trim();
      }
      if (empVal && empVal.trim()) {
        params.employee_id = empVal.trim();
      }

      const res = await API.getHistory(params);
      const records = res.records || [];
      this.currentEditableRecords = records;

      if (records.length === 0) {
        container.innerHTML = `
          <div class="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
            لا توجد سجلات حضور مسجلة ${dateVal ? `لتاريخ ${dateVal}` : 'حالياً'}. يمكنك استخدام تبويب "إضافة حضور بأثر رجعي" لإضافة سجل جديد.
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between mb-3 px-1 flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">قائمة السجلات:</span>
              <span class="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold font-mono">${records.length} سجل</span>
              ${dateVal ? `<span class="text-[11px] text-slate-400 font-mono">📅 تاريخ: ${dateVal}</span>` : `<span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">📋 معروض جميع الأيام</span>`}
            </div>
            <button onclick="ManagerUI.showAllRecordsToEdit()" class="text-xs font-bold text-blue-600 hover:underline">
              تحديث وعرض الكل 🔄
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-400 uppercase font-semibold">
                <tr>
                  <th class="py-3 px-3">الموظف</th>
                  <th class="py-3 px-3 text-center">التاريخ</th>
                  <th class="py-3 px-3 text-center">وقت الحضور</th>
                  <th class="py-3 px-3 text-center">وقت الانصراف</th>
                  <th class="py-3 px-3 text-center">الحالة</th>
                  <th class="py-3 px-3 text-center">التأخير والخصم</th>
                  <th class="py-3 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                ${records.map(r => {
                  const lateText = r.late_minutes > 0 ? `${r.late_minutes} دقيقة (${r.estimated_deduction || 0} ج.م)` : 'لا يوجد';
                  const safeName = (r.full_name || '').replace(/'/g, "\\'");
                  return `
                    <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td class="py-3 px-3">
                        <div class="flex items-center gap-2.5">
                          <div class="w-8 h-8 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500">
                            ${r.profile_photo ? `<img src="${r.profile_photo}" class="w-full h-full object-cover" />` : (r.full_name || 'م').charAt(0)}
                          </div>
                          <div>
                            <span class="font-bold text-slate-900 dark:text-white block">${r.full_name}</span>
                            <span class="text-[10px] text-slate-400 font-mono">${r.employee_code || ''}</span>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-3 text-center font-mono font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        ${r.date}
                      </td>
                      <td class="py-3 px-3 text-center font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        ${r.check_in_time ? formatTime12(r.check_in_time) : '<span class="text-slate-400 font-normal">—</span>'}
                      </td>
                      <td class="py-3 px-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        ${r.check_out_time ? formatTime12(r.check_out_time) : '<span class="text-slate-400 font-normal">—</span>'}
                      </td>
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        ${getStatusBadge(r.status)}
                      </td>
                      <td class="py-3 px-3 text-center font-mono text-[11px] whitespace-nowrap ${r.late_minutes > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-400'}">
                        ${lateText}
                      </td>
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        <div class="flex items-center justify-center gap-1.5">
                          <button onclick="ManagerUI.openEditAttendanceModal(${r.id})"
                            class="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-300 border border-blue-500/30 text-xs font-bold inline-flex items-center gap-1 transition-all" title="تعديل الموعد">
                            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                            <span>تعديل ✏️</span>
                          </button>
                          <button onclick="ManagerUI.deleteAttendanceRecord(${r.id}, '${safeName}', '${r.date}')"
                            class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold inline-flex items-center gap-1 transition-all" title="حذف السجل نهائياً">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            <span>حذف 🗑️</span>
                          </button>
                        </div>
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
      console.error('Error loading records to edit:', err);
      container.innerHTML = `<div class="p-8 text-center text-rose-500 font-bold">فشل في تحميل السجلات: ${err.message}</div>`;
    }
  },

  openEditAttendanceModal(recordId) {
    const record = (this.currentEditableRecords || []).find(r => r.id === recordId);
    if (!record) {
      showToast('لم يتم العثور على السجل', 'danger');
      return;
    }

    const modal = document.getElementById('manual-edit-modal');
    if (!modal) return;

    const safeName = (record.full_name || '').replace(/'/g, "\\'");

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                <i data-lucide="clock" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">تعديل سجل حضور الموظف</h3>
                <p class="text-[11px] text-slate-400 font-semibold">${record.full_name} • يوم ${record.date}</p>
              </div>
            </div>
            <button onclick="document.getElementById('manual-edit-modal').innerHTML=''" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>

          <form onsubmit="event.preventDefault(); ManagerUI.saveEditedAttendance(${recordId});" class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">وقت الحضور الفعلي</label>
                <input type="time" id="edit-rec-checkin" value="${record.check_in_time || '09:00'}" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white" />
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">وقت الانصراف الفعلي</label>
                <input type="time" id="edit-rec-checkout" value="${record.check_out_time || '17:00'}" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white" />
              </div>
            </div>

            <div class="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <i data-lucide="calculator" class="w-4 h-4 flex-shrink-0"></i>
              <span>يتم احتساب حالة الحضور (منضبط / متأخر) وقيمة الخصم تلقائياً بواسطة المنظومة حسب وقت الحضور وفترة السماح المعتمدة.</span>
            </div>

            <div>
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" id="edit-rec-waive" checked class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                <span class="text-xs font-bold text-emerald-700 dark:text-emerald-400">إلغاء الخصم والتأخير (اعتماد حضور منضبط 0 دقيقة تأخير)</span>
              </label>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                سبب التعديل (اختياري)
              </label>
              <input type="text" id="edit-rec-reason" placeholder="مثال: تصحيح وقت تسجيل الحضور بناء على مراجعة المدير (اختياري)"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white" />
            </div>

            <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <button type="button" onclick="ManagerUI.deleteAttendanceRecord(${record.id}, '${safeName}', '${record.date}'); document.getElementById('manual-edit-modal').innerHTML='';"
                class="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold flex items-center gap-1 transition-all">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> حذف هذا السجل 🗑️
              </button>

              <div class="flex items-center gap-2">
                <button type="button" onclick="document.getElementById('manual-edit-modal').innerHTML=''" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                  إلغاء
                </button>
                <button type="submit" id="edit-rec-save-btn" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all">
                  حفظ التعديل وتحديث السجل
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  async saveEditedAttendance(recordId) {
    const checkin = document.getElementById('edit-rec-checkin')?.value;
    const checkout = document.getElementById('edit-rec-checkout')?.value;
    const waive = document.getElementById('edit-rec-waive')?.checked;
    const rawReason = document.getElementById('edit-rec-reason')?.value;
    const reason = (rawReason && rawReason.trim()) || 'تصحيح موعد الحضور بواسطة المدير';

    const btn = document.getElementById('edit-rec-save-btn');
    if (btn) btn.disabled = true;

    try {
      const res = await API.updateAttendance(recordId, {
        check_in_time: checkin || null,
        check_out_time: checkout || null,
        waive_deductions: waive,
        reason: reason
      });

      showToast(res.message || 'تم تحديث سجل الحضور بنجاح ✓', 'success');
      document.getElementById('manual-edit-modal').innerHTML = '';
      await this.loadRecordsToEdit();
    } catch (err) {
      showToast(err.message || 'فشل في تحديث سجل الحضور', 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ========================================================
  // 6. REPORTS & MONTHLY SUMMARY ("التقارير")
  // ========================================================
  async renderReportsSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="file-text" class="w-5 h-5 text-blue-600"></i> التقارير وسجل الحضور
            </h2>
            <p class="text-xs text-slate-500">استخراج تقارير الحضور وتصديرها بصيغة Excel / CSV</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button onclick="ManagerUI.switchSection('archive')" class="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center gap-1.5 border border-blue-200 dark:border-blue-800 transition-colors">
              <i data-lucide="coins" class="w-4 h-4"></i> مسير الرواتب وصافي القبض
            </button>
            <button onclick="ManagerUI.exportHistoryCsv()" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-2">
              <i data-lucide="download" class="w-4 h-4"></i> تصدير Excel / CSV
            </button>
            <button onclick="window.print()" class="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 no-print">
              <i data-lucide="printer" class="w-4 h-4"></i> طباعة
            </button>
          </div>
        </div>

        <div id="mgr-reports-container" class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          <div class="p-8 text-center text-slate-400 text-xs">جاري تحميل سجلات التقارير...</div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    await this.loadReportsData();
  },

  async loadReportsData() {
    const container = document.getElementById('mgr-reports-container');
    if (!container) return;

    try {
      const res = await API.getHistory();
      const records = res.records || [];

      if (records.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-500 text-xs">لا توجد سجلات حضور حتى الآن.</div>`;
        return;
      }

      container.innerHTML = `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th class="py-3 px-4">التاريخ</th>
                <th class="py-3 px-4">الموظف</th>
                <th class="py-3 px-4">الحضور</th>
                <th class="py-3 px-4">الانصراف</th>
                <th class="py-3 px-4">الحالة والتأخير</th>
                <th class="py-3 px-4 text-center">الخصم</th>
                <th class="py-3 px-4">ساعات العمل</th>
                <th class="py-3 px-4">المسافة</th>
                <th class="py-3 px-4">الصورة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${records.map(r => `
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td class="py-3 px-4 font-mono font-medium">${r.date}</td>
                  <td class="py-3 px-4">
                    <span class="font-bold text-slate-800 dark:text-slate-200 block">${r.full_name}</span>
                    <span class="text-[10px] text-slate-400 font-mono">${r.employee_code}</span>
                  </td>
                  <td class="py-3 px-4 font-mono">${formatTime12(r.check_in_time)}</td>
                  <td class="py-3 px-4 font-mono">${formatTime12(r.check_out_time)}</td>
                  <td class="py-3 px-4">
                    ${getStatusBadge(r.status)}
                    ${r.late_minutes > 0 ? `<span class="text-amber-500 text-[10px] block mt-0.5">تأخير: ${formatMinutesArabic(r.late_minutes)}</span>` : ''}
                  </td>
                  <td class="py-3 px-4 text-center font-bold font-mono">
                    ${r.estimated_deduction > 0 ? `<span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 text-[11px]">-${r.estimated_deduction} ج.م</span>` : `<span class="text-emerald-500 text-[11px]">0</span>`}
                  </td>
                  <td class="py-3 px-4 font-bold">${r.worked_hours || 0} س</td>
                  <td class="py-3 px-4">${r.check_in_distance ? `${r.check_in_distance}م` : '—'}</td>
                  <td class="py-3 px-4">
                    ${r.check_in_photo ? `
                      <button onclick="ManagerUI.openRecordInspectionModal(${JSON.stringify(r).replace(/"/g, '&quot;')})" class="text-blue-600 font-bold text-xs flex items-center gap-1">
                        عرض
                      </button>
                    ` : '—'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="p-8 text-center text-rose-500">${err.message}</div>`;
    }
  },

  async exportHistoryCsv() {
    window.open('/api/reports/export/csv', '_blank');
  },

  // ========================================================
  // 7. SETTINGS & DEDUCTIONS ("الإعدادات")
  // ========================================================
  async renderSettingsSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6 w-full">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="sliders" class="w-5 h-5 text-emerald-500"></i> الإعدادات والقواعد العامة
          </h2>
          <p class="text-xs text-slate-500">إدارة القواعد الأمنية، الخصومات التقديرية، والرقابة</p>
        </div>

        <form onsubmit="ManagerUI.saveCompanyRules(event)" class="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6 text-xs w-full">
          <div>
            <h3 class="font-bold text-sm text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800">
              قواعد التحقق والأمان
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <label class="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 cursor-pointer">
                <input type="checkbox" id="rule-req-checkout-photo" class="rounded text-blue-600 focus:ring-blue-500 w-4 h-4" />
                <div>
                  <span class="font-bold text-slate-800 dark:text-slate-200 block">طلب صورة عند الانصراف</span>
                  <span class="text-[11px] text-slate-500">إلزام الموظف بصورة سيلفي عند الخروج أيضاً</span>
                </div>
              </label>

              <label class="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 cursor-pointer">
                <input type="checkbox" id="rule-suspicious-ip" class="rounded text-blue-600 focus:ring-blue-500 w-4 h-4" />
                <div>
                  <span class="font-bold text-slate-800 dark:text-slate-200 block">مراقبة الـ IP المتكرر</span>
                  <span class="text-[11px] text-slate-500">تنبيه عند تسجيل عدة موظفين من نفس الجهاز</span>
                </div>
              </label>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <i data-lucide="coins" class="w-4 h-4 text-amber-500"></i> نظام شرائح خصم التأخير (بالجنيه المصري)
                </h3>
                <p class="text-[11px] text-slate-500 mt-0.5">حدد الوقت بالدقائق ومبلغ الخصم بالجنيه لكل شريحة</p>
              </div>
              <label class="flex items-center gap-2 cursor-pointer font-normal text-xs text-blue-600">
                <input type="checkbox" id="rule-enable-deductions" class="rounded text-blue-600 focus:ring-blue-500 w-4 h-4" />
                <span class="font-bold">تفعيل احتساب الخصومات</span>
              </label>
            </div>

            <!-- Tiers Explanation Notice -->
            <div class="mt-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
              <i data-lucide="info" class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"></i>
              <p class="leading-relaxed">
                <strong>نظام الشرائح غير تراكمي:</strong> عند تأخر الموظف، يتم تطبيق الشريحة الأعلى التي وصل إليها فقط وتمسح ما قبلها (مثلاً: إذا حددت 15 دقيقة بـ 25 ج و 25 دقيقة بـ 50 ج، وتأخر الموظف 25 دقيقة يُخصم منه <strong>50 ج فقط</strong> وليس 75 ج).
              </p>
            </div>

            <!-- Tiers List -->
            <div class="mt-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-slate-700 dark:text-slate-300">شرائح التأخير المقررة:</span>
                <button type="button" onclick="ManagerUI.addDelayTierRow()" class="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center gap-1.5 transition-colors">
                  <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> إضافة وقت جديد
                </button>
              </div>

              <div id="delay-tiers-container" class="space-y-2.5">
                <!-- Dynamic Tier Rows Rendered Here -->
              </div>
            </div>

            <!-- Absence & Fallback rates -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label class="block text-slate-500 mb-1 font-semibold">خصم يوم الغياب الكامل (جنيه مصري)</label>
                <div class="relative">
                  <input type="number" step="1" id="rule-absence-rate" placeholder="100" class="w-full pl-12 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold" />
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">ج.م</span>
                </div>
              </div>
              <div>
                <label class="block text-slate-500 mb-1 font-semibold">خصم نصف اليوم (جنيه مصري)</label>
                <div class="relative">
                  <input type="number" step="1" id="rule-half-day-rate" placeholder="50" class="w-full pl-12 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold" />
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">ج.م</span>
                </div>
              </div>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button type="submit" class="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5">
              <i data-lucide="check" class="w-4 h-4"></i>
              <span>حفظ القواعد والشرائح</span>
            </button>
          </div>
        </form>

        <!-- WhatsApp Notifications Settings Card -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6 text-xs w-full">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="message-circle" class="w-5 h-5 text-emerald-500"></i> إعدادات إشعارات الواتساب (WhatsApp Notifications)
              </h3>
              <p class="text-[11px] text-slate-500 mt-0.5">الربط الآلي لإرسال رسائل التأخير للموظفين، تقرير الصباح اليومي للمدير، وكشوف الرواتب الشهرية</p>
            </div>
            <label class="flex items-center gap-2 cursor-pointer font-normal text-xs text-emerald-600">
              <input type="checkbox" id="rule-whatsapp-enabled" class="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
              <span class="font-bold">تفعيل الواتساب</span>
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 cursor-pointer">
              <input type="checkbox" id="rule-whatsapp-auto-late" class="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200 block">إرسال تنبيه واتساب فوري عند التأخير</span>
                <span class="text-[11px] text-slate-500">إشعار الموظف بعدد دقائق التأخير وقيمة الخصم تلقائياً عند تسجيل الحضور</span>
              </div>
            </label>

            <div>
              <label class="block text-slate-500 mb-1 font-semibold">رقم واتساب المدير لتقرير الصباح:</label>
              <div class="relative">
                <input type="text" id="rule-whatsapp-mgr-phone" placeholder="01227580963" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs" />
              </div>
              <span class="text-[10px] text-slate-400 mt-1 block">يستلم عليه تقرير الحضور والغائبين والمتأخرين كل صباح</span>
            </div>
          </div>

          <!-- Provider Selection -->
          <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-4">
            <div>
              <label class="block text-slate-700 dark:text-slate-200 font-bold mb-2">طريقة الإرسال والربط (Gateway Provider):</label>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="wa-provider" value="direct" id="wa-prov-direct" checked onchange="ManagerUI.toggleWaApiFields()" class="text-emerald-600" />
                  <div>
                    <span class="font-bold block text-slate-800 dark:text-slate-200">روابط مباشرة (مجاناً)</span>
                    <span class="text-[10px] text-slate-400">فتح الواتساب بضغطة زر وبدون أي اشتراكات</span>
                  </div>
                </label>
                <label class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="wa-provider" value="ultramsg" id="wa-prov-ultramsg" onchange="ManagerUI.toggleWaApiFields()" class="text-emerald-600" />
                  <div>
                    <span class="font-bold block text-slate-800 dark:text-slate-200">UltraMsg API</span>
                    <span class="text-[10px] text-slate-400">إرسال خلفي تلقائي</span>
                  </div>
                </label>
                <label class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="wa-provider" value="custom" id="wa-prov-custom" onchange="ManagerUI.toggleWaApiFields()" class="text-emerald-600" />
                  <div>
                    <span class="font-bold block text-slate-800 dark:text-slate-200">بوابة مخصصة / Webhook</span>
                    <span class="text-[10px] text-slate-400">GreenAPI أو خادم خارجي</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- Optional API Fields -->
            <div id="wa-api-fields-container" class="hidden grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-emerald-500/20">
              <div>
                <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Instance ID / المعرف:</label>
                <input type="text" id="rule-wa-instance-id" placeholder="instanceXXXX" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs" />
              </div>
              <div>
                <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">API Token / رمز المصادقة:</label>
                <input type="password" id="rule-wa-token" placeholder="رمز التوكن الخاص بالبوابة" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs" />
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
            <button type="button" onclick="ManagerUI.testWhatsAppConnection()" class="py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-colors">
              <i data-lucide="send" class="w-4 h-4 text-emerald-500"></i>
              <span>إرسال رسالة تجريبية للاختبار 📲</span>
            </button>
            <button type="button" onclick="ManagerUI.saveWhatsAppSettings()" class="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all">
              <i data-lucide="check" class="w-4 h-4"></i>
              <span>حفظ إعدادات الواتساب</span>
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    try {
      const res = await API.getSettings();
      const s = res.settings || {};
      document.getElementById('rule-req-checkout-photo').checked = s.require_checkout_photo === '1';
      document.getElementById('rule-suspicious-ip').checked = s.suspicious_ip_detection === '1';
      document.getElementById('rule-enable-deductions').checked = s.enable_salary_deductions === '1';
      document.getElementById('rule-absence-rate').value = s.deduction_absence_rate || '100';
      document.getElementById('rule-half-day-rate').value = s.deduction_half_day_rate || '50';

      // Load WhatsApp Settings
      const waRes = await API.getWhatsAppSettings().catch(() => ({ settings: {} }));
      const wa = waRes.settings || {};
      const waEnabledEl = document.getElementById('rule-whatsapp-enabled');
      if (waEnabledEl) waEnabledEl.checked = wa.whatsapp_enabled === '1';
      const waAutoLateEl = document.getElementById('rule-whatsapp-auto-late');
      if (waAutoLateEl) waAutoLateEl.checked = wa.whatsapp_auto_late_alert === '1';
      const waPhoneEl = document.getElementById('rule-whatsapp-mgr-phone');
      if (waPhoneEl) waPhoneEl.value = wa.whatsapp_manager_phone || '';
      const waInstanceEl = document.getElementById('rule-wa-instance-id');
      if (waInstanceEl) waInstanceEl.value = wa.whatsapp_instance_id || '';
      const waTokenEl = document.getElementById('rule-wa-token');
      if (waTokenEl) waTokenEl.value = wa.whatsapp_api_token || '';

      const prov = wa.whatsapp_provider || 'direct';
      const radio = document.getElementById(`wa-prov-${prov}`);
      if (radio) radio.checked = true;
      this.toggleWaApiFields();

      // Load Delay Tiers
      const container = document.getElementById('delay-tiers-container');
      container.innerHTML = '';
      let tiers = [];
      try {
        if (s.delay_deduction_tiers) {
          tiers = JSON.parse(s.delay_deduction_tiers);
        }
      } catch (e) {
        tiers = [];
      }

      if (!Array.isArray(tiers) || tiers.length === 0) {
        // Default initial tiers: 15 mins -> 25 EGP, 25 mins -> 50 EGP
        tiers = [
          { minutes: 15, amount: 25 },
          { minutes: 25, amount: 50 }
        ];
      }

      tiers.forEach(t => this.addDelayTierRow(t.minutes, t.amount));
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  addDelayTierRow(minutes = '', amount = '') {
    const container = document.getElementById('delay-tiers-container');
    if (!container) return;
    const rowId = 'tier-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const div = document.createElement('div');
    div.id = rowId;
    div.className = 'flex items-center gap-2 sm:gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 tier-row';
    div.innerHTML = `
      <div class="flex-1">
        <label class="block text-[11px] text-slate-500 mb-1 font-medium">إذا تأخر الموظف (بالدقائق):</label>
        <div class="relative">
          <input type="number" min="1" step="1" value="${minutes}" placeholder="مثال: 15" required class="tier-minutes w-full pl-12 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold font-mono focus:ring-2 focus:ring-blue-500" />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">دقيقة</span>
        </div>
      </div>
      <div class="flex-1">
        <label class="block text-[11px] text-slate-500 mb-1 font-medium">قيمة الخصم المالي:</label>
        <div class="relative">
          <input type="number" min="0" step="1" value="${amount}" placeholder="مثال: 25" required class="tier-amount w-full pl-12 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold font-mono focus:ring-2 focus:ring-blue-500 text-rose-600 dark:text-rose-400" />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">جنيه</span>
        </div>
      </div>
      <div class="pt-5 flex-shrink-0">
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors" title="حذف الشريحة">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
    container.appendChild(div);
    if (window.lucide) lucide.createIcons();
  },

  async saveCompanyRules(e) {
    e.preventDefault();

    // Collect delay deduction tiers
    const tierRows = document.querySelectorAll('#delay-tiers-container .tier-row');
    const tiers = [];
    tierRows.forEach(row => {
      const minInput = row.querySelector('.tier-minutes');
      const amtInput = row.querySelector('.tier-amount');
      if (minInput && amtInput) {
        const min = parseInt(minInput.value, 10);
        const amt = parseFloat(amtInput.value);
        if (!isNaN(min) && !isNaN(amt)) {
          tiers.push({ minutes: min, amount: amt });
        }
      }
    });

    // Sort ascending by minutes
    tiers.sort((a, b) => a.minutes - b.minutes);

    const data = {
      require_checkout_photo: document.getElementById('rule-req-checkout-photo').checked ? '1' : '0',
      suspicious_ip_detection: document.getElementById('rule-suspicious-ip').checked ? '1' : '0',
      enable_salary_deductions: document.getElementById('rule-enable-deductions').checked ? '1' : '0',
      deduction_absence_rate: document.getElementById('rule-absence-rate').value || '100',
      deduction_half_day_rate: document.getElementById('rule-half-day-rate').value || '50',
      delay_deduction_tiers: JSON.stringify(tiers),
      currency_symbol: 'ج.م'
    };

    this.showApplyScopeModal({
      title: 'تطبيق شرائح وقواعد الخصومات الجديدة',
      onConfirm: async (selectedScope) => {
        data.apply_scope = selectedScope;
        try {
          const res = await API.updateCompanySettings(data);
          showToast(res.message || 'تم حفظ وتحديث قواعد وإعدادات المنظومة بنجاح', 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        }
      }
    });
  },

  // Inspection Modal
  // Inspection Modal (Dual Check-In & Check-Out Tracking)
  openRecordInspectionModal(record) {
    const modal = document.getElementById('record-inspect-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="map-pin" class="w-5 h-5 text-emerald-500"></i>
                تفاصيل توثيق الحضور والانصراف: ${record.full_name}
              </h3>
              <span class="text-xs text-slate-400 font-mono">${record.date} • الحالة: ${record.status || 'حاضر'}</span>
            </div>
            <button onclick="document.getElementById('record-inspect-modal').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="pt-4 space-y-4 overflow-y-auto pr-1">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Card 1: Check-In Details -->
              <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                <div class="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700">
                  <span class="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <i data-lucide="log-in" class="w-4 h-4"></i> تسجيل الحضور
                  </span>
                  <span class="font-mono font-bold text-slate-900 dark:text-white text-xs">${formatTime12(record.check_in_time)}</span>
                </div>

                <div>
                  <span class="text-[11px] text-slate-500 block mb-1 font-semibold">صورة إثبات الحضور:</span>
                  ${record.check_in_photo ? `
                    <img src="${record.check_in_photo}" class="w-full h-44 rounded-xl object-cover bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-inner" />
                  ` : `
                    <div class="w-full h-32 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                      لا توجد صورة حضور
                    </div>
                  `}
                </div>

                <div class="space-y-1.5 pt-1 text-[11px]">
                  <div class="flex justify-between">
                    <span class="text-slate-500">المسافة عن المقر:</span>
                    <strong class="text-slate-800 dark:text-white font-mono">${record.check_in_distance !== null && record.check_in_distance !== undefined ? record.check_in_distance + ' متر' : '—'}</strong>
                  </div>
                  ${record.check_in_lat ? `
                    <div class="flex justify-between items-center">
                      <span class="text-slate-500">إحداثيات GPS:</span>
                      <a href="https://www.google.com/maps?q=${record.check_in_lat},${record.check_in_lng}" target="_blank" class="text-blue-500 hover:underline font-mono inline-flex items-center gap-1">
                        ${record.check_in_lat.toFixed(4)}, ${record.check_in_lng.toFixed(4)} ↗
                      </a>
                    </div>
                  ` : ''}
                  ${record.late_minutes > 0 ? `
                    <div class="p-2 rounded-lg bg-amber-500/10 text-amber-500 font-bold text-[11px]">
                      تأخير عن موعد العمل: ${formatMinutesArabic(record.late_minutes)}
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- Card 2: Check-Out Details -->
              <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                <div class="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700">
                  <span class="font-extrabold text-sm text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <i data-lucide="log-out" class="w-4 h-4"></i> تسجيل الانصراف
                  </span>
                  <span class="font-mono font-bold text-slate-900 dark:text-white text-xs">${record.check_out_time ? formatTime12(record.check_out_time) : 'قيد العمل'}</span>
                </div>

                <div>
                  <span class="text-[11px] text-slate-500 block mb-1 font-semibold">صورة إثبات الانصراف:</span>
                  ${record.check_out_photo ? `
                    <img src="${record.check_out_photo}" class="w-full h-44 rounded-xl object-cover bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-inner" />
                  ` : `
                    <div class="w-full h-44 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                      <i data-lucide="${record.check_out_time ? 'check-circle' : 'clock'}" class="w-8 h-8 mb-2 ${record.check_out_time ? 'text-emerald-500' : 'text-slate-500'}"></i>
                      <span>${record.check_out_time ? 'تم تسجيل الانصراف بدون صورة إضافية' : 'الموظف لم يقم بتسجيل الانصراف بعد'}</span>
                    </div>
                  `}
                </div>

                <div class="space-y-1.5 pt-1 text-[11px]">
                  <div class="flex justify-between">
                    <span class="text-slate-500">المسافة عند الانصراف:</span>
                    <strong class="text-slate-800 dark:text-white font-mono">${record.check_out_distance !== null && record.check_out_distance !== undefined ? record.check_out_distance + ' متر' : '—'}</strong>
                  </div>
                  ${record.check_out_lat ? `
                    <div class="flex justify-between items-center">
                      <span class="text-slate-500">إحداثيات موقع الانصراف:</span>
                      <a href="https://www.google.com/maps?q=${record.check_out_lat},${record.check_out_lng}" target="_blank" class="text-purple-500 hover:underline font-mono inline-flex items-center gap-1">
                        ${record.check_out_lat.toFixed(4)}, ${record.check_out_lng.toFixed(4)} ↗
                      </a>
                    </div>
                  ` : ''}
                  ${record.early_leave_minutes > 0 ? `
                    <div class="p-2 rounded-lg bg-purple-500/10 text-purple-400 font-bold text-[11px]">
                      انصراف مبكر قبل نهاية الدوام: ${formatMinutesArabic(record.early_leave_minutes)}
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- Total Worked Hours Summary Bar -->
            <div class="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/90 flex items-center justify-between font-semibold">
              <span class="text-slate-600 dark:text-slate-300">ساعات العمل المعتمدة لهذا اليوم:</span>
              <span class="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm">${record.worked_hours || 0} ساعة</span>
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  // Modal: Employee Full Statistics & Attendance Track Record (With Month Picker, Advances & Bonuses)
  async openEmployeeStatsModal(employeeId, employeeName, selectedMonth = null) {
    const modal = document.getElementById('employee-stats-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs max-h-[92vh] flex flex-col">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="bar-chart-3" class="w-5 h-5 text-emerald-500"></i>
                إحصائيات وسجل التزام: ${employeeName || 'الموظف'}
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">تفاصيل الحضور، التأخير، الخصومات، السلف المعتمدة، المكافآت، وصافي القبض</p>
            </div>
            <button onclick="document.getElementById('employee-stats-modal').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="py-12 text-center text-slate-400" id="emp-stats-content">
            <div class="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            جاري تحليل وسحب سجلات الموظف والبيانات المالية...
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    try {
      const res = await API.getEmployeeStats(employeeId, selectedMonth);
      const s = res.stats || {};
      const emp = res.employee || {};
      const records = res.recentRecords || [];
      const advances = res.advances || [];
      const bonuses = res.bonuses || [];
      const availMonths = res.availableMonths || [];
      const activeMonth = res.selectedMonth || res.currentMonth;

      const content = document.getElementById('emp-stats-content');
      if (!content) return;

      const baseSalary = parseFloat(s.baseSalary || emp.base_salary || 3000);
      const totalBonuses = parseFloat(s.totalBonuses || 0);
      const totalAdvances = parseFloat(s.totalAdvances || 0);
      const totalLateDeductions = parseFloat(s.totalLateDeductions || 0);
      const totalAbsenceDeductions = parseFloat(s.totalAbsenceDeductions || 0);
      const totalDeductions = parseFloat(s.totalDeductions || (totalLateDeductions + totalAbsenceDeductions));
      const netSalary = s.netSalary !== undefined ? s.netSalary : Math.max(0, baseSalary + totalBonuses - totalDeductions - totalAdvances);

      content.innerHTML = `
        <div class="space-y-5 overflow-y-auto pr-1 max-h-[78vh] text-right">
          <!-- Quick Profile Bar, Month Filter & Quick Financial Actions -->
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <img src="${emp.profile_photo || '/uploads/avatar.svg'}" class="w-12 h-12 rounded-2xl object-cover bg-slate-200 dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600" />
              <div>
                <span class="font-extrabold text-sm text-slate-900 dark:text-white block">${emp.full_name}</span>
                <span class="text-[11px] text-slate-400 font-mono">${emp.employee_code} • ${emp.job_title || 'موظف'} (${emp.department_name || 'عام'})</span>
              </div>
            </div>

            <!-- Month Switcher & Direct Actions -->
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <label class="text-[11px] text-slate-400 font-bold whitespace-nowrap">الشهر:</label>
                <select onchange="ManagerUI.openEmployeeStatsModal(${employeeId}, '${(emp.full_name || '').replace(/'/g, "\\'")}', this.value)"
                  class="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none">
                  ${availMonths.map(m => `
                    <option value="${m}" ${m === activeMonth ? 'selected' : ''}>
                      📅 ${m === res.currentMonth ? `${m} (الشهر الحالي)` : m}
                    </option>
                  `).join('')}
                  <option value="all" ${activeMonth === 'all' ? 'selected' : ''}>جميع الشهور (تراكمي)</option>
                </select>
              </div>

              <button onclick="ManagerUI.openAddBonusModal(${employeeId}, '${activeMonth}')"
                class="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs" title="إضافة مكافأة للموظف">
                <i data-lucide="gift" class="w-3.5 h-3.5"></i> + مكافأة
              </button>
              <button onclick="ManagerUI.openAddAdvanceModal(${employeeId}, '${activeMonth}')"
                class="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs" title="تسجيل سلفة للموظف">
                <i data-lucide="hand-coins" class="w-3.5 h-3.5"></i> + سلفة
              </button>
              <button onclick="ManagerUI.printPayslip(${employeeId}, '${activeMonth}')"
                class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs" title="طباعة قسيمة الراتب">
                <i data-lucide="printer" class="w-3.5 h-3.5"></i> قسيمة الراتب 📄
              </button>
            </div>
          </div>

          <!-- Attendance Commitment Metrics (4 Cards) -->
          <div>
            <h4 class="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <i data-lucide="activity" class="w-4 h-4 text-blue-500"></i> مؤشرات الانضباط والالتزام بالدوام:
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <!-- Late Days -->
              <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-right">
                <span class="text-[11px] font-bold text-amber-500 block">أيام التأخير</span>
                <div class="flex items-baseline gap-1 mt-1">
                  <span class="text-2xl font-extrabold text-amber-500 font-mono">${s.lateDays || 0}</span>
                  <span class="text-[11px] text-amber-500/80">يوم</span>
                </div>
                <span class="text-[10px] text-amber-600 dark:text-amber-400 block mt-1 font-semibold">إجمالي: ${formatMinutesArabic(s.totalLateMinutes)}</span>
              </div>

              <!-- Early Leave Days -->
              <div class="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-right">
                <span class="text-[11px] font-bold text-purple-400 block">أيام الخروج المبكر</span>
                <div class="flex items-baseline gap-1 mt-1">
                  <span class="text-2xl font-extrabold text-purple-400 font-mono">${s.earlyLeaveDays || 0}</span>
                  <span class="text-[11px] text-purple-400/80">يوم</span>
                </div>
                <span class="text-[10px] text-purple-400 block mt-1 font-semibold">إجمالي: ${formatMinutesArabic(s.totalEarlyLeaveMinutes || s.totalEarlyMinutes)}</span>
              </div>

              <!-- Absent Days -->
              <div class="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-right">
                <span class="text-[11px] font-bold text-rose-400 block">أيام الغياب</span>
                <div class="flex items-baseline gap-1 mt-1">
                  <span class="text-2xl font-extrabold text-rose-400 font-mono">${s.absentDays || 0}</span>
                  <span class="text-[11px] text-rose-400/80">يوم</span>
                </div>
                <span class="text-[10px] text-rose-400 block mt-1">غياب غير مسجل</span>
              </div>

              <!-- On-Time Days -->
              <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-right">
                <span class="text-[11px] font-bold text-emerald-400 block">حضور في الموعد</span>
                <div class="flex items-baseline gap-1 mt-1">
                  <span class="text-2xl font-extrabold text-emerald-400 font-mono">${s.onTimeDays || 0}</span>
                  <span class="text-[11px] text-emerald-400/80">يوم</span>
                </div>
                <span class="text-[10px] text-emerald-400 block mt-1">حضور كلي: ${s.presentDays || 0} يوم</span>
              </div>
            </div>
          </div>

          <!-- Comprehensive Financial & Payroll Breakdown Cards (5 Cards) -->
          <div>
            <h4 class="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <i data-lucide="coins" class="w-4 h-4 text-emerald-500"></i> الحساب المالي ومسير الراتب والسلف (${activeMonth}):
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-right">
              <!-- Base Salary -->
              <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <span class="text-[11px] text-slate-500 dark:text-slate-400 font-bold block">المرتب الأساسي</span>
                <span class="font-extrabold text-slate-900 dark:text-white font-mono text-base mt-1 block">${baseSalary.toLocaleString('ar-EG')} ج.م</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">الراتب المتفق عليه</span>
              </div>

              <!-- Bonuses (+) -->
              <div class="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                <span class="text-[11px] text-purple-600 dark:text-purple-400 font-bold block">المكافآت (+)</span>
                <span class="font-extrabold text-purple-600 dark:text-purple-400 font-mono text-base mt-1 block">+${totalBonuses.toLocaleString('ar-EG')} ج.م</span>
                <span class="text-[10px] text-purple-500/80 block mt-0.5 font-semibold">${bonuses.length} مكافأة معتمدة 🎁</span>
              </div>

              <!-- Deductions (-) -->
              <div class="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <span class="text-[11px] text-rose-500 dark:text-rose-400 font-bold block">خصومات الدوام (-)</span>
                <span class="font-extrabold text-rose-600 dark:text-rose-400 font-mono text-base mt-1 block">-${totalDeductions.toLocaleString('ar-EG')} ج.م</span>
                <span class="text-[10px] text-rose-500/80 block mt-0.5 font-mono">تأخير: ${totalLateDeductions} • غياب: ${totalAbsenceDeductions}</span>
              </div>

              <!-- Advances (-) -->
              <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <span class="text-[11px] text-amber-600 dark:text-amber-400 font-bold block">السلف والمسحوبات (-)</span>
                <span class="font-extrabold text-amber-600 dark:text-amber-400 font-mono text-base mt-1 block">-${totalAdvances.toLocaleString('ar-EG')} ج.م</span>
                <span class="text-[10px] text-amber-600/80 dark:text-amber-400/80 block mt-0.5 font-semibold">${advances.filter(a => a.status === 'approved').length} سلفة معتمدة 💸</span>
              </div>

              <!-- Net Salary (=) -->
              <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 col-span-2 sm:col-span-1">
                <span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block">صافي القبض المستحق</span>
                <span class="font-black text-emerald-600 dark:text-emerald-400 font-mono text-lg mt-1 block">${netSalary.toLocaleString('ar-EG')} ج.م</span>
                <span class="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block mt-0.5 font-semibold">المبلغ النهائي بعد التسوية</span>
              </div>
            </div>
          </div>

          <!-- Bonuses Detail Section (If any) -->
          ${bonuses.length > 0 ? `
            <div class="border border-purple-200 dark:border-purple-900/40 rounded-2xl overflow-hidden bg-purple-50/20 dark:bg-purple-950/10">
              <div class="p-2.5 bg-purple-50/80 dark:bg-purple-900/30 border-b border-purple-200 dark:border-purple-800/40 flex items-center justify-between">
                <span class="font-bold text-xs text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <i data-lucide="gift" class="w-4 h-4 text-purple-500"></i> تفاصيل المكافآت والحوافز (${bonuses.length}):
                </span>
                <span class="text-[11px] font-bold font-mono text-purple-600 dark:text-purple-400">+${totalBonuses.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div class="divide-y divide-purple-100 dark:divide-purple-900/30 p-2 space-y-1">
                ${bonuses.map(b => `
                  <div class="flex items-center justify-between py-1.5 px-2 hover:bg-purple-100/30 rounded-xl transition-colors">
                    <div>
                      <span class="font-bold text-slate-800 dark:text-slate-200 text-xs block">🎁 ${b.reason}</span>
                      <span class="text-[10px] text-slate-400 font-mono">${b.date} • شهر: ${b.month}</span>
                    </div>
                    <span class="font-mono font-bold text-purple-600 dark:text-purple-400 text-xs">+${parseFloat(b.amount).toLocaleString('ar-EG')} ج.م</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Advances Detail Section (If any) -->
          ${advances.length > 0 ? `
            <div class="border border-amber-200 dark:border-amber-900/40 rounded-2xl overflow-hidden bg-amber-50/20 dark:bg-amber-950/10">
              <div class="p-2.5 bg-amber-50/80 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800/40 flex items-center justify-between">
                <span class="font-bold text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <i data-lucide="hand-coins" class="w-4 h-4 text-amber-500"></i> تفاصيل السلف والمسحوبات (${advances.length}):
                </span>
                <span class="text-[11px] font-bold font-mono text-amber-600 dark:text-amber-400">-${totalAdvances.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div class="divide-y divide-amber-100 dark:divide-amber-900/30 p-2 space-y-1">
                ${advances.map(a => {
                  const statusBadge = a.status === 'approved'
                    ? '<span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">معتمدة ومخصومة ✓</span>'
                    : (a.status === 'rejected'
                      ? '<span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-bold">مرفوضة ✗</span>'
                      : '<span class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-bold">قيد المراجعة ⏳</span>');
                  return `
                    <div class="flex items-center justify-between py-1.5 px-2 hover:bg-amber-100/30 rounded-xl transition-colors">
                      <div>
                        <div class="flex items-center gap-1.5">
                          <span class="font-bold text-slate-800 dark:text-slate-200 text-xs">💸 ${a.reason || 'سلفة على الراتب'}</span>
                          ${statusBadge}
                        </div>
                        <span class="text-[10px] text-slate-400 font-mono">${a.date} (شهر: ${a.month})</span>
                      </div>
                      <span class="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">-${parseFloat(a.amount).toLocaleString('ar-EG')} ج.م</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Recent Attendance History Table -->
          <div>
            <h4 class="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <i data-lucide="calendar" class="w-4 h-4 text-emerald-500"></i> سجل أيام الحضور والانصراف والخصم (${activeMonth}):
            </h4>
            ${records.length === 0 ? `
              <div class="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-2xl">
                لا توجد سجلات حضور مسجلة لهذا الموظف في هذا الشهر.
              </div>
            ` : `
              <div class="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <table class="w-full text-right text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-400 uppercase font-semibold">
                    <tr>
                      <th class="py-2.5 px-3">التاريخ</th>
                      <th class="py-2.5 px-3">الحضور</th>
                      <th class="py-2.5 px-3">الانصراف</th>
                      <th class="py-2.5 px-3">الحالة والتأخير</th>
                      <th class="py-2.5 px-3 text-center">الخصم المطبق</th>
                      <th class="py-2.5 px-3">ساعات العمل</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    ${records.map(rec => `
                      <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td class="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-sans font-bold">${rec.date}</td>
                        <td class="py-2.5 px-3">${formatTime12(rec.check_in_time)}</td>
                        <td class="py-2.5 px-3">${formatTime12(rec.check_out_time)}</td>
                        <td class="py-2.5 px-3 font-sans">
                          ${getStatusBadge(rec.status)}
                          ${rec.late_minutes > 0 ? `<span class="text-amber-500 text-[10px] block mt-0.5">تأخير: ${formatMinutesArabic(rec.late_minutes)}</span>` : ''}
                          ${rec.early_leave_minutes > 0 ? `<span class="text-purple-400 text-[10px] block mt-0.5">انصراف مبكر: ${formatMinutesArabic(rec.early_leave_minutes)}</span>` : ''}
                        </td>
                        <td class="py-2.5 px-3 text-center font-bold font-mono">
                          ${rec.estimated_deduction > 0 ? `
                            <span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 text-[11px]">-${rec.estimated_deduction} ج.م</span>
                          ` : `<span class="text-emerald-500 text-[11px]">0</span>`}
                        </td>
                        <td class="py-2.5 px-3 font-bold">${rec.worked_hours || 0} س</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      const content = document.getElementById('emp-stats-content');
      if (content) content.innerHTML = `<div class="p-4 text-center text-rose-500">${err.message}</div>`;
    }
  },

  // ========================================================
  // 6.5 MONTHLY ARCHIVE & SEPARATION ("أرشيف الشهور")
  // ========================================================
  async renderMonthlyArchiveSection(selectedMonth = null) {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="calendar-range" class="w-5 h-5 text-emerald-500"></i> أرشيف وتقارير الشهور
            </h2>
            <p class="text-xs text-slate-500">متابعة إحصائيات كل شهر بشكل مستقل وتصفير البيانات تلقائياً لكل دورة عمل شهرية</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap" id="mgr-archive-actions-bar">
            <div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>

        <div id="mgr-archive-main-container" class="space-y-6">
          <div class="p-12 text-center text-slate-400">جاري تحميل بيانات أرشيف الشهور...</div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    try {
      const monthsRes = await API.getAvailableMonths();
      const months = monthsRes.months || [];
      const currentMonth = monthsRes.currentMonth || '';
      const targetMonth = selectedMonth || currentMonth;

      // Update action bar with Month Picker, Bonus, Advances, and Export buttons
      const actionsBar = document.getElementById('mgr-archive-actions-bar');
      if (actionsBar) {
        actionsBar.innerHTML = `
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300">الشهر:</label>
            <select id="archive-month-select" onchange="ManagerUI.renderMonthlyArchiveSection(this.value)"
              class="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500">
              ${months.map(m => `
                <option value="${m.value}" ${m.value === targetMonth ? 'selected' : ''}>
                  📅 ${m.label}
                </option>
              `).join('')}
            </select>
          </div>
          <button onclick="ManagerUI.openAddBonusModal(null, '${targetMonth}')"
            class="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 flex items-center gap-1.5 transition-all">
            <i data-lucide="gift" class="w-4 h-4"></i> + إضافة مكافأة
          </button>
          <button onclick="ManagerUI.openBonusesManagementModal('${targetMonth}')"
            class="px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold flex items-center gap-1.5 transition-all">
            <i data-lucide="award" class="w-4 h-4"></i> إدارة وحذف المكافآت
          </button>
          <button onclick="ManagerUI.openAdvancesManagementModal('${targetMonth}')"
            class="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all">
            <i data-lucide="hand-coins" class="w-4 h-4"></i> إدارة وحذف ومراجعة السلف
          </button>
          <button onclick="window.open('/api/reports/export/csv?date_from=${targetMonth}-01&date_to=${targetMonth}-31', '_blank')"
            class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all">
            <i data-lucide="download" class="w-4 h-4"></i> تصدير Excel
          </button>
        `;
      }

      // Fetch summary for targetMonth
      const summaryRes = await API.getMonthlySummary({ month: targetMonth });
      const summaries = summaryRes.summaries || [];

      // Calculate totals across all employees for this month
      let totalLateMinsCompany = 0;
      let totalEarlyMinsCompany = 0;
      let totalAbsentCompany = 0;
      let totalWorkedHoursCompany = 0;
      let totalDeductionsCompany = 0;
      let totalBaseSalariesCompany = 0;
      let totalBonusesCompany = 0;
      let totalAdvancesCompany = 0;
      let totalNetSalariesCompany = 0;

      summaries.forEach(s => {
        totalLateMinsCompany += (s.totalLateMinutes || 0);
        totalEarlyMinsCompany += (s.totalEarlyLeaveMinutes || 0);
        totalAbsentCompany += (s.absentDays || 0);
        totalWorkedHoursCompany += (s.totalWorkedHours || 0);
        totalDeductionsCompany += (s.totalDeductions || 0);
        totalBaseSalariesCompany += (s.baseSalary || 3000);
        totalBonusesCompany += (s.totalBonuses || 0);
        totalAdvancesCompany += (s.totalAdvances || 0);
        totalNetSalariesCompany += (s.netSalary !== undefined ? s.netSalary : Math.max(0, (s.baseSalary || 3000) + (s.totalBonuses || 0) - (s.totalDeductions || 0) - (s.totalAdvances || 0)));
      });

      const mainContainer = document.getElementById('mgr-archive-main-container');
      if (!mainContainer) return;

      const activeMonthObj = months.find(m => m.value === targetMonth) || { label: targetMonth };

      mainContainer.innerHTML = `
        <!-- Month Payroll & Attendance Executive Stat Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div class="p-3.5 sm:p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-right">
            <span class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold block">المرتبات الأساسية</span>
            <span class="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-1 block font-mono">${totalBaseSalariesCompany.toLocaleString('ar-EG')} ج.م</span>
            <span class="text-[10px] text-slate-400 mt-0.5 block">${summaries.length} موظف</span>
          </div>

          <div class="p-3.5 sm:p-4 rounded-3xl bg-purple-500/10 border border-purple-500/20 shadow-sm text-right">
            <span class="text-[11px] sm:text-xs text-purple-600 dark:text-purple-400 font-bold block">المكافآت والحوافز</span>
            <span class="text-lg sm:text-xl font-black text-purple-600 dark:text-purple-400 mt-1 block font-mono">+${totalBonusesCompany.toLocaleString('ar-EG')} ج.م</span>
            <span class="text-[10px] text-purple-400/80 mt-0.5 block font-semibold">حوافز شهرية 🎁</span>
          </div>

          <div class="p-3.5 sm:p-4 rounded-3xl bg-rose-500/10 border border-rose-500/20 shadow-sm text-right">
            <span class="text-[11px] sm:text-xs text-rose-500 font-bold block">خصومات (تأخير+غياب)</span>
            <span class="text-lg sm:text-xl font-black text-rose-500 mt-1 block font-mono">-${totalDeductionsCompany.toLocaleString('ar-EG')} ج.م</span>
            <span class="text-[10px] text-rose-400 mt-0.5 block font-mono truncate">تأخير: ${formatMinutesArabic(totalLateMinsCompany)}</span>
          </div>

          <div class="p-3.5 sm:p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 shadow-sm text-right">
            <span class="text-[11px] sm:text-xs text-amber-600 dark:text-amber-400 font-bold block">السلف والمسحوبات</span>
            <span class="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400 mt-1 block font-mono">-${totalAdvancesCompany.toLocaleString('ar-EG')} ج.م</span>
            <span class="text-[10px] text-amber-500/80 mt-0.5 block font-semibold">سلف معتمدة 💸</span>
          </div>

          <div class="p-3.5 sm:p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 shadow-sm text-right">
            <span class="text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-bold block">صافي مسيرات الرواتب</span>
            <span class="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block font-mono">${totalNetSalariesCompany.toLocaleString('ar-EG')} ج.م</span>
            <span class="text-[10px] text-emerald-500/80 mt-0.5 block font-semibold">المبلغ المستحق للصرف</span>
          </div>

          <div class="p-3.5 sm:p-4 rounded-3xl bg-blue-500/10 border border-blue-500/20 shadow-sm text-right">
            <span class="text-[11px] sm:text-xs text-blue-500 font-bold block">ساعات العمل</span>
            <span class="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400 mt-1 block font-mono">${totalWorkedHoursCompany.toFixed(1)} س</span>
            <span class="text-[10px] text-blue-400/80 mt-0.5 block">خلال ${activeMonthObj.label}</span>
          </div>
        </div>

        <!-- Note about automatic monthly rollover -->
        <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-between text-xs font-semibold">
          <div class="flex items-center gap-2.5">
            <i data-lucide="info" class="w-4 h-4 flex-shrink-0"></i>
            <span>نظام الرواتب الذكي: يتم احتساب صافي القبض وفق المعادلة: <strong>(المرتب الأساسي + المكافآت - خصومات التأخير والغياب - السلف المعتمدة)</strong>.</span>
          </div>
        </div>

        <!-- Employees Month Archive & Payroll Table -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="coins" class="w-4 h-4 text-emerald-500"></i>
                مسير رواتب وكشف حساب الموظفين لشهر: <span class="text-emerald-500 font-bold">${activeMonthObj.label}</span>
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">تفاصيل المرتب الأساسي، المكافآت، الخصومات بالشرائح، السلف، وصافي القبض مع طباعة قسيمة الراتب</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button onclick="ManagerUI.sendAllPayslipsWhatsApp('${targetMonth}')"
                class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 transition-all">
                <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                <span>إرسال الرواتب للجميع عبر واتساب 📲</span>
              </button>
              <span class="text-xs text-slate-400 font-mono">${summaries.length} موظف مسجل</span>
            </div>
          </div>

          ${summaries.length === 0 ? `
            <div class="p-12 text-center text-slate-500 text-xs">لا توجد سجلات للموظفين في هذا الشهر.</div>
          ` : `
            <div class="overflow-x-auto lg:overflow-x-visible">
              <table class="w-full text-right text-xs min-w-[680px] lg:min-w-0">
                <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold uppercase border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th class="py-3 px-3">الموظف</th>
                    <th class="py-3 px-2 text-center">المرتب الأساسي</th>
                    <th class="py-3 px-2 text-center">الحضور</th>
                    <th class="py-3 px-2.5">التأخير (الشرائح)</th>
                    <th class="py-3 px-2 text-center">الغياب</th>
                    <th class="py-3 px-2 text-center">المكافآت (+)</th>
                    <th class="py-3 px-2 text-center">السلف (-)</th>
                    <th class="py-3 px-2 text-center">صافي القبض</th>
                    <th class="py-3 px-3 text-center">الإجراءات والطباعة</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  ${summaries.map(s => {
                    const baseSal = s.baseSalary || 3000;
                    const netSal = s.netSalary !== undefined ? s.netSalary : Math.max(0, baseSal + (s.totalBonuses || 0) - (s.totalDeductions || 0) - (s.totalAdvances || 0));
                    return `
                    <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td class="py-3 px-3">
                        <div class="flex items-center gap-2.5">
                          <img src="${s.employee.profile_photo || '/uploads/avatar.svg'}" class="w-8 h-8 rounded-full object-cover bg-slate-100 dark:bg-slate-800 flex-shrink-0" />
                          <div class="min-w-0">
                            <span class="font-bold text-slate-800 dark:text-slate-200 block truncate">${s.employee.full_name}</span>
                            <span class="text-[10px] text-slate-400 font-mono block">${s.employee.employee_code} • ${s.employee.job_title || s.employee.department_name || 'موظف'}</span>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-2 text-center font-bold text-slate-700 dark:text-slate-300 font-mono whitespace-nowrap">
                        ${baseSal.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td class="py-3 px-2 text-center font-bold text-emerald-600 dark:text-emerald-400 font-mono whitespace-nowrap">
                        ${s.presentDays || s.onTimeDays} يوم
                      </td>
                      <td class="py-3 px-2.5">
                        ${s.lateDays > 0 ? `
                          <div>
                            <span class="font-bold text-amber-500 block text-[11px]">${s.lateDays}ي (${formatMinutesArabic(s.totalLateMinutes)})</span>
                            <span class="text-[10px] text-rose-500 font-semibold font-mono">خصم: ${(s.totalLateDeductions || 0).toLocaleString('ar-EG')} ج.م</span>
                          </div>
                        ` : '<span class="text-emerald-500 font-bold text-[11px]">لا يوجد ✓</span>'}
                      </td>
                      <td class="py-3 px-2 text-center">
                        ${s.absentDays > 0 ? `
                          <div>
                            <span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 font-bold font-mono text-[11px]">${s.absentDays} يوم</span>
                            ${s.totalAbsenceDeductions > 0 ? `<span class="text-[10px] text-rose-400 block font-mono mt-0.5">-${(s.totalAbsenceDeductions).toLocaleString('ar-EG')} ج.م</span>` : ''}
                          </div>
                        ` : '<span class="text-emerald-500 font-bold text-[11px]">0</span>'}
                      </td>
                      <td class="py-3 px-2 text-center whitespace-nowrap">
                        ${(s.totalBonuses || 0) > 0 ? `
                          <button type="button" onclick="ManagerUI.openBonusesManagementModal('${targetMonth}')"
                            class="px-2 py-0.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold font-mono text-[11px] transition-all cursor-pointer" title="عرض وحذف مكافآت الموظفين">
                            +${s.totalBonuses.toLocaleString('ar-EG')} ج.م
                          </button>
                        ` : `<span class="text-slate-400 font-mono text-[11px]">0</span>`}
                      </td>
                      <td class="py-3 px-2 text-center whitespace-nowrap">
                        ${(s.totalAdvances || 0) > 0 ? `
                          <button type="button" onclick="ManagerUI.openAdvancesManagementModal('${targetMonth}')"
                            class="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold font-mono text-[11px] transition-all cursor-pointer" title="عرض وحذف سلف الموظفين">
                            -${s.totalAdvances.toLocaleString('ar-EG')} ج.م
                          </button>
                        ` : `<span class="text-slate-400 font-mono text-[11px]">0</span>`}
                      </td>
                      <td class="py-3 px-2 text-center whitespace-nowrap">
                        <span class="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black font-mono text-xs sm:text-sm border border-emerald-500/25 inline-block">
                          ${netSal.toLocaleString('ar-EG')} ج.م
                        </span>
                      </td>
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        <div class="flex items-center justify-center gap-1.5">
                          <button onclick="ManagerUI.openEmployeeMonthDetailsModal(${s.employee.id}, '${targetMonth}')"
                            class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold inline-flex items-center gap-1 transition-all" title="كشف الحساب وسجل الأيام">
                            <i data-lucide="receipt" class="w-3.5 h-3.5 text-emerald-500"></i>
                            <span>كشف الحساب</span>
                          </button>
                          <button onclick="ManagerUI.printPayslip(${s.employee.id}, '${targetMonth}')"
                            class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 shadow-sm shadow-emerald-500/20 transition-all" title="طباعة قسيمة الراتب ومفردات المرتب">
                            <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                            <span>قسيمة الراتب 📄</span>
                          </button>
                          <button onclick="ManagerUI.sendPayslipWhatsApp(${s.employee.id}, '${targetMonth}')"
                            class="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold inline-flex items-center gap-1 transition-all" title="إرسال كشف الراتب للموظف عبر واتساب">
                            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                            <span>واتساب 📲</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `}).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async confirmResetArchive() {
    if (!confirm('هل أنت متأكد من تصفير سجلات وأرشيف الحضور؟\nسيتم حذف جميع سجلات الحضور والانصراف السابقة لتبدأ الدورة الشهرية بحسابات فارغة ونظيفة.')) {
      return;
    }
    try {
      const res = await API.resetArchive();
      showToast(res.message || 'تم تصفير الأرشيف بنجاح', 'success');
      await this.renderMonthlyArchiveSection();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  // Modal: Inspect Full Attendance Record for Employee in Specific Month
  async openEmployeeMonthDetailsModal(employeeId, month) {
    const modal = document.getElementById('month-details-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2" id="month-details-title">
                <i data-lucide="calendar" class="w-5 h-5 text-emerald-500"></i>
                تفاصيل سجل الحضور لشهر ${month}
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5" id="month-details-sub">جاري سحب بيانات الشهر...</p>
            </div>
            <button onclick="document.getElementById('month-details-modal').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="py-12 text-center text-slate-400" id="month-details-body">
            <div class="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            جاري استخراج السجلات اليومية...
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    try {
      const res = await API.getEmployeeMonthDetails(employeeId, month);
      const emp = res.employee || {};
      const stats = res.stats || {};
      const records = res.records || [];
      const bonuses = res.bonuses || [];
      const advances = res.advances || [];

      let lateDeductions = stats.totalLateDeductions || 0;
      let absenceDeductions = stats.totalAbsenceDeductions || 0;
      if (!lateDeductions && !absenceDeductions) {
        records.forEach(r => {
          const ded = parseFloat(r.estimated_deduction || 0);
          if (r.status === 'Absent') absenceDeductions += ded;
          else if (ded > 0) lateDeductions += ded;
        });
      }
      const baseSal = stats.baseSalary || parseFloat(emp.base_salary || 3000);
      const totalBonuses = stats.totalBonuses || bonuses.reduce((s, b) => s + parseFloat(b.amount || 0), 0);
      const totalAdvances = stats.totalAdvances || advances.filter(a => a.status === 'approved').reduce((s, a) => s + parseFloat(a.amount || 0), 0);
      const totalDed = (lateDeductions + absenceDeductions);
      const netSal = stats.netSalary !== undefined ? stats.netSalary : Math.max(0, baseSal + totalBonuses - totalDed - totalAdvances);

      const titleEl = document.getElementById('month-details-title');
      const subEl = document.getElementById('month-details-sub');
      const bodyEl = document.getElementById('month-details-body');

      if (titleEl) titleEl.innerHTML = `<i data-lucide="calendar" class="w-5 h-5 text-emerald-500"></i> كشف حساب وسجل شهر ${month}: ${emp.full_name}`;
      if (subEl) subEl.textContent = `${emp.employee_code} • ${emp.job_title || 'موظف'} (${emp.department_name || 'عام'})`;

      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="space-y-4 overflow-y-auto pr-1 max-h-[75vh] text-right">

            <!-- 0. Quick Action Toolbar -->
            <div class="flex items-center justify-between flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">إجراءات الموظف لهذا الشهر:</span>
              <div class="flex items-center gap-2 flex-wrap">
                <button onclick="ManagerUI.printPayslip(${emp.id}, '${month}')"
                  class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-500/25 transition-all">
                  <i data-lucide="printer" class="w-3.5 h-3.5"></i> طباعة قسيمة الراتب 📄
                </button>
                <button onclick="ManagerUI.openAddBonusModal(${emp.id}, '${month}')"
                  class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all">
                  <i data-lucide="gift" class="w-3.5 h-3.5"></i> + إضافة مكافأة
                </button>
                <button onclick="ManagerUI.openAddAdvanceModal(${emp.id}, '${month}')"
                  class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all">
                  <i data-lucide="hand-coins" class="w-3.5 h-3.5"></i> + تسجيل سلفة
                </button>
              </div>
            </div>

            <!-- 1. Executive Financial Payroll Breakdown (6 Cards) -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span class="text-[10px] text-slate-500 dark:text-slate-400 font-bold block">المرتب الأساسي</span>
                <span class="text-base font-black text-slate-900 dark:text-white font-mono mt-0.5 block">${baseSal.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div class="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                <span class="text-[10px] text-purple-600 dark:text-purple-400 font-bold block">المكافآت (+)</span>
                <span class="text-base font-black text-purple-600 dark:text-purple-400 font-mono mt-0.5 block">+${totalBonuses.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <span class="text-[10px] text-amber-500 font-bold block">خصم التأخير (-)</span>
                <span class="text-base font-black text-amber-500 font-mono mt-0.5 block">-${lateDeductions.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div class="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <span class="text-[10px] text-rose-400 font-bold block">خصم الغياب (-)</span>
                <span class="text-base font-black text-rose-500 font-mono mt-0.5 block">-${absenceDeductions.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div class="p-3 rounded-2xl bg-amber-600/10 border border-amber-600/20">
                <span class="text-[10px] text-amber-600 dark:text-amber-400 font-bold block">السلف المعتمدة (-)</span>
                <span class="text-base font-black text-amber-600 dark:text-amber-400 font-mono mt-0.5 block">-${totalAdvances.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div class="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">صافي القبض المستحق</span>
                <span class="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">${netSal.toLocaleString('ar-EG')} ج.م</span>
              </div>
            </div>

            <!-- 2. Bonuses List Section -->
            <div class="border border-purple-200 dark:border-purple-900/50 rounded-2xl overflow-hidden bg-purple-50/20 dark:bg-purple-950/10">
              <div class="p-3 bg-purple-50/80 dark:bg-purple-900/30 border-b border-purple-200 dark:border-purple-800/40 flex items-center justify-between">
                <span class="font-bold text-xs text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <i data-lucide="gift" class="w-4 h-4 text-purple-500"></i> المكافآت والحوافز المسجلة لهذا الشهر (${bonuses.length})
                </span>
                <button onclick="ManagerUI.openAddBonusModal(${emp.id}, '${month}')" class="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline">
                  + إضافة مكافأة جديدة
                </button>
              </div>
              ${bonuses.length === 0 ? `
                <div class="p-4 text-center text-slate-400 text-xs">لا توجد مكافآت مسجلة لهذا الموظف في شهر ${month}.</div>
              ` : `
                <div class="divide-y divide-purple-100 dark:divide-purple-900/30 p-2">
                  ${bonuses.map(b => `
                    <div class="flex items-center justify-between py-2 px-2 hover:bg-purple-100/30 rounded-xl transition-colors">
                      <div>
                        <span class="font-bold text-slate-800 dark:text-slate-200 block text-xs">🎁 ${b.reason}</span>
                        <span class="text-[10px] text-slate-400 font-mono">${b.date} • بواسطة: ${b.creator_name || 'الإدارة'}</span>
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">+${parseFloat(b.amount).toLocaleString('ar-EG')} ج.م</span>
                        <button onclick="ManagerUI.deleteBonus(${b.id}, ${emp.id}, '${month}')"
                          class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-1 text-[11px] font-bold transition-colors" title="حذف المكافأة بالكامل">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          <span>حذف المكافأة</span>
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- 3. Advances List Section -->
            <div class="border border-amber-200 dark:border-amber-900/50 rounded-2xl overflow-hidden bg-amber-50/20 dark:bg-amber-950/10">
              <div class="p-3 bg-amber-50/80 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800/40 flex items-center justify-between">
                <span class="font-bold text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <i data-lucide="hand-coins" class="w-4 h-4 text-amber-500"></i> السلف والمسحوبات لهذا الشهر (${advances.length})
                </span>
                <button onclick="ManagerUI.openAddAdvanceModal(${emp.id}, '${month}')" class="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline">
                  + تسجيل سلفة جديدة
                </button>
              </div>
              ${advances.length === 0 ? `
                <div class="p-4 text-center text-slate-400 text-xs">لا توجد سلف مسجلة لهذا الموظف في شهر ${month}.</div>
              ` : `
                <div class="divide-y divide-amber-100 dark:divide-amber-900/30 p-2">
                  ${advances.map(a => {
                    const statusBadge = a.status === 'approved'
                      ? '<span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">معتمدة ✓</span>'
                      : (a.status === 'rejected'
                        ? '<span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-bold">مرفوضة ✗</span>'
                        : '<span class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-bold">قيد المراجعة ⏳</span>');
                    return `
                      <div class="flex items-center justify-between py-2 px-2 hover:bg-amber-100/30 rounded-xl transition-colors">
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="font-bold text-slate-800 dark:text-slate-200 text-xs">💸 ${a.reason || 'سلفة على الراتب'}</span>
                            ${statusBadge}
                          </div>
                          <span class="text-[10px] text-slate-400 font-mono">${a.date} ${a.review_notes ? '• ' + a.review_notes : ''}</span>
                        </div>
                        <div class="flex items-center gap-3">
                          <span class="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">-${parseFloat(a.amount).toLocaleString('ar-EG')} ج.م</span>
                          <button onclick="ManagerUI.deleteAdvance(${a.id}, ${emp.id}, '${month}')"
                            class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-1 text-[11px] font-bold transition-colors" title="حذف السلفة بالكامل">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            <span>حذف السلفة</span>
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>

            <!-- 4. Daily Attendance and Deductions Breakdown Table -->
            <div class="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div class="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span class="font-bold text-xs text-slate-800 dark:text-slate-200">سجل أيام الشهر وتفاصيل كل خصم يومي:</span>
                <span class="text-[11px] text-slate-400 font-mono">${records.length} يوم مسجل • حضور: ${stats.presentDays || 0}</span>
              </div>
              ${records.length === 0 ? `
                <div class="p-8 text-center text-slate-500">لا توجد أيام مسجلة لهذا الموظف في هذا الشهر.</div>
              ` : `
                <table class="w-full text-right text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-semibold uppercase">
                    <tr>
                      <th class="py-2.5 px-3">اليوم والتاريخ</th>
                      <th class="py-2.5 px-3">الحضور</th>
                      <th class="py-2.5 px-3">الانصراف</th>
                      <th class="py-2.5 px-3">الحالة والتأخير</th>
                      <th class="py-2.5 px-3 text-center">الخصم المطبق</th>
                      <th class="py-2.5 px-3">ساعات العمل</th>
                      <th class="py-2.5 px-3 text-center">المعاينة</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    ${records.map(r => `
                      <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td class="py-2.5 px-3 font-sans text-slate-800 dark:text-slate-200 font-bold">${r.date}</td>
                        <td class="py-2.5 px-3">${formatTime12(r.check_in_time)}</td>
                        <td class="py-2.5 px-3">${formatTime12(r.check_out_time)}</td>
                        <td class="py-2.5 px-3 font-sans">
                          ${getStatusBadge(r.status)}
                          ${r.late_minutes > 0 ? `<span class="text-amber-500 text-[10px] block mt-0.5">تأخير: ${formatMinutesArabic(r.late_minutes)}</span>` : ''}
                          ${r.early_leave_minutes > 0 ? `<span class="text-purple-400 text-[10px] block mt-0.5">انصراف مبكر: ${formatMinutesArabic(r.early_leave_minutes)}</span>` : ''}
                        </td>
                        <td class="py-2.5 px-3 text-center font-bold font-mono">
                          ${r.estimated_deduction > 0 ? `
                            <span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 text-[11px]">-${r.estimated_deduction} ج.م</span>
                          ` : `<span class="text-emerald-500 text-[11px]">0</span>`}
                        </td>
                        <td class="py-2.5 px-3 font-bold">${r.worked_hours || 0} س</td>
                        <td class="py-2.5 px-3 text-center">
                          ${r.check_in_photo || r.check_out_photo ? `
                            <button onclick="ManagerUI.openRecordInspectionModal(${JSON.stringify(r).replace(/"/g, '&quot;')})" class="text-emerald-500 hover:underline font-bold text-xs">
                              معاينة
                            </button>
                          ` : '—'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        `;
      }
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      const bodyEl = document.getElementById('month-details-body');
      if (bodyEl) bodyEl.innerHTML = `<div class="p-6 text-center text-rose-500">${err.message}</div>`;
    }
  },

  // ========================================================
  // PAYSLIP PRINTING & FINANCIAL ACTIONS (BONUSES & ADVANCES)
  // ========================================================

  async printPayslip(employeeId, month) {
    try {
      showToast('جاري تجهيز قسيمة الراتب ومفردات المرتب...', 'info');
      const res = await API.getEmployeeMonthDetails(employeeId, month);
      if (window.Tafqeet && window.Tafqeet.showPayslipModal) {
        window.Tafqeet.showPayslipModal(res, true);
      } else {
        alert('حدث خطأ في تحميل وحدة توليد قسائم الرواتب.');
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  // Modal: Add Bonus to Employee
  async openAddBonusModal(preselectedEmployeeId = null, preselectedMonth = null, defaultReason = null, defaultAmount = null) {
    const modal = document.getElementById('bonuses-modal');
    if (!modal) return;

    const todayDate = new Date().toISOString().substring(0, 10);
    const targetMonth = preselectedMonth || todayDate.substring(0, 7);

    let employees = [];
    try {
      const empRes = await API.getEmployees({ is_active: 1 });
      employees = empRes.employees || [];
    } catch (err) {
      console.error('Error fetching employees:', err);
    }

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="gift" class="w-5 h-5 text-purple-500"></i> إضافة مكافأة / بونص لموظف
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">تضاف المكافأة تلقائياً إلى راتب الموظف في كشف حساب الشهر المحدد</p>
            </div>
            <button onclick="document.getElementById('bonuses-modal').innerHTML=''" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="ManagerUI.submitAddBonus(event, '${targetMonth}')" class="space-y-3.5 pt-4">
            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">الموظف المستحق *</label>
              <select id="bonus-emp-select" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <option value="">-- اختر الموظف --</option>
                ${employees.map(e => `
                  <option value="${e.id}" ${e.id === parseInt(preselectedEmployeeId, 10) ? 'selected' : ''}>
                    ${e.full_name} (${e.employee_code} - ${e.job_title || 'موظف'})
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">مبلغ المكافأة (ج.م) *</label>
              <input type="number" id="bonus-amount-input" step="1" min="1" required placeholder="مثال: 500" value="${defaultAmount || ''}"
                class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-emerald-600 text-sm" />
            </div>

            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">سبب أو عنوان المكافأة *</label>
              <input type="text" id="bonus-reason-input" required placeholder="مثال: كفاءة وإنجاز مهمة، تميز في العمل، حافز شهري" value="${defaultReason ? defaultReason.replace(/"/g, '&quot;') : ''}"
                class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">شهر الصرف *</label>
                <input type="month" id="bonus-month-input" required value="${targetMonth}"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono" />
              </div>
              <div>
                <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">تاريخ المكافأة</label>
                <input type="date" id="bonus-date-input" required value="${todayDate}"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono" />
              </div>
            </div>

            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">ملاحظات إضافية (اختياري)</label>
              <textarea id="bonus-notes-input" placeholder="أي تفاصيل خاصة بتسليم المكافأة..."
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-16"></textarea>
            </div>

            <div class="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onclick="document.getElementById('bonuses-modal').innerHTML=''"
                class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">إلغاء</button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-purple-500/25">
                <i data-lucide="check" class="w-4 h-4"></i> اعتماد المكافأة
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async submitAddBonus(event, currentMonth) {
    event.preventDefault();
    const employee_id = document.getElementById('bonus-emp-select').value;
    const amount = document.getElementById('bonus-amount-input').value;
    const reason = document.getElementById('bonus-reason-input').value;
    const month = document.getElementById('bonus-month-input').value;
    const date = document.getElementById('bonus-date-input').value;
    const notes = document.getElementById('bonus-notes-input').value;

    try {
      const res = await API.createBonus({ employee_id, amount, reason, month, date, notes });
      showToast(res.message || 'تمت إضافة المكافأة بنجاح!', 'success');
      document.getElementById('bonuses-modal').innerHTML = '';

      // Refresh relevant views
      if (this.activeSection === 'archive') {
        await this.renderMonthlyArchiveSection(month);
      }
      const detailsModal = document.getElementById('month-details-modal');
      if (detailsModal && detailsModal.innerHTML) {
        await this.openEmployeeMonthDetailsModal(employee_id, month);
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async deleteBonus(bonusId, employeeId = null, month = null) {
    if (!confirm('هل أنت متأكد من حذف هذه المكافأة من حساب الموظف؟')) return;
    try {
      const res = await API.deleteBonus(bonusId);
      showToast(res.message || 'تم حذف المكافأة بنجاح', 'success');
      if (employeeId && month) {
        await this.openEmployeeMonthDetailsModal(employeeId, month);
      }
      const hubBody = document.getElementById('bonuses-hub-body');
      if (hubBody) {
        await this.openBonusesManagementModal(month);
      }
      if (this.activeSection === 'archive') {
        await this.renderMonthlyArchiveSection(month);
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async openBonusesManagementModal(selectedMonth = null) {
    const modal = document.getElementById('bonuses-modal');
    if (!modal) return;

    const targetMonth = selectedMonth || new Date().toISOString().substring(0, 7);

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="award" class="w-5 h-5 text-purple-500"></i> إدارة وحذف مكافآت الموظفين
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">عرض وسجل جميع المكافآت والحوافز لشهر ${targetMonth} مع إمكانية حذف أي مكافأة أضيفت بالخطأ</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="ManagerUI.openAddBonusModal(null, '${targetMonth}')"
                class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-purple-500/25">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> + إضافة مكافأة جديدة
              </button>
              <button onclick="document.getElementById('bonuses-modal').innerHTML=''" class="text-slate-400 hover:text-slate-600">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>
          </div>

          <!-- Bonuses Table Container -->
          <div class="py-3 flex-1 overflow-y-auto" id="bonuses-hub-body">
            <div class="p-8 text-center text-slate-400">جاري تحميل سجل المكافآت...</div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    try {
      const res = await API.getBonuses({ month: targetMonth });
      const bonuses = res.bonuses || [];
      const hubBody = document.getElementById('bonuses-hub-body');
      if (!hubBody) return;

      if (bonuses.length === 0) {
        hubBody.innerHTML = `<div class="p-12 text-center text-slate-400">لا توجد مكافآت مسجلة في شهر ${targetMonth}.</div>`;
        return;
      }

      hubBody.innerHTML = `
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-semibold uppercase">
            <tr>
              <th class="py-2.5 px-3">الموظف</th>
              <th class="py-2.5 px-3">المبلغ</th>
              <th class="py-2.5 px-3">السبب والتاريخ</th>
              <th class="py-2.5 px-3">بواسطة</th>
              <th class="py-2.5 px-3 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
            ${bonuses.map(b => `
              <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td class="py-3 px-3 font-sans">
                  <span class="font-bold text-slate-800 dark:text-slate-200 block">${b.full_name}</span>
                  <span class="text-[10px] text-slate-400 font-mono">${b.employee_code} • ${b.department_name || 'عام'}</span>
                </td>
                <td class="py-3 px-3 font-black text-purple-600 dark:text-purple-400 text-sm">
                  +${parseFloat(b.amount).toLocaleString('ar-EG')} ج.م
                </td>
                <td class="py-3 px-3 font-sans">
                  <span class="font-bold text-slate-700 dark:text-slate-300 block">🎁 ${b.reason}</span>
                  <span class="text-[10px] text-slate-400 font-mono">${b.date} (شهر: ${b.month})</span>
                </td>
                <td class="py-3 px-3 font-sans text-slate-500 text-[11px]">
                  ${b.creator_name || 'الإدارة'}
                </td>
                <td class="py-3 px-3 text-center font-sans">
                  <button onclick="ManagerUI.deleteBonus(${b.id}, null, '${targetMonth}')"
                    class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-1 text-[11px] font-bold transition-colors mx-auto" title="حذف المكافأة نهائياً">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    <span>حذف المكافأة</span>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      const hubBody = document.getElementById('bonuses-hub-body');
      if (hubBody) hubBody.innerHTML = `<div class="p-6 text-center text-rose-500">${err.message}</div>`;
    }
  },

  // Modal: Add / Record Direct Advance (سلفة)
  async openAddAdvanceModal(preselectedEmployeeId = null, preselectedMonth = null) {
    const modal = document.getElementById('advances-modal');
    if (!modal) return;

    const todayDate = new Date().toISOString().substring(0, 10);
    const targetMonth = preselectedMonth || todayDate.substring(0, 7);

    let employees = [];
    try {
      const empRes = await API.getEmployees({ is_active: 1 });
      employees = empRes.employees || [];
    } catch (err) {
      console.error('Error fetching employees:', err);
    }

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="hand-coins" class="w-5 h-5 text-amber-500"></i> تسجيل سلفة مالية لموظف
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">تُخصم السلفة تلقائياً من صافي راتب الموظف في كشف الشهر المحدد</p>
            </div>
            <button onclick="document.getElementById('advances-modal').innerHTML=''" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="ManagerUI.submitAddAdvance(event, '${targetMonth}')" class="space-y-3.5 pt-4">
            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">الموظف *</label>
              <select id="adv-emp-select" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <option value="">-- اختر الموظف --</option>
                ${employees.map(e => `
                  <option value="${e.id}" ${e.id === parseInt(preselectedEmployeeId, 10) ? 'selected' : ''}>
                    ${e.full_name} (${e.employee_code} - ${e.job_title || 'موظف'})
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">مبلغ السلفة (ج.م) *</label>
              <input type="number" id="adv-amount-input" step="1" min="1" required placeholder="مثال: 1000"
                class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-amber-600 text-sm" />
            </div>

            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">سبب السلفة</label>
              <input type="text" id="adv-reason-input" placeholder="مثال: سلفة شخصية على الراتب، ظرف طارئ"
                class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">شهر الخصم *</label>
                <input type="month" id="adv-month-input" required value="${targetMonth}"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono" />
              </div>
              <div>
                <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">تاريخ استلام السلفة</label>
                <input type="date" id="adv-date-input" required value="${todayDate}"
                  class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono" />
              </div>
            </div>

            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">ملاحظات الإدارة</label>
              <textarea id="adv-notes-input" placeholder="أي تفاصيل أو طريقة الاستلام..."
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-16"></textarea>
            </div>

            <div class="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onclick="document.getElementById('advances-modal').innerHTML=''"
                class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">إلغاء</button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/25">
                <i data-lucide="check" class="w-4 h-4"></i> تسجيل واعتماد السلفة
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async submitAddAdvance(event, currentMonth) {
    event.preventDefault();
    const employee_id = document.getElementById('adv-emp-select').value;
    const amount = document.getElementById('adv-amount-input').value;
    const reason = document.getElementById('adv-reason-input').value || 'سلفة على الراتب';
    const month = document.getElementById('adv-month-input').value;
    const date = document.getElementById('adv-date-input').value;
    const notes = document.getElementById('adv-notes-input').value;

    try {
      const res = await API.submitAdvance({ employee_id, amount, reason, month, date, notes, status: 'approved' });
      showToast(res.message || 'تم تسجيل السلفة بنجاح!', 'success');
      document.getElementById('advances-modal').innerHTML = '';

      if (this.activeSection === 'archive') {
        await this.renderMonthlyArchiveSection(month);
      }
      const detailsModal = document.getElementById('month-details-modal');
      if (detailsModal && detailsModal.innerHTML) {
        await this.openEmployeeMonthDetailsModal(employee_id, month);
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  // Modal: Advances Review & Management Hub
  async openAdvancesManagementModal(selectedMonth = null, filterStatus = 'all') {
    const modal = document.getElementById('advances-modal');
    if (!modal) return;

    const targetMonth = selectedMonth || new Date().toISOString().substring(0, 7);

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="hand-coins" class="w-5 h-5 text-amber-500"></i> إدارة ومراجعة وحذف سلف الموظفين
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">مراجعة واعتماد أو رفض طلبات السلف، وحذف أي سلفة أُضيفت بالخطأ فوراً</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="ManagerUI.openAddAdvanceModal(null, '${targetMonth}')"
                class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-amber-500/25">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> تسجيل سلفة جديدة
              </button>
              <button onclick="document.getElementById('advances-modal').innerHTML=''" class="text-slate-400 hover:text-slate-600">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>
          </div>

          <!-- Filter Tabs -->
          <div class="flex items-center gap-2 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
            <button onclick="ManagerUI.openAdvancesManagementModal('${targetMonth}', 'all')"
              class="px-3 py-1.5 rounded-xl font-bold transition-colors ${filterStatus === 'all' ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">
              جميع السلف
            </button>
            <button onclick="ManagerUI.openAdvancesManagementModal('${targetMonth}', 'pending')"
              class="px-3 py-1.5 rounded-xl font-bold transition-colors ${filterStatus === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">
              طلبات قيد المراجعة ⏳
            </button>
            <button onclick="ManagerUI.openAdvancesManagementModal('${targetMonth}', 'approved')"
              class="px-3 py-1.5 rounded-xl font-bold transition-colors ${filterStatus === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">
              السلف المعتمدة ✓
            </button>
            <button onclick="ManagerUI.openAdvancesManagementModal('${targetMonth}', 'rejected')"
              class="px-3 py-1.5 rounded-xl font-bold transition-colors ${filterStatus === 'rejected' ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">
              الطلبات المرفوضة ✗
            </button>
          </div>

          <!-- Advances Table Container -->
          <div class="py-3 flex-1 overflow-y-auto" id="advances-hub-body">
            <div class="p-8 text-center text-slate-400">جاري تحميل سجل السلف...</div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    try {
      const params = { month: targetMonth };
      if (filterStatus !== 'all') params.status = filterStatus;
      const res = await API.getAdvances(params);
      const advances = res.advances || [];
      const hubBody = document.getElementById('advances-hub-body');
      if (!hubBody) return;

      if (advances.length === 0) {
        hubBody.innerHTML = `<div class="p-12 text-center text-slate-400">لا توجد سلف مطابقة لهذا الفلتر في شهر ${targetMonth}.</div>`;
        return;
      }

      hubBody.innerHTML = `
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-semibold uppercase">
            <tr>
              <th class="py-2.5 px-3">الموظف</th>
              <th class="py-2.5 px-3">المبلغ</th>
              <th class="py-2.5 px-3">السبب والتاريخ</th>
              <th class="py-2.5 px-3 text-center">الحالة</th>
              <th class="py-2.5 px-3 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
            ${advances.map(a => {
              const statusBadge = a.status === 'approved'
                ? '<span class="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">معتمدة ✓</span>'
                : (a.status === 'rejected'
                  ? '<span class="px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-bold">مرفوضة ✗</span>'
                  : '<span class="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-600 text-xs font-bold animate-pulse">قيد المراجعة ⏳</span>');

              return `
                <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td class="py-3 px-3 font-sans">
                    <span class="font-bold text-slate-800 dark:text-slate-200 block">${a.full_name}</span>
                    <span class="text-[10px] text-slate-400 font-mono">${a.employee_code} • ${a.department_name || 'عام'}</span>
                  </td>
                  <td class="py-3 px-3 font-black text-amber-600 dark:text-amber-400 text-sm">
                    ${parseFloat(a.amount).toLocaleString('ar-EG')} ج.م
                  </td>
                  <td class="py-3 px-3 font-sans">
                    <span class="font-bold text-slate-700 dark:text-slate-300 block">${a.reason || 'سلفة راتب'}</span>
                    <span class="text-[10px] text-slate-400 font-mono">${a.date} (شهر: ${a.month})</span>
                  </td>
                  <td class="py-3 px-3 text-center font-sans">
                    ${statusBadge}
                  </td>
                  <td class="py-3 px-3 text-center font-sans">
                    ${a.status === 'pending' ? `
                      <div class="flex items-center justify-center gap-1.5 flex-wrap">
                        <button onclick="ManagerUI.reviewAdvanceRequest(${a.id}, 'approved', '${targetMonth}')"
                          class="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs" title="موافقة على السلفة وخصمها من الراتب">
                          موافقة ✓
                        </button>
                        <button onclick="ManagerUI.reviewAdvanceRequest(${a.id}, 'rejected', '${targetMonth}')"
                          class="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 font-bold text-xs" title="رفض طلب السلفة">
                          رفض ✗
                        </button>
                        <button onclick="ManagerUI.deleteAdvance(${a.id}, null, '${targetMonth}')"
                          class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-1 text-[11px] font-bold transition-colors" title="حذف السلفة نهائياً">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          <span>حذف السلفة</span>
                        </button>
                      </div>
                    ` : `
                      <div class="flex items-center justify-center gap-2">
                        <span class="text-[10px] text-slate-400 font-mono">${a.approver_name ? 'بواسطة: ' + a.approver_name : 'تمت المعالجة'}</span>
                        <button onclick="ManagerUI.deleteAdvance(${a.id}, null, '${targetMonth}')"
                          class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-1 text-[11px] font-bold transition-colors" title="حذف السلفة نهائياً">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          <span>حذف السلفة</span>
                        </button>
                      </div>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      const hubBody = document.getElementById('advances-hub-body');
      if (hubBody) hubBody.innerHTML = `<div class="p-6 text-center text-rose-500">${err.message}</div>`;
    }
  },

  async reviewAdvanceRequest(advanceId, action, month = null) {
    let review_notes = '';
    if (action === 'rejected') {
      review_notes = prompt('يرجى كتابة سبب رفض السلفة (اختياري، سيظهر للموظف):') || '';
    }
    try {
      const res = await API.reviewAdvance(advanceId, action, review_notes);
      showToast(res.message || 'تمت معالجة الطلب بنجاح', 'success');
      await this.openAdvancesManagementModal(month, 'all');
      if (this.activeSection === 'archive') {
        await this.renderMonthlyArchiveSection(month);
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async deleteAdvance(advanceId, employeeId = null, month = null) {
    if (!confirm('هل أنت متأكد من حذف هذه السلفة من السجلات؟')) return;
    try {
      const res = await API.deleteAdvance(advanceId);
      showToast(res.message || 'تم حذف السلفة بنجاح', 'success');
      if (employeeId && month) {
        await this.openEmployeeMonthDetailsModal(employeeId, month);
      }
      const advModal = document.getElementById('advances-hub-body');
      if (advModal) {
        await this.openAdvancesManagementModal(month, 'all');
      }
      if (this.activeSection === 'archive') {
        await this.renderMonthlyArchiveSection(month);
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  // ========================================================
  // 8. MANAGER PROFILE SECTION
  // ========================================================
  currentUploadedAvatar: null,

  async renderProfileSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    // Fetch freshest user profile
    let user = App.currentUser || API.getCurrentUser() || {};
    try {
      const res = await API.getMe();
      if (res && res.user) {
        user = res.user;
        App.currentUser = user;
        API.setCurrentUser(user);
      }
    } catch (e) {
      console.warn('Could not refresh user profile:', e);
    }

    // Get company settings for company name
    let companyName = '';
    try {
      const sRes = await API.getSettings();
      companyName = (sRes.workplace && sRes.workplace.company_name) || (sRes.settings && sRes.settings.company_name) || '';
    } catch (e) {}

    container.innerHTML = `
      <div class="space-y-6 w-full">
        <!-- Page Header -->
        <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 class="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="user-cog" class="w-6 h-6 text-blue-600"></i>
              الملف الشخصي للمدير
            </h2>
            <p class="text-xs text-slate-500 mt-1">عرض وتعديل البيانات الشخصية لمدير النظام وكلمة المرور واسم المؤسسة</p>
          </div>
          <span class="px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-xs font-bold flex items-center gap-1.5">
            <i data-lucide="shield-check" class="w-4 h-4 text-blue-600"></i>
            حساب مدير النظام (Manager)
          </span>
        </div>

        <!-- Manager Profile Card & Form -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
          <!-- Top Hero Avatar & Info -->
          <div class="flex flex-col sm:flex-row items-center sm:items-start gap-5 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div class="relative group">
              <img id="mgr-profile-avatar-preview" src="${user.profile_photo || '/uploads/avatar.svg'}" class="w-24 h-24 rounded-3xl object-cover bg-blue-50 dark:bg-slate-800 shadow-md border-2 border-white dark:border-slate-700" />
              <label for="mgr-avatar-file-input" class="absolute inset-0 bg-slate-900/60 rounded-3xl opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[11px] font-bold cursor-pointer transition-opacity">
                <i data-lucide="camera" class="w-5 h-5 mb-1"></i>
                تغيير الصورة
              </label>
              <input type="file" id="mgr-avatar-file-input" accept="image/*" class="hidden" onchange="ManagerUI.handleAvatarUpload(event)" />
            </div>
            <div class="text-center sm:text-right flex-1">
              <h3 class="text-xl font-extrabold text-slate-900 dark:text-white" id="mgr-profile-card-name">${user.full_name || 'محمد حماده'}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${user.job_title || 'المدير العام ومسؤول المنظومة'} • <span class="font-mono font-bold text-blue-600 dark:text-blue-400">${user.employee_code || 'MGR-001'}</span></p>
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                <span class="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span> الحساب نشط
                </span>
                <span class="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-semibold">
                  🏢 ${companyName || 'المقر الرئيسي للمنظومة'}
                </span>
              </div>
            </div>
          </div>

          <!-- Edit Profile Form -->
          <form onsubmit="ManagerUI.saveProfile(event)" class="space-y-6 pt-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
              <!-- Full Name -->
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  الاسم الكامل لمدير النظام *
                </label>
                <div class="relative">
                  <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                    <i data-lucide="user" class="w-4 h-4"></i>
                  </span>
                  <input type="text" id="mgr-edit-fullname" required value="${user.full_name || 'محمد حماده'}"
                    class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold" />
                </div>
              </div>

              <!-- Email -->
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  البريد الإلكتروني الرسمي *
                </label>
                <div class="relative">
                  <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                    <i data-lucide="mail" class="w-4 h-4"></i>
                  </span>
                  <input type="email" id="mgr-edit-email" required value="${user.email || 'admin@workforce.local'}"
                    class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono" />
                </div>
              </div>

              <!-- Phone -->
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  رقم الهاتف أو الجوال
                </label>
                <div class="relative">
                  <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                    <i data-lucide="phone" class="w-4 h-4"></i>
                  </span>
                  <input type="text" id="mgr-edit-phone" value="${user.phone || ''}" placeholder="+966501112233"
                    class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono" />
                </div>
              </div>

              <!-- Job Title -->
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  المسمى الإداري والوظيفي
                </label>
                <div class="relative">
                  <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                    <i data-lucide="briefcase" class="w-4 h-4"></i>
                  </span>
                  <input type="text" id="mgr-edit-jobtitle" value="${user.job_title || 'المدير العام'}" placeholder="المدير العام ومسؤول العمليات"
                    class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
              </div>

              <!-- Company Name -->
              <div class="md:col-span-2">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  اسم المنشأة أو المؤسسة
                </label>
                <div class="relative">
                  <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                    <i data-lucide="building-2" class="w-4 h-4"></i>
                  </span>
                  <input type="text" id="mgr-edit-company" value="${companyName || ''}" placeholder="شركة الرؤية للحلول المتطورة"
                    class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold" />
                </div>
              </div>
            </div>

            <!-- Password Change Section (Optional) -->
            <div class="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
              <div class="flex items-center gap-2">
                <i data-lucide="lock" class="w-4 h-4 text-slate-500"></i>
                <h4 class="font-bold text-xs text-slate-900 dark:text-white">تغيير كلمة المرور (اختياري)</h4>
                <span class="text-[11px] text-slate-400">اترك الحقول فارغة إذا كنت لا ترغب بتغييرها</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">كلمة المرور الجديدة</label>
                  <input type="password" id="mgr-edit-pass" placeholder="••••••••"
                    class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">تأكيد كلمة المرور الجديدة</label>
                  <input type="password" id="mgr-edit-confirmpass" placeholder="••••••••"
                    class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            <!-- Submit Button -->
            <div class="flex justify-end gap-3 pt-2">
              <button type="submit" id="mgr-save-profile-btn"
                class="py-3 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all">
                <i data-lucide="check" class="w-4 h-4"></i>
                <span>حفظ التعديلات في الملف الشخصي</span>
              </button>
            </div>
          </form>
        </div>

      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  handleAvatarUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('حجم الصورة يجب أن لا يتجاوز 2 ميجابايت', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      ManagerUI.currentUploadedAvatar = e.target.result;
      const preview = document.getElementById('mgr-profile-avatar-preview');
      if (preview) preview.src = e.target.result;
      showToast('تم اختيار الصورة، اضغط "حفظ التعديلات" لاعتمادها', 'info');
    };
    reader.readAsDataURL(file);
  },

  async saveProfile(event) {
    event.preventDefault();
    const btn = document.getElementById('mgr-save-profile-btn');
    const fullName = document.getElementById('mgr-edit-fullname').value.trim();
    const email = document.getElementById('mgr-edit-email').value.trim();
    const phone = document.getElementById('mgr-edit-phone').value.trim();
    const jobTitle = document.getElementById('mgr-edit-jobtitle').value.trim();
    const company = document.getElementById('mgr-edit-company').value.trim();
    const pass = document.getElementById('mgr-edit-pass').value;
    const confirmPass = document.getElementById('mgr-edit-confirmpass').value;

    if (!fullName || !email) {
      showToast('الاسم الكامل والبريد الإلكتروني حقول إلزامية', 'warning');
      return;
    }

    if (pass && pass.length > 0) {
      if (pass !== confirmPass) {
        showToast('كلمتا المرور غير متطابقتين', 'danger');
        return;
      }
      if (pass.length < 6) {
        showToast('كلمة المرور يجب أن لا تقل عن 6 خانات', 'warning');
        return;
      }
    }

    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> جاري الحفظ...`;

    try {
      const payload = {
        full_name: fullName,
        email: email,
        phone: phone,
        job_title: jobTitle,
        company_name: company
      };

      if (pass && pass.length > 0) {
        payload.password = pass;
        payload.confirm_password = confirmPass;
      }

      if (ManagerUI.currentUploadedAvatar) {
        payload.profile_photo = ManagerUI.currentUploadedAvatar;
      }

      const res = await API.updateProfile(payload);
      API.setCurrentUser(res.user);
      App.currentUser = res.user;

      // Update header
      const headerName = document.getElementById('header-user-name');
      const headerAvatar = document.getElementById('header-user-avatar');
      const headerRole = document.getElementById('header-user-role');
      if (headerName) headerName.textContent = res.user.full_name;
      if (headerAvatar && res.user.profile_photo) headerAvatar.src = res.user.profile_photo;
      if (headerRole) headerRole.textContent = res.user.job_title || 'المدير العام (Manager)';

      showToast(res.message || 'تم تحديث البيانات الشخصية بنجاح', 'success');

      ManagerUI.currentUploadedAvatar = null;
      await ManagerUI.renderProfileSection();
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> <span>حفظ التعديلات في الملف الشخصي</span>`;
      }
      if (window.lucide) lucide.createIcons();
    }
  },

  openResetSystemModal() {
    const modal = document.getElementById('employee-crud-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 modal-enter text-right">
          <!-- Header -->
          <div class="flex items-center gap-3 pb-4 border-b border-rose-100 dark:border-rose-950/60">
            <div class="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
              <i data-lucide="alert-triangle" class="w-6 h-6"></i>
            </div>
            <div>
              <h3 class="font-extrabold text-base text-rose-600 dark:text-rose-400">
                تحذير: تصفير سجلات الحضور والبدء من جديد
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                يرجى قراءة ما سيتم مسحه وما سيتم الحفاظ عليه بدقة قبل التأكيد
              </p>
            </div>
          </div>

          <!-- Explanation Body -->
          <div class="space-y-3.5 py-4 text-xs leading-relaxed">
            <div class="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-300">
              <span class="font-bold block mb-1.5 flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
                ما سيتم حذفه وتصفيره بالكامل:
              </span>
              <ul class="list-disc list-inside space-y-1 text-[11px] text-rose-700 dark:text-rose-300/90 font-medium">
                <li>كافة سجلات الحضور والانصراف السابقة لجميع الموظفين.</li>
                <li>إحصائيات التأخير، الخروج المبكر، الغياب، وساعات العمل.</li>
                <li>صور الكاميرا والتوثيق وإحداثيات GPS المسجلة عند الحضور.</li>
                <li>أرشيف الشهور السابقة وطلبات التصحيح والإشعارات القديمة.</li>
              </ul>
            </div>

            <div class="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300">
              <span class="font-bold block mb-1.5 flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                <i data-lucide="shield-check" class="w-4 h-4"></i>
                ما سيتم الحفاظ عليه بأمان تام (لن يتم حذفه نهائياً):
              </span>
              <ul class="list-disc list-inside space-y-1 text-[11px] text-emerald-700 dark:text-emerald-300/90 font-medium">
                <li>حسابات الموظفين (أحمد حماده، منصور السيد، وكافة الموظفين بكلمات سرهم وبياناتهم).</li>
                <li>مواعيد العمل الرسمية وفترات السماح (Working Hours).</li>
                <li>موقع المنشأة الجغرافي ونطاق الـ GPS المحدد على الخريطة.</li>
                <li>الأقسام وإعدادات الشركة وحساب المدير العام.</li>
              </ul>
            </div>

            <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold text-center pt-1">
              هل أنت متأكد تماماً من رغبتك في تصفير سجلات الحضور والبدء من الصفر الآن؟
            </p>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onclick="document.getElementById('employee-crud-modal').innerHTML=''"
              class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              إلغاء الأمر
            </button>
            <button type="button" id="confirm-reset-system-btn" onclick="ManagerUI.executeResetAttendanceSystem()"
              class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/25 flex items-center gap-1.5 transition-all">
              <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
              <span>نعم، صفّر الحضور وابدأ من جديد</span>
            </button>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async executeResetAttendanceSystem() {
    const btn = document.getElementById('confirm-reset-system-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> جاري التصفير...`;
    }

    try {
      const res = await API.resetAttendanceSystem();
      showToast(res.message || 'تم تصفير الحضور بنجاح والبدء من الصفر', 'success');
      document.getElementById('employee-crud-modal').innerHTML = '';
      await this.renderProfileSection();
    } catch (err) {
      showToast(err.message, 'danger');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="rotate-ccw" class="w-4 h-4"></i> <span>نعم، صفّر الحضور وابدأ من جديد</span>`;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  // --------------------------------------------------------
  // WhatsApp Notification Modals & Handlers
  // --------------------------------------------------------
  async openMorningBriefingModal() {
    const modal = document.getElementById('employee-crud-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs space-y-4">
          <div class="flex items-center justify-center p-8">
            <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="mr-3 font-bold text-slate-600 dark:text-slate-300">جاري إعداد تقرير الصباح لليوم...</span>
          </div>
        </div>
      </div>
    `;

    try {
      const data = await API.getMorningBriefing();
      modal.innerHTML = `
        <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                  <i data-lucide="message-circle" class="w-5 h-5"></i>
                </div>
                <div>
                  <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">تقرير الصباح اليومي للواتساب</h3>
                  <p class="text-[11px] text-slate-400 mt-0.5">التاريخ: ${data.today} • إجمالي القوة: ${data.stats.total} موظف</p>
                </div>
              </div>
              <button onclick="document.getElementById('employee-crud-modal').innerHTML=''" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>

            <!-- Stats Overview Cards -->
            <div class="grid grid-cols-4 gap-2 text-center">
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                <span class="text-[10px] text-slate-400 block font-semibold">إجمالي الموظفين</span>
                <span class="text-lg font-black text-slate-800 dark:text-white font-mono mt-0.5 block">${data.stats.total}</span>
              </div>
              <div class="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <span class="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">في الموعد</span>
                <span class="text-lg font-black text-emerald-600 font-mono mt-0.5 block">${data.stats.onTime}</span>
              </div>
              <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <span class="text-[10px] text-amber-600 dark:text-amber-400 block font-semibold">المتأخرين</span>
                <span class="text-lg font-black text-amber-600 font-mono mt-0.5 block">${data.stats.late}</span>
              </div>
              <div class="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <span class="text-[10px] text-rose-600 dark:text-rose-400 block font-semibold">لم يحضروا بعد</span>
                <span class="text-lg font-black text-rose-600 font-mono mt-0.5 block">${data.stats.absent}</span>
              </div>
            </div>

            <!-- Message Preview -->
            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                <span>نص رسالة الواتساب الجاهزة:</span>
                <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('morning-msg-preview').value); showToast('تم نسخ نص التقرير للحافظة 📋', 'success');" class="text-blue-500 hover:underline text-[11px] font-semibold flex items-center gap-1">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i> نسخ النص
                </button>
              </label>
              <textarea id="morning-msg-preview" rows="8" readonly class="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-sans text-xs leading-relaxed focus:outline-none resize-none">${data.messageText}</textarea>
            </div>

            <!-- Recipient Phone Number -->
            <div>
              <label class="block text-slate-500 font-semibold mb-1">إرسال إلى رقم واتساب المدير:</label>
              <input type="text" id="morning-mgr-phone" value="${data.managerPhone || ''}" placeholder="01227580963" class="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs focus:ring-2 focus:ring-emerald-500" />
            </div>

            <!-- Action Buttons -->
            <div class="pt-2 flex items-center justify-between flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onclick="document.getElementById('employee-crud-modal').innerHTML=''" class="px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs">
                إغلاق
              </button>
              <div class="flex items-center gap-2">
                <button type="button" onclick="ManagerUI.sendMorningBriefingViaApi()" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all">
                  <i data-lucide="zap" class="w-4 h-4 text-amber-400"></i> إرسال عبر بوابة API
                </button>
                <a id="morning-wa-direct-link" href="${data.waLink}" target="_blank" onclick="setTimeout(() => { document.getElementById('employee-crud-modal').innerHTML=''; }, 800);" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-500/25 transition-all">
                  <i data-lucide="message-circle" class="w-4 h-4"></i> فتح في واتساب الآن 📲
                </a>
              </div>
            </div>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async sendMorningBriefingViaApi() {
    const phone = document.getElementById('morning-mgr-phone')?.value;
    try {
      const res = await API.sendMorningBriefing({ phone });
      showToast(res.message, res.dispatchResult?.apiDelivered ? 'success' : 'info');
      if (res.waLink && !res.dispatchResult?.apiDelivered) {
        window.open(res.waLink, '_blank');
      }
      setTimeout(() => {
        const m = document.getElementById('employee-crud-modal');
        if (m) m.innerHTML = '';
      }, 1000);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async sendPayslipWhatsApp(employeeId, month) {
    try {
      showToast('جاري تجهيز كشف الراتب ورابط الواتساب...', 'info');
      const res = await API.sendPayslipWhatsApp({ employee_id: employeeId, month });
      showToast(res.message, 'success');
      if (res.waLink) {
        window.open(res.waLink, '_blank');
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async sendAllPayslipsWhatsApp(month) {
    if (!confirm(`هل تريد تجهيز وإرسال كشوف الرواتب لشهر (${month}) لجميع الموظفين عبر الواتساب؟`)) {
      return;
    }

    const modal = document.getElementById('employee-crud-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs space-y-4">
          <div class="flex items-center justify-center p-8">
            <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="mr-3 font-bold text-slate-600 dark:text-slate-300">جاري معالجة وتجهيز كشوف رواتب الموظفين...</span>
          </div>
        </div>
      </div>
    `;

    try {
      const res = await API.sendAllPayslipsWhatsApp(month);
      const results = res.results || [];
      modal.innerHTML = `
        <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                  <i data-lucide="check-check" class="w-5 h-5"></i>
                </div>
                <div>
                  <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">كشوف رواتب الواتساب لشهر ${month}</h3>
                  <p class="text-[11px] text-slate-400 mt-0.5">تم تجهيز كشوف الرواتب لعدد ${results.length} موظف</p>
                </div>
              </div>
              <button onclick="document.getElementById('employee-crud-modal').innerHTML=''" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>

            <div class="space-y-2">
              ${results.map(r => `
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <span class="font-bold text-slate-900 dark:text-white block">${r.name}</span>
                    <span class="text-[11px] text-slate-400 font-mono">${r.phone || 'بدون رقم هاتف'}</span>
                  </div>
                  <div>
                    ${r.waLink ? `
                      <a href="${r.waLink}" target="_blank" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 transition-all">
                        <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> إرسال عبر واتساب 📲
                      </a>
                    ` : `
                      <span class="text-rose-500 font-semibold text-[11px]">لا يمكن الإرسال (بدون رقم)</span>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>

            <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button onclick="document.getElementById('employee-crud-modal').innerHTML=''" class="px-5 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  toggleWaApiFields() {
    const prov = document.querySelector('input[name="wa-provider"]:checked')?.value;
    const container = document.getElementById('wa-api-fields-container');
    if (!container) return;
    if (prov === 'ultramsg' || prov === 'custom') {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  },

  async saveWhatsAppSettings() {
    const provider = document.querySelector('input[name="wa-provider"]:checked')?.value || 'direct';
    const enabled = document.getElementById('rule-whatsapp-enabled')?.checked ? '1' : '0';
    const autoLate = document.getElementById('rule-whatsapp-auto-late')?.checked ? '1' : '0';
    const mgrPhone = document.getElementById('rule-whatsapp-mgr-phone')?.value || '';
    const instanceId = document.getElementById('rule-wa-instance-id')?.value || '';
    const token = document.getElementById('rule-wa-token')?.value || '';

    const payload = {
      whatsapp_enabled: enabled,
      whatsapp_provider: provider,
      whatsapp_auto_late_alert: autoLate,
      whatsapp_manager_phone: mgrPhone,
      whatsapp_instance_id: instanceId,
      whatsapp_api_token: token
    };

    try {
      const res = await API.saveWhatsAppSettings(payload);
      showToast(res.message || 'تم حفظ إعدادات الواتساب بنجاح', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async renderPackagesSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    let user = App.currentUser || API.getCurrentUser() || {};
    try {
      const res = await API.getMe();
      if (res && res.user) {
        user = res.user;
        App.currentUser = user;
      }
    } catch (_) {}

    const sub = user.subscription || {};
    const remaining = (sub.remainingDays !== undefined ? sub.remainingDays : (sub.daysRemaining !== undefined ? sub.daysRemaining : (sub.days_remaining !== undefined ? sub.days_remaining : 0)));
    const isExpired = sub.expired !== undefined ? sub.expired : (sub.isExpired !== undefined ? sub.isExpired : (remaining <= 0));
    const company = user.company_name || 'شركتكم الموقرة';
    const waBase = "https://wa.me/201093320211?text=";

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold mb-1.5 border border-emerald-500/20">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-500"></i>
              <span>إدارة الاشتراكات والتجديد</span>
            </div>
            <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">باقات وأسعار نظام وقتي (WAQTY)</h2>
            <p class="text-xs text-slate-500 mt-1">يمكنك ترقية أو تجديد اشتراك مؤسستك مباشرة عبر واتساب مع التفعيل الفوري</p>
          </div>
          <button onclick="App.openSupportModal()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-2 self-start sm:self-auto transition-all">
            <i data-lucide="headphones" class="w-4 h-4 text-emerald-500"></i>
            <span>تحدث مع الدعم الفني</span>
          </button>
        </div>

        <!-- Current Status Banner -->
        <div class="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl ${isExpired ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'} flex items-center justify-center font-bold text-xl flex-shrink-0">
              <i data-lucide="${isExpired ? 'alert-triangle' : 'shield-check'}" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="text-xs text-slate-400 font-bold">المؤسسة: ${company}</div>
              <h3 class="text-base font-extrabold text-white mt-0.5">
                ${isExpired ? 'انتهت فترة الاشتراك أو التجربة' : `فترة الاشتراك نشطة (${remaining} يوم متبقي)`}
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                تاريخ الانتهاء: <span class="font-mono text-slate-200">${sub.expiresAt ? formatDateTime12(sub.expiresAt) : 'غير محدد'}</span>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <a href="${waBase}${encodeURIComponent('مرحباً، أود تجديد باقة مؤسسة ' + company)}" target="_blank"
              class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
              <span>تجديد / تمديد الاشتراك الآن</span>
            </a>
          </div>
        </div>

        <!-- Packages Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <!-- 1. Monthly -->
          <div class="rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">شهري</span>
                <i data-lucide="calendar" class="w-4 h-4 text-slate-400"></i>
              </div>
              <h4 class="font-extrabold text-lg text-slate-900 dark:text-white">الباقة الشهرية</h4>
              <div class="my-4">
                <span class="text-3xl font-black text-slate-900 dark:text-white font-mono">75</span>
                <span class="text-xs text-slate-500 font-bold">ج.م / 30 يوم</span>
              </div>
              <ul class="text-xs text-slate-600 dark:text-slate-400 space-y-2.5 mb-6">
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> عدد لا محدود من الموظفين</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> إثبات الحضور بالـ GPS والصورة</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> مسير رواتب وخصومات تلقائية</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> دعم فني مخصص</li>
              </ul>
            </div>
            <a href="${waBase}${encodeURIComponent('مرحباً، أود الاشتراك في الباقة الشهرية (75 ج.م) لشركة ' + company)}" target="_blank"
              class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
              <span>تفعيل الباقة الشهرية</span>
            </a>
          </div>

          <!-- 2. Quarterly -->
          <div class="rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">ربع سنوي</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">وفر 20%</span>
              </div>
              <h4 class="font-extrabold text-lg text-slate-900 dark:text-white">باقة 3 أشهر</h4>
              <div class="my-4">
                <span class="text-3xl font-black text-slate-900 dark:text-white font-mono">180</span>
                <span class="text-xs text-slate-500 font-bold">ج.م / 90 يوم</span>
              </div>
              <ul class="text-xs text-slate-600 dark:text-slate-400 space-y-2.5 mb-6">
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> كل مميزات الباقة الشهرية</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> تقارير وتحليلات متقدمة</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> استقرار واحتفاظ بالأرشيف</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> أولوية دعم فني</li>
              </ul>
            </div>
            <a href="${waBase}${encodeURIComponent('مرحباً، أود الاشتراك في باقة 3 أشهر (180 ج.م) لشركة ' + company)}" target="_blank"
              class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
              <span>تفعيل باقة 3 أشهر</span>
            </a>
          </div>

          <!-- 3. Semi-Annual -->
          <div class="rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">نصف سنوي</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300">خصم 25% 🔥</span>
              </div>
              <h4 class="font-extrabold text-lg text-slate-900 dark:text-white">باقة 6 أشهر</h4>
              <div class="flex items-baseline gap-2 my-4">
                <span class="text-3xl font-black text-slate-900 dark:text-white font-mono">300</span>
                <span class="text-xs text-slate-500 font-bold">ج.م / 180 يوم</span>
                <span class="line-through text-slate-400 text-sm font-mono mr-1">400</span>
              </div>
              <ul class="text-xs text-slate-600 dark:text-slate-400 space-y-2.5 mb-6">
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> كل مميزات النظام كاملة</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> رسائل إشعارات ومسيرات واتساب</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> نسخ احتياطي دوري للبيانات</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> تدريب وإعداد مجاني للمنظومة</li>
              </ul>
            </div>
            <a href="${waBase}${encodeURIComponent('مرحباً، أود الاشتراك في عرض باقة 6 أشهر (300 ج.م بدل 400 ج.م) لشركة ' + company)}" target="_blank"
              class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
              <span>تفعيل باقة 6 أشهر (عرض 300 ج.م)</span>
            </a>
          </div>

          <!-- 4. Annual (Featured) -->
          <div class="rounded-3xl p-6 bg-gradient-to-b from-emerald-500/10 via-white to-white dark:via-slate-900 dark:to-slate-900 border-2 border-emerald-500 shadow-md hover:shadow-2xl transition-all flex flex-col justify-between relative">
            <div class="absolute -top-3.5 right-6 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-black uppercase tracking-wider shadow-md">
              الأكثر توفيراً - خصم 25% ⭐
            </div>
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">سنوي كامل</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">خصم 25% 🏷️</span>
              </div>
              <h4 class="font-extrabold text-lg text-slate-900 dark:text-white">الباقة السنوية (سنة)</h4>
              <div class="flex items-baseline gap-2 my-4">
                <span class="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">600</span>
                <span class="text-xs text-slate-500 font-bold">ج.م / 365 يوم</span>
                <span class="line-through text-slate-400 text-sm font-mono mr-1">800</span>
              </div>
              <ul class="text-xs text-slate-600 dark:text-slate-400 space-y-2.5 mb-6">
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> راحة بال لعام كامل بدون انقطاع</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> عدد لا نهائي من الموظفين والفروع</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> دعم فني VIP مباشر وفوري</li>
                <li class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0"></i> كافة التحديثات والميزات مجاناً</li>
              </ul>
            </div>
            <a href="${waBase}${encodeURIComponent('مرحباً، أود الاشتراك في عرض الباقة السنوية (600 ج.م بدل 800 ج.م) لشركة ' + company)}" target="_blank"
              class="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/25 transition-all">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
              <span>تفعيل الباقة السنوية (عرض 600 ج.م)</span>
            </a>
          </div>
        </div>

        <!-- Direct Contact Banner -->
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <i data-lucide="phone-call" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="font-bold text-slate-900 dark:text-white">خط الدعم والاشتراكات المباشر</div>
              <div class="text-slate-500 font-mono">01093320211 (واتساب ومكالمات)</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="App.openSupportModal()" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 transition-all">
              <i data-lucide="headphones" class="w-4 h-4"></i>
              <span>تقديم طلب دعم فني</span>
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  async renderSupportSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    let user = App.currentUser || API.getCurrentUser() || {};
    try {
      const res = await API.getMe();
      if (res && res.user) {
        user = res.user;
        App.currentUser = user;
      }
    } catch (_) {}

    const company = user.company_name || '';

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold mb-1.5 border border-blue-500/20">
              <i data-lucide="headphones" class="w-3.5 h-3.5 text-blue-500"></i>
              <span>خدمة العملاء والدعم الفني المباشر</span>
            </div>
            <h2 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">مركز الدعم الفني والمساعدة</h2>
            <p class="text-xs text-slate-500 mt-1">فريقنا متواجد على مدار الساعة لمساعدتك في أي استفسار أو مشكلة تقنية</p>
          </div>
          <a href="https://wa.me/201093320211?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B%D8%8C%20%D9%84%D8%AF%D9%8A%20%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%AD%D9%88%D9%84%20%D9%86%D8%B8%D8%A7%D9%85%20%D9%88%D9%82%D8%AA%D9%8A" target="_blank"
            class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 self-start sm:self-auto shadow-md shadow-emerald-500/20 transition-all">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
            <span>محادثة واتساب مباشرة: 01093320211</span>
          </a>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Ticket Form -->
          <div class="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 class="font-extrabold text-base text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <i data-lucide="send" class="w-4 h-4 text-blue-500"></i>
              <span>فتح تذكرة دعم فني جديدة</span>
            </h3>
            <p class="text-xs text-slate-500 mb-5">أرسل لنا تفاصيل المشكلة وسيقوم مهندس الدعم الفني بالتواصل معك ومتابعتها</p>

            <form onsubmit="App.submitSupportTicket(event)" class="space-y-4 text-xs">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">الاسم الكامل *</label>
                  <input type="text" id="supp-name" required value="${user.full_name || ''}" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                </div>
                <div>
                  <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">رقم الهاتف / الواتساب *</label>
                  <input type="tel" id="supp-phone" required value="${user.phone || ''}" placeholder="01xxxxxxxxx" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-left" dir="ltr" />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">اسم المؤسسة أو الشركة</label>
                  <input type="text" id="supp-company" value="${company}" class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                </div>
                <div>
                  <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">نوع المشكلة أو الاستفسار *</label>
                  <select id="supp-subject" required class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <option value="مشكلة في تسجيل الدخول">مشكلة في تسجيل الدخول</option>
                    <option value="مشكلة في الحضور والانصراف / الموقع">مشكلة في الحضور والانصراف / الموقع</option>
                    <option value="استفسار عن باقات الاشتراك والتجديد">استفسار عن باقات الاشتراك والتجديد</option>
                    <option value="طلب ميزة أو تطوير خاص">طلب ميزة أو تطوير خاص</option>
                    <option value="مشكلة تقنية عامة">مشكلة تقنية عامة</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">تفاصيل المشكلة *</label>
                <textarea id="supp-message" required rows="5" placeholder="يرجى كتابة تفاصيل المشكلة أو استفسارك بالتفصيل..." class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"></textarea>
              </div>

              <div class="flex justify-end pt-2">
                <button type="submit" id="supp-submit-btn" class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all">
                  <i data-lucide="send" class="w-4 h-4"></i>
                  <span>إرسال التذكرة الآن</span>
                </button>
              </div>
            </form>
          </div>

          <!-- Contact Cards -->
          <div class="lg:col-span-5 space-y-4">
            <div class="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl p-6 shadow-xl">
              <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
                <i data-lucide="message-circle" class="w-6 h-6"></i>
              </div>
              <h4 class="font-extrabold text-base mb-1">خدمة عملاء واتساب المباشرة</h4>
              <p class="text-xs text-white/80 mb-4 leading-relaxed">تواصل فوراً مع مسؤول الدعم الفني والحسابات عبر واتساب لحل المشاكل أو الاستفسار عن الباقات في أسرع وقت.</p>
              <div class="text-xl font-mono font-black mb-4 tracking-wider">01093320211</div>
              <a href="https://wa.me/201093320211" target="_blank" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-emerald-800 font-bold text-xs hover:bg-slate-100 transition-all shadow-md">
                <span>فتح محادثة واتساب</span>
                <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
              </a>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-3">
              <h4 class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="info" class="w-4 h-4 text-blue-500"></i>
                <span>نصائح سريعة قبل إرسال التذكرة:</span>
              </h4>
              <p>• إذا كان الموظف لا يظهر له زر الحضور، تأكد من تفعيل خاصية تحديد الموقع (GPS) في هاتفه وسماحه للمتصفح بالوصول للموقع الجغرافي.</p>
              <p>• إذا كان الموظف خارج النطاق، يمكنك توسيع نطاق السماح بالمتر من إعدادات موقع العمل.</p>
              <p>• لتجديد أو تمديد صلاحية الباقة، توجه إلى قائمة "باقات الاشتراك" وتواصل معنا مباشرة.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  async testWhatsAppConnection() {
    const phone = document.getElementById('rule-whatsapp-mgr-phone')?.value || '01227580963';
    try {
      showToast('جاري اختبار إرسال رسالة واتساب...', 'info');
      const res = await API.testWhatsApp({ phone });
      showToast(res.message, res.dispatch?.apiDelivered ? 'success' : 'info');
      if (res.waLink) {
        window.open(res.waLink, '_blank');
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }
};
