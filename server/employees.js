const express = require('express');
const bcrypt = require('bcryptjs');
const { db, logAudit, uploadsDir, getTodayString, getCurrentMonthString } = require('./database');
const { authenticateToken, requireManager } = require('./auth');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// GET /api/employees (List all employees belonging to the logged-in manager)
router.get('/', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    const today = getTodayString();
    const { department_id, is_active, search } = req.query;

    let query = `
      SELECT
        u.id, u.employee_code, u.full_name, u.email, u.role, u.department_id, u.manager_id,
        u.job_title, u.phone, u.hire_date, u.base_salary, u.schedule_id, u.shift_id, u.is_active,
        u.profile_photo, (u.face_descriptor IS NOT NULL) as has_face_enrolled, u.face_enrolled_at, u.created_at,
        d.name as department_name,
        s.name as schedule_name, s.start_time, s.end_time,
        cs.name as shift_name,
        ar.status as today_status, ar.check_in_time as today_check_in, ar.check_out_time as today_check_out
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      LEFT JOIN company_shifts cs ON u.shift_id = cs.id
      LEFT JOIN attendance_records ar ON (u.id = ar.employee_id AND ar.date = ?)
      WHERE u.role = 'employee' AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1))
      AND u.full_name NOT LIKE '%طارق النجار%'
    `;
    const params = [today, managerId, managerId];

    if (department_id) {
      query += ` AND u.department_id = ? `;
      params.push(department_id);
    }
    if (is_active !== undefined && is_active !== '') {
      query += ` AND u.is_active = ? `;
      params.push(parseInt(is_active, 10));
    }
    if (search) {
      query += ` AND (u.full_name LIKE ? OR u.employee_code LIKE ? OR u.email LIKE ?) `;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY u.id DESC `;
    const employees = db.prepare(query).all(...params);

    res.json({ success: true, count: employees.length, employees });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد قائمة الموظفين' });
  }
});

// GET /api/employees/:id
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    // Non-managers can only view themselves
    if (req.user.role !== 'manager' && req.user.id !== targetId) {
      return res.status(403).json({ success: false, error: 'غير مصرح بعرض بيانات موظف آخر' });
    }

    const emp = db.prepare(`
      SELECT
        u.id, u.employee_code, u.full_name, u.email, u.role, u.department_id, u.manager_id,
        u.job_title, u.phone, u.hire_date, u.base_salary, u.schedule_id, u.shift_id, u.is_active,
        u.profile_photo, u.created_at,
        d.name as department_name,
        s.name as schedule_name, s.start_time, s.end_time, s.grace_period_minutes, s.half_day_threshold,
        cs.name as shift_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      LEFT JOIN company_shifts cs ON u.shift_id = cs.id
      WHERE u.id = ?
    `).get(targetId);

    if (!emp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    res.json({ success: true, employee: emp });
  } catch (error) {
    console.error('Get employee by id error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد بيانات الموظف' });
  }
});

// GET /api/employees/:id/stats (Detailed attendance & punctuality statistics for a specific employee)
router.get('/:id/stats', authenticateToken, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    // Non-managers can only view themselves
    if (req.user.role !== 'manager' && req.user.id !== targetId) {
      return res.status(403).json({ success: false, error: 'غير مصرح بعرض إحصائيات موظف آخر' });
    }

    const employee = db.prepare(`
      SELECT
        u.id, u.employee_code, u.full_name, u.email, u.job_title, u.phone, u.hire_date,
        u.profile_photo, u.base_salary,
        d.name as department_name,
        s.name as schedule_name, s.start_time, s.end_time
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE u.id = ?
    `).get(targetId);

    if (!employee) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    const currentMonth = getCurrentMonthString();
    const filterMonth = req.query.month || currentMonth;

    // Attendance records for this employee (filtered by month or all-time)
    let recordsQuery = `
      SELECT * FROM attendance_records
      WHERE employee_id = ?
    `;
    const queryParams = [targetId];

    if (filterMonth !== 'all') {
      recordsQuery += ` AND date LIKE ? `;
      queryParams.push(`${filterMonth}%`);
    }

    recordsQuery += ` ORDER BY date DESC `;
    const records = db.prepare(recordsQuery).all(...queryParams);

    // Available distinct months for this employee
    const availableMonthsRaw = db.prepare(`
      SELECT DISTINCT SUBSTR(date, 1, 7) as m
      FROM attendance_records
      WHERE employee_id = ? AND date IS NOT NULL
      ORDER BY m DESC
    `).all(targetId).map(r => r.m);

    if (!availableMonthsRaw.includes(currentMonth)) {
      availableMonthsRaw.unshift(currentMonth);
    }

    let presentDays = 0;
    let onTimeDays = 0;
    let lateDays = 0;
    let totalLateMinutes = 0;
    let earlyLeaveDays = 0;
    let totalEarlyLeaveMinutes = 0;
    let halfDays = 0;
    let absentDays = 0;
    let totalWorkedHours = 0;
    let totalDeductions = 0;

    let totalLateDeductions = 0;
    let totalAbsenceDeductions = 0;

    records.forEach(r => {
      const deduction = parseFloat(r.estimated_deduction || 0);
      if (r.check_in_time) {
        presentDays++;
        if (r.worked_hours) totalWorkedHours += parseFloat(r.worked_hours);
        if (deduction > 0) {
          totalDeductions += deduction;
          totalLateDeductions += deduction;
        }

        if (r.status === 'On Time' && (!r.early_leave_minutes || r.early_leave_minutes <= 0)) {
          onTimeDays++;
        }
        if (r.status === 'Late' || r.late_minutes > 0) {
          lateDays++;
          totalLateMinutes += (r.late_minutes || 0);
        }
        if (r.status === 'Half Day') {
          halfDays++;
        }
        if (r.early_leave_minutes > 0 || r.status === 'Early Leave') {
          earlyLeaveDays++;
          totalEarlyLeaveMinutes += (r.early_leave_minutes || 0);
        }
      } else if (r.status === 'Absent') {
        absentDays++;
        if (deduction > 0) {
          totalDeductions += deduction;
          totalAbsenceDeductions += deduction;
        }
      }
    });

    totalWorkedHours = parseFloat(totalWorkedHours.toFixed(2));
    totalDeductions = parseFloat(totalDeductions.toFixed(2));
    totalLateDeductions = parseFloat(totalLateDeductions.toFixed(2));
    totalAbsenceDeductions = parseFloat(totalAbsenceDeductions.toFixed(2));

    // Fetch salary advances (approved) for this employee
    let advQuery = `SELECT * FROM salary_advances WHERE employee_id = ?`;
    const advParams = [targetId];
    if (filterMonth !== 'all') {
      advQuery += ` AND month = ?`;
      advParams.push(filterMonth);
    }
    advQuery += ` ORDER BY date DESC, created_at DESC`;
    const advances = db.prepare(advQuery).all(...advParams);

    let totalAdvances = 0;
    advances.forEach(a => {
      if (a.status === 'approved') totalAdvances += parseFloat(a.amount || 0);
    });

    // Fetch bonuses for this employee
    let bonQuery = `SELECT * FROM employee_bonuses WHERE employee_id = ?`;
    const bonParams = [targetId];
    if (filterMonth !== 'all') {
      bonQuery += ` AND month = ?`;
      bonParams.push(filterMonth);
    }
    bonQuery += ` ORDER BY date DESC, created_at DESC`;
    const bonuses = db.prepare(bonQuery).all(...bonParams);

    let totalBonuses = 0;
    bonuses.forEach(b => {
      totalBonuses += parseFloat(b.amount || 0);
    });

    totalAdvances = parseFloat(totalAdvances.toFixed(2));
    totalBonuses = parseFloat(totalBonuses.toFixed(2));

    const baseSalary = parseFloat(employee.base_salary || 3000);
    const netSalary = Math.max(0, parseFloat((baseSalary + totalBonuses - totalDeductions - totalAdvances).toFixed(2)));

    const totalTrackedDays = records.length;
    const disciplineRate = presentDays > 0 ? Math.round((onTimeDays / presentDays) * 100) : 0;

    res.json({
      success: true,
      employee,
      selectedMonth: filterMonth,
      currentMonth,
      availableMonths: availableMonthsRaw,
      stats: {
        baseSalary,
        totalBonuses,
        totalAdvances,
        netSalary,
        totalLateDeductions,
        totalAbsenceDeductions,
        totalTrackedDays,
        presentDays,
        onTimeDays,
        lateDays,
        totalLateMinutes,
        earlyLeaveDays,
        totalEarlyLeaveMinutes,
        halfDays,
        absentDays,
        totalWorkedHours,
        totalDeductions,
        disciplineRate
      },
      recentRecords: records,
      advances,
      bonuses
    });
  } catch (error) {
    console.error('Get employee stats error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد إحصائيات الموظف' });
  }
});

// POST /api/employees (Manager Adds Employee Manually)
router.post('/', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    let {
      employee_code, full_name, email, password, confirm_password, department_id,
      job_title, phone, hire_date, base_salary, schedule_id, shift_id, is_active, profile_photo
    } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, error: 'الاسم الكامل، البريد الإلكتروني، وكلمة المرور حقول إلزامية' });
    }

    if (confirm_password && password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'كلمتا المرور غير متطابقتين' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'يجب أن لا تقل كلمة المرور عن 6 خانات' });
    }

    // Auto-generate unique employee_code if not provided
    if (!employee_code || employee_code.trim().length === 0) {
      let code;
      let collision = true;
      let attempts = 0;
      while (collision && attempts < 50) {
        attempts++;
        const candidate = 'EMP-' + String(1000 + Math.floor(Math.random() * 9000));
        const check = db.prepare('SELECT id FROM users WHERE employee_code = ?').get(candidate);
        if (!check) {
          code = candidate;
          collision = false;
        }
      }
      employee_code = code || ('EMP-' + Date.now());
    } else {
      const existingCode = db.prepare(`SELECT id FROM users WHERE UPPER(employee_code) = UPPER(?)`).get(employee_code.trim());
      if (existingCode) {
        return res.status(400).json({ success: false, error: 'الرقم الوظيفي مسجل مسبقاً لموظف آخر' });
      }
    }

    // Check existing email
    const existing = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(email.trim());
    if (existing) {
      return res.status(400).json({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً في النظام' });
    }

    const hash = bcrypt.hashSync(password, 10);

    // Default schedule for this manager if not selected
    if (!schedule_id) {
      const mgrSched = db.prepare(`SELECT id FROM schedules WHERE manager_id = ? LIMIT 1`).get(managerId);
      if (mgrSched) {
        schedule_id = mgrSched.id;
      }
    }

    // Create avatar placeholder
    let photoPath = profile_photo || null;
    if (!photoPath) {
      const initial = full_name.trim().charAt(0);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#3b82f6" rx="100"/><text x="100" y="115" font-family="Cairo, Arial, sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initial}</text></svg>`;
      photoPath = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    }

    const activeStatus = is_active !== undefined ? parseInt(is_active, 10) : 1;
    const parsedShiftId = shift_id ? parseInt(shift_id, 10) : null;

    const stmt = db.prepare(`
      INSERT INTO users (
        employee_code, full_name, email, password_hash, role, manager_id,
        department_id, job_title, phone, hire_date, base_salary,
        schedule_id, shift_id, is_active, profile_photo
      ) VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      employee_code.trim().toUpperCase(),
      full_name.trim(),
      email.trim(),
      hash,
      managerId,
      department_id || null,
      job_title || null,
      phone || null,
      hire_date || getTodayString(),
      base_salary ? parseFloat(base_salary) : 5000,
      schedule_id || null,
      parsedShiftId,
      activeStatus,
      photoPath
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'CREATE_EMPLOYEE',
      'users',
      result.lastInsertRowid,
      null,
      { employee_code, full_name, email, job_title, department_id, manager_id: managerId },
      'إضافة موظف جديد يدوياً من قبل المدير',
      clientIp
    );

    res.json({
      success: true,
      message: 'تم إنشاء حساب الموظف بنجاح ويمكنه الآن تسجيل الدخول',
      id: result.lastInsertRowid,
      employee_code
    });
  } catch (error) {
    console.error('Add employee error:', error);
    res.status(500).json({ success: false, error: 'فشل في إضافة الموظف' });
  }
});

// PUT /api/employees/:id (Update Employee) - Manager Only
router.put('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const managerId = req.user.id;
    const oldEmp = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
    if (!oldEmp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    // Security: Only manager who owns employee (or admin 1) can edit
    if (oldEmp.manager_id !== managerId && managerId !== 1) {
      return res.status(403).json({ success: false, error: 'غير مصرح بتعديل موظف تابع لجهة أخرى' });
    }

    const {
      full_name, email, password, confirm_password, department_id,
      job_title, phone, hire_date, base_salary, schedule_id, shift_id, is_active, profile_photo
    } = req.body;

    if (email && email.trim().toLowerCase() !== oldEmp.email.toLowerCase()) {
      const existing = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?`).get(email.trim(), targetId);
      if (existing) {
        return res.status(400).json({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً لمستخدم آخر' });
      }
    }

    let passHash = oldEmp.password_hash;
    if (password && password.trim().length > 0) {
      if (confirm_password && password.trim() !== confirm_password.trim()) {
        return res.status(400).json({ success: false, error: 'كلمتا المرور غير متطابقتين' });
      }
      if (password.trim().length < 6) {
        return res.status(400).json({ success: false, error: 'يجب أن لا تقل كلمة المرور عن 6 خانات' });
      }
      passHash = bcrypt.hashSync(password.trim(), 10);
    }

    let photoPath = oldEmp.profile_photo;
    if (profile_photo && profile_photo.startsWith('data:image')) {
      photoPath = profile_photo;
      try {
        if (!process.env.VERCEL) {
          const matches = profile_photo.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          let buffer;
          let ext = 'jpg';
          if (matches && matches.length === 3) {
            ext = matches[1].includes('png') ? 'png' : 'jpg';
            buffer = Buffer.from(matches[2], 'base64');
          } else {
            buffer = Buffer.from(profile_photo, 'base64');
          }
          const fileName = `avatar_emp_${targetId}_${Date.now()}.${ext}`;
          fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
        }
      } catch (imgErr) {
        console.warn('Optional local employee photo write skipped:', imgErr.message);
      }
    } else if (profile_photo && (profile_photo.startsWith('/uploads/') || profile_photo.startsWith('http'))) {
      photoPath = profile_photo;
    }

    const updatedShiftId = shift_id !== undefined ? (shift_id ? parseInt(shift_id, 10) : null) : oldEmp.shift_id;

    db.prepare(`
      UPDATE users SET
        full_name = ?, email = ?, password_hash = ?, department_id = ?,
        job_title = ?, phone = ?, hire_date = ?, base_salary = ?,
        schedule_id = ?, shift_id = ?, is_active = ?, profile_photo = ?
      WHERE id = ?
    `).run(
      full_name !== undefined && full_name.trim().length > 0 ? full_name.trim() : oldEmp.full_name,
      email !== undefined && email.trim().length > 0 ? email.trim() : oldEmp.email,
      passHash,
      department_id !== undefined ? (department_id ? parseInt(department_id, 10) : null) : oldEmp.department_id,
      job_title !== undefined ? (job_title ? job_title.trim() : null) : oldEmp.job_title,
      phone !== undefined ? (phone ? phone.trim() : null) : oldEmp.phone,
      hire_date !== undefined ? hire_date : oldEmp.hire_date,
      base_salary !== undefined ? parseFloat(base_salary) : oldEmp.base_salary,
      schedule_id !== undefined ? (schedule_id ? parseInt(schedule_id, 10) : null) : oldEmp.schedule_id,
      updatedShiftId,
      is_active !== undefined ? parseInt(is_active, 10) : oldEmp.is_active,
      photoPath,
      targetId
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'UPDATE_EMPLOYEE',
      'users',
      targetId,
      oldEmp,
      req.body,
      'تحديث بيانات موظف',
      clientIp
    );

    res.json({ success: true, message: 'تم تحديث بيانات الموظف بنجاح' });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث بيانات الموظف' });
  }
});

