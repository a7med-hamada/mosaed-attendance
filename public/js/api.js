// Centralized API Client & Utility Functions
const API = {
  baseUrl: '/api',

  getToken() {
    return localStorage.getItem('wf_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('wf_token', token);
    } else {
      localStorage.removeItem('wf_token');
    }
  },

  getCurrentUser() {
    try {
      const u = localStorage.getItem('wf_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem('wf_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('wf_user');
    }
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 401 && !endpoint.includes('verify-password') && !endpoint.includes('login')) {
        this.setToken(null);
        this.setCurrentUser(null);
        if (!window.location.pathname.includes('login')) {
          window.location.reload();
        }
        throw new Error(t('logging_in'));
      }

      // Handle CSV downloads or file responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/csv')) {
        return response.blob();
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'حدث خطأ في الاتصال بالخادم');
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Auth
  registerManager(data) {
    return this.request('/auth/register-manager', {
      method: 'POST',
      body: data
    });
  },

  login(identifier, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: { identifier, password }
    });
  },

  getMe() {
    return this.request('/auth/me');
  },

  updateProfile(data) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: data
    });
  },

  verifyPassword(password) {
    return this.request('/auth/verify-password', {
      method: 'POST',
      body: { password }
    });
  },

  faceEnroll(descriptor, photo) {
    return this.request('/auth/face-enroll', {
      method: 'POST',
      body: { descriptor, photo }
    });
  },

  requestFaceReset(reason) {
    return this.request('/attendance/face-reset-request', {
      method: 'POST',
      body: { reason }
    });
  },

  getFaceResetStatus() {
    return this.request('/attendance/face-reset-status');
  },

  getFaceResetRequests() {
    return this.request('/attendance/face-reset-requests');
  },

  reviewFaceReset(id, action, notes = '', notif_id = null) {
    return this.request(`/attendance/face-reset-requests/${id || 0}/review`, {
      method: 'PUT',
      body: { action, notes, notif_id }
    });
  },

  // Attendance
  checkIn(latitude, longitude, accuracy, photo, shift_id = null, face_descriptor = null) {
    const body = { latitude, longitude, accuracy, photo };
    if (shift_id) body.shift_id = shift_id;
    if (face_descriptor) body.face_descriptor = face_descriptor;
    return this.request('/attendance/check-in', {
      method: 'POST',
      body
    });
  },

  checkOut(latitude, longitude, accuracy, photo, face_descriptor = null) {
    const body = { latitude, longitude, accuracy, photo };
    if (face_descriptor) body.face_descriptor = face_descriptor;
    return this.request('/attendance/check-out', {
      method: 'POST',
      body
    });
  },

  getMyToday() {
    return this.request('/attendance/my-today');
  },

  getLiveToday() {
    return this.request('/attendance/live-today');
  },

  getHistory(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/attendance/history?${qs}`);
  },

  updateAttendance(id, data) {
    return this.request(`/attendance/${id}`, {
      method: 'PUT',
      body: data
    });
  },

  deleteAttendance(id) {
    return this.request(`/attendance/${id}`, {
      method: 'DELETE'
    });
  },

  createManualAttendanceRecord(data) {
    return this.request('/attendance/manual-record', {
      method: 'POST',
      body: data
    });
  },

  bulkManualAttendance(data) {
    return this.request('/attendance/bulk-manual-records', {
      method: 'POST',
      body: data
    });
  },

  batchManualAttendance(items) {
    return this.request('/attendance/batch-manual-records', {
      method: 'POST',
      body: { items }
    });
  },

  // Corrections
  getCorrections(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/corrections?${qs}`);
  },

  submitCorrection(data) {
    return this.request('/corrections', {
      method: 'POST',
      body: data
    });
  },

  reviewCorrection(id, action, review_notes) {
    return this.request(`/corrections/${id}/review`, {
      method: 'PUT',
      body: { action, review_notes }
    });
  },

  getEmployees(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/employees?${qs}`);
  },

  getEmployee(id) {
    return this.request(`/employees/${id}`);
  },

  getEmployeeStats(id, month = null) {
    const qs = month ? `?month=${encodeURIComponent(month)}` : '';
    return this.request(`/employees/${id}/stats${qs}`);
  },

  createEmployee(data) {
    return this.request('/employees', {
      method: 'POST',
      body: data
    });
  },

  updateEmployee(id, data) {
    return this.request(`/employees/${id}`, {
      method: 'PUT',
      body: data
    });
  },

  deleteEmployee(id, password = null) {
    return this.request(`/employees/${id}`, {
      method: 'DELETE',
      body: password ? { password } : undefined
    });
  },

  resetEmployeeFace(id) {
    return this.request(`/employees/${id}/reset-face`, {
      method: 'POST'
    });
  },

  // Departments & Schedules
  getDepartments() {
    return this.request('/departments');
  },

  createDepartment(data) {
    return this.request('/departments', { method: 'POST', body: data });
  },

  updateDepartment(id, data) {
    return this.request(`/departments/${id}`, { method: 'PUT', body: data });
  },

  deleteDepartment(id) {
    return this.request(`/departments/${id}`, { method: 'DELETE' });
  },

  getSchedules() {
    return this.request('/schedules');
  },

  createSchedule(data) {
    return this.request('/schedules', { method: 'POST', body: data });
  },

  updateSchedule(id, data) {
    return this.request(`/schedules/${id}`, { method: 'PUT', body: data });
  },

  deleteSchedule(id) {
    return this.request(`/schedules/${id}`, { method: 'DELETE' });
  },

  getHolidays() {
    return this.request('/schedules/holidays/list');
  },

  createHoliday(data) {
    return this.request('/schedules/holidays', { method: 'POST', body: data });
  },

  deleteHoliday(id) {
    return this.request(`/schedules/holidays/${id}`, { method: 'DELETE' });
  },

  // Settings
  getSettings() {
    return this.request('/settings');
  },

  updateWorkplace(data) {
    return this.request('/settings/workplace', { method: 'PUT', body: data });
  },

  updateWorkingHours(data) {
    return this.request('/settings/working-hours', { method: 'PUT', body: data });
  },

  getShifts() {
    return this.request('/settings/shifts');
  },

  saveShifts(data) {
    return this.request('/settings/shifts', { method: 'POST', body: data });
  },

  updateCompanySettings(data) {
    return this.request('/settings/company', { method: 'PUT', body: data });
  },

  updateManagerAttendance(data) {
    return this.request('/settings/manager-attendance', { method: 'PUT', body: data });
  },

  resetManagerFace() {
    return this.request('/settings/manager-face-reset', { method: 'POST' });
  },

  resetAttendanceSystem() {
    return this.request('/settings/reset-attendance-system', { method: 'POST' });
  },

  // Company Branches & Multi-Branch Requests
  getBranches() {
    return this.request('/branches');
  },

  requestBranch(data) {
    return this.request('/branches/request', {
      method: 'POST',
      body: data
    });
  },

  cancelBranchRequest(id) {
    return this.request(`/branches/request/${id}`, {
      method: 'DELETE'
    });
  },

  deleteBranch(id, password) {
    return this.request(`/branches/${id}`, {
      method: 'DELETE',
      body: { password }
    });
  },

  // Reports
  getMonthlySummary(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/reports/monthly-summary?${qs}`);
  },

  getAvailableMonths() {
    return this.request('/reports/available-months');
  },

  getEmployeeMonthDetails(employeeId, month) {
    const qs = new URLSearchParams({ employee_id: employeeId, month }).toString();
    return this.request(`/reports/employee-month-details?${qs}`);
  },

  getDepartmentSummary(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/reports/department-summary?${qs}`);
  },

  exportCsv(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/reports/export/csv?${qs}`);
  },

  resetArchive() {
    return this.request('/reports/reset-archive', { method: 'POST' });
  },

  // Gamification & Attendance Score (لوحة الشرف وموظف الشهر ومؤشر الالتزام)
  getLeaderboard(month) {
    const qs = month ? `?month=${month}` : '';
    return this.request(`/reports/leaderboard${qs}`);
  },

  getMyScore(month, employeeId) {
    const params = {};
    if (month) params.month = month;
    if (employeeId) params.employee_id = employeeId;
    const qs = new URLSearchParams(params).toString();
    return this.request(`/reports/my-score${qs ? `?${qs}` : ''}`);
  },

  // Salary Advances (السلف والمسحوبات)
  getAdvances(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/advances?${qs}`);
  },

  getAdvanceEligibility(month = '') {
    const qs = month ? `?month=${encodeURIComponent(month)}` : '';
    return this.request(`/advances/eligibility${qs}`);
  },

  submitAdvance(data) {
    return this.request('/advances', {
      method: 'POST',
      body: data
    });
  },

  reviewAdvance(id, action, review_notes) {
    return this.request(`/advances/${id}/review`, {
      method: 'PUT',
      body: { action, review_notes }
    });
  },

  deleteAdvance(id) {
    return this.request(`/advances/${id}`, {
      method: 'DELETE'
    });
  },

  // Bonuses & Incentives (المكافآت والحوافز)
  getBonuses(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/bonuses?${qs}`);
  },

  createBonus(data) {
    return this.request('/bonuses', {
      method: 'POST',
      body: data
    });
  },

  deleteBonus(id) {
    return this.request(`/bonuses/${id}`, {
      method: 'DELETE'
    });
  },

  // Employee Deductions & Penalties (الخصومات والجزاءات اليدوية)
  getDeductions(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/deductions?${qs}`);
  },

  createDeduction(data) {
    return this.request('/deductions', {
      method: 'POST',
      body: data
    });
  },

  deleteDeduction(id) {
    return this.request(`/deductions/${id}`, {
      method: 'DELETE'
    });
  },

  // Leaves & Permissions (الإجازات والأذونات الرسمية)
  getLeaveBalance(employeeId) {
    const qs = employeeId ? `?employee_id=${employeeId}` : '';
    return this.request(`/leaves/balance${qs}`);
  },

  getLeaves(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/leaves?${qs}`);
  },

  submitLeave(data) {
    return this.request('/leaves', {
      method: 'POST',
      body: data
    });
  },

  reviewLeave(id, status, review_notes) {
    return this.request(`/leaves/${id}/review`, {
      method: 'PUT',
      body: { status, review_notes }
    });
  },

  deleteLeave(id) {
    return this.request(`/leaves/${id}`, {
      method: 'DELETE'
    });
  },

  getPermissions(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/permissions?${qs}`);
  },

  submitPermission(data) {
    return this.request('/permissions', {
      method: 'POST',
      body: data
    });
  },

  reviewPermission(id, status, review_notes) {
    return this.request(`/permissions/${id}/review`, {
      method: 'PUT',
      body: { status, review_notes }
    });
  },

  deletePermission(id) {
    return this.request(`/permissions/${id}`, {
      method: 'DELETE'
    });
  },

  // Notifications
  getNotifications() {
    return this.request('/notifications');
  },

  markNotificationRead(id) {
    return this.request(`/notifications/${id}/read`, { method: 'PUT' });
  },

  markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'PUT' });
  },

  clearAllNotifications() {
    return this.request('/notifications/clear-all', { method: 'DELETE' });
  },

  deleteNotification(id) {
    return this.request(`/notifications/${id}`, { method: 'DELETE' });
  },

  // Audit
  getAuditLogs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/audit?${qs}`);
  },

  // WhatsApp
  getWhatsAppSettings() {
    return this.request('/whatsapp/settings');
  },
  saveWhatsAppSettings(data) {
    return this.request('/whatsapp/settings', {
      method: 'PUT',
      body: data
    });
  },
  getMorningBriefing(date) {
    const qs = date ? `?date=${date}` : '';
    return this.request(`/whatsapp/morning-briefing${qs}`);
  },
  sendMorningBriefing(data = {}) {
    return this.request('/whatsapp/morning-briefing/send', {
      method: 'POST',
      body: data
    });
  },
  sendPayslipWhatsApp(data) {
    return this.request('/whatsapp/send-payslip', {
      method: 'POST',
      body: data
    });
  },
  sendAllPayslipsWhatsApp(month) {
    return this.request('/whatsapp/send-all-payslips', {
      method: 'POST',
      body: { month }
    });
  },
  testWhatsApp(data) {
    return this.request('/whatsapp/test', {
      method: 'POST',
      body: data
    });
  },
  getWhatsAppLogs() {
    return this.request('/whatsapp/logs');
  },

  // Support & Packages
  getPackages() {
    return this.request('/support/packages');
  },
  submitSupportTicket(data) {
    return this.request('/support/tickets', {
      method: 'POST',
      body: data
    });
  }
};

