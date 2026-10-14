const express = require('express');
const jwt = require('jsonwebtoken');
const { db, logAudit } = require('./database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'workforce-secret-super-key-2026';
const SUPER_ADMIN_PASSCODE = '19931993';

// Middleware to authenticate Super Admin
function authenticateSuperAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'غير مصرح: يرجى تسجيل الدخول برمز المالك السري أولاً' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || !user || user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'انتهت صلاحية جلسة المالك، يرجى إعادة تسجيل الدخول' });
    }
    req.superAdmin = user;
    next();
  });
}

// POST /api/super-admin/login - Authenticate Platform Owner with Email & Password
router.post('/login', (req, res) => {
  try {
    const { email, password, passcode } = req.body;
    const inputPassword = password || passcode;

    if (!inputPassword) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال كلمة المرور' });
    }

    if (String(inputPassword).trim() !== SUPER_ADMIN_PASSCODE) {
      return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
    }

    const cleanEmail = (email && String(email).trim()) ? String(email).trim().toLowerCase() : 'admin@waqty.com';

    const payload = {
      role: 'superadmin',
      email: cleanEmail,
      name: 'مالك المنظومة | Platform Owner',
      authenticated_at: new Date().toISOString()
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(0, 'SuperAdmin', 'SUPERADMIN_LOGIN', 'system', 0, null, null, `تسجيل دخول ناجح إلى لوحة تحكم المالك (${cleanEmail})`, clientIp);

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح إلى لوحة المالك',
      token,
      email: cleanEmail
    });
  } catch (error) {
    console.error('Super admin login error:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
  }
});

// GET /api/super-admin/overview - Overall Platform Statistics
router.get('/overview', authenticateSuperAdmin, (req, res) => {
  try {
    const totalCompanies = db.prepare("SELECT count(*) as c FROM users WHERE role = 'manager'").get().c;
    const activeCompanies = db.prepare("SELECT count(*) as c FROM users WHERE role = 'manager' AND is_active = 1").get().c;
    const suspendedCompanies = db.prepare("SELECT count(*) as c FROM users WHERE role = 'manager' AND is_active = 0").get().c;
    const totalEmployees = db.prepare("SELECT count(*) as c FROM users WHERE role = 'employee'").get().c;
    const totalAttendance = db.prepare("SELECT count(*) as c FROM attendance_records").get().c;

    res.json({
      success: true,
      stats: {
        totalCompanies,
        activeCompanies,
        suspendedCompanies,
        totalEmployees,
        totalAttendance
      }
    });
  } catch (error) {
    console.error('Super admin overview error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحميل إحصائيات المنصة' });
  }
});

// GET /api/super-admin/companies - List All Registered Companies & Managers
router.get('/companies', authenticateSuperAdmin, (req, res) => {
  try {
    const managers = db.prepare(`
      SELECT
        u.id, u.employee_code, u.full_name, u.email, u.phone, u.role,
        u.is_active, u.created_at, u.subscription_plan, u.trial_days, u.subscription_expires_at
      FROM users u
      WHERE u.role = 'manager'
      ORDER BY u.created_at DESC
    `).all();

    const companies = managers.map(mgr => {
      // Find workplace company name
      let wp = db.prepare(`
        SELECT company_name, name as workplace_name, is_configured
        FROM workplaces
        WHERE manager_id = ?
        LIMIT 1
      `).get(mgr.id);

      if (!wp && mgr.id === 1) {
        wp = db.prepare(`SELECT company_name, name as workplace_name, is_configured FROM workplaces WHERE id = 1`).get();
      }

      // Count employees
      const empCount = db.prepare(`
        SELECT count(*) as c
        FROM users
        WHERE role = 'employee' AND (manager_id = ? OR (? = 1 AND manager_id IS NULL))
      `).get(mgr.id, mgr.id).c;

      // Count attendance records
      const attCount = db.prepare(`
        SELECT count(*) as c
        FROM attendance_records ar
        JOIN users u ON ar.employee_id = u.id
        WHERE u.manager_id = ? OR (? = 1 AND u.manager_id IS NULL)
      `).get(mgr.id, mgr.id).c;

      // Calculate subscription / trial expiration
      let expiresAt;
      if (mgr.subscription_expires_at) {
        expiresAt = new Date(mgr.subscription_expires_at);
      } else {
        const regDate = new Date(mgr.created_at || Date.now());
        const totalTrial = mgr.trial_days || 14;
        expiresAt = new Date(regDate.getTime() + totalTrial * 24 * 60 * 60 * 1000);
      }

      const diffMs = expiresAt.getTime() - Date.now();
      const trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      const isTrialExpired = diffMs <= 0;

      return {
        id: mgr.id,
        employee_code: mgr.employee_code,
        full_name: mgr.full_name,
        email: mgr.email,
        phone: mgr.phone || '',
        company_name: (wp && wp.company_name) ? wp.company_name : 'منشأة بدون اسم',
        workplace_name: (wp && wp.workplace_name) ? wp.workplace_name : 'غير محدد',
        is_configured: wp ? (wp.is_configured === 1) : false,
        is_active: mgr.is_active === 1,
        created_at: mgr.created_at,
        subscription_plan: mgr.subscription_plan || 'trial',
        subscription_expires_at: expiresAt.toISOString(),
        subscription_expires_date: expiresAt.toISOString().split('T')[0],
        trial_days_total: mgr.trial_days || 14,
        trial_days_remaining: trialDaysRemaining,
        is_trial_expired: isTrialExpired,
        employee_count: empCount,
        attendance_count: attCount
      };
    });

    res.json({
      success: true,
      count: companies.length,
      companies
    });
  } catch (error) {
    console.error('Super admin list companies error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحميل قائمة الشركات' });
  }
});

