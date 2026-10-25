const express = require('express');
const { db, logAudit, getCurrentMonthString } = require('./database');
const { authenticateToken, requireManager } = require('./auth');
const { evaluateAttendanceStatusAndDeduction } = require('./attendance');

function getWorkdaysFromWeekendDays(weekendDaysStr) {
  if (!weekendDaysStr || weekendDaysStr === 'none' || weekendDaysStr === 'null') {
    return '0,1,2,3,4,5,6';
  }
  const weekends = String(weekendDaysStr).split(',').map(s => s.trim());
  const allDays = ['0', '1', '2', '3', '4', '5', '6'];
  return allDays.filter(d => !weekends.includes(d)).join(',');
}

function getWeekendDaysFromWorkdays(workingDaysStr) {
  const workdays = (workingDaysStr || '0,1,2,3,4').split(',').map(s => s.trim());
  const allDays = ['0', '1', '2', '3', '4', '5', '6'];
  const res = allDays.filter(d => !workdays.includes(d)).join(',');
  return res || 'none';
}

// Recalculates current month attendance records when scope is 'from_month_start'
function recalculateMonthAttendance(managerId) {
  try {
    const currentMonth = getCurrentMonthString();
    const monthStart = `${currentMonth}-01`;

    let schedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? LIMIT 1`).get(managerId);
    if (!schedule && managerId === 1) {
      schedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 LIMIT 1`).get();
    }
    const settingsRows = db.prepare(`SELECT key, value FROM company_settings`).all();
    const settings = {};
    settingsRows.forEach(r => settings[r.key] = r.value);

    const weekendDaysStr = settings['weekend_days'] || (schedule && schedule.working_days ? getWeekendDaysFromWorkdays(schedule.working_days) : '5');
    const weekendDays = weekendDaysStr.split(',').map(s => s.trim());

    const records = db.prepare(`
      SELECT ar.*, u.schedule_id,
             COALESCE(s.start_time, '09:00') as sched_start,
             COALESCE(s.end_time, '17:00') as sched_end,
             COALESCE(s.grace_period_minutes, 15) as sched_grace
      FROM attendance_records ar
      JOIN users u ON ar.employee_id = u.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE ar.date >= ? AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1))
    `).all(monthStart, managerId, managerId);

    for (const r of records) {
      if (r.status === 'On Leave') continue;

      const dayOfWeek = String(new Date(r.date + 'T12:00:00').getDay());
      const isWeekend = weekendDays.includes(dayOfWeek);

      // If weekend day: never penalize
      if (isWeekend) {
        if (r.status === 'Absent') {
          db.prepare(`DELETE FROM attendance_records WHERE id = ?`).run(r.id);
          continue;
        }
      }

      if (r.check_in_time) {
        const evalResult = evaluateAttendanceStatusAndDeduction(
          r.check_in_time,
          r.sched_start,
          r.sched_grace,
          false
        );

        db.prepare(`
          UPDATE attendance_records SET
            status = ?,
            late_minutes = ?,
            estimated_deduction = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(evalResult.status, evalResult.lateMinutes, evalResult.deduction, r.id);
      } else if (r.status === 'Absent') {
        const absenceRate = parseFloat(settings['deduction_absence_rate'] || '100');
        db.prepare(`
          UPDATE attendance_records SET
            estimated_deduction = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(absenceRate, r.id);
      }
    }
  } catch (err) {
    console.error('Error recalculating month attendance:', err);
  }
}

const router = express.Router();