// Universal 12-hour Time Formatter (ص / م)
function formatTime12(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === '—' || timeStr === 'null' || timeStr === 'undefined') return '—';
  
  // If it's a full ISO or date string
  if (typeof timeStr === 'string' && (timeStr.includes('T') || (timeStr.includes('-') && timeStr.includes(':')))) {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const period = hours >= 12 ? 'م' : 'ص';
      hours = hours % 12 || 12;
      return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
    }
  }

  const parts = String(timeStr).trim().split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');
    if (!isNaN(hours)) {
      const period = hours >= 12 ? 'م' : 'ص';
      hours = hours % 12 || 12;
      return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
    }
  }
  return timeStr;
}
window.formatTime12 = formatTime12;

function formatDateTime12(dateTimeStr) {
  if (!dateTimeStr || dateTimeStr === '-' || dateTimeStr === '—') return '—';
  const d = new Date(dateTimeStr);
  if (isNaN(d.getTime())) return dateTimeStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12 || 12;
  return `${y}-${m}-${day} ${String(hours).padStart(2, '0')}:${mins} ${period}`;
}
window.formatDateTime12 = formatDateTime12;

// WhatsApp Link Generator
function getWhatsAppLink(phone, message) {
  if (!phone) return '#';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (/^01[0125][0-9]{8}$/.test(cleaned)) cleaned = '2' + cleaned;
  else if (/^1[0125][0-9]{8}$/.test(cleaned)) cleaned = '20' + cleaned;
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message || '')}`;
}
window.getWhatsAppLink = getWhatsAppLink;


// SweetAlert2 Modern Dialog Engine
function getSwalThemeOptions() {
  const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
  return {
    background: isDark ? '#0f172a' : '#ffffff',
    color: isDark ? '#f8fafc' : '#0f172a',
    buttonsStyling: false,
    customClass: {
      popup: 'swal2-qasetly-popup',
      title: 'swal2-qasetly-title',
      htmlContainer: 'swal2-qasetly-html',
      confirmButton: 'swal2-confirm',
      cancelButton: 'swal2-cancel',
      actions: 'swal2-actions'
    }
  };
}

async function showAppConfirm(titleOrOpts, messageText = '', icon = 'warning') {
  if (typeof window.Swal === 'undefined') {
    return confirm(typeof titleOrOpts === 'object' ? (titleOrOpts.text || titleOrOpts.title) : (messageText ? `${titleOrOpts}\n${messageText}` : titleOrOpts));
  }

  const base = getSwalThemeOptions();
  let title = 'تأكيد الإجراء';
  let text = '';
  let html = null;
  let confirmText = 'تأكيد';
  let cancelText = 'إلغاء';
  let isDanger = true;
  let customIcon = icon;

  if (typeof titleOrOpts === 'object' && titleOrOpts !== null) {
    title = titleOrOpts.title || title;
    text = titleOrOpts.text || '';
    html = titleOrOpts.html || null;
    confirmText = titleOrOpts.confirmButtonText || confirmText;
    cancelText = titleOrOpts.cancelButtonText || cancelText;
    isDanger = titleOrOpts.isDanger !== undefined ? titleOrOpts.isDanger : true;
    customIcon = titleOrOpts.icon || customIcon;
  } else if (messageText) {
    title = titleOrOpts;
    text = messageText;
  } else {
    text = titleOrOpts;
  }

  if (!html && text && text.includes('\n')) {
    html = text.split('\n').filter(Boolean).map(line => `<p class="mb-1.5 last:mb-0">${line}</p>`).join('');
    text = undefined;
  }

  const confirmClass = isDanger ? 'swal2-confirm swal2-qasetly-danger' : 'swal2-confirm';

  const res = await Swal.fire({
    ...base,
    title: title,
    text: text,
    html: html,
    icon: customIcon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    focusCancel: true,
    customClass: {
      ...base.customClass,
      confirmButton: confirmClass
    }
  });

  return res.isConfirmed;
}

async function showAppAlert(titleOrText, textOrType = '', type = 'info') {
  if (typeof window.Swal === 'undefined') {
    alert(typeof textOrType === 'string' && textOrType && !['info', 'success', 'error', 'warning'].includes(textOrType) ? `${titleOrText}\n${textOrType}` : titleOrText);
    return;
  }

  const base = getSwalThemeOptions();
  let title = '';
  let text = '';
  let html = null;
  let icon = 'info';

  if (arguments.length === 1) {
    text = titleOrText;
  } else if (arguments.length === 2) {
    if (['info', 'success', 'error', 'warning', 'question'].includes(textOrType)) {
      text = titleOrText;
      icon = textOrType;
    } else {
      title = titleOrText;
      text = textOrType;
    }
  } else {
    title = titleOrText;
    text = textOrType;
    icon = type;
  }

  if (text && text.includes('\n')) {
    html = text.split('\n').filter(Boolean).map(line => `<p class="mb-1.5 last:mb-0">${line}</p>`).join('');
    text = undefined;
  }

  return Swal.fire({
    ...base,
    title: title || undefined,
    text: text,
    html: html,
    icon: icon,
    confirmButtonText: 'حسناً'
  });
}

// Hook native alert so any unexpected alert() call renders as SweetAlert2

async function showAppPrompt(titleOrOpts, messageText = '', defaultValue = '') {
  if (typeof window.Swal === 'undefined') {
    return prompt(typeof titleOrOpts === 'object' ? (titleOrOpts.title || titleOrOpts.text) : (messageText || titleOrOpts), defaultValue);
  }

  const base = getSwalThemeOptions();
  let title = 'إدخال بيانات';
  let inputLabel = '';
  let inputValue = defaultValue;
  let placeholder = '';
  let confirmText = 'متابعة';
  let cancelText = 'إلغاء';
  let inputType = 'text';
  let isDanger = false;
  let icon = 'question';

  if (typeof titleOrOpts === 'object' && titleOrOpts !== null) {
    title = titleOrOpts.title || title;
    inputLabel = titleOrOpts.label || titleOrOpts.text || inputLabel;
    inputValue = titleOrOpts.defaultValue !== undefined ? titleOrOpts.defaultValue : inputValue;
    placeholder = titleOrOpts.placeholder || placeholder;
    confirmText = titleOrOpts.confirmButtonText || confirmText;
    cancelText = titleOrOpts.cancelButtonText || cancelText;
    inputType = titleOrOpts.inputType || 'text';
    isDanger = titleOrOpts.isDanger || false;
    icon = titleOrOpts.icon || icon;
  } else if (messageText) {
    title = titleOrOpts;
    inputLabel = messageText;
  } else {
    inputLabel = titleOrOpts;
  }

  const confirmClass = isDanger ? 'swal2-confirm swal2-qasetly-danger' : 'swal2-confirm';

  const res = await Swal.fire({
    ...base,
    title: title,
    input: inputType,
    inputLabel: inputLabel,
    inputValue: inputValue,
    inputPlaceholder: placeholder,
    icon: icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    customClass: {
      ...base.customClass,
      confirmButton: confirmClass,
      input: 'swal2-qasetly-input'
    }
  });

  if (res.isConfirmed) {
    return res.value !== undefined ? res.value : '';
  }
  return null;
}

if (typeof window !== 'undefined') {
  window.showAppConfirm = showAppConfirm;
  window.showAppPrompt = showAppPrompt;
  window.showAppAlert = showAppAlert;
  const _nativeAlert = window.alert;
  window.alert = function(msg) {
    if (typeof window.Swal !== 'undefined') {
      window.showAppAlert(msg);
    } else {
      _nativeAlert(msg);
    }
  };
}

// UI Notification Toast
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const iconThemes = {
    success: {
      pill: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/20',
      icon: 'check-circle-2',
      borderAccent: 'border-r-4 border-r-teal-500'
    },
    danger: {
      pill: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20',
      icon: 'alert-circle',
      borderAccent: 'border-r-4 border-r-rose-500'
    },
    warning: {
      pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
      icon: 'alert-triangle',
      borderAccent: 'border-r-4 border-r-amber-500'
    },
    info: {
      pill: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20',
      icon: 'info',
      borderAccent: 'border-r-4 border-r-teal-500'
    }
  };

  const theme = iconThemes[type] || iconThemes.info;

  toast.className = `flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold transition-all duration-300 transform translate-y-2 opacity-0 max-w-md w-full pointer-events-auto ${theme.borderAccent}`;
  toast.innerHTML = `
    <div class="w-8 h-8 rounded-xl flex items-center justify-center border flex-shrink-0 ${theme.pill}">
      <i data-lucide="${theme.icon}" class="w-4 h-4"></i>
    </div>
    <div class="flex-1 leading-snug">${message}</div>
    <button class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" onclick="this.parentElement.remove()">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Client-side Haversine Distance calculation
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Format minutes into fluent Arabic hours and minutes:
// e.g. 100 -> "ساعة و 40 دقيقة", 60 -> "ساعة", 120 -> "ساعتان", 15 -> "15 دقيقة"
function formatMinutesArabic(totalMinutes) {
  const mins = Math.round(Number(totalMinutes) || 0);
  if (mins <= 0) return '0 دقيقة';

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;

  if (hours === 0) {
    if (remainingMins === 1) return 'دقيقة واحدة';
    if (remainingMins === 2) return 'دقيقتان';
    if (remainingMins >= 3 && remainingMins <= 10) return `${remainingMins} دقائق`;
    return `${remainingMins} دقيقة`;
  }

  let hoursText = '';
  if (hours === 1) {
    hoursText = 'ساعة';
  } else if (hours === 2) {
    hoursText = 'ساعتان';
  } else if (hours >= 3 && hours <= 10) {
    hoursText = `${hours} ساعات`;
  } else {
    hoursText = `${hours} ساعة`;
  }

  if (remainingMins === 0) {
    return hoursText;
  }

  let minsText = '';
  if (remainingMins === 1) {
    minsText = 'دقيقة واحدة';
  } else if (remainingMins === 2) {
    minsText = 'دقيقتان';
  } else if (remainingMins >= 3 && remainingMins <= 10) {
    minsText = `${remainingMins} دقائق`;
  } else {
    minsText = `${remainingMins} دقيقة`;
  }

  return `${hoursText} و ${minsText}`;
}

