process.env.TZ = 'Africa/Cairo';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const SOURCE_DB_FILE = path.join(__dirname, '..', 'attendance.db');
let DB_FILE = SOURCE_DB_FILE;
let uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

if (process.env.VERCEL) {
  const tmpDbFile = path.join('/tmp', 'attendance.db');
  try {
    if (!fs.existsSync(tmpDbFile) && fs.existsSync(SOURCE_DB_FILE)) {
      fs.copyFileSync(SOURCE_DB_FILE, tmpDbFile);
    }
    DB_FILE = tmpDbFile;
    uploadsDir = path.join('/tmp', 'uploads');
  } catch (err) {
    console.error('Vercel /tmp setup fallback error:', err);
  }
}

try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (mkdirErr) {
  console.warn('Uploads dir warning:', mkdirErr.message);
}

const db = new DatabaseSync(DB_FILE);

// Enable WAL mode (or MEMORY on serverless) & foreign keys for performance and consistency
const journalMode = process.env.VERCEL ? 'MEMORY' : 'WAL';
db.exec(`
  PRAGMA journal_mode = ${journalMode};
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    manager_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '09:00',
    end_time TEXT NOT NULL DEFAULT '17:00',
    grace_period_minutes INTEGER NOT NULL DEFAULT 15,
    half_day_threshold TEXT NOT NULL DEFAULT '12:00',
    absence_threshold TEXT NOT NULL DEFAULT '13:00',
    working_days TEXT NOT NULL DEFAULT '0,1,2,3,4', -- 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workplaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL DEFAULT 'شركة الرؤية للحلول الرقمية',
    name TEXT NOT NULL DEFAULT 'المقر الرئيسي',
    latitude REAL NOT NULL DEFAULT 30.0444,
    longitude REAL NOT NULL DEFAULT 31.2357,
    allowed_radius_meters REAL NOT NULL DEFAULT 150,
    max_gps_accuracy_meters REAL NOT NULL DEFAULT 150,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee', -- 'manager' or 'employee'
    department_id INTEGER,
    job_title TEXT,
    phone TEXT,
    hire_date TEXT,
    base_salary REAL DEFAULT 5000,
    schedule_id INTEGER,
    is_active INTEGER DEFAULT 1,
    profile_photo TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    check_in_time TEXT, -- HH:MM:SS
    check_out_time TEXT, -- HH:MM:SS
    check_in_lat REAL,
    check_in_lng REAL,
    check_in_distance REAL,
    check_in_accuracy REAL,
    check_in_photo TEXT,
    check_out_lat REAL,
    check_out_lng REAL,
    check_out_distance REAL,
    check_out_accuracy REAL,
    check_out_photo TEXT,
    status TEXT NOT NULL, -- 'Present', 'On Time', 'Late', 'Half Day', 'Absent', 'Early Leave', 'Outside Location', 'Pending Review'
    scheduled_start TEXT DEFAULT '09:00',
    scheduled_end TEXT DEFAULT '17:00',
    late_minutes INTEGER DEFAULT 0,
    early_leave_minutes INTEGER DEFAULT 0,
    worked_hours REAL DEFAULT 0,
    estimated_deduction REAL DEFAULT 0,
    verification_status TEXT DEFAULT 'verified', -- 'verified', 'outside_radius', 'poor_gps', 'suspicious', 'manual_override'
    ip_address TEXT,
    user_agent TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attendance_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    attendance_record_id INTEGER,
    date TEXT NOT NULL,
    requested_check_in TEXT,
    requested_check_out TEXT,
    reason_type TEXT NOT NULL, -- 'forgot_checkin', 'forgot_checkout', 'gps_issue', 'internet_issue', 'other'
    reason_details TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reviewed_by INTEGER,
    review_notes TEXT,
    reviewed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(attendance_record_id) REFERENCES attendance_records(id) ON DELETE SET NULL,
    FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS company_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    is_recurring INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, -- NULL means all managers
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'success', 'danger'
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    old_values TEXT,
    new_values TEXT,
    reason TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS salary_advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    reason TEXT,
    month TEXT NOT NULL, -- YYYY-MM
    date TEXT NOT NULL, -- YYYY-MM-DD
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    approved_by INTEGER,
    approved_at TEXT,
    review_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(approved_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS employee_bonuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    month TEXT NOT NULL, -- YYYY-MM
    date TEXT NOT NULL, -- YYYY-MM-DD
    created_by INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_phone TEXT NOT NULL,
    recipient_name TEXT,
    recipient_role TEXT DEFAULT 'employee',
    message_type TEXT NOT NULL, -- 'late_alert', 'morning_briefing', 'payslip', 'test'
    message_text TEXT NOT NULL,
    status TEXT DEFAULT 'sent', -- 'sent', 'pending', 'failed', 'direct_opened'
    response_details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    leave_type TEXT NOT NULL DEFAULT 'annual', -- 'annual', 'sick', 'casual', 'unpaid'
    start_date TEXT NOT NULL, -- YYYY-MM-DD
    end_date TEXT NOT NULL, -- YYYY-MM-DD
    days_count INTEGER NOT NULL DEFAULT 1,
    reason TEXT,
    attachment_photo TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reviewed_by INTEGER,
    reviewed_at TEXT,
    review_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS permission_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    permission_type TEXT NOT NULL DEFAULT 'late_arrival', -- 'late_arrival', 'early_departure', 'during_day'
    start_time TEXT NOT NULL, -- HH:MM
    end_time TEXT NOT NULL, -- HH:MM
    hours_count REAL NOT NULL DEFAULT 1.0,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reviewed_by INTEGER,
    reviewed_at TEXT,
    review_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendance_records(employee_id, date);
  CREATE INDEX IF NOT EXISTS idx_att_date ON attendance_records(date);
  CREATE INDEX IF NOT EXISTS idx_att_status ON attendance_records(status);
  CREATE INDEX IF NOT EXISTS idx_att_checkout ON attendance_records(date, check_out_time);
  CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_adv_emp_month ON salary_advances(employee_id, month);
  CREATE INDEX IF NOT EXISTS idx_bon_emp_month ON employee_bonuses(employee_id, month);
  CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests(employee_id, status);
  CREATE INDEX IF NOT EXISTS idx_leave_dates ON leave_requests(start_date, end_date, status);
  CREATE INDEX IF NOT EXISTS idx_perm_emp_date ON permission_requests(employee_id, date, status);
  CREATE INDEX IF NOT EXISTS idx_wa_phone ON whatsapp_logs(recipient_phone);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_shifts_mgr_active ON company_shifts(manager_id, is_active);
`);

