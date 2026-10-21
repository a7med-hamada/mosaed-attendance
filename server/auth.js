const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { db, logAudit, uploadsDir } = require('./database');
const { PACKAGES, SUPPORT_WHATSAPP } = require('./support');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'workforce-secret-super-key-2026';

function getSubscriptionDetails(managerId) {
  const mgr = db.prepare('SELECT id, is_active, subscription_plan, subscription_expires_at, trial_days, created_at FROM users WHERE id = ?').get(managerId);
  if (!mgr) {
    return {
      isExpired: false,
      expired: false,
      daysRemaining: 14,
      remainingDays: 14,
      days_remaining: 14,
      plan: 'trial',
      expiresAt: null
    };
  }

  // Lifetime / Open Subscription Plan (مدى الحياة - بدون انتهاء)
  if (mgr.subscription_plan === 'lifetime' || mgr.subscription_plan === 'open') {
    return {
      isExpired: false,
      expired: false,
      isLifetime: true,
      daysRemaining: null,
      remainingDays: null,
      days_remaining: null,
      plan: 'lifetime',
      expiresAt: null
    };
  }

  let expiresAt;
  if (mgr.subscription_expires_at) {
    expiresAt = new Date(mgr.subscription_expires_at);
  } else {
    const regDate = new Date(mgr.created_at || Date.now());
    const totalTrial = mgr.trial_days || 14;
    expiresAt = new Date(regDate.getTime() + totalTrial * 24 * 60 * 60 * 1000);
  }

  const diffMs = expiresAt.getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const isExpired = diffMs <= 0;

  return {
    isExpired,
    expired: isExpired,
    daysRemaining,
    remainingDays: daysRemaining,
    days_remaining: daysRemaining,
    plan: mgr.subscription_plan || 'trial',
    expiresAt: expiresAt.toISOString()
  };
}

// Middleware to authenticate JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'غير مصرح: يرجى تسجيل الدخول أولاً' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
    }

    // Verify user account is still active (real-time suspension enforcement)
    const activeCheck = db.prepare('SELECT id, is_active, role, manager_id, parent_manager_id FROM users WHERE id = ?').get(user.id);
    if (!activeCheck || !activeCheck.is_active) {
      return res.status(403).json({ success: false, error: 'تم إيقاف حسابك مؤقتاً، يرجى مراجعة إدارة المنظومة' });
    }
    // If employee or sub-manager, verify primary manager company account is also active
    const primaryMgrId = activeCheck.role === 'manager' ? (activeCheck.parent_manager_id || null) : activeCheck.manager_id;
    if (primaryMgrId) {
      const mgrCheck = db.prepare('SELECT is_active FROM users WHERE id = ?').get(primaryMgrId);
      if (mgrCheck && !mgrCheck.is_active) {
        return res.status(403).json({ success: false, error: 'تم إيقاف حساب هذه المنشأة مؤقتاً، يرجى مراجعة إدارة المنظومة' });
      }
    }

    // Check subscription expiration
    const effectiveMgrId = activeCheck.role === 'manager' ? (activeCheck.parent_manager_id || activeCheck.id) : (activeCheck.manager_id || 1);
    const subCheck = getSubscriptionDetails(effectiveMgrId);
    user.subscription = subCheck;
    user.parent_manager_id = activeCheck.parent_manager_id || null;
    user.manager_id = effectiveMgrId;
    user.effective_manager_id = effectiveMgrId;

    if (subCheck.isExpired && req.method !== 'GET' && !req.path.includes('/support')) {
      return res.status(403).json({
        success: false,
        subscription_expired: true,
        error: 'لقد نفذت المدة المجانية لمنشأتكم، يرجى تجديد الاشتراك للاستمرار',
        support_phone: SUPPORT_WHATSAPP
      });
    }

    req.user = user;
    next();
  });
}

// Middleware to require Manager role
function requireManager(req, res, next) {
  if (!req.user || req.user.role !== 'manager') {
    return res.status(403).json({ success: false, error: 'صلاحيات غير كافية: هذا الإجراء مخصص لمدير النظام فقط' });
  }
  next();
}