// GET /api/super-admin/companies/:id/employees - List Employees of a specific company
router.get('/companies/:id/employees', authenticateSuperAdmin, (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const manager = db.prepare("SELECT id, full_name FROM users WHERE id = ? AND role = 'manager'").get(managerId);

    if (!manager) {
      return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
    }

    const employees = db.prepare(`
      SELECT
        u.id, u.employee_code, u.full_name, u.email, u.phone,
        u.job_title, u.base_salary, u.is_active, u.hire_date, u.created_at,
        d.name as department_name, s.name as schedule_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE u.role = 'employee' AND (u.manager_id = ? OR (? = 1 AND u.manager_id IS NULL))
      ORDER BY u.id DESC
    `).all(managerId, managerId);

    res.json({
      success: true,
      manager,
      count: employees.length,
      employees
    });
  } catch (error) {
    console.error('Super admin get company employees error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحميل موظفي الشركة' });
  }
});

// PUT /api/super-admin/companies/:id/status - Toggle Suspend / Activate Account
router.put('/companies/:id/status', authenticateSuperAdmin, (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    const manager = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'manager'").get(managerId);
    if (!manager) {
      return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
    }

    const newStatus = is_active ? 1 : 0;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, managerId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      0,
      'SuperAdmin',
      newStatus === 1 ? 'RESUME_COMPANY_ACCOUNT' : 'SUSPEND_COMPANY_ACCOUNT',
      'users',
      managerId,
      { is_active: manager.is_active },
      { is_active: newStatus },
      newStatus === 1 ? `تفعيل حساب المنشأة (${manager.full_name})` : `تجميد وقفل حساب المنشأة (${manager.full_name})`,
      clientIp
    );

    res.json({
      success: true,
      message: newStatus === 1
        ? `تم تفعيل حساب منشأة (${manager.full_name}) وإعادة الوصول بالكامل ✅`
        : `تم إيقاف وقفل حساب منشأة (${manager.full_name}) ومنع المدير وموظفيه من الدخول 🔒`,
      is_active: newStatus === 1
    });
  } catch (error) {
    console.error('Super admin update company status error:', error);
    res.status(500).json({ success: false, error: 'فشل في تعديل حالة الحساب' });
  }
});

// PUT /api/super-admin/companies/:id/details - Update Company & Manager Details
router.put('/companies/:id/details', authenticateSuperAdmin, (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const { company_name, manager_name, phone, subscription_plan, trial_days } = req.body;

    const manager = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'manager'").get(managerId);
    if (!manager) {
      return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
    }

    // Update user info
    if (manager_name || phone !== undefined || subscription_plan || trial_days !== undefined) {
      db.prepare(`
        UPDATE users SET
          full_name = COALESCE(?, full_name),
          phone = COALESCE(?, phone),
          subscription_plan = COALESCE(?, subscription_plan),
          trial_days = COALESCE(?, trial_days)
        WHERE id = ?
      `).run(
        manager_name ? manager_name.trim() : null,
        phone !== undefined ? phone.trim() : null,
        subscription_plan || null,
        trial_days !== undefined ? parseInt(trial_days, 10) : null,
        managerId
      );
    }

    // Update workplace company_name
    if (company_name) {
      const existingWp = db.prepare('SELECT id FROM workplaces WHERE manager_id = ? LIMIT 1').get(managerId);
      if (existingWp) {
        db.prepare('UPDATE workplaces SET company_name = ? WHERE id = ?').run(company_name.trim(), existingWp.id);
      } else if (managerId === 1) {
        db.prepare('UPDATE workplaces SET company_name = ? WHERE id = 1').run(company_name.trim());
      }
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(0, 'SuperAdmin', 'UPDATE_COMPANY_DETAILS', 'users', managerId, null, req.body, `تعديل بيانات المنشأة (${company_name || manager.full_name})`, clientIp);

    res.json({
      success: true,
      message: 'تم تحديث بيانات المنشأة بنجاح'
    });
  } catch (error) {
    console.error('Super admin update company details error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث بيانات المنشأة' });
  }
});