// Status Badge Generator Helper
function getStatusBadge(status) {
  const s = status || 'Present';
  let badgeClass = 'badge-present';
  let label = t('status_present');

  switch (s) {
    case 'On Time':
      badgeClass = 'badge-ontime';
      label = t('status_ontime');
      break;
    case 'Late':
      badgeClass = 'badge-late';
      label = t('status_late');
      break;
    case 'Half Day':
      badgeClass = 'badge-halfday';
      label = t('status_halfday');
      break;
    case 'Absent':
      badgeClass = 'badge-absent';
      label = t('status_absent');
      break;
    case 'Early Leave':
      badgeClass = 'badge-earlyleave';
      label = t('status_earlyleave');
      break;
    case 'On Leave':
      badgeClass = 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
      label = 'إجازة معتمدة';
      break;
    case 'Outside Location':
      badgeClass = 'badge-outside';
      label = t('status_outsidelocation');
      break;
    case 'Pending Review':
      badgeClass = 'badge-late';
      label = t('status_pendingreview');
      break;
    case 'Approved':
      badgeClass = 'badge-present';
      label = t('status_approved');
      break;
    case 'Rejected':
      badgeClass = 'badge-absent';
      label = t('status_rejected');
      break;
    default:
      badgeClass = 'badge-present';
      label = s;
  }

  return `<span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${badgeClass}">${label}</span>`;
}