// GET /api/settings (Settings, workplace, schedule, and setup checklist)
router.get('/', authenticateToken, (req, res) => {
  try {
    const managerId = req.user.role === 'manager' ? req.user.id : (req.user.manager_id || 1);

    // Get workplace for this manager
    let workplace = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? LIMIT 1`).get(managerId);
    if (!workplace && managerId === 1) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 LIMIT 1`).get();
    }

    // Get schedule for this manager
    let schedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? LIMIT 1`).get(managerId);
    if (!schedule && managerId === 1) {
      schedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 LIMIT 1`).get();
    }

    // Settings
    const settingsRows = db.prepare(`SELECT * FROM company_settings`).all();
    const settingsMap = {};
    settingsRows.forEach(row => {
      settingsMap[row.key] = row.value;
    });

    if (!settingsMap['weekend_days']) {
      if (schedule && schedule.working_days) {
        settingsMap['weekend_days'] = getWeekendDaysFromWorkdays(schedule.working_days);
      } else {
        settingsMap['weekend_days'] = '5';
      }
    }

    // Employee count for this manager
    const empCount = db.prepare(`
      SELECT COUNT(*) as c FROM users
      WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1))
    `).get(managerId, managerId).c;

    // First-Time Setup Checklist
    const checklist = {
      hasManager: true,
      hasEmployees: empCount > 0,
      employeeCount: empCount,
      hasWorkplace: !!workplace && workplace.is_configured === 1,
      hasSchedule: !!schedule && schedule.is_configured === 1,
      hasRules: !!workplace && workplace.is_configured === 1 && !!schedule && schedule.is_configured === 1,
      isFullyConfigured: empCount > 0 && !!workplace && workplace.is_configured === 1 && !!schedule && schedule.is_configured === 1
    };

    const currentMode = workplace ? (workplace.schedule_mode || 'normal') : 'normal';
    const rawShifts = db.prepare('SELECT * FROM company_shifts WHERE manager_id = ? AND is_active = 1 ORDER BY start_time ASC').all(managerId);
    const shifts = rawShifts.map(s => {
      let empIds = [];
      try {
        if (s.assigned_employee_ids) {
          empIds = typeof s.assigned_employee_ids === 'string'
            ? (s.assigned_employee_ids.startsWith('[') ? JSON.parse(s.assigned_employee_ids) : s.assigned_employee_ids.split(',').map(Number))
            : s.assigned_employee_ids;
        }
      } catch(e) { empIds = []; }
      return { ...s, assigned_employee_ids: empIds };
    });

    const managerUser = db.prepare('SELECT id, base_salary, schedule_id, (face_descriptor IS NOT NULL) as has_face_enrolled, face_enrolled_at FROM users WHERE id = ?').get(managerId);

    res.json({
      success: true,
      workplace: workplace || null,
      schedule: schedule || null,
      schedule_mode: currentMode,
      shifts,
      settings: settingsMap,
      checklist,
      manager_config: {
        enabled: settingsMap['manager_track_attendance'] === '1',
        start_date: settingsMap['manager_attendance_start_date'] || null,
        salary: managerUser ? (managerUser.base_salary || 0) : 0,
        schedule_id: managerUser ? managerUser.schedule_id : null,
        has_face_enrolled: managerUser ? (managerUser.has_face_enrolled === 1) : false,
        face_enrolled_at: managerUser ? managerUser.face_enrolled_at : null
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد الإعدادات' });
  }
});

