const express = require('express');
const { db, logAudit, createNotification, getTodayString, getCurrentTimeString, getCurrentMonthString } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const leavesRouter = express.Router();
const permissionsRouter = express.Router();

// Helper to calculate difference in calendar days (inclusive)
function calculateDaysCount(startDateStr, endDateStr) {
  try {
    const d1 = new Date(startDateStr + 'T00:00:00');
    const d2 = new Date(endDateStr + 'T00:00:00');
    const diffTime = d2.getTime() - d1.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
  } catch {
    return 1;
  }
}

// Helper to calculate hours between two HH:MM strings
function calculateHoursCount(startTimeStr, endTimeStr) {
  try {
    const [h1, m1] = startTimeStr.split(':').map(Number);
    const [h2, m2] = endTimeStr.split(':').map(Number);
    const mins1 = h1 * 60 + (m1 || 0);
    const mins2 = h2 * 60 + (m2 || 0);
    const diffMins = mins2 - mins1;
    return diffMins > 0 ? parseFloat((diffMins / 60).toFixed(1)) : 1.0;
  } catch {
    return 1.0;
  }
}

// =============================================================
// 1. LEAVE REQUESTS ROUTER (/api/leaves)
// =============================================================

// GET /api/leaves/balance
leavesRouter.get('/balance', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const targetUserId = (isManager && req.query.employee_id) ? parseInt(req.query.employee_id, 10) : req.user.id;

    const user = db.prepare('SELECT id, full_name, annual_leave_balance FROM users WHERE id = ?').get(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }

    const currentYear = getTodayString().substring(0, 4);
    const currentMonth = getCurrentMonthString();

    // Calculate approved leave days this year
    const approvedLeaves = db.prepare(`
      SELECT leave_type, SUM(days_count) as total_days
      FROM leave_requests
      WHERE employee_id = ? AND status = 'approved' AND start_date LIKE ?
      GROUP BY leave_type
    `).all(targetUserId, `${currentYear}-%`);

    let annualUsed = 0;
    let sickUsed = 0;
    let casualUsed = 0;
    let unpaidUsed = 0;

    approvedLeaves.forEach(r => {
      const days = parseInt(r.total_days, 10) || 0;
      if (r.leave_type === 'annual') annualUsed += days;
      else if (r.leave_type === 'sick') sickUsed += days;
      else if (r.leave_type === 'casual') casualUsed += days;
      else if (r.leave_type === 'unpaid') unpaidUsed += days;
    });

    const annualTotal = user.annual_leave_balance !== undefined && user.annual_leave_balance !== null ? user.annual_leave_balance : 21;
    const annualRemaining = Math.max(0, annualTotal - annualUsed);

    // Permissions this month
    const approvedPerms = db.prepare(`
      SELECT COUNT(*) as count, SUM(hours_count) as total_hours
      FROM permission_requests
      WHERE employee_id = ? AND status = 'approved' AND date LIKE ?
    `).get(targetUserId, `${currentMonth}-%`);

    res.json({
      success: true,
      balance: {
        annual_total: annualTotal,
        annual_used: annualUsed,
        annual_remaining: annualRemaining,
        sick_used: sickUsed,
        casual_used: casualUsed,
        unpaid_used: unpaidUsed,
        permissions_this_month: approvedPerms ? (approvedPerms.count || 0) : 0,
        permission_hours_this_month: approvedPerms && approvedPerms.total_hours ? parseFloat(approvedPerms.total_hours.toFixed(1)) : 0
      }
    });
  } catch (error) {
    console.error('Get leave balance error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد رصيد الإجازات' });
  }
});