// Safe migrations for multi-manager workspace separation & setup states
try {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('manager_id')) {
    db.exec(`ALTER TABLE users ADD COLUMN manager_id INTEGER;`);
    db.exec(`UPDATE users SET manager_id = 1 WHERE role = 'employee';`);
  }
  if (!userCols.includes('annual_leave_balance')) {
    db.exec(`ALTER TABLE users ADD COLUMN annual_leave_balance INTEGER DEFAULT 21;`);
  }
  if (!userCols.includes('subscription_plan')) {
    db.exec(`ALTER TABLE users ADD COLUMN subscription_plan TEXT DEFAULT 'trial';`);
  }
  if (!userCols.includes('trial_days')) {
    db.exec(`ALTER TABLE users ADD COLUMN trial_days INTEGER DEFAULT 14;`);
  }
  if (!userCols.includes('subscription_expires_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN subscription_expires_at TEXT;`);
    const defaultExp = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    db.exec(`UPDATE users SET subscription_expires_at = '${defaultExp}' WHERE role = 'manager' AND (subscription_expires_at IS NULL OR subscription_expires_at = '');`);
  }

  if (!userCols.includes('shift_id')) {
    db.exec(`ALTER TABLE users ADD COLUMN shift_id INTEGER DEFAULT NULL;`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_shift ON users(shift_id);`);

  if (!userCols.includes('face_descriptor')) {
    db.exec(`ALTER TABLE users ADD COLUMN face_descriptor TEXT DEFAULT NULL;`);
  }
  if (!userCols.includes('face_photo')) {
    db.exec(`ALTER TABLE users ADD COLUMN face_photo TEXT DEFAULT NULL;`);
  }
  if (!userCols.includes('face_enrolled_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN face_enrolled_at TEXT DEFAULT NULL;`);
  }

  // Support Tickets table for technical support from website to super admin
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_name TEXT NOT NULL,
      sender_phone TEXT NOT NULL,
      sender_email TEXT,
      company_name TEXT,
      role TEXT DEFAULT 'user',
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      attachment_photo TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      admin_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_status ON support_tickets(status);
  `);

  const ticketCols = db.prepare('PRAGMA table_info(support_tickets)').all().map(c => c.name);
  if (!ticketCols.includes('attachment_photo')) {
    db.exec(`ALTER TABLE support_tickets ADD COLUMN attachment_photo TEXT;`);
  }

  const wpCols = db.prepare('PRAGMA table_info(workplaces)').all().map(c => c.name);
  if (!wpCols.includes('manager_id')) {
    db.exec(`ALTER TABLE workplaces ADD COLUMN manager_id INTEGER;`);
    db.exec(`UPDATE workplaces SET manager_id = 1;`);
  }
  if (!wpCols.includes('is_configured')) {
    db.exec(`ALTER TABLE workplaces ADD COLUMN is_configured INTEGER DEFAULT 0;`);
    db.exec(`UPDATE workplaces SET is_configured = 1 WHERE id = 1;`);
  }

  const schedCols = db.prepare('PRAGMA table_info(schedules)').all().map(c => c.name);
  if (!schedCols.includes('manager_id')) {
    db.exec(`ALTER TABLE schedules ADD COLUMN manager_id INTEGER;`);
    db.exec(`UPDATE schedules SET manager_id = 1;`);
  }
  if (!schedCols.includes('is_configured')) {
    db.exec(`ALTER TABLE schedules ADD COLUMN is_configured INTEGER DEFAULT 0;`);
    db.exec(`UPDATE schedules SET is_configured = 1 WHERE id = 1;`);
  }
  if (!schedCols.includes('early_leave_grace_minutes')) {
    db.exec(`ALTER TABLE schedules ADD COLUMN early_leave_grace_minutes INTEGER DEFAULT 0;`);
  }

  const deptCols = db.prepare('PRAGMA table_info(departments)').all().map(c => c.name);
  if (!deptCols.includes('manager_id')) {
    db.exec(`ALTER TABLE departments ADD COLUMN manager_id INTEGER;`);
    db.exec(`UPDATE departments SET manager_id = 1;`);
  }

  if (!wpCols.includes('schedule_mode')) {
    db.exec(`ALTER TABLE workplaces ADD COLUMN schedule_mode TEXT DEFAULT 'normal';`);
  }

  // Company Shifts table (multi-shift periods)
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      grace_period_minutes INTEGER DEFAULT 15,
      early_leave_grace_minutes INTEGER DEFAULT 15,
      early_checkin_minutes INTEGER DEFAULT 60,
      assigned_employee_ids TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_shifts_mgr ON company_shifts(manager_id);
  `);

  const shiftCols = db.prepare('PRAGMA table_info(company_shifts)').all().map(c => c.name);
  if (!shiftCols.includes('early_checkin_minutes')) {
    db.exec(`ALTER TABLE company_shifts ADD COLUMN early_checkin_minutes INTEGER DEFAULT 60;`);
  }

  const attCols = db.prepare('PRAGMA table_info(attendance_records)').all().map(c => c.name);
  if (!attCols.includes('shift_id')) {
    db.exec(`ALTER TABLE attendance_records ADD COLUMN shift_id INTEGER;`);
  }
  if (!attCols.includes('shift_name')) {
    db.exec(`ALTER TABLE attendance_records ADD COLUMN shift_name TEXT;`);
  }
} catch (migErr) {
  console.error('Migration error:', migErr);
}

