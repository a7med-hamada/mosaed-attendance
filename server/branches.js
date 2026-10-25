const express = require('express');
const bcrypt = require('bcryptjs');
const { db, logAudit, createNotification } = require('./database');
const { authenticateToken, requireManager } = require('./auth');
const { loadFromCloud, saveToCloud } = require('./cloud-sync');

const router = express.Router();
const OWNER_PHONE = '01093320211';

// GET /api/branches - List all company branches and branch requests
router.get('/', authenticateToken, requireManager, async (req, res) => {
  try {
    try { await loadFromCloud(); } catch (_) {}
    const managerId = req.user.manager_id || req.user.id;

    // 1. Get primary workplace and all branch workplaces
    const workplaces = db.prepare(`
      SELECT w.*, 
        u.full_name as branch_manager_name, u.email as branch_manager_email, u.phone as branch_manager_phone,
        (SELECT COUNT(*) FROM users e WHERE e.manager_id = w.manager_id AND e.role = 'employee' AND e.is_active = 1) as employee_count
      FROM workplaces w
      LEFT JOIN users u ON w.manager_id = u.id
      WHERE w.manager_id = ? OR w.manager_id IN (SELECT id FROM users WHERE parent_manager_id = ?)
      ORDER BY w.id ASC
    `).all(managerId, managerId);

    // 2. Get all branch managers
    const branchManagers = db.prepare(`
      SELECT id, employee_code, full_name, email, phone, role, is_active, created_at
      FROM users
      WHERE parent_manager_id = ? AND role = 'manager'
      ORDER BY id DESC
    `).all(managerId);

    // 3. Get all branch requests for this company
    const requests = db.prepare(`
      SELECT id, company_manager_id, parent_company_name, branch_name,
        branch_manager_name, branch_phone, branch_email, branch_address,
        branch_latitude, branch_longitude, branch_radius, branch_logo, status,
        super_admin_notes, created_branch_manager_id, created_workplace_id,
        created_at, reviewed_at
      FROM branch_requests
      WHERE company_manager_id = ?
      ORDER BY id DESC
    `).all(managerId);

    // 4. Primary company details
    const primaryWp = db.prepare(`SELECT company_name FROM workplaces WHERE manager_id = ? LIMIT 1`).get(managerId);
    const companyName = primaryWp ? primaryWp.company_name : (req.user.company_name || 'المنشأة');

    const whatsappUrl = `https://wa.me/201093320211?text=${encodeURIComponent(`السلام عليكم، أتواصل معكم بخصوص فروع شركة (${companyName}) على منظومة وقتي WAQTY.`)}`;

    res.json({
      success: true,
      company_name: companyName,
      workplaces,
      branch_managers: branchManagers,
      requests,
      payment_info: {
        phone: OWNER_PHONE,
        whatsapp_url: whatsappUrl,
        methods: [
          { name: 'فودافون كاش (Vodafone Cash)', number: OWNER_PHONE },
          { name: 'إنستاباي (InstaPay)', number: OWNER_PHONE }
        ],
        note: 'يرجى إرسال إيصال التحويل عبر واتساب ليتم تفعيل الفرع فوراً من قبل إدارة المنظومة.'
      }
    });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد بيانات الفروع' });
  }
});