// GET /api/leaves - List leave requests
leavesRouter.get('/', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const { employee_id, status, leave_type, month } = req.query;

    let query = `
      SELECT
        lr.*,
        u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        d.name as department_name,
        approver.full_name as approver_name
      FROM leave_requests lr
      JOIN users u ON lr.employee_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users approver ON lr.reviewed_by = approver.id
      WHERE 1=1
    `;
    const params = [];

    if (!isManager) {
      query += ` AND lr.employee_id = ? `;
      params.push(req.user.id);
    } else {
      query += ` AND u.manager_id = ? `;
      params.push(req.user.id);

      if (employee_id) {
        query += ` AND lr.employee_id = ? `;
        params.push(employee_id);
      }
    }

    if (status) {
      query += ` AND lr.status = ? `;
      params.push(status);
    }

    if (leave_type) {
      query += ` AND lr.leave_type = ? `;
      params.push(leave_type);
    }

    if (month) {
      query += ` AND (lr.start_date LIKE ? OR lr.end_date LIKE ?) `;
      params.push(`${month}-%`, `${month}-%`);
    }

    query += ` ORDER BY lr.created_at DESC LIMIT 200 `;

    const requests = db.prepare(query).all(...params);
    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    console.error('List leaves error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحميل طلبات الإجازات' });
  }
});