// One-time monthly archive reset & test accounts purge (tareq al-najjar and test managers)
try {
  const resetCheck = db.prepare(`SELECT value FROM company_settings WHERE key = 'archive_reset_oct2026'`).get();
  if (!resetCheck) {
    db.exec(`
      DELETE FROM attendance_records;
      DELETE FROM attendance_corrections;
      DELETE FROM users WHERE full_name LIKE '%طارق النجار%' OR (role = 'manager' AND id != 1);
      DELETE FROM schedules WHERE manager_id != 1;
      DELETE FROM workplaces WHERE manager_id != 1;
      UPDATE users SET manager_id = 1 WHERE role = 'employee';
      INSERT OR REPLACE INTO company_settings (key, value, category, description)
      VALUES ('archive_reset_oct2026', '1', 'system', 'Archive zeroed and test accounts removed on launch');
    `);
    console.log('[Database] Archive zeroed and test users removed successfully.');
  }
} catch (cleanErr) {
  console.error('Startup cleanup error:', cleanErr);
}

// Initialize default WhatsApp & 12-hour format settings
try {
  const defaultWhatsAppSettings = [
    { key: 'whatsapp_enabled', value: '1', category: 'whatsapp', description: 'تفعيل نظام إشعارات الواتساب' },
    { key: 'whatsapp_provider', value: 'direct', category: 'whatsapp', description: 'مزود خدمة واتساب (direct, ultramsg, greenapi, custom)' },
    { key: 'whatsapp_api_url', value: '', category: 'whatsapp', description: 'رابط بوابة الـ API' },
    { key: 'whatsapp_instance_id', value: '', category: 'whatsapp', description: 'معرف الـ Instance' },
    { key: 'whatsapp_api_token', value: '', category: 'whatsapp', description: 'رمز المصادقة API Token' },
    { key: 'whatsapp_manager_phone', value: '01227580963', category: 'whatsapp', description: 'رقم واتساب المدير لتقرير الصباح' },
    { key: 'whatsapp_auto_late_alert', value: '1', category: 'whatsapp', description: 'إرسال إشعار فوري للموظف عند التأخير' },
    { key: 'time_format_12h', value: '1', category: 'general', description: 'عرض الوقت بنظام 12 ساعة' }
  ];

  const insertSettingStmt = db.prepare(`
    INSERT OR IGNORE INTO company_settings (key, value, category, description)
    VALUES (?, ?, ?, ?)
  `);

  defaultWhatsAppSettings.forEach(s => {
    insertSettingStmt.run(s.key, s.value, s.category, s.description);
  });
} catch (waSettingErr) {
  console.error('WhatsApp settings init error:', waSettingErr);
}

