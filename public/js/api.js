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

      if (response.status === 401) {
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

  // Attendance
  checkIn(latitude, longitude, accuracy, photo) {
    return this.request('/attendance/check-in', {
      method: 'POST',
      body: { latitude, longitude, accuracy, photo }
    });
  },

  checkOut(latitude, longitude, accuracy, photo) {
    return this.request('/attendance/check-out', {
      method: 'POST',
      body: { latitude, longitude, accuracy, photo }
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

  deleteEmployee(id) {
    return this.request(`/employees/${id}`, {
      method: 'DELETE'
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

  updateCompanySettings(data) {
    return this.request('/settings/company', { method: 'PUT', body: data });
  },

  resetAttendanceSystem() {
    return this.request('/settings/reset-attendance-system', { method: 'POST' });
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
  }
};

// UI Notification Toast
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-emerald-600 text-white border-emerald-500',
    danger: 'bg-rose-600 text-white border-rose-500',
    warning: 'bg-amber-600 text-white border-amber-500',
    info: 'bg-blue-600 text-white border-blue-500'
  };

  const icons = {
    success: 'check-circle-2',
    danger: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info'
  };

  toast.className = `flex items-center gap-3 p-4 rounded-xl shadow-xl border ${bgColors[type] || bgColors.info} text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 max-w-md w-full`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-5 h-5 flex-shrink-0"></i>
    <div class="flex-1">${message}</div>
    <button class="text-white/80 hover:text-white" onclick="this.parentElement.remove()">
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