// PUT /api/settings/workplace (Manager sets workplace location & geofence)
router.put('/workplace', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    const { company_name, name, latitude, longitude, allowed_radius_meters, max_gps_accuracy_meters } = req.body;

    if (latitude === undefined || longitude === undefined || !allowed_radius_meters) {
      return res.status(400).json({ success: false, error: 'خط العرض وخط الطول ونصف القطر حقول مطلوبة' });
    }

    let currentWp = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? LIMIT 1`).get(managerId);

    if (currentWp) {
      db.prepare(`
        UPDATE workplaces SET
          company_name = ?, name = ?, latitude = ?, longitude = ?,
          allowed_radius_meters = ?, max_gps_accuracy_meters = ?, is_configured = 1
        WHERE id = ?
      `).run(
        company_name || currentWp.company_name,
        name || currentWp.name,
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(allowed_radius_meters),
        parseFloat(max_gps_accuracy_meters) || 150,
        currentWp.id
      );
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO workplaces (
          company_name, name, latitude, longitude,
          allowed_radius_meters, max_gps_accuracy_meters, manager_id, is_configured
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      insertStmt.run(
        company_name || 'المقر الرئيسي',
        name || 'المقر الرئيسي',
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(allowed_radius_meters),
        parseFloat(max_gps_accuracy_meters) || 150,
        managerId
      );
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'UPDATE_WORKPLACE_SETTINGS',
      'workplaces',
      currentWp ? currentWp.id : null,
      currentWp,
      req.body,
      'تحديد موقع العمل ونطاق الـ Geofence',
      clientIp
    );

    res.json({
      success: true,
      message: 'تم حفظ وتفعيل موقع مقر العمل والنطاق الجغرافي بنجاح'
    });
  } catch (error) {
    console.error('Update workplace error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث إعدادات موقع العمل' });
  }
});

// PUT /api/settings/working-hours (Manager defines working hours & attendance rules)
router.put('/working-hours', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    const start_time = req.body.start_time || req.body.work_start_time;
    const end_time = req.body.end_time || req.body.work_end_time;
    const grace_period_minutes = req.body.grace_period_minutes !== undefined ? req.body.grace_period_minutes : req.body.grace_period_mins;
    const late_threshold = req.body.late_threshold || req.body.late_threshold_time;
    const half_day_threshold = req.body.half_day_threshold || req.body.half_day_threshold_time;
    const absence_threshold = req.body.absence_threshold || req.body.absence_threshold_time;
    const weekend_days = req.body.weekend_days;
    const apply_scope = req.body.apply_scope || 'from_today';

    if (!start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'وقت بدء وانتهاء الدوام حقول إلزامية' });
    }

    let schedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? LIMIT 1`).get(managerId);

    const graceMins = parseInt(grace_period_minutes, 10) || 15;
    const halfDay = half_day_threshold || '12:00';
    const absence = absence_threshold || '13:00';

    const early_leave_grace_minutes = req.body.early_leave_grace_minutes !== undefined ? parseInt(req.body.early_leave_grace_minutes, 10) : (schedule && schedule.early_leave_grace_minutes !== undefined ? schedule.early_leave_grace_minutes : 0);

    let working_days = schedule ? schedule.working_days : '0,1,2,3,4';
    if (weekend_days !== undefined && weekend_days !== null) {
      working_days = getWorkdaysFromWeekendDays(weekend_days);
      db.prepare(`
        INSERT INTO company_settings (key, value) VALUES ('weekend_days', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(weekend_days));
    }

    if (schedule) {
      db.prepare(`
        UPDATE schedules SET
          start_time = ?, end_time = ?, grace_period_minutes = ?, early_leave_grace_minutes = ?,
          half_day_threshold = ?, absence_threshold = ?, working_days = ?, is_configured = 1
        WHERE id = ?
      `).run(start_time, end_time, graceMins, early_leave_grace_minutes, halfDay, absence, working_days, schedule.id);
    } else {
      db.prepare(`
        INSERT INTO schedules (
          name, start_time, end_time, grace_period_minutes, early_leave_grace_minutes,
          half_day_threshold, absence_threshold, working_days, manager_id, is_configured, is_default
        ) VALUES ('الدوام الرسمي العام', ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
      `).run(start_time, end_time, graceMins, early_leave_grace_minutes, halfDay, absence, working_days, managerId);
    }

    // Reset schedule_mode to normal
    db.prepare(`UPDATE workplaces SET schedule_mode = 'normal' WHERE manager_id = ? OR (manager_id IS NULL AND ? = 1)`).run(managerId, managerId);

    // Apply Scope: If manager chose retroactive from start of current month
    if (apply_scope === 'from_month_start') {
      recalculateMonthAttendance(managerId);
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'UPDATE_WORKING_HOURS',
      'schedules',
      schedule ? schedule.id : null,
      schedule,
      req.body,
      `تحديد مواعيد العمل وقواعد الحضور (${apply_scope === 'from_month_start' ? 'تطبيق بأثر رجعي من أول الشهر' : 'تطبيق من اليوم فصاعداً'})`,
      clientIp
    );

    res.json({
      success: true,
      message: apply_scope === 'from_month_start'
        ? 'تم حفظ مواعيد العمل وإعادة احتساب سجلات وخصومات الحضور للشهر الحالي بنجاح 🗓️'
        : 'تم حفظ وتفعيل مواعيد العمل وقواعد الحضور بنجاح ⏱️'
    });
  } catch (error) {
    console.error('Update working hours error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث مواعيد العمل' });
  }
});

// PUT /api/settings/company (Manager updates general company rules & deductions)
router.put('/company', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    const settings = { ...req.body };
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
    }

    const apply_scope = settings.apply_scope || 'from_today';
    delete settings.apply_scope;

    // Handle weekend days if present
    if (settings.weekend_days !== undefined && settings.weekend_days !== null) {
      const working_days = getWorkdaysFromWeekendDays(settings.weekend_days);
      db.prepare(`UPDATE schedules SET working_days = ? WHERE manager_id = ? OR (manager_id IS NULL AND ? = 1)`).run(working_days, managerId, managerId);
    }

    const upsertStmt = db.prepare(`
      INSERT INTO company_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    for (const [key, value] of Object.entries(settings)) {
      upsertStmt.run(key, String(value));
    }

    if (apply_scope === 'from_month_start') {
      recalculateMonthAttendance(managerId);
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'UPDATE_COMPANY_RULES',
      'company_settings',
      null,
      null,
      settings,
      `تحديث القواعد الإضافية والخصومات (${apply_scope === 'from_month_start' ? 'تطبيق بأثر رجعي من أول الشهر' : 'تطبيق من اليوم فصاعداً'})`,
      clientIp
    );

    res.json({
      success: true,
      message: apply_scope === 'from_month_start'
        ? 'تم حفظ الإعدادات وقواعد الخصم وإعادة احتساب سجلات الشهر الحالي بنجاح 🗓️'
        : 'تم حفظ وتحديث قواعد وإعدادات المنظومة بنجاح ⏱️'
    });
  } catch (error) {
    console.error('Update company settings error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث الإعدادات' });
  }
});

