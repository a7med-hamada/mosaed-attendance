const express = require('express');
const { db, getCurrentMonthString } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const router = express.Router();

// GET /api/reports/monthly-summary
router.get('/monthly-summary', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const month = req.query.month || getCurrentMonthString(); // YYYY-MM
    syncMissingAbsencesForMonth(month, isManager ? req.user.id : null);
    const requestedEmpId = req.query.employee_id;

    let targetEmployeeId = null;
    if (!isManager) {
      targetEmployeeId = req.user.id;
    } else if (requestedEmpId) {
      targetEmployeeId = parseInt(requestedEmpId, 10);
    }

    let empQuery = `
      SELECT u.id, u.employee_code, u.full_name, u.email, u.job_title, u.base_salary,
             d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'employee' AND u.is_active = 1
      AND u.full_name NOT LIKE '%طارق النجار%'
    `;
    const empParams = [];
    if (isManager) {
      empQuery += ` AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1)) `;
      empParams.push(req.user.id, req.user.id);
    }
    if (targetEmployeeId) {
      empQuery += ` AND u.id = ? `;
      empParams.push(targetEmployeeId);
    }
    empQuery += ` ORDER BY u.full_name ASC `;

    const employees = db.prepare(empQuery).all(...empParams);

    const summaries = employees.map(emp => {
      const records = db.prepare(`
        SELECT * FROM attendance_records
        WHERE employee_id = ? AND date LIKE ?
      `).all(emp.id, `${month}%`);

      let totalRecords = records.length;
      let presentDays = 0;
      let onTimeDays = 0;
      let lateDays = 0;
      let halfDays = 0;
      let absentDays = 0;
      let earlyLeaves = 0;
      let totalLateMinutes = 0;
      let totalEarlyLeaveMinutes = 0;
      let totalWorkedHours = 0;
      let totalDeductions = 0;
      let totalLateDeductions = 0;
      let totalAbsenceDeductions = 0;

      records.forEach(r => {
        if (r.check_in_time) {
          presentDays++;
          if (r.status === 'On Time') onTimeDays++;
          if (r.status === 'Late' || r.late_minutes > 0) {
            lateDays++;
            totalLateDeductions += (r.estimated_deduction || 0);
          }
          if (r.status === 'Half Day') {
            halfDays++;
            totalLateDeductions += (r.estimated_deduction || 0);
          }
        }
        if (r.status === 'Absent') {
          absentDays++;
          totalAbsenceDeductions += (r.estimated_deduction || 0);
        }
        if (r.early_leave_minutes > 0 || r.status === 'Early Leave') {
          earlyLeaves++;
          totalEarlyLeaveMinutes += (r.early_leave_minutes || 0);
        }

        totalLateMinutes += (r.late_minutes || 0);
        totalWorkedHours += (r.worked_hours || 0);
        totalDeductions += (r.estimated_deduction || 0);
      });

      const advancesSum = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM salary_advances
        WHERE employee_id = ? AND month = ? AND status = 'approved'
      `).get(emp.id, month);
      const totalAdvances = parseFloat(((advancesSum && advancesSum.total) || 0).toFixed(2));

      const bonusesSum = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM employee_bonuses
        WHERE employee_id = ? AND month = ?
      `).get(emp.id, month);
      const totalBonuses = parseFloat(((bonusesSum && bonusesSum.total) || 0).toFixed(2));

      const baseSalary = parseFloat(emp.base_salary || 3000);
      const netSalary = Math.max(0, parseFloat((baseSalary + totalBonuses - totalDeductions - totalAdvances).toFixed(2)));

      return {
        employee: emp,
        month,
        baseSalary,
        totalWorkingDays: totalRecords,
        presentDays,
        onTimeDays,
        lateDays,
        halfDays,
        absentDays,
        earlyLeaves,
        totalLateMinutes,
        totalEarlyLeaveMinutes,
        totalLateDeductions: parseFloat(totalLateDeductions.toFixed(2)),
        totalAbsenceDeductions: parseFloat(totalAbsenceDeductions.toFixed(2)),
        totalWorkedHours: parseFloat(totalWorkedHours.toFixed(1)),
        totalDeductions: parseFloat(totalDeductions.toFixed(2)),
        totalBonuses,
        totalAdvances,
        netSalary
      };
    });

    res.json({ success: true, month, summaries });
  } catch (error) {
    console.error('Monthly summary error:', error);
    res.status(500).json({ success: false, error: 'فشل في استخراج التقرير الشهري' });
  }
});