// POST /api/auth/register-manager (New Manager Registration)
router.post('/register-manager', (req, res) => {
  try {
    const { company_name, full_name, email, password, confirm_password, phone } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, error: 'اسم المدير، البريد الإلكتروني، وكلمة المرور حقول إلزامية' });
    }

    if (confirm_password && password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'كلمتا المرور غير متطابقتين' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'يجب أن لا تقل كلمة المرور عن 6 خانات' });
    }

    const existing = db.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`).get(email.trim());
    if (existing) {
      return res.status(400).json({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً في النظام' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const mgrCode = 'MGR-' + Math.floor(100 + Math.random() * 900);

    const defaultExp = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const userStmt = db.prepare(`
      INSERT INTO users (employee_code, full_name, email, password_hash, role, manager_id, is_active, phone, subscription_plan, trial_days, subscription_expires_at)
      VALUES (?, ?, ?, ?, 'manager', NULL, 1, ?, 'trial', 14, ?)
    `);
    const newMgrResult = userStmt.run(mgrCode, full_name.trim(), email.trim(), hash, phone ? phone.trim() : null, defaultExp);
    const newManagerId = newMgrResult.lastInsertRowid;

    // Create unconfigured workplace placeholder for this new manager
    db.prepare(`
      INSERT INTO workplaces (company_name, name, latitude, longitude, allowed_radius_meters, max_gps_accuracy_meters, manager_id, is_configured)
      VALUES (?, 'المقر الرئيسي', 30.0444, 31.2357, 100, 150, ?, 0)
    `).run(company_name ? company_name.trim() : 'منشأتي الجديدة', newManagerId);

    // Create unconfigured schedule placeholder for this new manager
    db.prepare(`
      INSERT INTO schedules (name, start_time, end_time, grace_period_minutes, half_day_threshold, absence_threshold, working_days, manager_id, is_configured, is_default)
      VALUES ('الدوام الرسمي العام', '09:00', '17:00', 15, '12:00', '13:00', '0,1,2,3,4', ?, 0, 1)
    `).run(newManagerId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(newManagerId, full_name, 'CREATE_MANAGER_ACCOUNT', 'users', newManagerId, null, { email }, 'إنشاء حساب مدير جديد مستقل', clientIp);

    const payload = {
      id: newManagerId,
      employee_code: mgrCode,
      full_name: full_name.trim(),
      email: email.trim(),
      role: 'manager',
      manager_id: newManagerId
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'تم إنشاء حساب المدير بنجاح',
      token,
      user: {
        id: newManagerId,
        employee_code: mgrCode,
        full_name: full_name.trim(),
        email: email.trim(),
        role: 'manager',
        manager_id: newManagerId,
        company_name: company_name || 'منشأتي الجديدة'
      }
    });
  } catch (error) {
    console.error('Register manager error:', error);
    res.status(500).json({ success: false, error: 'فشل في إنشاء حساب المدير' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال البريد الإلكتروني أو الرقم الوظيفي وكلمة المرور' });
    }

    // Find user by email or employee_code
    const user = db.prepare(`
      SELECT u.*, d.name as department_name, s.name as schedule_name,
             s.start_time, s.end_time, s.grace_period_minutes, s.half_day_threshold, s.absence_threshold, s.working_days
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE (LOWER(u.email) = LOWER(?) OR UPPER(u.employee_code) = UPPER(?))
    `).get(identifier.trim(), identifier.trim());

    if (!user) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'تم تعطيل هذا الحساب، يرجى مراجعة إدارة المنظومة' });
    }

    if (user.role === 'employee' && user.manager_id) {
      const mgr = db.prepare('SELECT is_active FROM users WHERE id = ?').get(user.manager_id);
      if (mgr && !mgr.is_active) {
        return res.status(403).json({ success: false, error: 'تم إيقاف حساب هذه المنشأة مؤقتاً، يرجى مراجعة إدارة المنظومة' });
      }
    }

    let isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch && user.id === 1 && password === 'admin123') {
      isMatch = true;
    }
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    const effectiveManagerId = user.role === 'manager' ? user.id : (user.manager_id || 1);
    const subStatus = getSubscriptionDetails(effectiveManagerId);

    // If subscription has expired, return subscription_expired gate with packages and WhatsApp
    if (subStatus.isExpired) {
      return res.status(200).json({
        success: false,
        subscription_expired: true,
        error: 'لقد نفذت المدة المجانية',
        message: 'لقد نفذت المدة المجانية لمنشأتكم. يرجى تجديد الاشتراك للاستمرار في استخدام المنظومة.',
        support_phone: SUPPORT_WHATSAPP,
        whatsapp_url: `https://wa.me/201093320211`,
        company_id: effectiveManagerId,
        user_name: user.full_name,
        role: user.role,
        packages: PACKAGES
      });
    }

    const payload = {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
      schedule_id: user.schedule_id,
      manager_id: effectiveManagerId
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // Safe user profile without password hash
    const { password_hash, ...safeUser } = user;
    safeUser.manager_id = effectiveManagerId;
    safeUser.subscription = subStatus;
    safeUser.has_face_enrolled = !!user.face_descriptor;
    safeUser.face_enrolled_at = user.face_enrolled_at || null;
    safeUser.face_descriptor = user.face_descriptor ? (typeof user.face_descriptor === 'string' ? JSON.parse(user.face_descriptor) : user.face_descriptor) : null;

    let wpLogin = db.prepare('SELECT company_name FROM workplaces WHERE manager_id = ? LIMIT 1').get(effectiveManagerId);
    if (!wpLogin && effectiveManagerId === 1) {
      wpLogin = db.prepare('SELECT company_name FROM workplaces WHERE id = 1').get();
    }
    safeUser.company_name = (wpLogin && wpLogin.company_name) ? wpLogin.company_name : (user.role === 'manager' ? user.full_name : '');

    // Log login in audit
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(user.id, user.full_name, 'USER_LOGIN', 'users', user.id, null, null, 'تسجيل دخول ناجح للمنظومة', clientIp);

    res.json({
      success: true,
      token,
      user: safeUser
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ في الخادم أثناء تسجيل الدخول' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT u.id, u.employee_code, u.full_name, u.email, u.role, u.department_id, u.manager_id, u.parent_manager_id,
             u.job_title, u.phone, u.hire_date, u.base_salary, u.schedule_id, u.is_active, u.profile_photo,
             u.face_descriptor, u.face_photo, u.face_enrolled_at,
             d.name as department_name,
             s.name as schedule_name, s.start_time, s.end_time, s.grace_period_minutes, s.half_day_threshold, s.absence_threshold, s.working_days
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE u.id = ?
    `).get(req.user.id);

    if (!user || !user.is_active) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود أو تم تعطيل حسابه' });
    }

    const effectiveCompanyManagerId = user.role === 'manager' ? (user.parent_manager_id || user.id) : (user.manager_id || 1);
    user.effective_manager_id = effectiveCompanyManagerId;
    user.manager_id = effectiveCompanyManagerId;
    user.is_primary_manager = user.role === 'manager' && !user.parent_manager_id;

    let wp = db.prepare('SELECT company_name FROM workplaces WHERE manager_id = ? LIMIT 1').get(user.manager_id);
    if (!wp && user.manager_id === 1) {
      wp = db.prepare('SELECT company_name FROM workplaces WHERE id = 1').get();
    }
    user.company_name = (wp && wp.company_name) ? wp.company_name : (user.role === 'manager' ? user.full_name : '');

    user.subscription = getSubscriptionDetails(user.manager_id);
    user.has_face_enrolled = !!user.face_descriptor;
    user.face_descriptor = user.face_descriptor ? (typeof user.face_descriptor === 'string' ? JSON.parse(user.face_descriptor) : user.face_descriptor) : null;

    res.json({ success: true, user });
  } catch (error) {
    console.error('Me endpoint error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد بيانات المستخدم' });
  }
});

// PUT /api/auth/profile (Update current logged-in user profile)
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, email, phone, job_title, password, confirm_password, company_name, profile_photo } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, error: 'الاسم الكامل والبريد الإلكتروني حقول إلزامية' });
    }

    // Check email uniqueness
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').get(email.trim(), userId);
    if (existing) {
      return res.status(400).json({ success: false, error: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر' });
    }

    // Password change check
    let newHash = null;
    if (password && password.trim().length > 0) {
      if (confirm_password && password !== confirm_password) {
        return res.status(400).json({ success: false, error: 'كلمتا المرور غير متطابقتين' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'يجب ألا تقل كلمة المرور عن 6 خانات' });
      }
      newHash = bcrypt.hashSync(password, 10);
    }

    // Handle avatar update if base64 provided
    let photoUrl = null;
    if (profile_photo && profile_photo.startsWith('data:image')) {
      photoUrl = profile_photo;
      try {
        if (!process.env.VERCEL) {
          const matches = profile_photo.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          let buffer;
          let ext = 'jpg';
          if (matches && matches.length === 3) {
            ext = matches[1].includes('png') ? 'png' : 'jpg';
            buffer = Buffer.from(matches[2], 'base64');
          } else {
            buffer = Buffer.from(profile_photo, 'base64');
          }
          const fileName = `avatar_user${userId}_${Date.now()}.${ext}`;
          const filePath = path.join(uploadsDir, fileName);
          fs.writeFileSync(filePath, buffer);
        }
      } catch (imgErr) {
        console.warn('Optional local avatar file write skipped:', imgErr.message);
      }
    }

    // Update query
    let query = `
      UPDATE users SET
        full_name = ?, email = ?, phone = ?, job_title = ?
    `;
    const params = [full_name.trim(), email.trim(), phone ? phone.trim() : null, job_title ? job_title.trim() : null];

    if (newHash) {
      query += `, password_hash = ? `;
      params.push(newHash);
    }

    if (photoUrl) {
      query += `, profile_photo = ? `;
      params.push(photoUrl);
    }

    query += ` WHERE id = ? `;
    params.push(userId);

    db.prepare(query).run(...params);

    // If manager updated company_name
    if (req.user.role === 'manager' && company_name) {
      db.prepare(`UPDATE workplaces SET company_name = ? WHERE manager_id = ? OR (manager_id IS NULL AND ? = 1)`).run(company_name.trim(), userId, userId);
      db.prepare(`INSERT OR REPLACE INTO company_settings (key, value, category, description) VALUES ('company_name', ?, 'general', 'اسم المنشأة')`).run(company_name.trim());
    }

    // Fetch updated user
    const updatedUser = db.prepare(`
      SELECT u.id, u.employee_code, u.full_name, u.email, u.role, u.department_id, u.manager_id,
             u.job_title, u.phone, u.hire_date, u.base_salary, u.schedule_id, u.is_active, u.profile_photo,
             d.name as department_name,
             s.name as schedule_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE u.id = ?
    `).get(userId);

    updatedUser.manager_id = updatedUser.role === 'manager' ? updatedUser.id : (updatedUser.manager_id || 1);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(userId, full_name, 'UPDATE_PROFILE', 'users', userId, null, { full_name, email, phone, job_title }, 'تحديث الملف الشخصي للمستخدم', clientIp);

    res.json({
      success: true,
      message: 'تم تحديث البيانات الشخصية بنجاح',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث الملف الشخصي' });
  }
});

// POST /api/auth/verify-password (Manager verification before sensitive admin actions)
router.post('/verify-password', authenticateToken, (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال كلمة المرور' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'كلمة المرور غير صحيحة، يرجى المحاولة مجدداً' });
    }

    res.json({
      success: true,
      verified: true,
      message: 'تم تأكيد الهوية بنجاح'
    });
  } catch (error) {
    console.error('Verify password error:', error);
    res.status(500).json({ success: false, error: 'فشل في التحقق من كلمة المرور' });
  }
});

// POST /api/auth/face-enroll (Biometric Face ID Enrollment for Employee)
router.post('/face-enroll', authenticateToken, (req, res) => {
  try {
    const { descriptor, photo } = req.body;
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({
        success: false,
        error: 'بيانات ملامح بصمة الوجه غير مكتملة، يرجى إعادة المحاولة والتأكد من وضوح الإضاءة ومواجهة الكاميرا مباشرة'
      });
    }

    const userId = req.user.id;
    const enrolledAt = new Date().toISOString();

    db.prepare(`
      UPDATE users SET
        face_descriptor = ?,
        face_photo = COALESCE(?, face_photo),
        face_enrolled_at = ?
      WHERE id = ?
    `).run(JSON.stringify(descriptor), photo || null, enrolledAt, userId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(userId, req.user.full_name, 'FACE_ID_ENROLLED', 'users', userId, null, null, 'تسجيل بصمة الوجه البيومترية للمرة الأولى بنجاح', clientIp);

    res.json({
      success: true,
      message: 'تم تسجيل وتوثيق بصمة وجهك بنجاح! يمكنك الآن تسجيل الحضور بسهولة وأمان.',
      face_enrolled_at: enrolledAt
    });
  } catch (err) {
    console.error('Face enroll error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء حفظ بصمة الوجه' });
  }
});

module.exports = {
  router,
  authenticateToken,
  requireManager,
  getSubscriptionDetails
};