// GET /api/settings/shifts (Retrieve shifts for current manager or employee)
router.get('/shifts', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === 'manager' ? user.id : (user.manager_id || 1);

    let workplace = db.prepare('SELECT schedule_mode FROM workplaces WHERE manager_id = ? LIMIT 1').get(managerId);
    if (!workplace && managerId === 1) {
      workplace = db.prepare('SELECT schedule_mode FROM workplaces WHERE id = 1 LIMIT 1').get();
    }
    const scheduleMode = workplace ? (workplace.schedule_mode || 'normal') : 'normal';

    const rawShifts = db.prepare(`
      SELECT id, manager_id, name, start_time, end_time,
             grace_period_minutes, early_leave_grace_minutes,
             COALESCE(early_checkin_minutes, 60) as early_checkin_minutes,
             assigned_employee_ids, is_active, created_at
      FROM company_shifts
      WHERE manager_id = ? AND is_active = 1
      ORDER BY start_time ASC
    `).all(managerId);

    const shifts = rawShifts.map(s => {
      let empIds = [];
      try {
        if (s.assigned_employee_ids) {
          empIds = typeof s.assigned_employee_ids === 'string'
            ? (s.assigned_employee_ids.startsWith('[') ? JSON.parse(s.assigned_employee_ids) : s.assigned_employee_ids.split(',').map(Number))
            : s.assigned_employee_ids;
        }
      } catch(e) { empIds = []; }
      return { ...s, assigned_employee_ids: empIds };
    });

    res.json({
      success: true,
      schedule_mode: scheduleMode,
      shifts
    });
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحميل الورديات' });
  }
});