// DELETE /api/super-admin/companies/:id - Permanently Delete Company and all its data
// CRITICAL SECURITY REQUIREMENT: Requires confirmation passcode '19931993'
router.delete('/companies/:id', authenticateSuperAdmin, (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const confirm_password = (req.body && req.body.confirm_password) || (req.query && req.query.confirm_password);

    if (!confirm_password || String(confirm_password).trim() !== SUPER_ADMIN_PASSCODE) {
      return res.status(403).json({
        success: false,
        error: 'كلمة مرور التأكيد غير صحيحة. تم إلغاء عملية الحذف فوراً لحماية البيانات.'
      });
    }

    const manager = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'manager'").get(managerId);
    if (!manager) {
      return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
    }

    // Find all employee IDs under this manager
    const emps = db.prepare(`
      SELECT id FROM users
      WHERE role = 'employee' AND (manager_id = ? OR (? = 1 AND manager_id IS NULL))
    `).all(managerId, managerId);
    const empIds = emps.map(e => e.id);

    // Delete in cascading order
    if (empIds.length > 0) {
      const placeholders = empIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM attendance_records WHERE employee_id IN (${placeholders})`).run(...empIds);
      db.prepare(`DELETE FROM attendance_corrections WHERE employee_id IN (${placeholders})`).run(...empIds);
      db.prepare(`DELETE FROM leave_requests WHERE employee_id IN (${placeholders})`).run(...empIds);
      db.prepare(`DELETE FROM permission_requests WHERE employee_id IN (${placeholders})`).run(...empIds);
      db.prepare(`DELETE FROM salary_advances WHERE employee_id IN (${placeholders})`).run(...empIds);
      db.prepare(`DELETE FROM employee_bonuses WHERE employee_id IN (${placeholders})`).run(...empIds);
      db.prepare(`DELETE FROM notifications WHERE user_id IN (${placeholders})`).run(...empIds);
      db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...empIds);
    }

    // Delete manager's workplaces, schedules, departments, notifications, and user record
    db.prepare('DELETE FROM workplaces WHERE manager_id = ?').run(managerId);
    db.prepare('DELETE FROM schedules WHERE manager_id = ?').run(managerId);
    db.prepare('DELETE FROM departments WHERE manager_id = ?').run(managerId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(managerId);
    db.prepare('DELETE FROM users WHERE id = ?').run(managerId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      0,
      'SuperAdmin',
      'DELETE_COMPANY_PERMANENT',
      'users',
      managerId,
      manager,
      null,
      `حذف شركة (${manager.full_name}) بالكامل مع ${empIds.length} موظف وجميع سجلاتهم بعد التحقق من كلمة المرور`,
      clientIp
    );

    res.json({
      success: true,
      message: `تم حذف شركة (${manager.full_name}) وجميع موظفيها (${empIds.length} موظف) وسجلاتها بالكامل بنجاح 🗑️`
    });
  } catch (error) {
    console.error('Super admin delete company error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف المنشأة' });
  }
});

// POST /api/super-admin/companies/:id/subscription/extend
// Extends subscription by N days (stackable! can click multiple times to stack years/months)
router.post('/companies/:id/subscription/extend', authenticateSuperAdmin, (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const { days, plan } = req.body;
    const addDays = parseInt(days, 10);

    if (!addDays || isNaN(addDays)) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد عدد الأيام المراد إضافتها' });
    }

    const manager = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'manager'").get(managerId);
    if (!manager) {
      return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
    }

    // Determine current expiration base date
    let baseDate = new Date();
    if (manager.subscription_expires_at) {
      const curExp = new Date(manager.subscription_expires_at);
      if (curExp.getTime() > Date.now()) {
        baseDate = curExp; // Add on top of existing remaining time!
      }
    }

    const newExpiresAt = new Date(baseDate.getTime() + addDays * 24 * 60 * 60 * 1000).toISOString();
    const newPlan = plan || manager.subscription_plan || 'custom';

    db.prepare(`
      UPDATE users SET
        subscription_expires_at = ?,
        subscription_plan = ?
      WHERE id = ?
    `).run(newExpiresAt, newPlan, managerId);

    const diffMs = new Date(newExpiresAt).getTime() - Date.now();
    const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      0,
      'SuperAdmin',
      'EXTEND_SUBSCRIPTION',
      'users',
      managerId,
      { old_expires: manager.subscription_expires_at },
      { new_expires: newExpiresAt, added_days: addDays, plan: newPlan },
      `تمديد اشتراك منشأة (${manager.full_name}) بإضافة ${addDays} يوم (باقة: ${newPlan}). المتبقي الجديد: ${remainingDays} يوم`,
      clientIp
    );

    res.json({
      success: true,
      message: `تم تمديد الاشتراك بنجاح! تم إضافة ${addDays} يوم. إجمالي الأيام المتبقية الآن: ${remainingDays} يوم ✅`,
      subscription_expires_at: newExpiresAt,
      subscription_expires_date: newExpiresAt.split('T')[0],
      days_remaining: remainingDays,
      plan: newPlan
    });
  } catch (error) {
    console.error('Super admin extend subscription error:', error);
    res.status(500).json({ success: false, error: 'فشل في تمديد الاشتراك' });
  }
});

// PUT /api/super-admin/companies/:id/subscription/set-days
// Manually set exact remaining days or add/subtract days
router.put('/companies/:id/subscription/set-days', authenticateSuperAdmin, (req, res) => {
  try {
    const managerId = parseInt(req.params.id, 10);
    const { days } = req.body;
    const targetDays = parseInt(days, 10);

    if (isNaN(targetDays)) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال عدد الأيام بشكل صحيح' });
    }

    const manager = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'manager'").get(managerId);
    if (!manager) {
      return res.status(404).json({ success: false, error: 'الشركة غير موجودة' });
    }

    // Set expiration to (Now + targetDays)
    const newExpiresAt = new Date(Date.now() + targetDays * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE users SET
        subscription_expires_at = ?
      WHERE id = ?
    `).run(newExpiresAt, managerId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      0,
      'SuperAdmin',
      'SET_SUBSCRIPTION_DAYS',
      'users',
      managerId,
      { old_expires: manager.subscription_expires_at },
      { new_expires: newExpiresAt, days: targetDays },
      `تعديل الأيام المتبقية لاشتراك منشأة (${manager.full_name}) إلى ${targetDays} يوم`,
      clientIp
    );

    res.json({
      success: true,
      message: `تم تعديل عدد الأيام المتبقية إلى ${targetDays} يوم بنجاح ✅`,
      subscription_expires_at: newExpiresAt,
      subscription_expires_date: newExpiresAt.split('T')[0],
      days_remaining: Math.max(0, targetDays)
    });
  } catch (error) {
    console.error('Super admin set subscription days error:', error);
    res.status(500).json({ success: false, error: 'فشل في تعديل عدد الأيام' });
  }
});