// Face Reset Requests Table & Indexes
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS face_reset_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      manager_id INTEGER NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_face_reset_status ON face_reset_requests(status);
    CREATE INDEX IF NOT EXISTS idx_face_reset_emp ON face_reset_requests(employee_id);
    CREATE INDEX IF NOT EXISTS idx_face_reset_mgr ON face_reset_requests(manager_id);
  `);

  const notifCols = db.prepare(`PRAGMA table_info(notifications)`).all().map(c => c.name);
  if (!notifCols.includes('related_id')) {
    db.exec(`ALTER TABLE notifications ADD COLUMN related_id INTEGER DEFAULT NULL;`);
  }

  // Clear legacy/test face descriptors so all employees enroll fresh with strict multi-angle liveness
  db.exec(`UPDATE users SET face_descriptor = NULL, face_photo = NULL, face_enrolled_at = NULL WHERE role = 'employee' AND face_descriptor IS NOT NULL;`);
} catch (faceTableErr) {
  console.error('Face reset table init error:', faceTableErr);
}

// Helper to log audit events
function logAudit(userId, userName, action, targetType, targetId, oldValues, newValues, reason, ipAddress) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id, old_values, new_values, reason, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      userId || null,
      userName || 'System',
      action,
      targetType || null,
      targetId ? String(targetId) : null,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      reason || null,
      ipAddress || null
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// Helper to create notifications
function createNotification(userId, title, message, type = 'info', relatedId = null) {
  try {
    const stmt = db.prepare(`
      INSERT INTO notifications (user_id, title, message, type, related_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId || null, title, message, type, relatedId || null);
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// Distance Calculation using Haversine formula (returns meters)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Cairo Timezone (Africa/Cairo, UTC+2/UTC+3) Date & Time Helpers
function getCairoNowParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    parts[p.type] = p.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour,
    minute: parts.minute,
    second: parts.second,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    monthStr: `${parts.year}-${parts.month}`,
    timeStr: `${hour}:${parts.minute}:${parts.second}`
  };
}

function getTodayString() {
  return getCairoNowParts().dateStr;
}

function getCurrentTimeString() {
  return getCairoNowParts().timeStr;
}

function getCurrentMonthString() {
  return getCairoNowParts().monthStr;
}

module.exports = {
  db,
  logAudit,
  createNotification,
  calculateHaversineDistance,
  uploadsDir,
  getCairoNowParts,
  getTodayString,
  getCurrentTimeString,
  getCurrentMonthString
};