// POST /api/branches/request - Submit new branch request
router.post('/request', authenticateToken, requireManager, async (req, res) => {
  try {
    const managerId = req.user.manager_id || req.user.id;
    const {
      branch_name, branch_manager_name, branch_phone, branch_email,
      branch_password, branch_address, branch_latitude, branch_longitude,
      branch_radius, branch_logo
    } = req.body;

    if (!branch_name || !branch_manager_name || !branch_phone || !branch_email || !branch_password) {
      return res.status(400).json({
        success: false,
        error: 'اسم الفرع، اسم المدير، رقم الهاتف، البريد الإلكتروني، وكلمة المرور حقول إلزامية'
      });
    }

    if (String(branch_password).trim().length < 6) {
      return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن لا تقل عن 6 خانات' });
    }

    // Check if email is already registered in users
    const existingUser = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(branch_email.trim());
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً في النظام' });
    }

    // Check if pending request exists with same email
    const existingReq = db.prepare(`SELECT id FROM branch_requests WHERE LOWER(branch_email) = LOWER(?) AND status = 'pending_payment'`).get(branch_email.trim());
    if (existingReq) {
      return res.status(400).json({ success: false, error: 'يوجد طلب معلق مسجل بهذا البريد الإلكتروني بالفعل' });
    }

    const primaryWp = db.prepare(`SELECT company_name FROM workplaces WHERE manager_id = ? LIMIT 1`).get(managerId);
    const parentCompanyName = primaryWp ? primaryWp.company_name : (req.user.company_name || 'المنشأة');

    const stmt = db.prepare(`
      INSERT INTO branch_requests (
        company_manager_id, parent_company_name, branch_name, branch_manager_name,
        branch_phone, branch_email, branch_password_hash, branch_address,
        branch_latitude, branch_longitude, branch_radius, branch_logo, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment')
    `);

    const result = stmt.run(
      managerId,
      parentCompanyName,
      branch_name.trim(),
      branch_manager_name.trim(),
      branch_phone.trim(),
      branch_email.trim(),
      bcrypt.hashSync(String(branch_password).trim(), 10),
      branch_address ? branch_address.trim() : null,
      branch_latitude ? parseFloat(branch_latitude) : 30.0444,
      branch_longitude ? parseFloat(branch_longitude) : 31.2357,
      branch_radius ? parseFloat(branch_radius) : 150,
      branch_logo || null
    );

    const reqId = result.lastInsertRowid;

    try { await saveToCloud(); } catch (_) {}

    // Send notification to Super Admin / System
    createNotification(
      null,
      'طلب فرع جديد قيد الدفع',
      `قدمت منشأة (${parentCompanyName}) طلباً لإنشاء فرع جديد (${branch_name.trim()})، وهو بانتظار تحويل الرسوم وتأكيد التفعيل.`,
      'warning',
      reqId
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'REQUEST_BRANCH',
      'branch_requests',
      reqId,
      null,
      { branch_name, branch_manager_name, branch_email, company_manager_id: managerId },
      `تقديم طلب إضافة فرع جديد (${branch_name})`,
      clientIp
    );

    const prefilledText = `السلام عليكم، قمت بتقديم طلب لإضافة فرع جديد (${branch_name.trim()}) لشركة (${parentCompanyName}) وأرغب في تحويل الرسوم لتفعيله. (رقم الطلب: #${reqId})`;
    const whatsappUrl = `https://wa.me/201093320211?text=${encodeURIComponent(prefilledText)}`;

    res.json({
      success: true,
      message: 'تم تسجيل بيانات الفرع بنجاح، يرجى التواصل مع إدارة المنظومة لتحويل الرسوم وتفعيل الفرع',
      request_id: reqId,
      branch_name: branch_name.trim(),
      payment_info: {
        phone: OWNER_PHONE,
        whatsapp_url: whatsappUrl,
        prefilled_text: prefilledText,
        methods: [
          { name: 'فودافون كاش (Vodafone Cash)', number: OWNER_PHONE },
          { name: 'إنستاباي (InstaPay)', number: OWNER_PHONE }
        ]
      }
    });
  } catch (error) {
    console.error('Branch request error:', error);
    res.status(500).json({ success: false, error: 'فشل في تسجيل طلب الفرع: ' + (error.message || '') });
  }
});

// DELETE /api/branches/request/:id - Cancel a pending branch request
router.delete('/request/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const managerId = req.user.manager_id || req.user.id;
    const reqId = parseInt(req.params.id, 10);

    const target = db.prepare(`
      SELECT id, company_manager_id, branch_name, status
      FROM branch_requests WHERE id = ?
    `).get(reqId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    if (target.company_manager_id !== managerId) {
      return res.status(403).json({ success: false, error: 'غير مصرح بإلغاء هذا الطلب' });
    }

    if (target.status === 'approved') {
      return res.status(400).json({ success: false, error: 'لا يمكن إلغاء طلب فرع تم تفعيله مسبقاً' });
    }

    db.prepare(`DELETE FROM branch_requests WHERE id = ?`).run(reqId);
    try { await saveToCloud(); } catch (_) {}

    res.json({ success: true, message: 'تم إلغاء طلب الفرع بنجاح' });
  } catch (error) {
    console.error('Delete branch request error:', error);
    res.status(500).json({ success: false, error: 'فشل في إلغاء الطلب' });
  }
});

