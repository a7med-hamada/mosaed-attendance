// Internationalization (i18n) dictionary
const translations = {
  ar: {
    system_title: "وقتي - نظام إدارة الحضور والانصراف",
    login_title: "نظام وقتي | WAQTY",
    login_subtitle: "نظام إدارة الحضور والانصراف وتتبع الوقت الذكي",
    email_or_code: "البريد الإلكتروني أو الرقم الوظيفي",
    password: "كلمة المرور",
    login_button: "تسجيل الدخول",
    logging_in: "جاري تسجيل الدخول...",
    demo_accounts: "حسابات تجريبية سريعة للاختبار:",
    demo_manager: "حساب المدير العام (Manager):",
    demo_employee: "حساب موظف (Employee):",
    logout: "تسجيل الخروج",
    dashboard: "لوحة التحكم المباشرة",
    live_today: "حضور اليوم المباشر",
    attendance_history: "سجل الحضور والتقارير",
    monthly_summary: "الملخص الشهري والخصومات",
    correction_requests: "طلبات تصحيح الحضور",
    employees_mgmt: "إدارة الموظفين",
    depts_schedules: "الأقسام وجداول الدوام",
    workplace_settings: "موقع العمل والنطاق الجغرافي",
    attendance_rules: "قواعد الحضور والخصومات",
    audit_logs: "سجل العمليات والرقابة",
    my_attendance: "تسجيل الحضور والانصراف",
    my_history: "سجل حضوري",
    my_summary: "ملخصي الشهري",
    my_corrections: "طلبات تصحيحي",
    my_profile: "ملفي الشخصي",

    // Statuses
    status_present: "حاضر",
    status_ontime: "في الموعد",
    status_late: "متأخر",
    status_halfday: "نصف يوم",
    status_absent: "غائب",
    status_earlyleave: "انصراف مبكر",
    status_outsidelocation: "خارج الموقع",
    status_pendingreview: "يحتاج مراجعة",
    status_approved: "معتمد",
    status_rejected: "مرفوض",

    // Live Metrics
    metric_total_employees: "إجمالي الموظفين",
    metric_present: "حاضرون اليوم",
    metric_ontime: "في الموعد",
    metric_late: "متأخرون",
    metric_halfday: "نصف يوم",
    metric_absent: "غائبون",
    metric_working_now: "على رأس العمل الآن",
    metric_checked_out: "تم الانصراف",
    metric_attendance_rate: "نسبة الحضور",

    // Employee Checkin
    greeting_morning: "صباح الخير",
    greeting_afternoon: "مساء الخير",
    work_schedule: "موعد الدوام الرسمي",
    current_time: "الوقت الحالي",
    gps_status: "موقع العمل الجغرافي",
    gps_verified: "داخل النطاق المسموح ✓",
    gps_outside: "خارج النطاق المسموح ✗",
    distance_from_workplace: "المسافة من مقر العمل",
    accuracy: "دقة تحديد الموقع",
    meters: "متر",
    check_in_btn: "تسجيل الحضور الآن",
    check_out_btn: "تسجيل الانصراف",
    checked_in_success: "تم تسجيل حضورك بنجاح ✓",
    check_in_time_lbl: "وقت الحضور:",
    check_out_time_lbl: "وقت الانصراف:",
    status_lbl: "الحالة:",
    worked_hours_lbl: "ساعات العمل:",

    // Camera & verification
    camera_title: "التقط صورة لإثبات وجودك في مكان العمل",
    camera_disclaimer: "سيتم تسجيل موقعك الحالي وصورة لإثبات وجودك في مقر العمل.",
    camera_take_photo: "التقاط الصورة",
    camera_retake: "إعادة التقاط",
    camera_confirm: "تأكيد وإرسال الحضور",
    camera_close: "إلغاء",
    switch_camera: "تبديل الكاميرا",

    // Filters & Actions
    export_csv: "تصدير Excel / CSV",
    print_report: "طباعة التقرير",
    filter: "تصفية",
    reset: "إعادة ضبط",
    date_from: "من تاريخ",
    date_to: "إلى تاريخ",
    employee: "الموظف",
    all_employees: "جميع الموظفين",
    department: "القسم",
    all_departments: "جميع الأقسام",
    status: "الحالة",
    all_statuses: "جميع الحالات",
    search: "بحث...",

    // General
    loading: "جاري التحميل...",
    save_changes: "حفظ التغييرات",
    saving: "جاري الحفظ...",
    cancel: "إلغاء",
    confirm: "تأكيد",
    delete: "حذف",
    edit: "تعديل",
    actions: "الإجراءات",
    details: "التفاصيل",
    notes: "ملاحظات",
    photo: "الصورة",
    location: "الموقع الجغرافي",
    audit_trail: "سجل الرقابة"
  },
  en: {
    system_title: "WAQTY - Smart Attendance & Time Tracking System",
    login_title: "WAQTY Attendance System",
    login_subtitle: "Smart Attendance, GPS Verification & Time Tracking",
    email_or_code: "Email or Employee ID",
    password: "Password",
    login_button: "Sign In",
    logging_in: "Signing in...",
    demo_accounts: "Quick Demo Accounts:",
    demo_manager: "Manager Account:",
    demo_employee: "Employee Account:",
    logout: "Log Out",
    dashboard: "Live Dashboard",
    live_today: "Today's Live Attendance",
    attendance_history: "Attendance History & Reports",
    monthly_summary: "Monthly Summary & Deductions",
    correction_requests: "Correction Requests",
    employees_mgmt: "Employees Management",
    depts_schedules: "Departments & Schedules",
    workplace_settings: "Workplace & Geofence",
    attendance_rules: "Rules & Deductions",
    audit_logs: "Audit Logs",
    my_attendance: "My Attendance",
    my_history: "My Attendance History",
    my_summary: "My Monthly Summary",
    my_corrections: "My Correction Requests",
    my_profile: "My Profile",

    // Statuses
    status_present: "Present",
    status_ontime: "On Time",
    status_late: "Late",
    status_halfday: "Half Day",
    status_absent: "Absent",
    status_earlyleave: "Early Leave",
    status_outsidelocation: "Outside Location",
    status_pendingreview: "Pending Review",
    status_approved: "Approved",
    status_rejected: "Rejected",

    // Live Metrics
    metric_total_employees: "Total Employees",
    metric_present: "Present Today",
    metric_ontime: "On Time",
    metric_late: "Late",
    metric_halfday: "Half Day",
    metric_absent: "Absent",
    metric_working_now: "Working Now",
    metric_checked_out: "Checked Out",
    metric_attendance_rate: "Attendance Rate",

    // Employee Checkin
    greeting_morning: "Good morning",
    greeting_afternoon: "Good afternoon",
    work_schedule: "Official Schedule",
    current_time: "Current Time",
    gps_status: "Workplace GPS Status",
    gps_verified: "Within Allowed Radius ✓",
    gps_outside: "Outside Allowed Radius ✗",
    distance_from_workplace: "Distance from Workplace",
    accuracy: "GPS Accuracy",
    meters: "meters",
    check_in_btn: "Check In Now",
    check_out_btn: "Check Out",
    checked_in_success: "Checked in successfully ✓",
    check_in_time_lbl: "Check-in Time:",
    check_out_time_lbl: "Check-out Time:",
    status_lbl: "Status:",
    worked_hours_lbl: "Worked Hours:",

    // Camera & verification
    camera_title: "Take photo to verify presence at workplace",
    camera_disclaimer: "Your current GPS location and photo will be recorded for workplace verification.",
    camera_take_photo: "Snap Photo",
    camera_retake: "Retake",
    camera_confirm: "Confirm & Check In",
    camera_close: "Cancel",
    switch_camera: "Switch Camera",

    // Filters & Actions
    export_csv: "Export Excel / CSV",
    print_report: "Print Report",
    filter: "Filter",
    reset: "Reset",
    date_from: "From Date",
    date_to: "To Date",
    employee: "Employee",
    all_employees: "All Employees",
    department: "Department",
    all_departments: "All Departments",
    status: "Status",
    all_statuses: "All Statuses",
    search: "Search...",

    // General
    loading: "Loading...",
    save_changes: "Save Changes",
    saving: "Saving...",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    edit: "Edit",
    actions: "Actions",
    details: "Details",
    notes: "Notes",
    photo: "Photo",
    location: "Location",
    audit_trail: "Audit Trail"
  }
};

let currentLang = localStorage.getItem('wf_lang') || 'ar';

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || key;
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('wf_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Update all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    el.textContent = t(k);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const k = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(k);
  });

  const langBtn = document.getElementById('lang-toggle-btn');
  if (langBtn) {
    const isMobile = window.innerWidth < 640;
    langBtn.textContent = lang === 'ar' ? (isMobile ? 'EN' : 'English (EN)') : (isMobile ? 'عربي' : 'العربية (AR)');
  }

  // Trigger re-render of current view
  if (window.renderCurrentView) {
    window.renderCurrentView();
  }
}

window.addEventListener('resize', () => {
  const langBtn = document.getElementById('lang-toggle-btn');
  if (langBtn) {
    const isMobile = window.innerWidth < 640;
    langBtn.textContent = currentLang === 'ar' ? (isMobile ? 'EN' : 'English (EN)') : (isMobile ? 'عربي' : 'العربية (AR)');
  }
});