// GET /api/super-admin/tickets - List all Support Tickets
router.get('/tickets', authenticateSuperAdmin, (req, res) => {
  try {
    const tickets = db.prepare(`
      SELECT * FROM support_tickets
      ORDER BY id DESC
    `).all();

    const newCount = tickets.filter(t => t.status === 'new').length;
    const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
    const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

    res.json({
      success: true,
      count: tickets.length,
      counts: {
        total: tickets.length,
        new: newCount,
        in_progress: inProgressCount,
        resolved: resolvedCount
      },
      tickets
    });
  } catch (error) {
    console.error('Super admin list tickets error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحميل تذاكر الدعم الفني' });
  }
});

// PUT /api/super-admin/tickets/:id/status - Update Ticket Status
router.put('/tickets/:id/status', authenticateSuperAdmin, (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { status, admin_notes } = req.body;

    if (!['new', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, error: 'حالة التذكرة غير صحيحة' });
    }

    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    }

    const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;

    db.prepare(`
      UPDATE support_tickets SET
        status = ?,
        admin_notes = COALESCE(?, admin_notes),
        resolved_at = COALESCE(?, resolved_at)
      WHERE id = ?
    `).run(status, admin_notes || null, resolvedAt, ticketId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      0,
      'SuperAdmin',
      'UPDATE_TICKET_STATUS',
      'support_tickets',
      ticketId,
      { old_status: ticket.status },
      { new_status: status },
      `تحديث حالة تذكرة دعم فني #${ticketId} إلى: ${status}`,
      clientIp
    );

    res.json({
      success: true,
      message: 'تم تحديث حالة التذكرة بنجاح'
    });
  } catch (error) {
    console.error('Super admin update ticket status error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث حالة التذكرة' });
  }
});

// DELETE /api/super-admin/tickets/:id - Delete Support Ticket
router.delete('/tickets/:id', authenticateSuperAdmin, (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    }

    db.prepare('DELETE FROM support_tickets WHERE id = ?').run(ticketId);

    res.json({
      success: true,
      message: 'تم حذف التذكرة بنجاح 🗑️'
    });
  } catch (error) {
    console.error('Super admin delete ticket error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف التذكرة' });
  }
});

module.exports = router;
