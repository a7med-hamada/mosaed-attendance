const express = require('express');
const { db, logAudit, createNotification, getTodayString, getCurrentMonthString } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const advancesRouter = express.Router();
const bonusesRouter = express.Router();
const deductionsRouter = express.Router();

const getCurrentDateString = getTodayString;

// ==========================================
// 1. SALARY ADVANCES ROUTER (/api/advances)
// ==========================================

// GET /api/advances - List advances
advancesRouter.get('/', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const { employee_id, month, status } = req.query;

    let query = `
      SELECT
        a.*,
        u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        d.name as department_name,
        approver.full_name as approver_name
      FROM salary_advances a
      JOIN users u ON a.employee_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users approver ON a.approved_by = approver.id
      WHERE 1=1
    `;
    const params = [];

    if (!isManager) {
      query += ` AND a.employee_id = ? `;
      params.push(req.user.id);
    } else {
      query += ` AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1)) `;
      params.push(req.user.id, req.user.id);
      if (employee_id) {
        query += ` AND a.employee_id = ? `;
        params.push(parseInt(employee_id, 10));
      }
    }

    if (month) {
      query += ` AND a.month = ? `;
      params.push(month);
    }

    if (status) {
      query += ` AND a.status = ? `;
      params.push(status);
    }

    query += ` ORDER BY a.date DESC, a.created_at DESC `;

    const advances = db.prepare(query).all(...params);
    res.json({ success: true, count: advances.length, advances });
  } catch (error) {
    console.error('Get advances error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد بيانات السلف' });
  }
});

// POST /api/advances - Submit or Record an advance
advancesRouter.post('/', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    let { employee_id, amount, reason, month, date, status, notes } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد مبلغ سلفة صحيح أكبر من الصفر' });
    }

    let targetEmployeeId = req.user.id;
    if (isManager) {
      if (!employee_id) {
        return res.status(400).json({ success: false, error: 'يرجى اختيار الموظف المطلوب تسجيل السلفة له' });
      }
      targetEmployeeId = parseInt(employee_id, 10);
    }

    // Verify target employee exists
    const emp = db.prepare('SELECT id, full_name, manager_id FROM users WHERE id = ?').get(targetEmployeeId);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    const advanceDate = date || getCurrentDateString();
    const advanceMonth = month || advanceDate.substring(0, 7);

    let advanceStatus = 'pending';
    let approvedBy = null;
    let approvedAt = null;
    let reviewNotes = notes || null;

    if (isManager) {
      advanceStatus = status || 'approved';
      approvedBy = req.user.id;
      approvedAt = advanceStatus === 'approved' ? new Date().toISOString() : null;
      if (!reviewNotes) reviewNotes = 'تم التسجيل والموافقة بواسطة الإدارة';
    }

    const stmt = db.prepare(`
      INSERT INTO salary_advances (employee_id, amount, reason, month, date, status, approved_by, approved_at, review_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      targetEmployeeId,
      parsedAmount,
      reason || 'سلفة راتب شهرية',
      advanceMonth,
      advanceDate,
      advanceStatus,
      approvedBy,
      approvedAt,
      reviewNotes
    );

    const advanceId = result.lastInsertRowid;

    if (!isManager) {
      // Notify Manager
      const mgrId = emp.manager_id || 1;
      createNotification(
        mgrId,
        'طلب سلفة جديد',
        `قدم الموظف ${emp.full_name} طلب سلفة مالية بقيمة ${parsedAmount.toLocaleString('ar-EG')} ج.م لشهر ${advanceMonth}.`,
        'warning'
      );
    } else {
      // Notify Employee
      createNotification(
        targetEmployeeId,
        'تسجيل سلفة معتمدة',
        `تم تسجيل سلفة مالية بحسابك بقيمة ${parsedAmount.toLocaleString('ar-EG')} ج.م لشهر ${advanceMonth}.`,
        'info'
      );
      logAudit(
        req.user.id,
        req.user.full_name,
        'ADD_SALARY_ADVANCE',
        'salary_advances',
        advanceId,
        null,
        { employee_id: targetEmployeeId, amount: parsedAmount, month: advanceMonth, reason },
        `تسجيل سلفة مباشرة للموظف ${emp.full_name}`,
        req.ip
      );
    }

    res.status(201).json({
      success: true,
      message: isManager ? 'تم تسجيل السلفة بنجاح' : 'تم إرسال طلب السلفة إلى الإدارة للمراجعة',
      advanceId
    });
  } catch (error) {
    console.error('Create advance error:', error);
    res.status(500).json({ success: false, error: 'فشل في حفظ بيانات السلفة' });
  }
});

// PUT /api/advances/:id/review - Review advance (Approve / Reject) (Manager only)
advancesRouter.put('/:id/review', authenticateToken, requireManager, (req, res) => {
  try {
    const { id } = req.params;
    const { action, review_notes } = req.body;

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ success: false, error: 'حالة المراجعة غير صالحة (approved أو rejected)' });
    }

    const advance = db.prepare(`
      SELECT a.*, u.full_name, u.manager_id
      FROM salary_advances a
      JOIN users u ON a.employee_id = u.id
      WHERE a.id = ?
    `).get(id);

    if (!advance) {
      return res.status(404).json({ success: false, error: 'طلب السلفة غير موجود' });
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE salary_advances
      SET status = ?, approved_by = ?, approved_at = ?, review_notes = ?
      WHERE id = ?
    `).run(action, req.user.id, nowIso, review_notes || null, id);

    // Notify employee
    const isApproved = action === 'approved';
    const notifTitle = isApproved ? 'تمت الموافقة على السلفة ✅' : 'تم رفض طلب السلفة ❌';
    const notifMsg = isApproved
      ? `تمت الموافقة على طلب السلفة بقيمة ${advance.amount.toLocaleString('ar-EG')} ج.م لشهر ${advance.month}. سيتم خصمها من صافي المرتب.`
      : `نعتذر، تم رفض طلب السلفة بقيمة ${advance.amount.toLocaleString('ar-EG')} ج.م. ${review_notes ? 'السبب: ' + review_notes : ''}`;

    createNotification(advance.employee_id, notifTitle, notifMsg, isApproved ? 'success' : 'danger');

    logAudit(
      req.user.id,
      req.user.full_name,
      isApproved ? 'APPROVE_ADVANCE' : 'REJECT_ADVANCE',
      'salary_advances',
      id,
      { old_status: advance.status },
      { new_status: action, review_notes },
      `${isApproved ? 'موافقة على' : 'رفض'} سلفة الموظف ${advance.full_name}`,
      req.ip
    );

    res.json({
      success: true,
      message: isApproved ? 'تمت الموافقة على السلفة بنجاح وخصمها من كشف الراتب' : 'تم رفض طلب السلفة'
    });
  } catch (error) {
    console.error('Review advance error:', error);
    res.status(500).json({ success: false, error: 'فشل في مراجعة طلب السلفة' });
  }
});