// POST /api/settings/shifts (Save schedule mode and multi-shift periods)
router.post('/shifts', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    const { schedule_mode, shifts, weekend_days } = req.body;

    const mode = schedule_mode === 'shifts' ? 'shifts' : 'normal';

    // 1. Update schedule_mode in workplace
    let currentWp = db.prepare('SELECT id FROM workplaces WHERE manager_id = ? LIMIT 1').get(managerId);
    if (currentWp) {
      db.prepare('UPDATE workplaces SET schedule_mode = ? WHERE id = ?').run(mode, currentWp.id);
    } else if (managerId === 1) {
      db.prepare('UPDATE workplaces SET schedule_mode = ? WHERE id = 1').run(mode);
    }

    // 2. Handle weekend days if provided
    if (weekend_days !== undefined && weekend_days !== null) {
      const working_days = getWorkdaysFromWeekendDays(weekend_days);
      db.prepare(`UPDATE schedules SET working_days = ? WHERE manager_id = ? OR (manager_id IS NULL AND ? = 1)`).run(working_days, managerId, managerId);
      db.prepare(`
        INSERT INTO company_settings (key, value) VALUES ('weekend_days', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(weekend_days));
    }

    // 3. Save shifts if provided
    if (Array.isArray(shifts)) {
      db.prepare('DELETE FROM company_shifts WHERE manager_id = ?').run(managerId);

      const insertStmt = db.prepare(`
        INSERT INTO company_shifts (
          manager_id, name, start_time, end_time,
          grace_period_minutes, early_leave_grace_minutes, early_checkin_minutes, assigned_employee_ids, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      for (const s of shifts) {
        if (!s.name || !s.start_time || !s.end_time) continue;
        let assignedStr = null;
        if (Array.isArray(s.assigned_employee_ids) && s.assigned_employee_ids.length > 0) {
          assignedStr = JSON.stringify(s.assigned_employee_ids.map(Number));
        } else if (typeof s.assigned_employee_ids === 'string' && s.assigned_employee_ids.trim()) {
          assignedStr = JSON.stringify(s.assigned_employee_ids.split(',').map(x => Number(x.trim())));
        }

        insertStmt.run(
          managerId,
          s.name.trim(),
          s.start_time.trim(),
          s.end_time.trim(),
          parseInt(s.grace_period_minutes, 10) || 15,
          parseInt(s.early_leave_grace_minutes, 10) || 15,
          parseInt(s.early_checkin_minutes, 10) || 60,
          assignedStr
        );
      }
    }

    // 4. If shifts mode is active, retroactively align today's records with matched shifts
    if (mode === 'shifts') {
      syncTodayAttendanceWithShifts(managerId);
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'UPDATE_SHIFTS_CONFIG',
      'company_shifts',
      null,
      null,
      { schedule_mode: mode, shifts_count: (shifts || []).length },
      `تحديث وضبط نظام مواعيد العمل (${mode === 'shifts' ? 'نظام الشيفتات المتعددة' : 'نظام الدوام العادي'}) وسريانه فوراً اليوم`,
      clientIp
    );

    res.json({
      success: true,
      message: mode === 'shifts'
        ? 'تم تفعيل وحفظ نظام الشيفتات بنجاح وسريانه فوراً لهذا اليوم! 🔄'
        : 'تم حفظ وتفعيل نظام الدوام العادي بنجاح! ⏱️',
      schedule_mode: mode
    });
  } catch (error) {
    console.error('Save shifts error:', error);
    res.status(500).json({ success: false, error: 'فشل في حفظ إعدادات الشيفتات' });
  }
});

