const express = require('express');
const { db, logAudit, createNotification } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const router = express.Router();

// GET /api/corrections
router.get('/', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const { status } = req.query;

    let query = `
      SELECT
        c.*,
        u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        d.name as department_name,
        reviewer.full_name as reviewer_name
      FROM attendance_corrections c
      JOIN users u ON c.employee_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users reviewer ON c.reviewed_by = reviewer.id
      WHERE 1=1
    `;
    const params = [];

    if (!isManager) {
      query += ` AND c.employee_id = ? `;
      params.push(req.user.id);
    }

    if (status) {
      query += ` AND c.status = ? `;
      params.push(status);
    }

    query += ` ORDER BY c.created_at DESC `;

    const requests = db.prepare(query).all(...params);
    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    console.error('Get corrections error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد طلبات تصحيح الحضور' });
  }
});

// POST /api/corrections (Employee submits request)
router.post('/', authenticateToken, (req, res) => {
  try {
    const { date, requested_check_in, requested_check_out, reason_type, reason_details } = req.body;

    if (!date || !reason_type) {
      return res.status(400).json({ success: false, error: 'تاريخ اليوم وسبب التصحيح مطلوبان' });
    }

    if (!requested_check_in && !requested_check_out) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد وقت الحضور أو وقت الانصراف المطلوب تصحيحه' });
    }

    // Check if an existing attendance record exists for that date
    const record = db.prepare(`SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?`).get(req.user.id, date);

    const stmt = db.prepare(`
      INSERT INTO attendance_corrections (
        employee_id, attendance_record_id, date, requested_check_in, requested_check_out,
        reason_type, reason_details, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const result = stmt.run(
      req.user.id,
      record ? record.id : null,
      date,
      requested_check_in || null,
      requested_check_out || null,
      reason_type,
      reason_details || null
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'SUBMIT_CORRECTION_REQUEST',
      'attendance_corrections',
      result.lastInsertRowid,
      null,
      { date, requested_check_in, requested_check_out, reason_type },
      reason_details,
      clientIp
    );

    // Notify managers
    createNotification(
      null,
      'طلب تصحيح حضور جديد',
      `قدم الموظف ${req.user.full_name} طلب تصحيح حضور ليوم ${date}.`,
      'info'
    );

    res.json({
      success: true,
      message: 'تم إرسال طلب تصحيح الحضور للمدير بنجاح وسيتم إشعارك بالقرار فور مراجعته'
    });
  } catch (error) {
    console.error('Submit correction error:', error);
    res.status(500).json({ success: false, error: 'فشل في إرسال طلب التصحيح' });
  }
});

// PUT /api/corrections/:id/review (Manager approves/rejects)
router.put('/:id/review', authenticateToken, requireManager, (req, res) => {
  try {
    const correctionId = req.params.id;
    const { action, review_notes } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'إجراء غير صالح (يجب أن يكون approve أو reject)' });
    }

    const correction = db.prepare(`SELECT * FROM attendance_corrections WHERE id = ?`).get(correctionId);
    if (!correction) {
      return res.status(404).json({ success: false, error: 'طلب التصحيح غير موجود' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const nowIso = new Date().toISOString();

    // If approved, update or create attendance record
    if (action === 'approve') {
      const existingRecord = db.prepare(`SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?`).get(correction.employee_id, correction.date);

      const checkIn = correction.requested_check_in || (existingRecord ? existingRecord.check_in_time : '09:00:00');
      const checkOut = correction.requested_check_out || (existingRecord ? existingRecord.check_out_time : '17:00:00');

      // Calculate worked hours
      let workedHours = 8.0;
      if (checkIn && checkOut) {
        const inParts = checkIn.split(':').map(Number);
        const outParts = checkOut.split(':').map(Number);
        const inM = inParts[0] * 60 + (inParts[1] || 0);
        const outM = outParts[0] * 60 + (outParts[1] || 0);
        workedHours = parseFloat((Math.max(0, outM - inM) / 60).toFixed(2));
      }

      if (existingRecord) {
        db.prepare(`
          UPDATE attendance_records SET
            check_in_time = ?, check_out_time = ?, status = 'Approved',
            worked_hours = ?, late_minutes = 0, estimated_deduction = 0,
            verification_status = 'manual_override', notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(checkIn, checkOut, workedHours, `تم اعتماد تصحيح الحضور بناءً على طلب الموظف: ${review_notes || 'بدون ملاحظات إضافية'}`, existingRecord.id);
      } else {
        db.prepare(`
          INSERT INTO attendance_records (
            employee_id, date, check_in_time, check_out_time, status,
            scheduled_start, scheduled_end, worked_hours, late_minutes,
            estimated_deduction, verification_status, notes
          ) VALUES (?, ?, ?, ?, 'Approved', '09:00', '17:00', ?, 0, 0, 'manual_override', ?)
        `).run(correction.employee_id, correction.date, checkIn, checkOut, workedHours, `تم إنشاء الحضور بناءً على اعتماد طلب التصحيح: ${review_notes || ''}`);
      }
    }

    // Update correction status
    db.prepare(`
      UPDATE attendance_corrections SET
        status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = ?
      WHERE id = ?
    `).run(newStatus, req.user.id, review_notes || null, nowIso, correctionId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      action === 'approve' ? 'APPROVE_CORRECTION_REQUEST' : 'REJECT_CORRECTION_REQUEST',
      'attendance_corrections',
      correctionId,
      { status: correction.status },
      { status: newStatus, review_notes },
      review_notes || `تم ${action === 'approve' ? 'قبول' : 'رفض'} طلب التصحيح`,
      clientIp
    );

    // Notify employee
    createNotification(
      correction.employee_id,
      action === 'approve' ? 'تمت الموافقة على طلب تصحيح الحضور ✓' : 'تم رفض طلب تصحيح الحضور ✗',
      action === 'approve'
        ? `وافق المدير على طلب تصحيح حضورك ليوم ${correction.date}. ${review_notes ? 'ملاحظة: ' + review_notes : ''}`
        : `تم رفض طلب تصحيح حضورك ليوم ${correction.date}. السبب: ${review_notes || 'غير محدد'}`,
      action === 'approve' ? 'success' : 'danger'
    );

    res.json({
      success: true,
      message: action === 'approve' ? 'تمت الموافقة على طلب التصحيح وتحديث سجل الحضور' : 'تم رفض طلب التصحيح وتوثيق الإجراء'
    });
  } catch (error) {
    console.error('Review correction error:', error);
    res.status(500).json({ success: false, error: 'فشل في مراجعة طلب التصحيح' });
  }
});

module.exports = router;