// GET /api/reports/available-months (All months with records + current month)
router.get('/available-months', authenticateToken, (req, res) => {
  try {
    const rawMonths = db.prepare(`
      SELECT DISTINCT SUBSTR(date, 1, 7) as month
      FROM attendance_records
      WHERE date IS NOT NULL AND length(date) >= 7
      ORDER BY month DESC
    `).all().map(r => r.month);

    const currentMonth = getCurrentMonthString();
    if (!rawMonths.includes(currentMonth)) {
      rawMonths.unshift(currentMonth);
    }

    const monthNamesAr = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];

    const months = rawMonths.map(m => {
      const parts = m.split('-');
      const year = parts[0];
      const monthNum = parts[1] || '01';
      const monthIdx = parseInt(monthNum, 10) - 1;
      const arName = monthNamesAr[monthIdx] || m;
      const isCurrent = m === currentMonth;
      return {
        value: m,
        label: `${arName} ${year}${isCurrent ? ' (الشهر الحالي)' : ''}`,
        year: parseInt(year, 10),
        month: parseInt(monthNum, 10),
        isCurrent
      };
    });

    res.json({ success: true, currentMonth, months });
  } catch (error) {
    console.error('Available months error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد قائمة الشهور' });
  }
});

// GET /api/reports/employee-month-details (Full records for a specific employee in a specific month)
router.get('/employee-month-details', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const month = req.query.month || getCurrentMonthString();
    const employeeId = isManager ? parseInt(req.query.employee_id, 10) : req.user.id;

    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد الموظف' });
    }

    syncMissingAbsencesForMonth(month);

    const employee = db.prepare(`
      SELECT u.id, u.employee_code, u.full_name, u.email, u.job_title, u.phone, u.hire_date, u.profile_photo, u.base_salary,
             d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(employeeId);

    if (!employee) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    const records = db.prepare(`
      SELECT * FROM attendance_records
      WHERE employee_id = ? AND date LIKE ?
      ORDER BY date ASC
    `).all(employeeId, `${month}%`);

    let presentDays = 0;
    let onTimeDays = 0;
    let lateDays = 0;
    let totalLateMinutes = 0;
    let earlyLeaveDays = 0;
    let totalEarlyLeaveMinutes = 0;
    let absentDays = 0;
    let totalWorkedHours = 0;
    let totalDeductions = 0;
    let totalLateDeductions = 0;
    let totalAbsenceDeductions = 0;

    const absentDaysList = [];
    const lateDaysList = [];
    const onTimeDaysList = [];

    records.forEach(r => {
      const ded = parseFloat(r.estimated_deduction || 0);
      if (r.check_in_time) {
        presentDays++;
        if (r.status === 'On Time') {
          onTimeDays++;
          onTimeDaysList.push({
            date: r.date,
            checkInTime: r.check_in_time,
            checkOutTime: r.check_out_time
          });
        }
        if (r.status === 'Late' || r.late_minutes > 0) {
          lateDays++;
          totalLateMinutes += (r.late_minutes || 0);
          totalLateDeductions += ded;
          lateDaysList.push({
            date: r.date,
            checkInTime: r.check_in_time,
            lateMinutes: r.late_minutes || 0,
            deduction: ded
          });
        }
        if (r.status === 'Half Day') {
          totalLateDeductions += ded;
          lateDaysList.push({
            date: r.date,
            checkInTime: r.check_in_time,
            lateMinutes: r.late_minutes || 0,
            deduction: ded,
            isHalfDay: true
          });
        }
      }
      if (r.status === 'Absent') {
        absentDays++;
        totalAbsenceDeductions += ded;
        absentDaysList.push({
          date: r.date,
          deduction: ded,
          notes: r.notes || 'غياب غير مسجل'
        });
      }
      if (r.early_leave_minutes > 0 || r.status === 'Early Leave') {
        earlyLeaveDays++;
        totalEarlyLeaveMinutes += (r.early_leave_minutes || 0);
      }
      totalWorkedHours += (r.worked_hours || 0);
      totalDeductions += ded;
    });

    // Query salary advances for this employee in this month
    const advances = db.prepare(`
      SELECT a.*, approver.full_name as approver_name
      FROM salary_advances a
      LEFT JOIN users approver ON a.approved_by = approver.id
      WHERE a.employee_id = ? AND a.month = ?
      ORDER BY a.date DESC, a.created_at DESC
    `).all(employeeId, month);

    let totalAdvances = 0;
    advances.forEach(a => {
      if (a.status === 'approved') {
        totalAdvances += parseFloat(a.amount || 0);
      }
    });

    // Query bonuses for this employee in this month
    const bonuses = db.prepare(`
      SELECT b.*, creator.full_name as creator_name
      FROM employee_bonuses b
      LEFT JOIN users creator ON b.created_by = creator.id
      WHERE b.employee_id = ? AND b.month = ?
      ORDER BY b.date DESC, b.created_at DESC
    `).all(employeeId, month);

    let totalBonuses = 0;
    bonuses.forEach(b => {
      totalBonuses += parseFloat(b.amount || 0);
    });

    const baseSalary = parseFloat(employee.base_salary || 3000);
    const netSalary = Math.max(0, parseFloat((baseSalary + totalBonuses - totalDeductions - totalAdvances).toFixed(2)));

    res.json({
      success: true,
      employee,
      month,
      stats: {
        baseSalary,
        totalDays: records.length,
        presentDays,
        onTimeDays,
        lateDays,
        totalLateMinutes,
        earlyLeaveDays,
        totalEarlyLeaveMinutes,
        absentDays,
        totalWorkedHours: parseFloat(totalWorkedHours.toFixed(1)),
        totalLateDeductions: parseFloat(totalLateDeductions.toFixed(2)),
        totalAbsenceDeductions: parseFloat(totalAbsenceDeductions.toFixed(2)),
        totalDeductions: parseFloat(totalDeductions.toFixed(2)),
        totalBonuses: parseFloat(totalBonuses.toFixed(2)),
        totalAdvances: parseFloat(totalAdvances.toFixed(2)),
        netSalary,
        absentDaysList,
        lateDaysList,
        onTimeDaysList
      },
      records,
      advances,
      bonuses
    });
  } catch (error) {
    console.error('Employee month details error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد تفاصيل الشهر للموظف' });
  }
});

// GET /api/reports/department-summary (Manager only)
router.get('/department-summary', authenticateToken, requireManager, (req, res) => {
  try {
    const month = req.query.month || getCurrentMonthString();

    const depts = db.prepare(`
      SELECT d.id, d.name, COUNT(DISTINCT u.id) as employee_count
      FROM departments d
      LEFT JOIN users u ON (d.id = u.department_id AND u.is_active = 1 AND u.role = 'employee')
      GROUP BY d.id
    `).all();

    const result = depts.map(dept => {
      const stats = db.prepare(`
        SELECT
          COUNT(ar.id) as total_records,
          SUM(CASE WHEN ar.check_in_time IS NOT NULL THEN 1 ELSE 0 END) as present_count,
          SUM(CASE WHEN ar.status = 'Late' THEN 1 ELSE 0 END) as late_count,
          SUM(CASE WHEN ar.status = 'Absent' THEN 1 ELSE 0 END) as absent_count,
          SUM(ar.late_minutes) as total_late_minutes,
          SUM(ar.worked_hours) as total_worked_hours,
          SUM(ar.estimated_deduction) as total_deductions
        FROM attendance_records ar
        JOIN users u ON ar.employee_id = u.id
        WHERE u.department_id = ? AND ar.date LIKE ?
      `).get(dept.id, `${month}%`);

      return {
        department: dept,
        total_records: stats.total_records || 0,
        present_count: stats.present_count || 0,
        late_count: stats.late_count || 0,
        absent_count: stats.absent_count || 0,
        total_late_minutes: stats.total_late_minutes || 0,
        total_worked_hours: parseFloat((stats.total_worked_hours || 0).toFixed(1)),
        total_deductions: parseFloat((stats.total_deductions || 0).toFixed(2))
      };
    });

    res.json({ success: true, month, departments: result });
  } catch (error) {
    console.error('Dept summary error:', error);
    res.status(500).json({ success: false, error: 'فشل في استخراج تقرير الأقسام' });
  }
});

// GET /api/reports/export/csv
router.get('/export/csv', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const { date_from, date_to, employee_id, department_id, status } = req.query;

    let query = `
      SELECT
        ar.date,
        u.employee_code,
        u.full_name,
        COALESCE(d.name, 'غير محدد') as department_name,
        ar.scheduled_start,
        COALESCE(ar.check_in_time, '-') as check_in_time,
        ar.scheduled_end,
        COALESCE(ar.check_out_time, '-') as check_out_time,
        ar.status,
        ar.late_minutes,
        ar.early_leave_minutes,
        ar.worked_hours,
        ar.estimated_deduction,
        COALESCE(ar.check_in_distance, '-') as distance_meters,
        ar.verification_status,
        COALESCE(ar.notes, '') as notes
      FROM attendance_records ar
      JOIN users u ON ar.employee_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (!isManager) {
      query += ` AND ar.employee_id = ? `;
      params.push(req.user.id);
    } else {
      query += ` AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1)) `;
      params.push(req.user.id, req.user.id);
      if (employee_id) {
        query += ` AND ar.employee_id = ? `;
        params.push(employee_id);
      }
    }

    if (date_from) {
      query += ` AND ar.date >= ? `;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND ar.date <= ? `;
      params.push(date_to);
    }
    if (department_id) {
      query += ` AND u.department_id = ? `;
      params.push(department_id);
    }
    if (status) {
      query += ` AND ar.status = ? `;
      params.push(status);
    }

    query += ` ORDER BY ar.date DESC, ar.check_in_time DESC `;

    const records = db.prepare(query).all(...params);

    // Build CSV with UTF-8 BOM
    const headers = [
      'التاريخ',
      'الرقم الوظيفي',
      'اسم الموظف',
      'القسم',
      'بداية الدوام المقرر',
      'وقت الحضور الفعلي',
      'نهاية الدوام المقرر',
      'وقت الانصراف الفعلي',
      'الحالة',
      'دقائق التأخير',
      'دقائق الانصراف المبكر',
      'ساعات العمل',
      'الخصم التقديري',
      'المسافة عن المقر (متر)',
      'حالة التحقق الجغرافي',
      'ملاحظات'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    let csvContent = '\uFEFF'; // BOM for Excel UTF-8 Arabic support
    csvContent += headers.map(h => `"${h}"`).join(',') + '\r\n';

    records.forEach(row => {
      const line = [
        row.date,
        row.employee_code,
        row.full_name,
        row.department_name,
        row.scheduled_start,
        row.check_in_time,
        row.scheduled_end,
        row.check_out_time,
        row.status,
        row.late_minutes,
        row.early_leave_minutes,
        row.worked_hours,
        row.estimated_deduction,
        row.distance_meters,
        row.verification_status,
        row.notes
      ].map(escapeCsv).join(',');

      csvContent += line + '\r\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_report_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ success: false, error: 'فشل في تصدير ملف CSV' });
  }
});

// POST /api/reports/reset-archive (Disabled to protect attendance records)
router.post('/reset-archive', authenticateToken, requireManager, (req, res) => {
  return res.status(400).json({ success: false, error: 'تم تعطيل تصفير الأرشيف لحماية سجلات وتقارير الحضور من الحذف غير المقصود' });
});

// Helper: Sync missing absences for a given month while skipping official weekends
function syncMissingAbsencesForMonth(month, managerId = null) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const mNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, mNum, 0).getDate();

    // Get company settings
    const settingsRows = db.prepare(`SELECT key, value FROM company_settings`).all();
    const settings = {};
    settingsRows.forEach(r => settings[r.key] = r.value);

    const weekendDaysStr = settings['weekend_days'] || '5';
    const weekendDays = (weekendDaysStr === 'none' || !weekendDaysStr) ? [] : weekendDaysStr.split(',').map(s => s.trim());
    const absenceRate = parseFloat(settings['deduction_absence_rate'] || '100');

    // Get active employees
    let empQuery = `SELECT id, full_name, hire_date FROM users WHERE role = 'employee' AND is_active = 1`;
    const empParams = [];
    if (managerId) {
      empQuery += ` AND (manager_id = ? OR (manager_id IS NULL AND ? = 1))`;
      empParams.push(managerId, managerId);
    }
    const employees = db.prepare(empQuery).all(...empParams);

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMins = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMins}`;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
      if (dateStr > today) break;

      // If today, only mark absent if passed threshold
      if (dateStr === today && currentTimeStr < '13:00') {
        continue;
      }

      // Check day of week
      const dayOfWeek = String(new Date(dateStr + 'T12:00:00').getDay());
      if (weekendDays.includes(dayOfWeek)) {
        continue; // Weekend is exempt!
      }

      for (const emp of employees) {
        if (emp.hire_date && emp.hire_date > dateStr) continue;

        // Check if employee has an approved leave
        const leave = db.prepare(`
          SELECT id, leave_type FROM leave_requests
          WHERE employee_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
        `).get(emp.id, dateStr);

        const existing = db.prepare(`SELECT id, status FROM attendance_records WHERE employee_id = ? AND date = ?`).get(emp.id, dateStr);

        if (!existing) {
          if (leave) {
            const leaveLabel = leave.leave_type === 'sick' ? 'إجازة مرضية معتمدة' :
                               leave.leave_type === 'annual' ? 'إجازة سنوية معتمدة' :
                               leave.leave_type === 'casual' ? 'إجازة عارضة معتمدة' : 'إجازة رسمية معتمدة';
            db.prepare(`
              INSERT INTO attendance_records (
                employee_id, date, status, scheduled_start, scheduled_end,
                worked_hours, estimated_deduction, verification_status, notes
              ) VALUES (?, ?, 'On Leave', '09:00', '17:00', 0, 0, 'approved_leave', ?)
            `).run(emp.id, dateStr, leaveLabel);
          } else {
            db.prepare(`
              INSERT INTO attendance_records (
                employee_id, date, status, scheduled_start, scheduled_end,
                worked_hours, estimated_deduction, verification_status, notes
              ) VALUES (?, ?, 'Absent', '09:00', '17:00', 0, ?, 'system_auto', 'تسجيل غياب آلي - تخلف عن تسجيل الحضور')
            `).run(emp.id, dateStr, absenceRate);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error syncing missing absences:', err);
  }
}

// ==========================================
// 8. Gamification & Attendance Score (مؤشر أداء الالتزام ولوحة شرف موظف الشهر)
// ==========================================

function calculateEmployeeScore(employeeId, month) {
  syncMissingAbsencesForMonth(month);

  const records = db.prepare(`
    SELECT * FROM attendance_records
    WHERE employee_id = ? AND date LIKE ?
    ORDER BY date ASC
  `).all(employeeId, `${month}%`);

  const permissions = db.prepare(`
    SELECT * FROM permission_requests
    WHERE employee_id = ? AND date LIKE ? AND status = 'approved'
  `).all(employeeId, `${month}%`);

  const permMap = {};
  permissions.forEach(p => {
    permMap[p.date] = permMap[p.date] || [];
    permMap[p.date].push(p);
  });

  let totalLoggedDays = records.length;
  let onTimeDays = 0;
  let lateDays = 0;
  let absentDays = 0;
  let halfDays = 0;
  let approvedLeaveDays = 0;
  let totalLateMinutes = 0;
  let earlyLeaveDays = 0;
  let totalAbsenceDeductions = 0;
  let totalLateDeductions = 0;
  let totalPoints = 0;

  const absentDaysList = [];
  const lateDaysList = [];
  const onTimeDaysList = [];
  const dailyScores = [];

  records.forEach(r => {
    const ded = parseFloat(r.estimated_deduction || 0);
    let dayPoints = 100;
    const perms = permMap[r.date] || [];
    const hasLatePerm = perms.some(p => p.permission_type === 'late_arrival' || p.permission_type === 'during_day');
    const hasEarlyPerm = perms.some(p => p.permission_type === 'early_departure' || p.permission_type === 'during_day');

    if (r.status === 'On Time' || (r.check_in_time && (r.late_minutes || 0) === 0 && r.status !== 'Absent' && r.status !== 'Half Day')) {
      onTimeDays++;
      dayPoints = 100;
      onTimeDaysList.push({
        date: r.date,
        checkInTime: r.check_in_time || '09:00',
        checkOutTime: r.check_out_time || null
      });
    } else if (r.status === 'On Leave') {
      approvedLeaveDays++;
      dayPoints = 100;
    } else if (r.status === 'Late' || (r.check_in_time && (r.late_minutes || 0) > 0)) {
      lateDays++;
      const lateMins = r.late_minutes || 0;
      totalLateMinutes += lateMins;
      totalLateDeductions += ded;

      if (hasLatePerm) {
        dayPoints = 100;
      } else {
        if (lateMins <= 15) dayPoints = 85;
        else if (lateMins <= 30) dayPoints = 70;
        else if (lateMins <= 60) dayPoints = 55;
        else dayPoints = 40;
      }

      lateDaysList.push({
        date: r.date,
        checkInTime: r.check_in_time,
        lateMinutes: lateMins,
        deduction: ded,
        hasPermission: hasLatePerm
      });
    } else if (r.status === 'Half Day') {
      halfDays++;
      dayPoints = 50;
      totalLateDeductions += ded;
      lateDaysList.push({
        date: r.date,
        checkInTime: r.check_in_time,
        lateMinutes: r.late_minutes || 0,
        deduction: ded,
        isHalfDay: true
      });
    } else if (r.status === 'Absent') {
      absentDays++;
      dayPoints = 0;
      totalAbsenceDeductions += ded;
      absentDaysList.push({
        date: r.date,
        deduction: ded,
        notes: r.notes || 'غياب غير مسجل'
      });
    }

    if ((r.early_leave_minutes || 0) > 0 || r.status === 'Early Leave') {
      earlyLeaveDays++;
      if (!hasEarlyPerm) {
        const earlyPenalty = Math.min(25, Math.round((r.early_leave_minutes || 0) / 2));
        dayPoints = Math.max(0, dayPoints - earlyPenalty);
      }
    }

    dayPoints = Math.max(0, Math.min(100, dayPoints));
    totalPoints += dayPoints;

    dailyScores.push({
      date: r.date,
      status: r.status,
      lateMinutes: r.late_minutes || 0,
      earlyMinutes: r.early_leave_minutes || 0,
      deduction: ded,
      dayPoints,
      checkInTime: r.check_in_time,
      checkOutTime: r.check_out_time
    });
  });

  // Commitment Score resets on new month and starts at 100%
  let finalScore = 100;
  if (totalLoggedDays > 0) {
    if (absentDays === 0 && lateDays === 0 && halfDays === 0) {
      finalScore = 100;
    } else {
      finalScore = Math.max(0, Math.min(100, Math.round(totalPoints / totalLoggedDays)));
    }
  }

  // Calculate consecutive on-time streak
  let streak = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    const isGoodDay = rec.status === 'On Time' || rec.status === 'On Leave' ||
      ((rec.late_minutes || 0) === 0 && rec.status !== 'Absent' && rec.status !== 'Half Day');
    if (isGoodDay) {
      streak++;
    } else {
      break;
    }
  }

  let tierKey = 'legendary';
  let tierName = 'فائق الالتزام 💎';
  let tierColor = 'emerald';
  let tierDesc = 'انضباط والتزام استثنائي في المواعيد';

  if (finalScore >= 95) {
    tierKey = 'legendary';
    tierName = 'فائق الالتزام 💎';
    tierColor = 'emerald';
    tierDesc = 'انضباط والتزام استثنائي في المواعيد';
  } else if (finalScore >= 85) {
    tierKey = 'committed';
    tierName = 'ملتزم ومتميز 🟢';
    tierColor = 'blue';
    tierDesc = 'أداء ممتاز ونسبة حضور عالية في الموعد';
  } else if (finalScore >= 70) {
    tierKey = 'good';
    tierName = 'متوسط 🟡';
    tierColor = 'amber';
    tierDesc = 'أداء مقبول مع وجود تأخيرات تحتاج تحسين';
  } else {
    tierKey = 'needs_improvement';
    tierName = 'إنذار عدم التزام 🔴';
    tierColor = 'rose';
    tierDesc = 'تكرار التأخير والغياب - يحتاج مراجعة فورية';
  }

  return {
    score: finalScore,
    streak,
    totalLoggedDays,
    onTimeDays,
    lateDays,
    absentDays,
    halfDays,
    approvedLeaveDays,
    earlyLeaveDays,
    totalLateMinutes,
    totalAbsenceDeductions: parseFloat(totalAbsenceDeductions.toFixed(2)),
    totalLateDeductions: parseFloat(totalLateDeductions.toFixed(2)),
    absentDaysList,
    lateDaysList,
    onTimeDaysList,
    tier: {
      key: tierKey,
      name: tierName,
      color: tierColor,
      desc: tierDesc
    },
    dailyScores
  };
}

function getLeaderboardData(month, managerId = null) {
  let query = `
    SELECT u.id, u.employee_code, u.full_name, u.email, u.phone, u.job_title, u.profile_photo,
           d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.role = 'employee' AND u.is_active = 1
    AND u.full_name NOT LIKE '%طارق النجار%'
  `;
  const params = [];
  if (managerId) {
    query += ` AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1)) `;
    params.push(managerId, managerId);
  }
  query += ` ORDER BY u.full_name ASC `;

  const employees = db.prepare(query).all(...params);

  const list = employees.map(emp => {
    const scoreData = calculateEmployeeScore(emp.id, month);
    return {
      employee: emp,
      score: scoreData.score,
      streak: scoreData.streak,
      tier: scoreData.tier,
      totalLoggedDays: scoreData.totalLoggedDays,
      onTimeDays: scoreData.onTimeDays,
      lateDays: scoreData.lateDays,
      absentDays: scoreData.absentDays,
      halfDays: scoreData.halfDays,
      approvedLeaveDays: scoreData.approvedLeaveDays,
      totalLateMinutes: scoreData.totalLateMinutes
    };
  });

  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.totalLateMinutes !== b.totalLateMinutes) return a.totalLateMinutes - b.totalLateMinutes;
    if (b.onTimeDays !== a.onTimeDays) return b.onTimeDays - a.onTimeDays;
    return b.streak - a.streak;
  });

  list.forEach((item, index) => {
    const rank = index + 1;
    item.rank = rank;
    if (rank === 1) {
      item.isEmployeeOfMonth = true;
      item.rankBadge = '🥇';
      item.trophyTitle = 'موظف الشهر الأكثر التزاماً 🏆';
    } else if (rank === 2) {
      item.isEmployeeOfMonth = false;
      item.rankBadge = '🥈';
      item.trophyTitle = 'المركز الثاني 🥈';
    } else if (rank === 3) {
      item.isEmployeeOfMonth = false;
      item.rankBadge = '🥉';
      item.trophyTitle = 'المركز الثالث 🥉';
    } else {
      item.isEmployeeOfMonth = false;
      item.rankBadge = `#${rank}`;
      item.trophyTitle = `المركز #${rank}`;
    }
  });

  const employeeOfTheMonth = list.length > 0 ? list[0] : null;
  const totalEmployees = list.length;
  const avgScore = totalEmployees > 0 ? Math.round(list.reduce((acc, curr) => acc + curr.score, 0) / totalEmployees) : 100;
  const legendaryCount = list.filter(item => item.score >= 95).length;

  return {
    month,
    employeeOfTheMonth,
    leaderboard: list,
    summary: {
      totalEmployees,
      avgScore,
      topScore: employeeOfTheMonth ? employeeOfTheMonth.score : 100,
      legendaryCount
    }
  };
}