// DELETE /api/advances/:id - Delete advance
advancesRouter.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const isManager = req.user.role === 'manager';

    const advance = db.prepare('SELECT * FROM salary_advances WHERE id = ?').get(id);
    if (!advance) {
      return res.status(404).json({ success: false, error: 'السلفة غير موجودة' });
    }

    if (!isManager) {
      if (advance.employee_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'غير مصرح لك بإلغاء هذه السلفة' });
      }
      if (advance.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'لا يمكن إلغاء سلفة تمت معالجتها بالفعل من الإدارة' });
      }
    }

    db.prepare('DELETE FROM salary_advances WHERE id = ?').run(id);

    if (isManager) {
      logAudit(
        req.user.id,
        req.user.full_name,
        'DELETE_ADVANCE',
        'salary_advances',
        id,
        advance,
        null,
        `حذف سجل سلفة للموظف ID: ${advance.employee_id}`,
        req.ip
      );
    }

    res.json({ success: true, message: 'تم حذف السلفة بنجاح' });
  } catch (error) {
    console.error('Delete advance error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف السلفة' });
  }
});

// ==========================================
// 2. BONUSES ROUTER (/api/bonuses)
// ==========================================

// GET /api/bonuses - List bonuses
bonusesRouter.get('/', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const { employee_id, month } = req.query;

    let query = `
      SELECT
        b.*,
        u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        d.name as department_name,
        creator.full_name as creator_name
      FROM employee_bonuses b
      JOIN users u ON b.employee_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users creator ON b.created_by = creator.id
      WHERE 1=1
    `;
    const params = [];

    if (!isManager) {
      query += ` AND b.employee_id = ? `;
      params.push(req.user.id);
    } else {
      query += ` AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1)) `;
      params.push(req.user.id, req.user.id);
      if (employee_id) {
        query += ` AND b.employee_id = ? `;
        params.push(parseInt(employee_id, 10));
      }
    }

    if (month) {
      query += ` AND b.month = ? `;
      params.push(month);
    }

    query += ` ORDER BY b.date DESC, b.created_at DESC `;

    const bonuses = db.prepare(query).all(...params);
    res.json({ success: true, count: bonuses.length, bonuses });
  } catch (error) {
    console.error('Get bonuses error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد بيانات المكافآت' });
  }
});