// ==========================================================================
// E-Wallet, InstaPay & Banking Payout Utilities
// ==========================================================================
const PAYOUT_METHODS_MAP = {
  vodafone_cash: {
    key: 'vodafone_cash',
    label: 'فودافون كاش',
    shortLabel: 'فودافون كاش',
    icon: 'smartphone',
    color: 'rose',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30',
    ussdPrefix: '*9*7*',
    isUssd: true,
    placeholder: '010XXXXXXXX'
  },
  instapay: {
    key: 'instapay',
    label: 'إنستاباي (InstaPay)',
    shortLabel: 'إنستاباي',
    icon: 'zap',
    color: 'purple',
    badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30',
    isInstaPay: true,
    placeholder: 'name@instapay أو رقم الهاتف'
  },
  orange_cash: {
    key: 'orange_cash',
    label: 'أورنج كاش',
    shortLabel: 'أورنج كاش',
    icon: 'smartphone',
    color: 'orange',
    badgeClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30',
    ussdPrefix: '*115*1*',
    isUssd: true,
    placeholder: '012XXXXXXXX'
  },
  etisalat_cash: {
    key: 'etisalat_cash',
    label: 'إي آند كاش (اتصالات)',
    shortLabel: 'اتصالات كاش',
    icon: 'smartphone',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    ussdPrefix: '*777*1*',
    isUssd: true,
    placeholder: '011XXXXXXXX'
  },
  we_pay: {
    key: 'we_pay',
    label: 'وي باي (WE Pay)',
    shortLabel: 'وي باي',
    icon: 'smartphone',
    color: 'indigo',
    badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30',
    ussdPrefix: '*322*1*',
    isUssd: true,
    placeholder: '015XXXXXXXX'
  },
  bank_account: {
    key: 'bank_account',
    label: 'حساب بنكي / آيبان (IBAN)',
    shortLabel: 'حساب بنكي',
    icon: 'landmark',
    color: 'blue',
    badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30',
    isBank: true,
    placeholder: 'رقم الحساب أو الآيبان الدولي EG...'
  },
  cash: {
    key: 'cash',
    label: 'استلام نقدي (كاش)',
    shortLabel: 'كاش',
    icon: 'banknote',
    color: 'slate',
    badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
    isCash: true,
    placeholder: 'صرف يدوي من الخزينة'
  },
  other_wallet: {
    key: 'other_wallet',
    label: 'محفظة ذكية أخرى',
    shortLabel: 'محفظة ذكية',
    icon: 'wallet',
    color: 'teal',
    badgeClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30',
    placeholder: 'رقم المحفظة / اسم الخدمة'
  }
};