// GET /api/reports/leaderboard
router.get('/leaderboard', authenticateToken, (req, res) => {
  try {
    const month = req.query.month || getCurrentMonthString();
    const managerId = req.user.role === 'manager' ? req.user.id : null;
    const data = getLeaderboardData(month, managerId);

    let myRank = null;
    if (req.user.role === 'employee') {
      myRank = data.leaderboard.find(item => item.employee.id === req.user.id) || null;
    }

    res.json({
      success: true,
      ...data,
      myRank
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ success: false, error: 'فشل في استخراج لوحة شرف الالتزام' });
  }
});

// GET /api/reports/my-score
router.get('/my-score', authenticateToken, (req, res) => {
  try {
    const month = req.query.month || getCurrentMonthString();
    const employeeId = req.user.role === 'manager' && req.query.employee_id ? parseInt(req.query.employee_id, 10) : req.user.id;
    const scoreData = calculateEmployeeScore(employeeId, month);
    const leaderboardData = getLeaderboardData(month, null);
    const rankedItem = leaderboardData.leaderboard.find(item => item.employee.id === employeeId);

    res.json({
      success: true,
      month,
      employeeId,
      score: scoreData.score,
      streak: scoreData.streak,
      tier: scoreData.tier,
      rank: rankedItem ? rankedItem.rank : 1,
      totalEmployees: leaderboardData.leaderboard.length,
      isEmployeeOfMonth: rankedItem ? rankedItem.isEmployeeOfMonth : false,
      rankBadge: rankedItem ? rankedItem.rankBadge : '🥇',
      trophyTitle: rankedItem ? rankedItem.trophyTitle : 'موظف متميز',
      metrics: {
        totalLoggedDays: scoreData.totalLoggedDays,
        onTimeDays: scoreData.onTimeDays,
        lateDays: scoreData.lateDays,
        absentDays: scoreData.absentDays,
        halfDays: scoreData.halfDays,
        approvedLeaveDays: scoreData.approvedLeaveDays,
        totalLateMinutes: scoreData.totalLateMinutes,
        totalAbsenceDeductions: scoreData.totalAbsenceDeductions,
        totalLateDeductions: scoreData.totalLateDeductions,
        absentDaysList: scoreData.absentDaysList,
        lateDaysList: scoreData.lateDaysList,
        onTimeDaysList: scoreData.onTimeDaysList
      },
      dailyScores: scoreData.dailyScores
    });
  } catch (error) {
    console.error('My score error:', error);
    res.status(500).json({ success: false, error: 'فشل في استخراج نقاط التقييم' });
  }
});

router.calculateEmployeeScore = calculateEmployeeScore;
router.getLeaderboardData = getLeaderboardData;

module.exports = router;