// POST /api/leaves - Submit leave request
leavesRouter.post('/', authenticateToken, (req, res) => {
  try {
    const employeeId = req.user.id;
    const { leave_type, start_date, end_date, reason, attachment_photo } = req.body;

    if (!leave_type || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'نوع الإجازة وتاريخ البدء والانتهاء حقول مطلوبة' });
    }

    if (end_date < start_date) {
      return res.status(400).json({ success: false, error: 'تاريخ نهاية الإجازة لا يمكن أن يسبق تاريخ البداية' });
    }

    const daysCount = calculateDaysCount(start_date, end_date);

    // Check overlap with existing approved/pending leaves
    const overlap = db.prepare(`
      SELECT id FROM leave_requests
      WHERE employee_id = ? AND status != 'rejected'
      AND (
        (start_date <= ? AND end_date >= ?) OR
        (start_date <= ? AND end_date >= ?) OR
        (start_date >= ? AND end_date <= ?)
      )
    `).get(employeeId, start_date, start_date, end_date, end_date, start_date, end_date);

    if (overlap) {
      return res.status(400).json({ success: false, error: 'لديك طلب إجازة آخر مسجل بالفعل يتداخل مع هذه التواريخ' });
    }

    const stmt = db.prepare(`
      INSERT INTO leave_requests (
        employee_id, leave_type, start_date, end_date, days_count,
        reason, attachment_photo, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const result = stmt.run(
      employeeId,
      leave_type,
      start_date,
      end_date,
      daysCount,
      reason ? reason.trim() : null,
      attachment_photo || null
    );

    const empUser = db.prepare('SELECT manager_id, full_name FROM users WHERE id = ?').get(employeeId);
    const managerId = empUser ? empUser.manager_id : 1;

    createNotification(
      managerId,
      'طلب إجازة جديد 🌴',
      `قدم الموظف ${empUser.full_name} طلب إجازة ${daysCount} يوم من ${start_date} إلى ${end_date}.`,
      'info'
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(employeeId, req.user.full_name, 'SUBMIT_LEAVE_REQUEST', 'leave_requests', result.lastInsertRowid, null, { leave_type, start_date, end_date, daysCount }, 'تقديم طلب إجازة', clientIp);

    res.json({
      success: true,
      message: 'تم تقديم طلب الإجازة بنجاح وهو بانتظار موافقة الإدارة',
      id: result.lastInsertRowid,
      days_count: daysCount
    });
  } catch (error) {
    console.error('Submit leave error:', error);
    res.status(500).json({ success: false, error: 'فشل في إرسال طلب الإجازة' });
  }
});

// PUT /api/leaves/:id/review - Manager review
leavesRouter.put('/:id/review', authenticateToken, requireManager, (req, res) => {
  try {
    const leaveId = parseInt(req.params.id, 10);
    const { status, review_notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'حالة الاعتماد يجب أن تكون إما approved أو rejected' });
    }

    const leave = db.prepare(`
      SELECT lr.*, u.full_name, u.manager_id
      FROM leave_requests lr
      JOIN users u ON lr.employee_id = u.id
      WHERE lr.id = ?
    `).get(leaveId);

    if (!leave) {
      return res.status(404).json({ success: false, error: 'طلب الإجازة غير موجود' });
    }

    if (leave.manager_id !== req.user.id && req.user.id !== 1) {
      return res.status(403).json({ success: false, error: 'غير مصرح بمراجعة طلب لموظف جهة أخرى' });
    }

    const reviewedAt = getTodayString() + ' ' + getCurrentTimeString();
    db.prepare(`
      UPDATE leave_requests SET
        status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ?
      WHERE id = ?
    `).run(status, req.user.id, reviewedAt, review_notes ? review_notes.trim() : null, leaveId);

    // If approved, mark attendance records during the leave window as 'On Leave'
    if (status === 'approved') {
      const today = getTodayString();
      if (today >= leave.start_date && today <= leave.end_date) {
        const existingAtt = db.prepare('SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?').get(leave.employee_id, today);
        const leaveLabel = leave.leave_type === 'sick' ? 'إجازة مرضية معتمدة' :
                           leave.leave_type === 'annual' ? 'إجازة سنوية معتمدة' :
                           leave.leave_type === 'casual' ? 'إجازة عارضة معتمدة' : 'إجازة معتمدة';
        if (existingAtt) {
          db.prepare(`
            UPDATE attendance_records
            SET status = 'On Leave', estimated_deduction = 0, notes = ?
            WHERE id = ?
          `).run(leaveLabel, existingAtt.id);
        } else {
          db.prepare(`
            INSERT INTO attendance_records (
              employee_id, date, status, scheduled_start, scheduled_end,
              worked_hours, estimated_deduction, verification_status, notes
            ) VALUES (?, ?, 'On Leave', '09:00', '17:00', 0, 0, 'approved_leave', ?)
          `).run(leave.employee_id, today, leaveLabel);
        }
      }
    }

    const notifMsg = status === 'approved'
      ? `تمت الموافقة على طلب إجازتك (${leave.days_count} يوم) من قبل الإدارة ✅`
      : `تم رفض طلب إجازتك من قبل الإدارة ❌ ${review_notes ? `(السبب: ${review_notes})` : ''}`;

    createNotification(leave.employee_id, 'تحديث بخصوص طلب الإجازة', notifMsg, status === 'approved' ? 'success' : 'danger');

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'REVIEW_LEAVE_REQUEST', 'leave_requests', leaveId, { old_status: leave.status }, { status, review_notes }, `مراجعة طلب إجازة (${status})`, clientIp);

    res.json({
      success: true,
      message: status === 'approved' ? 'تمت الموافقة على الإجازة بنجاح' : 'تم رفض طلب الإجازة',
      status
    });
  } catch (error) {
    console.error('Review leave error:', error);
    res.status(500).json({ success: false, error: 'فشل في اعتماد طلب الإجازة' });
  }
});

// DELETE /api/leaves/:id - Cancel pending leave or delete by manager
leavesRouter.delete('/:id', authenticateToken, (req, res) => {
  try {
    const leaveId = parseInt(req.params.id, 10);
    const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(leaveId);

    if (!leave) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    if (leave.employee_id !== req.user.id && req.user.role !== 'manager') {
      return res.status(403).json({ success: false, error: 'غير مصرح بإلغاء هذا الطلب' });
    }

    if (leave.status !== 'pending' && req.user.role !== 'manager') {
      return res.status(400).json({ success: false, error: 'لا يمكن إلغاء طلب تمت مراجعته مسبقاً' });
    }

    // If an approved leave is deleted by manager, clean up any associated 'On Leave' attendance records
    if (leave.status === 'approved') {
      db.prepare(`
        DELETE FROM attendance_records
        WHERE employee_id = ?
          AND date BETWEEN ? AND ?
          AND (verification_status = 'approved_leave' OR (status = 'On Leave' AND check_in_time IS NULL))
      `).run(leave.employee_id, leave.start_date, leave.end_date);
    }

    db.prepare('DELETE FROM leave_requests WHERE id = ?').run(leaveId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'DELETE_LEAVE_REQUEST',
      'leave_requests',
      leaveId,
      leave,
      null,
      `حذف طلب إجازة (${leave.status}) للموظف #${leave.employee_id}`,
      clientIp
    );

    if (req.user.role === 'manager' && leave.employee_id !== req.user.id) {
      createNotification(
        leave.employee_id,
        'إلغاء / حذف إجازة 🌴',
        `قامت الإدارة بحذف طلب إجازتك المسجل من ${leave.start_date} إلى ${leave.end_date}. تم تحديث رصيد إجازاتك وسجلات الحضور.`,
        'warning'
      );
    }

    res.json({ success: true, message: 'تم حذف طلب الإجازة بنجاح واستعادة الرصيد وسجلات الحضور' });
  } catch (error) {
    console.error('Delete leave error:', error);
    res.status(500).json({ success: false, error: 'فشل في إلغاء طلب الإجازة' });
  }
});