// DELETE /api/branches/:id - Delete an active branch (Requires company manager password)
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const managerId = req.user.manager_id || req.user.id;
    const targetId = parseInt(req.params.id, 10);
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال كلمة مرور حساب المدير لتأكيد حذف الفرع' });
    }

    const caller = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!caller || !bcrypt.compareSync(String(password).trim(), caller.password_hash)) {
      return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة، يرجى المحاولة مجدداً' });
    }

    // Find target workplace by workplace id or by branch manager user id
    let targetWp = db.prepare('SELECT * FROM workplaces WHERE id = ?').get(targetId);
    let branchManagerId = null;

    if (targetWp) {
      branchManagerId = targetWp.manager_id;
    } else {
      targetWp = db.prepare('SELECT * FROM workplaces WHERE manager_id = ?').get(targetId);
      if (targetWp) {
        branchManagerId = targetId;
      }
    }

    // Try finding by branch_requests id
    if (!targetWp) {
      const bReq = db.prepare('SELECT * FROM branch_requests WHERE id = ? AND company_manager_id = ?').get(targetId, managerId);
      if (bReq) {
        if (bReq.created_workplace_id) {
          targetWp = db.prepare('SELECT * FROM workplaces WHERE id = ?').get(bReq.created_workplace_id);
          branchManagerId = bReq.created_branch_manager_id;
        } else {
          db.prepare('DELETE FROM branch_requests WHERE id = ?').run(targetId);
          try { await saveToCloud(); } catch (_) {}
          return res.json({ success: true, message: 'تم حذف طلب الفرع بنجاح' });
        }
      }
    }

    if (!targetWp) {
      return res.status(404).json({ success: false, error: 'الفرع غير موجود' });
    }

    // Protect primary company headquarters (id 1 or primary manager's main workplace)
    if (targetWp.id === 1 || (targetWp.manager_id === managerId && targetWp.id === 1)) {
      return res.status(400).json({ success: false, error: 'لا يمكن حذف المقر الرئيسي الأساسي للشركة' });
    }

    // Verify ownership
    if (branchManagerId && branchManagerId !== managerId) {
      const bm = db.prepare('SELECT parent_manager_id FROM users WHERE id = ?').get(branchManagerId);
      if (bm && bm.parent_manager_id && bm.parent_manager_id !== managerId) {
        return res.status(403).json({ success: false, error: 'غير مصرح بحذف هذا الفرع' });
      }
    }

    const branchName = targetWp.company_name || targetWp.name || 'فرع';

    // 1. Delete all employees assigned to this branch manager (and their attendance/reports)
    if (branchManagerId && branchManagerId !== managerId) {
      const subEmployees = db.prepare('SELECT id FROM users WHERE manager_id = ? AND role = "employee"').all(branchManagerId);
      for (const se of subEmployees) {
        db.prepare('DELETE FROM attendance_records WHERE employee_id = ?').run(se.id);
        db.prepare('DELETE FROM attendance_corrections WHERE employee_id = ?').run(se.id);
        db.prepare('DELETE FROM salary_advances WHERE employee_id = ?').run(se.id);
        db.prepare('DELETE FROM employee_bonuses WHERE employee_id = ?').run(se.id);
        db.prepare('DELETE FROM employee_deductions WHERE employee_id = ?').run(se.id);
        db.prepare('DELETE FROM leave_requests WHERE employee_id = ?').run(se.id);
        db.prepare('DELETE FROM permission_requests WHERE employee_id = ?').run(se.id);
        db.prepare('DELETE FROM notifications WHERE user_id = ?').run(se.id);
        db.prepare('DELETE FROM face_reset_requests WHERE employee_id = ?').run(se.id);
        db.prepare('DELETE FROM users WHERE id = ?').run(se.id);
      }

      // Delete schedules, shifts, notifications for branch manager
      db.prepare('DELETE FROM schedules WHERE manager_id = ?').run(branchManagerId);
      db.prepare('DELETE FROM company_shifts WHERE manager_id = ?').run(branchManagerId);
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(branchManagerId);

      // Delete branch manager user
      db.prepare('DELETE FROM users WHERE id = ?').run(branchManagerId);
    }

    // 2. Delete the workplace
    db.prepare('DELETE FROM workplaces WHERE id = ?').run(targetWp.id);

    // 3. Delete linked branch_requests
    db.prepare(`
      DELETE FROM branch_requests 
      WHERE created_workplace_id = ? 
         OR (created_branch_manager_id IS NOT NULL AND created_branch_manager_id = ?)
         OR (company_manager_id = ? AND branch_name = ?)
    `).run(targetWp.id, branchManagerId || 0, managerId, branchName);

    // 4. Audit Log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'DELETE_BRANCH',
      'workplaces',
      targetWp.id,
      targetWp,
      null,
      `حذف الفرع (${branchName}) وحساب مديره وكافة بياناته نهائياً بعد التحقق من كلمة المرور`,
      clientIp
    );

    // 5. Cloud Sync
    try { await saveToCloud(); } catch (_) {}

    res.json({ success: true, message: `تم مسح الفرع (${branchName}) وكافة بياناته نهائياً بنجاح` });
  } catch (error) {
    console.error('Delete branch error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف الفرع: ' + (error.message || '') });
  }
});

module.exports = router;