// DELETE /api/employees/:id (Delete Employee) - Manager Only
router.delete('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const managerId = req.user.id;
    const oldEmp = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
    if (!oldEmp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    if (oldEmp.role === 'manager') {
      return res.status(400).json({ success: false, error: 'لا يمكن حذف حساب المدير العام' });
    }

    if (oldEmp.manager_id !== managerId && managerId !== 1) {
      return res.status(403).json({ success: false, error: 'غير مصرح بحذف موظف تابع لجهة أخرى' });
    }

    // Delete employee and related records
    db.prepare(`DELETE FROM attendance_records WHERE employee_id = ?`).run(targetId);
    db.prepare(`DELETE FROM attendance_corrections WHERE employee_id = ?`).run(targetId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(targetId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'DELETE_EMPLOYEE',
      'users',
      targetId,
      oldEmp,
      null,
      `حذف الموظف ${oldEmp.full_name}`,
      clientIp
    );

    res.json({ success: true, message: 'تم حذف الموظف بنجاح' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف الموظف' });
  }
});

// POST /api/employees/:id/reset-face (Manager resets employee Face ID)
router.post('/:id/reset-face', authenticateToken, requireManager, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const managerId = req.user.manager_id || req.user.id;

    const emp = db.prepare('SELECT id, full_name, manager_id FROM users WHERE id = ?').get(targetId);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    if (emp.manager_id !== managerId && managerId !== 1) {
      return res.status(403).json({ success: false, error: 'غير مصرح بتعديل موظف تابع لجهة أخرى' });
    }

    db.prepare(`
      UPDATE users SET
        face_descriptor = NULL,
        face_photo = NULL,
        face_enrolled_at = NULL
      WHERE id = ?
    `).run(targetId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'RESET_EMPLOYEE_FACE_ID',
      'users',
      targetId,
      null,
      null,
      `إعادة تعيين بصمة الوجه للموظف ${emp.full_name}`,
      clientIp
    );

    res.json({
      success: true,
      message: `تمت إعادة تعيين بصمة الوجه للموظف ${emp.full_name} بنجاح، وسيطلب منه النظام تسجيلها مجدداً عند أول تسجيل دخول.`
    });
  } catch (err) {
    console.error('Reset face error:', err);
    res.status(500).json({ success: false, error: 'فشل في إعادة تعيين بصمة الوجه' });
  }
});

module.exports = router;