// =============================================================
// 2. PERMISSION REQUESTS ROUTER (/api/permissions)
// =============================================================

// GET /api/permissions - List permissions
permissionsRouter.get('/', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const { employee_id, status, month, date } = req.query;

    let query = `
      SELECT
        pr.*,
        u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        d.name as department_name,
        approver.full_name as approver_name
      FROM permission_requests pr
      JOIN users u ON pr.employee_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users approver ON pr.reviewed_by = approver.id
      WHERE 1=1
    `;
    const params = [];

    if (!isManager) {
      query += ` AND pr.employee_id = ? `;
      params.push(req.user.id);
    } else {
      query += ` AND u.manager_id = ? `;
      params.push(req.user.id);

      if (employee_id) {
        query += ` AND pr.employee_id = ? `;
        params.push(employee_id);
      }
    }

    if (status) {
      query += ` AND pr.status = ? `;
      params.push(status);
    }

    if (date) {
      query += ` AND pr.date = ? `;
      params.push(date);
    } else if (month) {
      query += ` AND pr.date LIKE ? `;
      params.push(`${month}-%`);
    }

    query += ` ORDER BY pr.date DESC, pr.created_at DESC LIMIT 200 `;

    const requests = db.prepare(query).all(...params);
    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    console.error('List permissions error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد طلبات الأذونات' });
  }
});

