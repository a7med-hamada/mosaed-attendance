const express = require('express');
const { db, logAudit } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const router = express.Router();

// GET /api/schedules
router.get('/', authenticateToken, (req, res) => {
  try {
    const schedules = db.prepare(`
      SELECT s.*, COUNT(u.id) as assigned_employees
      FROM schedules s
      LEFT JOIN users u ON (s.id = u.schedule_id AND u.is_active = 1)
      GROUP BY s.id
      ORDER BY s.id ASC
    `).all();

    res.json({ success: true, count: schedules.length, schedules });
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد جداول الدوام' });
  }
});

// POST /api/schedules (Manager only)
router.post('/', authenticateToken, requireManager, (req, res) => {
  try {
    const { name, start_time, end_time, grace_period_minutes, half_day_threshold, absence_threshold, working_days, is_default } = req.body;
    if (!name || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'اسم جدول الدوام ومواعيد البدء والنهاية حقول مطلوبة' });
    }

    if (is_default) {
      db.prepare(`UPDATE schedules SET is_default = 0`).run();
    }

    const stmt = db.prepare(`
      INSERT INTO schedules (name, start_time, end_time, grace_period_minutes, half_day_threshold, absence_threshold, working_days, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name.trim(),
      start_time,
      end_time,
      parseInt(grace_period_minutes, 10) || 15,
      half_day_threshold || '12:00',
      absence_threshold || '13:00',
      working_days || '0,1,2,3,4',
      is_default ? 1 : 0
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'CREATE_SCHEDULE', 'schedules', result.lastInsertRowid, null, req.body, 'إنشاء جدول دوام جديد', clientIp);

    res.json({ success: true, message: 'تم إنشاء جدول الدوام بنجاح', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ success: false, error: 'فشل في إنشاء جدول الدوام' });
  }
});

// PUT /api/schedules/:id (Manager only)
router.put('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const oldSched = db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(targetId);
    if (!oldSched) {
      return res.status(404).json({ success: false, error: 'جدول الدوام غير موجود' });
    }

    const { name, start_time, end_time, grace_period_minutes, half_day_threshold, absence_threshold, working_days, is_default } = req.body;

    if (is_default) {
      db.prepare(`UPDATE schedules SET is_default = 0`).run();
    }

    db.prepare(`
      UPDATE schedules SET
        name = ?, start_time = ?, end_time = ?, grace_period_minutes = ?,
        half_day_threshold = ?, absence_threshold = ?, working_days = ?, is_default = ?
      WHERE id = ?
    `).run(
      name || oldSched.name,
      start_time || oldSched.start_time,
      end_time || oldSched.end_time,
      grace_period_minutes !== undefined ? parseInt(grace_period_minutes, 10) : oldSched.grace_period_minutes,
      half_day_threshold || oldSched.half_day_threshold,
      absence_threshold || oldSched.absence_threshold,
      working_days !== undefined ? working_days : oldSched.working_days,
      is_default !== undefined ? (is_default ? 1 : 0) : oldSched.is_default,
      targetId
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'UPDATE_SCHEDULE', 'schedules', targetId, oldSched, req.body, 'تعديل جدول الدوام', clientIp);

    res.json({ success: true, message: 'تم تحديث جدول الدوام بنجاح' });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث جدول الدوام' });
  }
});

// DELETE /api/schedules/:id
router.delete('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const oldSched = db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(targetId);
    if (!oldSched) {
      return res.status(404).json({ success: false, error: 'جدول الدوام غير موجود' });
    }

    db.prepare(`UPDATE users SET schedule_id = NULL WHERE schedule_id = ?`).run(targetId);
    db.prepare(`DELETE FROM schedules WHERE id = ?`).run(targetId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'DELETE_SCHEDULE', 'schedules', targetId, oldSched, null, 'حذف جدول دوام', clientIp);

    res.json({ success: true, message: 'تم حذف جدول الدوام بنجاح' });
  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف جدول الدوام' });
  }
});

// ==========================================
// Official Holidays Endpoints
// ==========================================

// GET /api/schedules/holidays
router.get('/holidays/list', authenticateToken, (req, res) => {
  try {
    const holidays = db.prepare(`SELECT * FROM holidays ORDER BY date ASC`).all();
    res.json({ success: true, holidays });
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد العطلات الرسمية' });
  }
});

// POST /api/schedules/holidays (Manager only)
router.post('/holidays', authenticateToken, requireManager, (req, res) => {
  try {
    const { name, date, is_recurring } = req.body;
    if (!name || !date) {
      return res.status(400).json({ success: false, error: 'اسم العطلة والتاريخ حقول مطلوبة' });
    }

    const stmt = db.prepare(`INSERT INTO holidays (name, date, is_recurring) VALUES (?, ?, ?)`);
    const result = stmt.run(name.trim(), date, is_recurring ? 1 : 0);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'ADD_HOLIDAY', 'holidays', result.lastInsertRowid, null, req.body, 'إضافة عطلة رسمية', clientIp);

    res.json({ success: true, message: 'تمت إضافة العطلة الرسمية بنجاح' });
  } catch (error) {
    console.error('Add holiday error:', error);
    res.status(500).json({ success: false, error: 'فشل في إضافة العطلة الرسمية' });
  }
});

// DELETE /api/schedules/holidays/:id (Manager only)
router.delete('/holidays/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    db.prepare(`DELETE FROM holidays WHERE id = ?`).run(targetId);
    res.json({ success: true, message: 'تم حذف العطلة الرسمية بنجاح' });
  } catch (error) {
    console.error('Delete holiday error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف العطلة الرسمية' });
  }
});

module.exports = router;