// POST /api/bonuses - Add bonus (Manager only)
bonusesRouter.post('/', authenticateToken, requireManager, (req, res) => {
  try {
    const { employee_id, amount, reason, month, date, notes } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال مبلغ مكافأة صحيح أكبر من الصفر' });
    }

    if (!employee_id) {
      return res.status(400).json({ success: false, error: 'يرجى اختيار الموظف المستحق للمكافأة' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة سبب أو تفاصيل المكافأة (مثال: كفاءة وإنجاز مهمة)' });
    }

    const emp = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(parseInt(employee_id, 10));
    if (!emp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    const bonusDate = date || getCurrentDateString();
    const bonusMonth = month || bonusDate.substring(0, 7);

    const stmt = db.prepare(`
      INSERT INTO employee_bonuses (employee_id, amount, reason, month, date, created_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      emp.id,
      parsedAmount,
      reason.trim(),
      bonusMonth,
      bonusDate,
      req.user.id,
      notes ? notes.trim() : null
    );

    const bonusId = result.lastInsertRowid;

    // Create celebratory notification for employee
    createNotification(
      emp.id,
      'تهانينا! تم منحك مكافأة مالية 🎁',
      `تمت إضافة مكافأة بقيمة ${parsedAmount.toLocaleString('ar-EG')} ج.م إلى حسابك لشهر ${bonusMonth}: ${reason.trim()}.`,
      'success'
    );

    logAudit(
      req.user.id,
      req.user.full_name,
      'ADD_EMPLOYEE_BONUS',
      'employee_bonuses',
      bonusId,
      null,
      { employee_id: emp.id, amount: parsedAmount, reason: reason.trim(), month: bonusMonth },
      `إضافة مكافأة للموظف ${emp.full_name}`,
      req.ip
    );

    res.status(201).json({
      success: true,
      message: 'تم إضافة المكافأة بنجاح وإضافتها لكشف حساب وراتب الموظف',
      bonusId
    });
  } catch (error) {
    console.error('Create bonus error:', error);
    res.status(500).json({ success: false, error: 'فشل في حفظ بيانات المكافأة' });
  }
});

// DELETE /api/bonuses/:id - Delete bonus (Manager only)
bonusesRouter.delete('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const { id } = req.params;

    const bonus = db.prepare('SELECT * FROM employee_bonuses WHERE id = ?').get(id);
    if (!bonus) {
      return res.status(404).json({ success: false, error: 'المكافأة غير موجودة' });
    }

    db.prepare('DELETE FROM employee_bonuses WHERE id = ?').run(id);

    logAudit(
      req.user.id,
      req.user.full_name,
      'DELETE_EMPLOYEE_BONUS',
      'employee_bonuses',
      id,
      bonus,
      null,
      `حذف مكافأة بقيمة ${bonus.amount} للموظف ID: ${bonus.employee_id}`,
      req.ip
    );

    res.json({ success: true, message: 'تم حذف المكافأة بنجاح' });
  } catch (error) {
    console.error('Delete bonus error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف المكافأة' });
  }
});

// ==========================================
// 3. DEDUCTIONS ROUTER (/api/deductions)
// ==========================================

// GET /api/deductions - List deductions
deductionsRouter.get('/', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const { employee_id, month } = req.query;

    let query = `
      SELECT
        d.*,
        u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        dept.name as department_name,
        creator.full_name as creator_name
      FROM employee_deductions d
      JOIN users u ON d.employee_id = u.id
      LEFT JOIN departments dept ON u.department_id = dept.id
      LEFT JOIN users creator ON d.created_by = creator.id
      WHERE 1=1
    `;
    const params = [];

    if (!isManager) {
      query += ` AND d.employee_id = ? `;
      params.push(req.user.id);
    } else {
      query += ` AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1)) `;
      params.push(req.user.id, req.user.id);
      if (employee_id) {
        query += ` AND d.employee_id = ? `;
        params.push(parseInt(employee_id, 10));
      }
    }

    if (month) {
      query += ` AND d.month = ? `;
      params.push(month);
    }

    query += ` ORDER BY d.date DESC, d.created_at DESC `;

    const deductions = db.prepare(query).all(...params);
    res.json({ success: true, count: deductions.length, deductions });
  } catch (error) {
    console.error('Get deductions error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد بيانات الخصومات والجزاءات' });
  }
});

// POST /api/deductions - Add manual deduction / penalty (Manager only)
deductionsRouter.post('/', authenticateToken, requireManager, (req, res) => {
  try {
    const { employee_id, amount, reason, month, date, notes } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال مبلغ خصم صحيح أكبر من الصفر' });
    }

    if (!employee_id) {
      return res.status(400).json({ success: false, error: 'يرجى اختيار الموظف المراد تسجيل الخصم أو الجزاء عليه' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة سبب أو تفاصيل الخصم (مثال: جزاء إداري، إتلاف عهدة، مخالفة سلوك)' });
    }

    const emp = db.prepare('SELECT id, full_name, manager_id FROM users WHERE id = ?').get(parseInt(employee_id, 10));
    if (!emp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    // Tenant check
    if (emp.manager_id && emp.manager_id !== req.user.id && req.user.id !== 1) {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بإضافة خصم لموظف في فرع آخر' });
    }

    const deductionDate = date || getCurrentDateString();
    const deductionMonth = month || deductionDate.substring(0, 7);

    const stmt = db.prepare(`
      INSERT INTO employee_deductions (employee_id, amount, reason, month, date, created_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      emp.id,
      parsedAmount,
      reason.trim(),
      deductionMonth,
      deductionDate,
      req.user.id,
      notes ? notes.trim() : null
    );

    const deductionId = result.lastInsertRowid;

    // Create notification for employee (STRICT RULE: NO EMOJIS! Pure Arabic)
    createNotification(
      emp.id,
      'إشعار تسجيل خصم أو جزاء مالي',
      `تم تسجيل خصم بقيمة ${parsedAmount.toLocaleString('ar-EG')} ج.م من حسابك لشهر ${deductionMonth}: ${reason.trim()}.`,
      'danger'
    );

    logAudit(
      req.user.id,
      req.user.full_name,
      'ADD_EMPLOYEE_DEDUCTION',
      'employee_deductions',
      deductionId,
      null,
      { employee_id: emp.id, amount: parsedAmount, reason: reason.trim(), month: deductionMonth },
      `تسجيل خصم مالي للموظف ${emp.full_name}`,
      req.ip
    );

    res.status(201).json({
      success: true,
      message: 'تم تسجيل الخصم بنجاح وخصمه من كشف حساب وراتب الموظف',
      deductionId
    });
  } catch (error) {
    console.error('Create deduction error:', error);
    res.status(500).json({ success: false, error: 'فشل في حفظ بيانات الخصم' });
  }
});

// DELETE /api/deductions/:id - Delete deduction (Manager only)
deductionsRouter.delete('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const { id } = req.params;

    const deduction = db.prepare('SELECT * FROM employee_deductions WHERE id = ?').get(id);
    if (!deduction) {
      return res.status(404).json({ success: false, error: 'سجل الخصم غير موجود' });
    }

    db.prepare('DELETE FROM employee_deductions WHERE id = ?').run(id);

    logAudit(
      req.user.id,
      req.user.full_name,
      'DELETE_EMPLOYEE_DEDUCTION',
      'employee_deductions',
      id,
      deduction,
      null,
      `حذف خصم بقيمة ${deduction.amount} للموظف ID: ${deduction.employee_id}`,
      req.ip
    );

    res.json({ success: true, message: 'تم حذف الخصم بنجاح' });
  } catch (error) {
    console.error('Delete deduction error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف الخصم' });
  }
});

module.exports = {
  advancesRouter,
  bonusesRouter,
  deductionsRouter
};