// POST /api/permissions - Submit permission
permissionsRouter.post('/', authenticateToken, (req, res) => {
  try {
    const employeeId = req.user.id;
    const { date, permission_type, start_time, end_time, reason } = req.body;

    if (!date || !permission_type || !start_time || !end_time || !reason) {
      return res.status(400).json({ success: false, error: 'جميع حقول طلب الإذن إلزامية' });
    }

    const hoursCount = calculateHoursCount(start_time, end_time);

    const stmt = db.prepare(`
      INSERT INTO permission_requests (
        employee_id, date, permission_type, start_time, end_time, hours_count, reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const result = stmt.run(
      employeeId,
      date,
      permission_type,
      start_time,
      end_time,
      hoursCount,
      reason.trim()
    );

    const empUser = db.prepare('SELECT manager_id, full_name FROM users WHERE id = ?').get(employeeId);
    const managerId = empUser ? empUser.manager_id : 1;

    createNotification(
      managerId,
      'طلب إذن خروج جديد ⏱️',
      `قدم الموظف ${empUser.full_name} طلب إذن (${hoursCount} ساعة) ليوم ${date}.`,
      'info'
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(employeeId, req.user.full_name, 'SUBMIT_PERMISSION_REQUEST', 'permission_requests', result.lastInsertRowid, null, { date, permission_type, start_time, end_time, hoursCount }, 'تقديم طلب إذن عمل', clientIp);

    res.json({
      success: true,
      message: 'تم تقديم طلب الإذن بنجاح وهو بانتظار موافقة الإدارة',
      id: result.lastInsertRowid,
      hours_count: hoursCount
    });
  } catch (error) {
    console.error('Submit permission error:', error);
    res.status(500).json({ success: false, error: 'فشل في إرسال طلب الإذن' });
  }
});

// PUT /api/permissions/:id/review - Manager review
permissionsRouter.put('/:id/review', authenticateToken, requireManager, (req, res) => {
  try {
    const permId = parseInt(req.params.id, 10);
    const { status, review_notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'حالة الاعتماد يجب أن تكون إما approved أو rejected' });
    }

    const perm = db.prepare(`
      SELECT pr.*, u.full_name, u.manager_id
      FROM permission_requests pr
      JOIN users u ON pr.employee_id = u.id
      WHERE pr.id = ?
    `).get(permId);

    if (!perm) {
      return res.status(404).json({ success: false, error: 'طلب الإذن غير موجود' });
    }

    if (perm.manager_id !== req.user.id && req.user.id !== 1) {
      return res.status(403).json({ success: false, error: 'غير مصرح بمراجعة طلب لموظف جهة أخرى' });
    }

    const reviewedAt = getTodayString() + ' ' + getCurrentTimeString();
    db.prepare(`
      UPDATE permission_requests SET
        status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ?
      WHERE id = ?
    `).run(status, req.user.id, reviewedAt, review_notes ? review_notes.trim() : null, permId);

    const notifMsg = status === 'approved'
      ? `تمت الموافقة على طلب إذنك ليوم (${perm.date}) من قبل الإدارة ✅`
      : `تم رفض طلب إذنك ليوم (${perm.date}) ❌ ${review_notes ? `(السبب: ${review_notes})` : ''}`;

    createNotification(perm.employee_id, 'تحديث بخصوص طلب الإذن', notifMsg, status === 'approved' ? 'success' : 'danger');

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'REVIEW_PERMISSION_REQUEST', 'permission_requests', permId, { old_status: perm.status }, { status, review_notes }, `مراجعة طلب إذن (${status})`, clientIp);

    res.json({
      success: true,
      message: status === 'approved' ? 'تمت الموافقة على طلب الإذن بنجاح' : 'تم رفض طلب الإذن',
      status
    });
  } catch (error) {
    console.error('Review permission error:', error);
    res.status(500).json({ success: false, error: 'فشل في مراجعة طلب الإذن' });
  }
});

// DELETE /api/permissions/:id - Cancel pending permission or delete by manager
permissionsRouter.delete('/:id', authenticateToken, (req, res) => {
  try {
    const permId = parseInt(req.params.id, 10);
    const perm = db.prepare('SELECT * FROM permission_requests WHERE id = ?').get(permId);

    if (!perm) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    if (perm.employee_id !== req.user.id && req.user.role !== 'manager') {
      return res.status(403).json({ success: false, error: 'غير مصرح بإلغاء هذا الطلب' });
    }

    if (perm.status !== 'pending' && req.user.role !== 'manager') {
      return res.status(400).json({ success: false, error: 'لا يمكن إلغاء طلب تمت مراجعته مسبقاً' });
    }

    db.prepare('DELETE FROM permission_requests WHERE id = ?').run(permId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'DELETE_PERMISSION_REQUEST',
      'permission_requests',
      permId,
      perm,
      null,
      `حذف طلب إذن (${perm.status}) للموظف #${perm.employee_id}`,
      clientIp
    );

    if (req.user.role === 'manager' && perm.employee_id !== req.user.id) {
      createNotification(
        perm.employee_id,
        'إلغاء / حذف إذن ⏱️',
        `قامت الإدارة بحذف طلب الإذن الخاص بك ليوم ${perm.date}.`,
        'warning'
      );
    }

    res.json({ success: true, message: 'تم إلغاء / حذف طلب الإذن بنجاح' });
  } catch (error) {
    console.error('Delete permission error:', error);
    res.status(500).json({ success: false, error: 'فشل في إلغاء طلب الإذن' });
  }
});

module.exports = {
  leavesRouter,
  permissionsRouter
};