function getPayoutMethodDetails(method) {
  return PAYOUT_METHODS_MAP[method] || PAYOUT_METHODS_MAP.cash;
}

function renderPayoutBadge(method, accountNum = '', providerName = '') {
  const meta = getPayoutMethodDetails(method);
  const numDisplay = accountNum ? String(accountNum).trim() : '';
  const providerDisplay = providerName ? String(providerName).trim() : '';
  
  let labelText = meta.shortLabel;
  if (providerDisplay && meta.isBank) {
    labelText = providerDisplay;
  }
  
  return `
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap ${meta.badgeClass}" title="${meta.label} ${numDisplay ? '- ' + numDisplay : ''}">
      <i data-lucide="${meta.icon}" class="w-3 h-3"></i>
      <span>${labelText}</span>
      ${numDisplay ? `<span class="font-mono text-[9px] opacity-80">${numDisplay.length > 11 ? numDisplay.slice(-6) + '..' : numDisplay}</span>` : ''}
    </span>
  `;
}

function generateUssdCode(method, accountNum, amount) {
  const meta = getPayoutMethodDetails(method);
  if (!meta.ussdPrefix || !accountNum) return null;
  const cleanNum = String(accountNum).replace(/[^0-9]/g, '');
  const cleanAmt = Math.round(Number(amount) || 0);
  if (!cleanNum || cleanAmt <= 0) return null;
  return `${meta.ussdPrefix}${cleanNum}*${cleanAmt}#`;
}

