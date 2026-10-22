const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { db, uploadsDir } = require('./database');

function seedDatabase() {
  console.log('--- Starting Seed Data ---');

  // Check if already seeded
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    console.log('Database already has users, skipping full seed.');
    return;
  }

  // 1. Departments
  const deptStmt = db.prepare('INSERT INTO departments (name, description, manager_name) VALUES (?, ?, ?)');
  const dEng = deptStmt.run('الهندسة والتطوير', 'تطوير المنظومات البرمجية والتطبيقات', 'م. أحمد السعيد').lastInsertRowid;
  const dSales = deptStmt.run('المبيعات وتطوير الأعمال', 'إدارة العقود والعملاء وتحقيق المبيعات', 'أ. كريم يوسف').lastInsertRowid;
  const dMkt = deptStmt.run('التسويق الرقمي', 'إدارة الحملات الإعلانية والهوية المؤسسية', 'أ. فاطمة إبراهيم').lastInsertRowid;
  const dHr = deptStmt.run('الموارد البشرية والعمليات', 'إدارة الكفاءات والمتابعة الإدارية والتشغيل', 'أ. نورهان علي').lastInsertRowid;

  // 2. Schedules
  const schedStmt = db.prepare(`
    INSERT INTO schedules (name, start_time, end_time, grace_period_minutes, half_day_threshold, absence_threshold, working_days, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const sDefault = schedStmt.run('الدوام الصباحي المعتاد', '09:00', '17:00', 15, '12:00', '13:00', '0,1,2,3,4', 1).lastInsertRowid;
  const sFlexible = schedStmt.run('دوام الدعم الفني والمناوبات', '10:00', '18:00', 20, '13:00', '14:00', '0,1,2,3,4', 0).lastInsertRowid;

  // 3. Workplace
  const wpStmt = db.prepare(`
    INSERT INTO workplaces (company_name, name, latitude, longitude, allowed_radius_meters, max_gps_accuracy_meters, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  // Using central business district coordinates (e.g. Riyadh King Fahd Rd / Cairo Smart Village)
  wpStmt.run('شركة الرؤية للحلول الرقمية المتطورة', 'المقر الرئيسي - مبنى الابتكار', 30.0444, 31.2357, 150, 150);

  // 4. Company Settings
  const settingStmt = db.prepare(`
    INSERT OR REPLACE INTO company_settings (key, value, category, description)
    VALUES (?, ?, ?, ?)
  `);
  settingStmt.run('company_name', 'شركة الرؤية للحلول الرقمية', 'general', 'اسم المنشأة');
  settingStmt.run('require_checkout_photo', '0', 'attendance', 'طلب صورة سيلفي عند الانصراف');
  settingStmt.run('enable_salary_deductions', '1', 'payroll', 'تفعيل حساب الخصومات المقدرة');
  settingStmt.run('deduction_late_per_minute', '2.0', 'payroll', 'قيمة الخصم بالريال لكل دقيقة تأخير');
  settingStmt.run('deduction_late_threshold_mins', '15', 'payroll', 'فترة السماح قبل تطبيق خصم التأخير');
  settingStmt.run('deduction_half_day_rate', '100.0', 'payroll', 'قيمة خصم نصف يوم (ثابت أو نسبة)');
  settingStmt.run('deduction_absence_rate', '250.0', 'payroll', 'قيمة خصم يوم غياب كامل');
  settingStmt.run('deduction_early_leave_rate', '50.0', 'payroll', 'قيمة خصم الانصراف المبكر بدون إذن');
  settingStmt.run('currency_symbol', 'ر.س', 'general', 'رمز العملة');
  settingStmt.run('suspicious_ip_detection', '1', 'security', 'اكتشاف تسجيلات الدخول المشبوهة لنفس الـ IP');

  // 5. Default Passwords
  const hashAdmin = bcrypt.hashSync(process.env.INITIAL_ADMIN_PASSWORD || 'admin123', 10);
  const hashEmp = bcrypt.hashSync(process.env.DEMO_EMPLOYEE_PASSWORD || 'emp123', 10);

  // Helper to generate a placeholder avatar SVG
  function generateAvatar(name, initials, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="${color}" rx="100"/>
      <text x="100" y="115" font-family="Arial, Tajawal, sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
    </svg>`;
    const fileName = `avatar_${encodeURIComponent(initials)}_${Date.now()}.svg`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, svg);
    return `/uploads/${fileName}`;
  }

  // Generate a sample attendance selfie badge
  function generateAttendancePhoto(name, date, time) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#grad)" rx="24"/>
      <circle cx="200" cy="160" r="90" fill="#3b82f6" fill-opacity="0.2"/>
      <circle cx="200" cy="140" r="45" fill="#60a5fa"/>
      <path d="M 140 230 C 140 190, 260 190, 260 230 Z" fill="#60a5fa"/>
      <rect x="20" y="290" width="360" height="90" rx="12" fill="#1e293b" fill-opacity="0.8" stroke="#334155" stroke-width="2"/>
      <text x="200" y="325" font-family="Tajawal, sans-serif" font-size="18" font-weight="bold" fill="#f8fafc" text-anchor="middle">إثبات حضور: ${name}</text>
      <text x="200" y="355" font-family="monospace" font-size="14" fill="#94a3b8" text-anchor="middle">${date} ${time} | GPS VERIFIED ✓</text>
    </svg>`;
    const fileName = `att_${Date.now()}_${Math.floor(Math.random()*1000)}.svg`;
    fs.writeFileSync(path.join(uploadsDir, fileName), svg);
    return `/uploads/${fileName}`;
  }

  const adminAvatar = generateAvatar('أحمد السعيد', 'م', '#2563eb');

  // Insert Admin
  const userStmt = db.prepare(`
    INSERT INTO users (employee_code, full_name, email, password_hash, role, department_id, job_title, phone, hire_date, base_salary, schedule_id, is_active, profile_photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const adminId = userStmt.run(
    'MGR-001',
    'محمد حماده (المدير العام)',
    'admin@workforce.local',
    hashAdmin,
    'manager',
    dEng,
    'مدير النظام والعمليات',
    '+966501112233',
    '2024-01-01',
    15000,
    sDefault,
    adminAvatar
  ).lastInsertRowid;

  // Insert 10 Employees
  const employeeData = [
    { code: 'EMP-101', name: 'سارة محمود إبراهيم', email: 'sara@workforce.local', dept: dEng, title: 'كبير مهندسي الواجهات', phone: '+966502223344', salary: 9500, sched: sDefault, color: '#ec4899', initials: 'س' },
    { code: 'EMP-102', name: 'عمر خالد المنصور', email: 'omar@workforce.local', dept: dEng, title: 'مطور واجهات خلفية أول', phone: '+966503334455', salary: 9000, sched: sDefault, color: '#3b82f6', initials: 'ع' },
    { code: 'EMP-103', name: 'مريم عبد الله القحطاني', email: 'mariam@workforce.local', dept: dEng, title: 'مصممة تجربة وواجهة المستخدم', phone: '+966504445566', salary: 8500, sched: sDefault, color: '#8b5cf6', initials: 'م' },
    { code: 'EMP-104', name: 'كريم يوسف النجار', email: 'kareem@workforce.local', dept: dSales, title: 'مدير تنفيذي للمبيعات', phone: '+966505556677', salary: 8000, sched: sDefault, color: '#10b981', initials: 'ك' },
    { code: 'EMP-105', name: 'هدى الشريف الحربي', email: 'huda@workforce.local', dept: dSales, title: 'أخصائية تطوير أعمال', phone: '+966506667788', salary: 7500, sched: sDefault, color: '#f59e0b', initials: 'هـ' },
    { code: 'EMP-106', name: 'زياد منصور الدوسري', email: 'ziad@workforce.local', dept: dSales, title: 'مستشار مبيعات أول', phone: '+966507778899', salary: 7000, sched: sFlexible, color: '#06b6d4', initials: 'ز' },
    { code: 'EMP-107', name: 'فاطمة إبراهيم الزهراني', email: 'fatima@workforce.local', dept: dMkt, title: 'أخصائية تسويق رقمي', phone: '+966508889900', salary: 7500, sched: sDefault, color: '#d946ef', initials: 'ف' },
    { code: 'EMP-108', name: 'طارق حسام رضوان', email: 'tariq@workforce.local', dept: dMkt, title: 'صانع محتوى وإعلام مرئي', phone: '+966509990011', salary: 6500, sched: sDefault, color: '#6366f1', initials: 'ط' },
    { code: 'EMP-109', name: 'نورهان علي الشهري', email: 'nourhan@workforce.local', dept: dHr, title: 'منسقة موارد بشرية وعمليات', phone: '+966501234567', salary: 7000, sched: sDefault, color: '#14b8a6', initials: 'ن' },
    { code: 'EMP-110', name: 'ياسر مصطفى الغامدي', email: 'yasser@workforce.local', dept: dHr, title: 'أخصائي دعم فني وتشغيل', phone: '+966507654321', salary: 6000, sched: sFlexible, color: '#f43f5e', initials: 'ي' }
  ];

  const employeeIds = [];
  for (const emp of employeeData) {
    const avatar = generateAvatar(emp.name, emp.initials, emp.color);
    const id = userStmt.run(
      emp.code,
      emp.name,
      emp.email,
      hashEmp,
      'employee',
      emp.dept,
      emp.title,
      emp.phone,
      '2024-03-01',
      emp.salary,
      emp.sched,
      avatar
    ).lastInsertRowid;
    employeeIds.push({ id, ...emp });
  }

  // 6. Generate 30 days of realistic attendance history
  console.log('Generating 30 days of attendance history...');
  const attStmt = db.prepare(`
    INSERT INTO attendance_records (
      employee_id, date, check_in_time, check_out_time,
      check_in_lat, check_in_lng, check_in_distance, check_in_accuracy, check_in_photo,
      check_out_lat, check_out_lng, check_out_distance, check_out_accuracy, check_out_photo,
      status, scheduled_start, scheduled_end, late_minutes, early_leave_minutes,
      worked_hours, estimated_deduction, verification_status, ip_address, user_agent, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const baseLat = 30.0444;
  const baseLng = 31.2357;
  const now = new Date();

  // Create date list for the last 30 days
  for (let d = 29; d >= 0; d--) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() - d);
    const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday

    // Skip weekends (Friday = 5, Saturday = 6)
    if (dayOfWeek === 5 || dayOfWeek === 6) continue;

    const dateStr = targetDate.toISOString().split('T')[0];
    const isToday = (d === 0);

    for (const emp of employeeIds) {
      // Deterministic pseudo-random seed based on employee id + day
      const rand = Math.sin(emp.id * 100 + d) * 10000;
      const roll = Math.abs(rand - Math.floor(rand));

      let status = 'On Time';
      let checkInTime = '08:52:14';
      let checkOutTime = isToday ? null : '17:05:30';
      let lateMinutes = 0;
      let earlyLeaveMinutes = 0;
      let workedHours = isToday ? 4.5 : 8.2;
      let deduction = 0;
      let distance = 35 + Math.floor(roll * 40); // 35 to 75m (within 150m radius)
      let lat = baseLat + (roll * 0.0003 - 0.00015);
      let lng = baseLng + (roll * 0.0003 - 0.00015);
      let vStatus = 'verified';
      let notes = 'حضور اعتيادي وموثق عبر النظام';

      if (isToday) {
        // Today's distribution for live dashboard
        if (emp.id === employeeIds[0].id) { // Sara
          status = 'On Time';
          checkInTime = '08:48:10';
        } else if (emp.id === employeeIds[1].id) { // Omar
          status = 'Late';
          checkInTime = '09:28:15';
          lateMinutes = 28;
          deduction = 28 * 2.0;
          notes = 'تأخر 28 دقيقة عن موعد بدء الدوام';
        } else if (emp.id === employeeIds[2].id) { // Mariam
          status = 'On Time';
          checkInTime = '08:55:00';
        } else if (emp.id === employeeIds[3].id) { // Kareem
          status = 'Half Day';
          checkInTime = '12:14:00';
          lateMinutes = 194;
          deduction = 100.0;
          notes = 'حضور بعد الساعة 12:00 ظهرًا (نصف يوم)';
        } else if (emp.id === employeeIds[4].id) { // Huda
          status = 'On Time';
          checkInTime = '08:59:22';
          checkOutTime = '13:00:10'; // left early or checked out
          workedHours = 4.0;
        } else if (emp.id === employeeIds[5].id) { // Ziad
          status = 'Absent';
          checkInTime = null;
          checkOutTime = null;
          deduction = 250.0;
          notes = 'تغيب عن العمل - تم تسجيل الغياب آلياً';
        } else if (emp.id === employeeIds[6].id) { // Fatima
          status = 'On Time';
          checkInTime = '08:42:19';
        } else if (emp.id === employeeIds[7].id) { // Tariq
          status = 'Late';
          checkInTime = '09:35:40';
          lateMinutes = 35;
          deduction = 35 * 2.0;
        } else if (emp.id === employeeIds[8].id) { // Nourhan
          status = 'On Time';
          checkInTime = '08:50:05';
        } else { // Yasser
          status = 'Absent';
          checkInTime = null;
          checkOutTime = null;
          deduction = 250.0;
          notes = 'لم يسجل الحضور حتى موعد الغياب المعتمد';
        }
      } else {
        // Historical days
        if (roll < 0.72) {
          // 72% On Time
          status = 'On Time';
          const min = Math.floor(45 + roll * 15);
          checkInTime = `08:${min < 10 ? '0' + min : min}:${Math.floor(roll * 59)}`;
          lateMinutes = 0;
          deduction = 0;
        } else if (roll < 0.85) {
          // 13% Late
          status = 'Late';
          const lateM = Math.floor(18 + roll * 40);
          lateMinutes = lateM;
          const min = (lateM);
          checkInTime = `09:${min < 10 ? '0' + min : min}:${Math.floor(roll * 59)}`;
          deduction = lateMinutes * 2.0;
          notes = `تسجيل حضور متأخر بمقدار ${lateMinutes} دقيقة`;
        } else if (roll < 0.92) {
          // 7% Half Day
          status = 'Half Day';
          checkInTime = `12:${Math.floor(10 + roll * 20)}:00`;
          lateMinutes = 190;
          deduction = 100.0;
          notes = 'حضور بعد حد نصف اليوم';
        } else if (roll < 0.97) {
          // 5% Absent
          status = 'Absent';
          checkInTime = null;
          checkOutTime = null;
          workedHours = 0;
          deduction = 250.0;
          notes = 'غياب بدون إذن مسبق';
        } else {
          // 3% Early leave
          status = 'Early Leave';
          checkInTime = '08:50:00';
          checkOutTime = '14:30:00';
          workedHours = 5.6;
          earlyLeaveMinutes = 150;
          deduction = 50.0;
          notes = 'انصراف مبكر قبل نهاية الدوام';
        }
      }

      let checkInPhoto = null;
      if (checkInTime) {
        checkInPhoto = generateAttendancePhoto(emp.name, dateStr, checkInTime);
      }

      attStmt.run(
        emp.id,
        dateStr,
        checkInTime,
        checkOutTime,
        checkInTime ? lat : null,
        checkInTime ? lng : null,
        checkInTime ? distance : null,
        checkInTime ? 18.5 : null,
        checkInPhoto,
        checkOutTime ? lat : null,
        checkOutTime ? lng : null,
        checkOutTime ? distance : null,
        checkOutTime ? 20.0 : null,
        null,
        status,
        '09:00',
        '17:00',
        lateMinutes,
        earlyLeaveMinutes,
        workedHours,
        deduction,
        vStatus,
        '192.168.1.' + (10 + emp.id),
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
        notes
      );
    }
  }

  // 7. Seed sample Attendance Correction Requests
  console.log('Seeding correction requests...');
  const corrStmt = db.prepare(`
    INSERT INTO attendance_corrections (employee_id, date, requested_check_in, requested_check_out, reason_type, reason_details, status, reviewed_by, review_notes, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yDateStr = yesterday.toISOString().split('T')[0];

  corrStmt.run(
    employeeIds[1].id, // Omar
    yDateStr,
    '09:00:00',
    '17:00:00',
    'gps_issue',
    'واجهت مشكلة في إشارة الـ GPS عند بوابة المبنى وتم تأخير تسجيلي 28 دقيقة بالخطأ',
    'pending',
    null,
    null,
    null
  );

  corrStmt.run(
    employeeIds[4].id, // Huda
    yDateStr,
    '08:55:00',
    '17:05:00',
    'forgot_checkout',
    'نسيت تسجيل الانصراف أثناء الخروج في موعد الدوام الرسمي بسبب مكالمة عميل عاجلة',
    'approved',
    adminId,
    'تم التحقق من كاميرات المراقبة وتأكيد الموعد واعتماد التصحيح',
    new Date().toISOString()
  );

  // 8. Seed sample Notifications
  console.log('Seeding notifications...');
  const notifStmt = db.prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)');
  notifStmt.run(null, 'موظف متأخر اليوم', 'سجل الموظف عمر خالد المنصور حضوره متأخراً بمقدار 28 دقيقة.', 'warning');
  notifStmt.run(null, 'طلب تصحيح حضور جديد', 'قدم الموظف عمر خالد طلباً لتصحيح وقت حضور يوم أمس بسبب مشكلة GPS.', 'info');
  notifStmt.run(null, 'تسجيل غياب آلي', 'تم تسجيل غياب آلي للموظف زياد منصور لعدم الحضور حتى الساعة 13:00.', 'danger');
  notifStmt.run(employeeIds[4].id, 'تمت الموافقة على طلب التصحيح', 'وافق مدير النظام على طلب تصحيح وقت الانصراف الخاص بك.', 'success');

  // 9. Seed Official Holidays
  console.log('Seeding official holidays...');
  const holStmt = db.prepare('INSERT INTO holidays (name, date, is_recurring) VALUES (?, ?, ?)');
  holStmt.run('اليوم الوطني للمملكة', '2026-09-23', 1);
  holStmt.run('يوم التأسيس', '2026-02-22', 1);
  holStmt.run('إجازة عيد الفطر المبارك', '2026-03-20', 0);
  holStmt.run('إجازة عيد الأضحى المبارك', '2026-05-27', 0);

  // 10. Seed initial Audit Log entries
  console.log('Seeding initial audit logs...');
  const auditStmt = db.prepare(`
    INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id, old_values, new_values, reason, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  auditStmt.run(
    adminId,
    'أحمد السعيد (المدير العام)',
    'SET_WORKPLACE_GEOFENCE',
    'workplaces',
    '1',
    JSON.stringify({ radius: 100 }),
    JSON.stringify({ radius: 150, lat: 30.0444, lng: 31.2357 }),
    'توسيع نطاق الحضور الجغرافي ليشمل مبنى الابتكار بالكامل',
    '127.0.0.1'
  );
  auditStmt.run(
    adminId,
    'أحمد السعيد (المدير العام)',
    'APPROVE_CORRECTION_REQUEST',
    'attendance_corrections',
    '2',
    JSON.stringify({ status: 'pending' }),
    JSON.stringify({ status: 'approved' }),
    'اعتماد تصحيح انصراف الموظفة هدى الشريف بعد مراجعة تقرير البوابة',
    '127.0.0.1'
  );

  console.log('--- Database successfully seeded! ---');
  console.log('Manager Login: admin@workforce.local / admin123');
  console.log('Employee Login: sara@workforce.local or omar@workforce.local / emp123');
}

module.exports = { seedDatabase };

if (require.main === module) {
  seedDatabase();
}
