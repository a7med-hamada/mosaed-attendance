const { db, getCurrentMonthString } = require('./database');

/**
 * Sync missing absences for a given month (YYYY-MM).
 * Automatically marks past working days where an employee did not attend as 'Absent'
 * with the company's absence deduction rate deducted.
 */
function syncMissingAbsencesForMonth(month, managerId = null) {
  try {
    if (!month || month.length < 7) {
      month = getCurrentMonthString();
    }

    const today = new Date().toISOString().split('T')[0];
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const mNum = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(mNum)) return;

    const daysInMonth = new Date(year, mNum, 0).getDate();

    // Get company settings
    const settingsRows = db.prepare(`SELECT key, value FROM company_settings`).all();
    const settings = {};
    settingsRows.forEach(r => settings[r.key] = r.value);

    // Only auto-mark absences if explicitly enabled by the manager in settings
    if (settings['auto_mark_absences'] !== '1') {
      return;
    }

    const weekendDaysStr = settings['weekend_days'] || '5';
    const weekendDays = (weekendDaysStr === 'none' || !weekendDaysStr) ? [] : weekendDaysStr.split(',').map(s => s.trim());
    const absenceRate = parseFloat(settings['deduction_absence_rate'] || '100');

    const isMgrTracked = settings['manager_track_attendance'] === '1';
    const mgrStartDate = settings['manager_attendance_start_date'] || today;

    const targetMgrId = managerId || 1;
    // Get active employees with schedule info (and manager if manager attendance is enabled)
    let empQuery = `
      SELECT u.id, u.full_name, u.hire_date, u.manager_id, u.role, u.base_salary,
             COALESCE(s.start_time, '09:00') as start_time,
             COALESCE(s.end_time, '17:00') as end_time,
             COALESCE(s.absence_threshold, '13:00') as absence_threshold,
             COALESCE(s.working_days, '0,1,2,3,4,5,6') as working_days
      FROM users u
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE u.is_active = 1
        AND (
          (u.role = 'employee' AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1)))
          ${isMgrTracked ? "OR (u.role = 'manager' AND u.id = ?)" : ''}
        )
        AND u.full_name NOT LIKE '%طارق النجار%'
    `;
    const empParams = [targetMgrId, targetMgrId];
    if (isMgrTracked) empParams.push(targetMgrId);
    const employees = db.prepare(empQuery).all(...empParams);

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMins = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMins}`;

    let hasChanges = false;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
      if (dateStr > today) break;

      // If today, only mark absent if passed threshold
      if (dateStr === today && currentTimeStr < '13:00') {
        continue;
      }

      // Check day of week (0=Sunday ... 6=Saturday)
      const dayOfWeek = String(new Date(dateStr + 'T12:00:00').getDay());
      if (weekendDays.includes(dayOfWeek)) {
        continue; // Official weekend day is exempt
      }

      for (const emp of employees) {
        // Skip if manager and date is prior to manager attendance start date
        if (emp.role === 'manager' && dateStr < mgrStartDate) continue;

        // Skip if date is prior to employee's hire date
        if (emp.hire_date && emp.hire_date > dateStr) continue;

        const currentEmpAbsenceRate = (emp.role === 'manager' && emp.base_salary > 0)
          ? Math.round(emp.base_salary / 30)
          : absenceRate;

        // Check if employee has an approved leave
        const leave = db.prepare(`
          SELECT id, leave_type FROM leave_requests
          WHERE employee_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
        `).get(emp.id, dateStr);

        const existing = db.prepare(`
          SELECT id, status, estimated_deduction, check_in_time
          FROM attendance_records
          WHERE employee_id = ? AND date = ?
        `).get(emp.id, dateStr);

        if (!existing) {
          if (leave) {
            const leaveLabel = leave.leave_type === 'sick' ? 'إجازة مرضية معتمدة' :
                               leave.leave_type === 'annual' ? 'إجازة سنوية معتمدة' :
                               leave.leave_type === 'casual' ? 'إجازة عارضة معتمدة' :
                               (leave.leave_type === 'mission' || leave.leave_type === 'business_mission') ? 'مأمورية عمل خارجية معتمدة' : 'إجازة رسمية معتمدة';
            db.prepare(`
              INSERT INTO attendance_records (
                employee_id, date, status, scheduled_start, scheduled_end,
                worked_hours, estimated_deduction, verification_status, notes
              ) VALUES (?, ?, 'On Leave', ?, ?, 0, 0, 'approved_leave', ?)
            `).run(emp.id, dateStr, emp.start_time, emp.end_time, leaveLabel);
            hasChanges = true;
          } else {
            db.prepare(`
              INSERT INTO attendance_records (
                employee_id, date, status, scheduled_start, scheduled_end,
                worked_hours, estimated_deduction, verification_status, notes
              ) VALUES (?, ?, 'Absent', ?, ?, 0, ?, 'system_auto', 'تسجيل غياب آلي - تخلف عن تسجيل الحضور')
            `).run(emp.id, dateStr, emp.start_time, emp.end_time, currentEmpAbsenceRate);
            hasChanges = true;
          }
        } else if (existing.status === 'Absent' && (!existing.estimated_deduction || existing.estimated_deduction === 0)) {
          // If absent record existed with 0 deduction, ensure the configured absence rate is applied
          db.prepare(`UPDATE attendance_records SET estimated_deduction = ? WHERE id = ?`).run(currentEmpAbsenceRate, existing.id);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      try {
        const { saveToCloud } = require('./cloud-sync');
        saveToCloud().catch(() => {});
      } catch (_) {}
    }
  } catch (err) {
    console.error('Error syncing missing absences:', err);
  }
}

/**
 * Sync absences across a date range (e.g. from history filter date_from/date_to)
 */
function syncAbsencesForDateRange(dateFrom, dateTo, managerId = null) {
  try {
    const months = new Set();
    const currentMonth = getCurrentMonthString();
    months.add(currentMonth);

    if (dateFrom && dateFrom.length >= 7) {
      months.add(dateFrom.substring(0, 7));
    }
    if (dateTo && dateTo.length >= 7) {
      months.add(dateTo.substring(0, 7));
    }

    for (const m of months) {
      syncMissingAbsencesForMonth(m, managerId);
    }
  } catch (err) {
    console.error('Error syncing absences for date range:', err);
  }
}

module.exports = {
  syncMissingAbsencesForMonth,
  syncAbsencesForDateRange
};
