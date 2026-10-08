const express = require('express');
const { db, logAudit } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

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

    res.json({
      success: true,
      workplace: workplace || null,
      schedule: schedule || null,
      settings: settingsMap,
      checklist
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

    if (!start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'وقت بدء وانتهاء الدوام حقول إلزامية' });
    }

    let schedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? LIMIT 1`).get(managerId);

    const graceMins = parseInt(grace_period_minutes, 10) || 15;
    const halfDay = half_day_threshold || '12:00';
    const absence = absence_threshold || '13:00';

    const early_leave_grace_minutes = req.body.early_leave_grace_minutes !== undefined ? parseInt(req.body.early_leave_grace_minutes, 10) : (schedule && schedule.early_leave_grace_minutes !== undefined ? schedule.early_leave_grace_minutes : 0);

    if (schedule) {
      db.prepare(`
        UPDATE schedules SET
          start_time = ?, end_time = ?, grace_period_minutes = ?, early_leave_grace_minutes = ?,
          half_day_threshold = ?, absence_threshold = ?, is_configured = 1
        WHERE id = ?
      `).run(start_time, end_time, graceMins, early_leave_grace_minutes, halfDay, absence, schedule.id);
    } else {
      db.prepare(`
        INSERT INTO schedules (
          name, start_time, end_time, grace_period_minutes, early_leave_grace_minutes,
          half_day_threshold, absence_threshold, working_days, manager_id, is_configured, is_default
        ) VALUES ('الدوام الرسمي العام', ?, ?, ?, ?, ?, ?, '0,1,2,3,4', ?, 1, 1)
      `).run(start_time, end_time, graceMins, early_leave_grace_minutes, halfDay, absence, managerId);
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
      'تحديد مواعيد العمل وقواعد الحضور والانصراف',
      clientIp
    );

    res.json({
      success: true,
      message: 'تم حفظ وتفعيل مواعيد العمل وقواعد الحضور بنجاح'
    });
  } catch (error) {
    console.error('Update working hours error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث مواعيد العمل' });
  }
});

// PUT /api/settings/company (Manager updates general company rules & deductions)
router.put('/company', authenticateToken, requireManager, (req, res) => {
  try {
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
    }

    const upsertStmt = db.prepare(`
      INSERT INTO company_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    for (const [key, value] of Object.entries(settings)) {
      upsertStmt.run(key, String(value));
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
      'تحديث القواعد الإضافية والخصومات',
      clientIp
    );

    res.json({ success: true, message: 'تم حفظ وتحديث قواعد وإعدادات المنظومة بنجاح' });
  } catch (error) {
    console.error('Update company settings error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث الإعدادات' });
  }
});

// POST /api/settings/reset-attendance-system (Manager resets attendance & starts from scratch while preserving employees, schedules, workplace)
router.post('/reset-attendance-system', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.id;
    
    // Delete attendance records for this manager's employees
    db.prepare(`
      DELETE FROM attendance_records 
      WHERE employee_id IN (
        SELECT id FROM users WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1))
      )
    `).run(managerId, managerId);

    // Delete attendance corrections
    db.prepare(`
      DELETE FROM attendance_corrections 
      WHERE employee_id IN (
        SELECT id FROM users WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1))
      )
    `).run(managerId, managerId);

    // Delete notifications
    db.prepare(`
      DELETE FROM notifications 
      WHERE user_id IS NULL OR user_id = ? OR user_id IN (
        SELECT id FROM users WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1))
      )
    `).run(managerId, managerId, managerId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'RESET_ATTENDANCE_SYSTEM',
      'attendance_records',
      null,
      null,
      null,
      'تصفير كافة سجلات الحضور والانصراف وإعادة البدء من جديد مع الحفاظ على الموظفين والمواعيد والمكان',
      clientIp
    );

    res.json({
      success: true,
      message: 'تم تصفير جميع سجلات الحضور والانصراف والأرشيف بنجاح والبدء من جديد، مع الحفاظ التام على الموظفين ومواعيد العمل وموقع المنشأة.'
    });
  } catch (error) {
    console.error('Reset system error:', error);
    res.status(500).json({ success: false, error: 'فشل في إعادة ضبط سجلات الحضور' });
  }
});

module.exports = router;