// Helper: Synchronize today's attendance records with active shifts
function syncTodayAttendanceWithShifts(managerId) {
  try {
    const today = getTodayString();
    const activeShifts = db.prepare(`SELECT * FROM company_shifts WHERE manager_id = ? AND is_active = 1 ORDER BY start_time ASC`).all(managerId);
    if (!activeShifts || activeShifts.length === 0) return;

    const records = db.prepare(`
      SELECT ar.*, u.id as emp_id, u.shift_id as emp_shift_id
      FROM attendance_records ar
      JOIN users u ON ar.employee_id = u.id
      WHERE ar.date = ? AND (u.manager_id = ? OR (? = 1 AND u.manager_id IS NULL))
    `).all(today, managerId, managerId);

    const updateStmt = db.prepare(`
      UPDATE attendance_records SET
        shift_id = ?,
        shift_name = ?,
        scheduled_start = ?,
        scheduled_end = ?,
        early_leave_minutes = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const rec of records) {
      let matched = null;
      if (rec.shift_id) {
        matched = activeShifts.find(s => s.id === rec.shift_id);
      }
      if (!matched && rec.emp_shift_id) {
        matched = activeShifts.find(s => s.id === rec.emp_shift_id);
      }
      if (!matched) {
        matched = activeShifts.find(s => {
          if (!s.assigned_employee_ids) return false;
          try {
            const ids = typeof s.assigned_employee_ids === 'string'
              ? (s.assigned_employee_ids.startsWith('[') ? JSON.parse(s.assigned_employee_ids) : s.assigned_employee_ids.split(',').map(Number))
              : s.assigned_employee_ids;
            return Array.isArray(ids) && ids.includes(rec.employee_id);
          } catch(e) { return false; }
        });
      }
      if (!matched) {
        const refMins = timeToMinutes(rec.check_in_time || rec.scheduled_start || '09:00');
        matched = activeShifts.reduce((closest, s) => {
          const diff1 = Math.abs(timeToMinutes(s.start_time) - refMins);
          const diff2 = Math.abs(timeToMinutes(closest.start_time) - refMins);
          return diff1 < diff2 ? s : closest;
        }, activeShifts[0]);
      }

      if (!matched) continue;

      let earlyLeaveMinutes = 0;
      let status = rec.status;

      if (rec.check_out_time) {
        const outMins = timeToMinutes(rec.check_out_time);
        const shiftEndMins = timeToMinutes(matched.end_time);
        const grace = matched.early_leave_grace_minutes || 0;

        if (outMins < (shiftEndMins - grace)) {
          earlyLeaveMinutes = shiftEndMins - outMins;
          if (status === 'On Time') status = 'Early Leave';
        } else {
          earlyLeaveMinutes = 0;
          if (status === 'Early Leave') {
            status = (rec.late_minutes && rec.late_minutes > 0) ? 'Late' : 'On Time';
          }
        }
      }

      updateStmt.run(
        matched.id,
        matched.name,
        matched.start_time,
        matched.end_time,
        earlyLeaveMinutes,
        status,
        rec.id
      );
    }
  } catch (err) {
    console.error('syncTodayAttendanceWithShifts error:', err);
  }
}

// POST /api/settings/reset-attendance-system (Disabled to protect attendance records)
router.post('/reset-attendance-system', authenticateToken, requireManager, (req, res) => {
  return res.status(400).json({
    success: false,
    error: 'تم تعطيل تصفير المنظومة لحماية سجلات وتقارير الحضور من الحذف غير المقصود'
  });
});

// PUT /api/settings/manager-attendance (Configure Manager Self-Attendance Tracking)
router.put('/manager-attendance', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    const { enabled, base_salary, salary, schedule_id } = req.body;

    const isEnabled = (enabled === true || enabled === '1' || enabled === 1) ? '1' : '0';
    const salaryVal = parseFloat(base_salary !== undefined && base_salary !== null ? base_salary : salary) || 5000;
    const schedId = schedule_id ? parseInt(schedule_id, 10) : null;

    // 1. Update company settings
    const upsertStmt = db.prepare(`
      INSERT INTO company_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    upsertStmt.run('manager_track_attendance', isEnabled);

    // If enabled, record start date if not yet recorded
    const existingStart = db.prepare(`SELECT value FROM company_settings WHERE key = 'manager_attendance_start_date'`).get();
    if (isEnabled === '1' && (!existingStart || !existingStart.value)) {
      const today = new Date().toISOString().split('T')[0];
      upsertStmt.run('manager_attendance_start_date', today);
    }

    // 2. Update manager's user record (base_salary and schedule_id)
    db.prepare(`
      UPDATE users SET
        base_salary = ?,
        schedule_id = ?
      WHERE id = ?
    `).run(salaryVal, schedId, managerId);

    // 3. Check face enrollment status
    const mgrUser = db.prepare('SELECT (face_descriptor IS NOT NULL) as has_face_enrolled FROM users WHERE id = ?').get(managerId);
    const hasFace = !!(mgrUser && mgrUser.has_face_enrolled);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      managerId,
      req.user.full_name,
      'UPDATE_MANAGER_ATTENDANCE_CONFIG',
      'company_settings',
      null,
      null,
      { enabled: isEnabled, base_salary: salaryVal, schedule_id: schedId },
      `تحديث إعدادات تسجيل حضور المدير (${isEnabled === '1' ? 'مفعل' : 'معطل'})`,
      clientIp
    );

    res.json({
      success: true,
      message: isEnabled === '1'
        ? 'تم تفعيل نظام تسجيل حضور المدير بنجاح'
        : 'تم تعطيل نظام تسجيل حضور المدير، وتم الاحتفاظ بسجلات الأيام السابقة',
      enabled: isEnabled === '1',
      requires_face_enrollment: isEnabled === '1' && !hasFace,
      has_face_enrolled: hasFace
    });
  } catch (error) {
    console.error('Update manager attendance settings error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث إعدادات حضور المدير' });
  }
});

// POST /api/settings/manager-face-reset (Reset Manager's Own Face Biometric Baseline)
router.post('/manager-face-reset', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    db.prepare(`
      UPDATE users SET
        face_descriptor = NULL,
        face_photo = NULL,
        face_enrolled_at = NULL
      WHERE id = ?
    `).run(managerId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      managerId,
      req.user.full_name,
      'RESET_MANAGER_FACE_BIOMETRIC',
      'users',
      managerId,
      null,
      null,
      'إعادة تعيين بصمة الوجه للمدير العام',
      clientIp
    );

    res.json({
      success: true,
      message: 'تمت إعادة تعيين بصمة الوجه بنجاح، يمكنك الآن تسجيل بصمة وجه جديدة'
    });
  } catch (error) {
    console.error('Reset manager face error:', error);
    res.status(500).json({ success: false, error: 'فشل في إعادة تعيين بصمة الوجه' });
  }
});

module.exports = router;