function generatePayoutWhatsAppMessage(data) {
  const { employeeName, title, amount, method, accountNumber, providerName, month } = data;
  const meta = getPayoutMethodDetails(method);
  const now = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  
  let methodText = meta.label;
  if (providerName) methodText += ` (${providerName})`;
  if (accountNumber) methodText += ` - رقم: ${accountNumber}`;

  return `السلام عليكم أخي الكريم ${employeeName || ''}،
تم بنجاح اعتماد وتحويل مستحقاتك المالية:
• البند: ${title || 'تحويل مستحقات مالية'} ${month ? `لشهر ${month}` : ''}
• المبلغ المحول: ${Number(amount || 0).toLocaleString('ar-EG')} ج.م
• وسيلة التحويل: ${methodText}
• تاريخ العملية: ${now}

يرجى مراجعة حسابك وتأكيد الاستلام. نتمنى لك دوام التوفيق والنجاح!`;
}

if (typeof window !== 'undefined') {
  window.PAYOUT_METHODS_MAP = PAYOUT_METHODS_MAP;
  window.getPayoutMethodDetails = getPayoutMethodDetails;
  window.renderPayoutBadge = renderPayoutBadge;
  window.generateUssdCode = generateUssdCode;
  window.generatePayoutWhatsAppMessage = generatePayoutWhatsAppMessage;
}
