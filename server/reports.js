const express = require('express');
const { db } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const router = express.Router();

// Helper to get current month YYYY-MM
function getCurrentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// GET /api/reports/monthly-summary
router.get('/monthly-summary', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const month = req.query.month || getCurrentMonthString(); // YYYY-MM
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

      records.forEach(r => {
        if (r.check_in_time) {
          presentDays++;
          if (r.status === 'On Time') onTimeDays++;
          if (r.status === 'Late') lateDays++;
          if (r.status === 'Half Day') halfDays++;
        }
        if (r.status === 'Absent') absentDays++;
        if (r.early_leave_minutes > 0 || r.status === 'Early Leave') {
          earlyLeaves++;
          totalEarlyLeaveMinutes += (r.early_leave_minutes || 0);
        }

        totalLateMinutes += (r.late_minutes || 0);
        totalWorkedHours += (r.worked_hours || 0);
        totalDeductions += (r.estimated_deduction || 0);
      });

      return {
        employee: emp,
        month,
        totalWorkingDays: totalRecords,
        presentDays,
        onTimeDays,
        lateDays,
        halfDays,
        absentDays,
        earlyLeaves,
        totalLateMinutes,
        totalEarlyLeaveMinutes,
        totalWorkedHours: parseFloat(totalWorkedHours.toFixed(1)),
        totalDeductions: parseFloat(totalDeductions.toFixed(2))
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

    const employee = db.prepare(`
      SELECT u.id, u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
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

    records.forEach(r => {
      if (r.check_in_time) {
        presentDays++;
        if (r.status === 'On Time') onTimeDays++;
        if (r.status === 'Late' || r.late_minutes > 0) {
          lateDays++;
          totalLateMinutes += (r.late_minutes || 0);
        }
      }
      if (r.status === 'Absent') absentDays++;
      if (r.early_leave_minutes > 0 || r.status === 'Early Leave') {
        earlyLeaveDays++;
        totalEarlyLeaveMinutes += (r.early_leave_minutes || 0);
      }
      totalWorkedHours += (r.worked_hours || 0);
      totalDeductions += (r.estimated_deduction || 0);
    });

    res.json({
      success: true,
      employee,
      month,
      stats: {
        totalDays: records.length,
        presentDays,
        onTimeDays,
        lateDays,
        totalLateMinutes,
        earlyLeaveDays,
        totalEarlyLeaveMinutes,
        absentDays,
        totalWorkedHours: parseFloat(totalWorkedHours.toFixed(1)),
        totalDeductions: parseFloat(totalDeductions.toFixed(2))
      },
      records
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
    } else if (employee_id) {
      query += ` AND ar.employee_id = ? `;
      params.push(employee_id);
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

// POST /api/reports/reset-archive (Manager resets all attendance records)
router.post('/reset-archive', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    // Delete attendance records for this manager's employees
    db.prepare(`
      DELETE FROM attendance_records 
      WHERE employee_id IN (
        SELECT id FROM users WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1))
      )
    `).run(managerId, managerId);

    db.prepare(`
      DELETE FROM attendance_corrections 
      WHERE employee_id IN (
        SELECT id FROM users WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1))
      )
    `).run(managerId, managerId);

    res.json({ success: true, message: 'تم تصفير سجلات الحضور والأرشيف بنجاح والبدء من جديد' });
  } catch (error) {
    console.error('Reset archive error:', error);
    res.status(500).json({ success: false, error: 'فشل في تصفير الأرشيف' });
  }
});

module.exports = router;
