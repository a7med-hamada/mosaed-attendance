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
      { id: 'hours', icon: 'calendar-clock', label: isEn ? 'Working Hours' : 'مواعيد العمل' },
      { id: 'workplace', icon: 'map-pin', label: isEn ? 'Workplace' : 'موقع العمل' },
      { id: 'archive', icon: 'coins', label: isEn ? 'Payroll & Monthly Archive' : 'مسير الرواتب والخصومات' },
      { id: 'reports', icon: 'file-text', label: isEn ? 'Reports' : 'التقارير' },
      { id: 'settings', icon: 'sliders', label: isEn ? 'Settings' : 'الإعدادات' },
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
    await this.loadLiveFeed();

    if (isLiveAutoRefresh) {
      managerLiveTimer = setInterval(() => this.loadLiveFeed(true), 8000);
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
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs min-w-[640px]">
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
                      <span class="font-mono font-bold text-slate-900 dark:text-white block">${r.check_in_time}</span>
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
                      <span class="font-mono font-bold text-slate-900 dark:text-white block">${r.check_out_time}</span>
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
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs min-w-[980px]">
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

  async openEditEmployeeModal(target) {
    const modal = document.getElementById('employee-crud-modal');
    if (!modal) return;

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

    try {
      const res = await API.updateEmployee(empId, payload);
      showToast(res.message || 'تم تحديث بيانات الموظف بنجاح', 'success');
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
  // 3. WORKING HOURS SETTINGS ("مواعيد العمل")
  // ========================================================
  async renderWorkingHoursSection() {
    const container = document.getElementById('manager-content');
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6 max-w-4xl">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="calendar-clock" class="w-5 h-5 text-blue-600"></i> تحديد مواعيد وقواعد الدوام
          </h2>
          <p class="text-xs text-slate-500">ضبط وقت بدء وانتهاء العمل، فترة السماح، وحدود التأخير والغياب ونصف اليوم</p>
        </div>

        <form onsubmit="ManagerUI.saveWorkingHours(event)" class="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6 text-xs">
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
            <button type="submit" class="py-3 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/25 flex items-center gap-2">
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
      document.getElementById('sched-start-time').value = sched.start_time || '09:00';
      document.getElementById('sched-end-time').value = sched.end_time || '17:00';
      document.getElementById('sched-grace-period').value = sched.grace_period_minutes || 15;
      document.getElementById('sched-early-leave-grace').value = sched.early_leave_grace_minutes || 15;
      document.getElementById('sched-half-day').value = sched.half_day_threshold || '12:00';
      document.getElementById('sched-absence').value = sched.absence_threshold || '13:00';
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async saveWorkingHours(e) {
    e.preventDefault();
    const data = {
      start_time: document.getElementById('sched-start-time').value,
      end_time: document.getElementById('sched-end-time').value,
      grace_period_minutes: parseInt(document.getElementById('sched-grace-period').value, 10),
      early_leave_grace_minutes: parseInt(document.getElementById('sched-early-leave-grace').value, 10) || 0,
      half_day_threshold: document.getElementById('sched-half-day').value,
      absence_threshold: document.getElementById('sched-absence').value
    };

    try {
      const res = await API.updateWorkingHours(data);
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
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
                  <td class="py-3 px-4 font-mono">${r.check_in_time || '—'}</td>
                  <td class="py-3 px-4 font-mono">${r.check_out_time || '—'}</td>
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
      <div class="space-y-6 max-w-4xl">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i data-lucide="sliders" class="w-5 h-5 text-blue-600"></i> الإعدادات والقواعد العامة
          </h2>
          <p class="text-xs text-slate-500">إدارة القواعد الأمنية، الخصومات التقديرية، والرقابة</p>
        </div>

        <form onsubmit="ManagerUI.saveCompanyRules(event)" class="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6 text-xs">
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

    try {
      const res = await API.updateCompanySettings(data);
      showToast(res.message || 'تم حفظ قواعد وشرائح الخصومات بنجاح', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
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
                  <span class="font-mono font-bold text-slate-900 dark:text-white text-xs">${record.check_in_time || '—'}</span>
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
                  <span class="font-mono font-bold text-slate-900 dark:text-white text-xs">${record.check_out_time || 'قيد العمل'}</span>
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

  // Modal: Employee Full Statistics & Attendance Track Record (With Month Picker)
  async openEmployeeStatsModal(employeeId, employeeName, selectedMonth = null) {
    const modal = document.getElementById('employee-stats-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 modal-enter text-xs max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="bar-chart-3" class="w-5 h-5 text-emerald-500"></i>
                إحصائيات وسجل التزام: ${employeeName || 'الموظف'}
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">تفاصيل أيام الحضور والتأخير والخروج المبكر والغياب وساعات العمل</p>
            </div>
            <button onclick="document.getElementById('employee-stats-modal').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="py-12 text-center text-slate-400" id="emp-stats-content">
            <div class="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            جاري تحليل وسحب سجلات الموظف...
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
      const availMonths = res.availableMonths || [];
      const activeMonth = res.selectedMonth || res.currentMonth;

      const content = document.getElementById('emp-stats-content');
      if (!content) return;

      content.innerHTML = `
        <div class="space-y-5 overflow-y-auto pr-1 max-h-[75vh] text-right">
          <!-- Quick Profile Bar & Month Filter -->
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <img src="${emp.profile_photo || '/uploads/avatar.svg'}" class="w-11 h-11 rounded-2xl object-cover bg-slate-200 dark:bg-slate-700 shadow-sm" />
              <div>
                <span class="font-extrabold text-sm text-slate-900 dark:text-white block">${emp.full_name}</span>
                <span class="text-[11px] text-slate-400 font-mono">${emp.employee_code} • ${emp.job_title || 'موظف'} (${emp.department_name || 'عام'})</span>
              </div>
            </div>

            <!-- Month Switcher Dropdown inside Modal -->
            <div class="flex items-center gap-2">
              <label class="text-[11px] text-slate-400 font-bold whitespace-nowrap">شهر الإحصائية:</label>
              <select onchange="ManagerUI.openEmployeeStatsModal(${employeeId}, '${(emp.full_name || '').replace(/'/g, "\\'")}', this.value)"
                class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                ${availMonths.map(m => `
                  <option value="${m}" ${m === activeMonth ? 'selected' : ''}>
                    📅 ${m === res.currentMonth ? `${m} (الشهر الحالي)` : m}
                  </option>
                `).join('')}
                <option value="all" ${activeMonth === 'all' ? 'selected' : ''}>جميع الشهور (تراكمي)</option>
              </select>
            </div>
          </div>

          <!-- The 4 Core User-Requested Metrics Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <!-- Late Days -->
            <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-right">
              <span class="text-[11px] font-bold text-amber-500 block">أيام التأخير</span>
              <div class="flex items-baseline gap-1 mt-1">
                <span class="text-2xl font-extrabold text-amber-400 font-mono">${s.lateDays}</span>
                <span class="text-[11px] text-amber-500/80">يوم</span>
              </div>
              <span class="text-[10px] text-amber-400/80 block mt-1 font-semibold">إجمالي: ${formatMinutesArabic(s.totalLateMinutes)}</span>
            </div>

            <!-- Early Leave Days -->
            <div class="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-right">
              <span class="text-[11px] font-bold text-purple-400 block">أيام الخروج المبكر</span>
              <div class="flex items-baseline gap-1 mt-1">
                <span class="text-2xl font-extrabold text-purple-400 font-mono">${s.earlyLeaveDays}</span>
                <span class="text-[11px] text-purple-400/80">يوم</span>
              </div>
              <span class="text-[10px] text-purple-400/80 block mt-1 font-semibold">إجمالي: ${formatMinutesArabic(s.totalEarlyLeaveMinutes || s.totalEarlyMinutes)}</span>
            </div>

            <!-- Absent Days -->
            <div class="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-right">
              <span class="text-[11px] font-bold text-rose-400 block">أيام الغياب</span>
              <div class="flex items-baseline gap-1 mt-1">
                <span class="text-2xl font-extrabold text-rose-400 font-mono">${s.absentDays}</span>
                <span class="text-[11px] text-rose-400/80">يوم</span>
              </div>
              <span class="text-[10px] text-rose-400/80 block mt-1">غياب غير مسجل</span>
            </div>

            <!-- On-Time Days -->
            <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-right">
              <span class="text-[11px] font-bold text-emerald-400 block">حضور في الموعد</span>
              <div class="flex items-baseline gap-1 mt-1">
                <span class="text-2xl font-extrabold text-emerald-400 font-mono">${s.onTimeDays}</span>
                <span class="text-[11px] text-emerald-400/80">يوم</span>
              </div>
              <span class="text-[10px] text-emerald-400/80 block mt-1">نصف يوم: ${s.halfDays} يوم</span>
            </div>
          </div>

          <!-- Secondary Summary Metrics & Payroll Details -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-right">
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <span class="text-[11px] text-slate-500 dark:text-slate-400 font-bold block">المرتب الأساسي للشهر:</span>
              <span class="font-extrabold text-slate-900 dark:text-white font-mono text-base mt-0.5 block">${(s.baseSalary || 3000).toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div class="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <span class="text-[11px] text-rose-500 dark:text-rose-400 font-bold block">إجمالي الخصومات المطبقة:</span>
              <span class="font-extrabold text-rose-600 dark:text-rose-400 font-mono text-base mt-0.5 block">-${(s.totalDeductions || 0).toLocaleString('ar-EG')} ج.م</span>
              <span class="text-[10px] text-rose-500/80 block mt-0.5 font-medium">
                (تأخير: ${(s.totalLateDeductions || 0)} ج.م • غياب: ${(s.totalAbsenceDeductions || 0)} ج.م)
              </span>
            </div>
            <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
              <span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block">صافي القبض المستحق:</span>
              <span class="font-black text-emerald-600 dark:text-emerald-400 font-mono text-lg mt-0.5 block">
                ${(s.netSalary !== undefined ? s.netSalary : Math.max(0, (s.baseSalary || 3000) - (s.totalDeductions || 0))).toLocaleString('ar-EG')} ج.م
              </span>
            </div>
          </div>

          <!-- Recent Attendance History Table -->
          <div>
            <h4 class="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2">سجل أيام الحضور والانصراف والخصم (${activeMonth}):</h4>
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
                        <td class="py-2.5 px-3">${rec.check_in_time || '—'}</td>
                        <td class="py-2.5 px-3">${rec.check_out_time || '—'}</td>
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
          <button onclick="ManagerUI.openAdvancesManagementModal('${targetMonth}')"
            class="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all">
            <i data-lucide="hand-coins" class="w-4 h-4"></i> إدارة ومراجعة السلف
          </button>
          <button onclick="window.open('/api/reports/export/csv?date_from=${targetMonth}-01&date_to=${targetMonth}-31', '_blank')"
            class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all">
            <i data-lucide="download" class="w-4 h-4"></i> تصدير Excel
          </button>
          <button onclick="ManagerUI.confirmResetArchive()"
            class="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all" title="تصفير سجلات وأرشيف الحضور والبدء من جديد">
            <i data-lucide="rotate-ccw" class="w-4 h-4"></i> تصفير الأرشيف
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
            <span class="text-xs text-slate-400 font-mono">${summaries.length} موظف مسجل</span>
          </div>

          ${summaries.length === 0 ? `
            <div class="p-12 text-center text-slate-500 text-xs">لا توجد سجلات للموظفين في هذا الشهر.</div>
          ` : `
            <div class="overflow-x-auto">
              <table class="w-full text-right text-xs min-w-[980px]">
                <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold uppercase border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th class="py-3.5 px-4">الموظف</th>
                    <th class="py-3.5 px-3 text-center">المرتب الأساسي</th>
                    <th class="py-3.5 px-3 text-center">الحضور</th>
                    <th class="py-3.5 px-3">التأخير (الشرائح)</th>
                    <th class="py-3.5 px-3 text-center">الغياب</th>
                    <th class="py-3.5 px-3 text-center">المكافآت (+)</th>
                    <th class="py-3.5 px-3 text-center">السلف (-)</th>
                    <th class="py-3.5 px-3 text-center">صافي القبض</th>
                    <th class="py-3.5 px-4 text-center">الإجراءات والطباعة</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  ${summaries.map(s => {
                    const baseSal = s.baseSalary || 3000;
                    const netSal = s.netSalary !== undefined ? s.netSalary : Math.max(0, baseSal + (s.totalBonuses || 0) - (s.totalDeductions || 0) - (s.totalAdvances || 0));
                    return `
                    <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td class="py-3.5 px-4">
                        <div class="flex items-center gap-3">
                          <img src="${s.employee.profile_photo || '/uploads/avatar.svg'}" class="w-8 h-8 rounded-full object-cover bg-slate-100 dark:bg-slate-800" />
                          <div>
                            <span class="font-bold text-slate-800 dark:text-slate-200 block">${s.employee.full_name}</span>
                            <span class="text-[10px] text-slate-400 font-mono">${s.employee.employee_code} • ${s.employee.job_title || s.employee.department_name || 'موظف'}</span>
                          </div>
                        </div>
                      </td>
                      <td class="py-3.5 px-3 text-center font-bold text-slate-700 dark:text-slate-300 font-mono">
                        ${baseSal.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td class="py-3.5 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        ${s.presentDays || s.onTimeDays} يوم
                      </td>
                      <td class="py-3.5 px-3">
                        ${s.lateDays > 0 ? `
                          <div>
                            <span class="font-bold text-amber-500 block">${s.lateDays} يوم (${formatMinutesArabic(s.totalLateMinutes)})</span>
                            <span class="text-[10px] text-rose-500 font-semibold font-mono">خصم: ${(s.totalLateDeductions || 0).toLocaleString('ar-EG')} ج.م</span>
                          </div>
                        ` : '<span class="text-emerald-500 font-bold">لا يوجد ✓</span>'}
                      </td>
                      <td class="py-3.5 px-3 text-center">
                        ${s.absentDays > 0 ? `
                          <div>
                            <span class="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 font-bold font-mono">${s.absentDays} يوم</span>
                            ${s.totalAbsenceDeductions > 0 ? `<span class="text-[10px] text-rose-400 block font-mono mt-0.5">-${(s.totalAbsenceDeductions).toLocaleString('ar-EG')} ج.م</span>` : ''}
                          </div>
                        ` : '<span class="text-emerald-500 font-bold">0</span>'}
                      </td>
                      <td class="py-3.5 px-3 text-center">
                        ${(s.totalBonuses || 0) > 0 ? `
                          <span class="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold font-mono">+${s.totalBonuses.toLocaleString('ar-EG')} ج.م</span>
                        ` : `<span class="text-slate-400 font-mono">0</span>`}
                      </td>
                      <td class="py-3.5 px-3 text-center">
                        ${(s.totalAdvances || 0) > 0 ? `
                          <span class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold font-mono">-${s.totalAdvances.toLocaleString('ar-EG')} ج.م</span>
                        ` : `<span class="text-slate-400 font-mono">0</span>`}
                      </td>
                      <td class="py-3.5 px-3 text-center">
                        <span class="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black font-mono text-sm border border-emerald-500/25 inline-block">
                          ${netSal.toLocaleString('ar-EG')} ج.م
                        </span>
                      </td>
                      <td class="py-3.5 px-4 text-center">
                        <div class="flex items-center justify-center gap-1.5 flex-wrap">
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
                        <button onclick="ManagerUI.deleteBonus(${b.id}, ${emp.id}, '${month}')" class="text-rose-500 hover:text-rose-700 p-1" title="حذف المكافأة">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
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
                          <button onclick="ManagerUI.deleteAdvance(${a.id}, ${emp.id}, '${month}')" class="text-rose-500 hover:text-rose-700 p-1" title="حذف السلفة">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
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
                        <td class="py-2.5 px-3">${r.check_in_time || '—'}</td>
                        <td class="py-2.5 px-3">${r.check_out_time || '—'}</td>
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
  async openAddBonusModal(preselectedEmployeeId = null, preselectedMonth = null) {
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
              <input type="number" id="bonus-amount-input" step="1" min="1" required placeholder="مثال: 500"
                class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-emerald-600 text-sm" />
            </div>

            <div>
              <label class="block text-slate-600 dark:text-slate-300 font-bold mb-1">سبب أو عنوان المكافأة *</label>
              <input type="text" id="bonus-reason-input" required placeholder="مثال: كفاءة وإنجاز مهمة، تميز في العمل، حافز شهري"
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
      if (this.activeSection === 'archive') {
        await this.renderMonthlyArchiveSection(month);
      }
    } catch (err) {
      showToast(err.message, 'danger');
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
                <i data-lucide="hand-coins" class="w-5 h-5 text-amber-500"></i> إدارة ومراجعة سلف الموظفين
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5">مراجعة طلبات السلف المقدمة من الموظفين والموافقة عليها أو تسجيل سلف مباشرة</p>
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
                      <div class="flex items-center justify-center gap-1.5">
                        <button onclick="ManagerUI.reviewAdvanceRequest(${a.id}, 'approved', '${targetMonth}')"
                          class="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs" title="موافقة على السلفة وخصمها من الراتب">
                          موافقة ✓
                        </button>
                        <button onclick="ManagerUI.reviewAdvanceRequest(${a.id}, 'rejected', '${targetMonth}')"
                          class="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 font-bold text-xs" title="رفض طلب السلفة">
                          رفض ✗
                        </button>
                      </div>
                    ` : `
                      <div class="flex items-center justify-center gap-2">
                        <span class="text-[10px] text-slate-400 font-mono">${a.approver_name ? 'بواسطة: ' + a.approver_name : 'تمت المعالجة'}</span>
                        <button onclick="ManagerUI.deleteAdvance(${a.id}, null, '${targetMonth}')" class="text-rose-500 hover:text-rose-700 p-1" title="حذف السجل">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
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
      <div class="space-y-6 max-w-4xl">
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

        <!-- Danger Zone Card: Reset Attendance & Start Fresh -->
        <div class="rounded-3xl p-6 sm:p-7 border border-rose-500/25 bg-rose-500/5 dark:bg-rose-950/25 space-y-4 shadow-sm">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1.5">
              <h4 class="font-extrabold text-sm sm:text-base text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <i data-lucide="alert-octagon" class="w-5 h-5 text-rose-500"></i>
                تصفير سجلات الحضور والبدء من جديد (إعادة التعيين)
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                يقوم هذا الإجراء بحذف وتصفير كافة سجلات الحضور والانصراف، الأرشيف، وطلبات التصحيح والإشعارات لتبدأ المنظومة نظيفة تماماً من الصفر.
              </p>
              <div class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-0.5">
                <i data-lucide="shield-check" class="w-4 h-4 text-emerald-500"></i>
                <span>محفوظ بأمان تام: الموظفون ببياناتهم، مواعيد الدوام الرسمية، وموقع المنشأة الجغرافي لن يتم المساس بهم.</span>
              </div>
            </div>
            <button type="button" onclick="ManagerUI.openResetSystemModal()"
              class="px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-600/25 flex items-center gap-2 self-start sm:self-center transition-all transform active:scale-98 whitespace-nowrap">
              <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
              <span>تصفير الحضور والبدء من جديد</span>
            </button>
          </div>
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
  }
};
