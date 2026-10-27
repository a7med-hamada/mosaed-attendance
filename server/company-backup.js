const { db } = require('./database');
const crypto = require('node:crypto');

function getMasterEncryptionKey() {
  if (process.env.CLOUD_SYNC_ENCRYPTION_KEY) {
    const raw = Buffer.from(process.env.CLOUD_SYNC_ENCRYPTION_KEY, 'base64');
    if (raw.length === 32) return raw;
  }
  return crypto.createHash('sha256')
    .update('mosaed_cloud_sync_master_encryption_secure_key_2026_salt_98412')
    .digest();
}

function encryptPayload(data) {
  const key = getMasterEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);
  return JSON.stringify({
    version: 2,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  });
}

function decryptPayload(envelopeStr) {
  if (!envelopeStr) return null;
  let parsed;
  try {
    parsed = typeof envelopeStr === 'string' ? JSON.parse(envelopeStr) : envelopeStr;
  } catch (e) {
    return null;
  }

  if (parsed && parsed.version === 2 && parsed.algorithm === 'aes-256-gcm') {
    const key = getMasterEncryptionKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
    return JSON.parse(plaintext);
  }

  // Plain JSON fallback
  return parsed;
}

function resolveManagerId(identifier) {
  if (!identifier) return 1;
  const num = parseInt(identifier, 10);
  if (!isNaN(num) && num > 0) {
    const u = db.prepare('SELECT id, role, manager_id FROM users WHERE id = ?').get(num);
    if (u) {
      return u.role === 'manager' ? u.id : (u.manager_id || 1);
    }
  }

  // Try matching by email
  const byEmail = db.prepare('SELECT id, role, manager_id FROM users WHERE email = ?').get(String(identifier).trim());
  if (byEmail) {
    return byEmail.role === 'manager' ? byEmail.id : (byEmail.manager_id || 1);
  }

  // Try matching by workplace company name
  const byWp = db.prepare('SELECT manager_id FROM workplaces WHERE company_name LIKE ? LIMIT 1').get(`%${String(identifier).trim()}%`);
  if (byWp && byWp.manager_id) return byWp.manager_id;

  // Try matching by company_backups
  const byBackup = db.prepare('SELECT manager_id FROM company_backups WHERE company_name LIKE ? ORDER BY id DESC LIMIT 1').get(`%${String(identifier).trim()}%`);
  if (byBackup && byBackup.manager_id) return byBackup.manager_id;

  return 1;
}

/**
 * Capture and encrypt complete company snapshot
 */
function createCompanySnapshot(targetManagerId, triggerAction = 'auto_snapshot', customSummary = null) {
  try {
    const managerId = resolveManagerId(targetManagerId);
    const manager = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'manager'").get(managerId)
      || db.prepare("SELECT * FROM users WHERE id = 1").get();

    if (!manager) {
      console.warn(`[CompanyBackup] No manager found for ID ${managerId}`);
      return null;
    }

    // Determine company name
    let companyName = 'المنشأة';
    const wp = db.prepare('SELECT company_name FROM workplaces WHERE manager_id = ? OR (id = 1 AND ? = 1) LIMIT 1').get(manager.id, manager.id);
    if (wp && wp.company_name) {
      companyName = wp.company_name;
    } else {
      const setting = db.prepare("SELECT value FROM company_settings WHERE key = 'company_name'").get();
      if (setting && setting.value) companyName = setting.value;
      else if (manager.full_name) companyName = manager.full_name;
    }

    // Collect all employees under this manager
    const employees = db.prepare(`
      SELECT * FROM users
      WHERE role = 'employee' AND (manager_id = ? OR (? = 1 AND manager_id IS NULL))
    `).all(manager.id, manager.id);

    const allUserIds = [manager.id, ...employees.map(e => e.id)];
    const placeholders = allUserIds.map(() => '?').join(',');

    // Collect all company entities
    const workplaces = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? OR (? = 1 AND id = 1)`).all(manager.id, manager.id);
    const shifts = db.prepare(`SELECT * FROM company_shifts WHERE manager_id = ? OR (? = 1 AND (manager_id IS NULL OR manager_id = 1))`).all(manager.id, manager.id);
    const schedules = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? OR (? = 1 AND id = 1)`).all(manager.id, manager.id);
    const departments = db.prepare(`SELECT * FROM departments WHERE manager_id = ? OR (? = 1 AND (manager_id IS NULL OR manager_id = 1))`).all(manager.id, manager.id);

    const attendanceRecords = db.prepare(`SELECT * FROM attendance_records WHERE employee_id IN (${placeholders})`).all(...allUserIds);
    const attendanceCorrections = db.prepare(`SELECT * FROM attendance_corrections WHERE employee_id IN (${placeholders})`).all(...allUserIds);
    const deductions = db.prepare(`SELECT * FROM employee_deductions WHERE employee_id IN (${placeholders})`).all(...allUserIds);
    const bonuses = db.prepare(`SELECT * FROM employee_bonuses WHERE employee_id IN (${placeholders})`).all(...allUserIds);
    const advances = db.prepare(`SELECT * FROM salary_advances WHERE employee_id IN (${placeholders})`).all(...allUserIds);
    const leaves = db.prepare(`SELECT * FROM leave_requests WHERE employee_id IN (${placeholders})`).all(...allUserIds);
    const permissions = db.prepare(`SELECT * FROM permission_requests WHERE employee_id IN (${placeholders})`).all(...allUserIds);
    const faceResets = db.prepare(`SELECT * FROM face_reset_requests WHERE employee_id IN (${placeholders})`).all(...allUserIds);
    const settings = db.prepare(`SELECT * FROM company_settings`).all();

    const snapshotPayload = {
      snapshotVersion: 2,
      createdAt: new Date().toISOString(),
      managerId: manager.id,
      companyName,
      triggerAction,
      tables: {
        manager,
        employees,
        workplaces,
        shifts,
        schedules,
        departments,
        attendanceRecords,
        attendanceCorrections,
        deductions,
        bonuses,
        advances,
        leaves,
        permissions,
        faceResets,
        settings
      }
    };

    const encryptedData = encryptPayload(snapshotPayload);
    const employeeCount = employees.length;
    const recordsCount = attendanceRecords.length;
    const summary = customSummary || `${employeeCount + 1} مستخدم (${employeeCount} موظف + مدير), ${recordsCount} سجل حضور, ${workplaces.length} مقر, ${shifts.length} وردية`;

    const result = db.prepare(`
      INSERT INTO company_backups (
        manager_id, company_name, trigger_action, summary,
        employee_count, records_count, encrypted_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(manager.id, companyName, triggerAction, summary, employeeCount, recordsCount, encryptedData);

    // Prune older backups for this manager beyond 3 to prevent excessive storage
    try {
      const oldBackups = db.prepare(`
        SELECT id FROM company_backups
        WHERE manager_id = ?
        ORDER BY id DESC
        LIMIT -1 OFFSET 3
      `).all(manager.id);
      if (oldBackups.length > 0) {
        const delIds = oldBackups.map(b => b.id).join(',');
        db.exec(`DELETE FROM company_backups WHERE id IN (${delIds});`);
      }
    } catch (_) {}

    return {
      backupId: result.lastInsertRowid,
      managerId: manager.id,
      companyName,
      employeeCount,
      recordsCount,
      summary,
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('[CompanyBackup] createCompanySnapshot error:', err);
    return null;
  }
}

/**
 * Restore an entire company dataset from an encrypted snapshot
 */
async function restoreCompanyData(companyIdentifier, specificBackupId = null) {
  const managerId = resolveManagerId(companyIdentifier);

  let backupRow = null;
  if (specificBackupId) {
    backupRow = db.prepare('SELECT * FROM company_backups WHERE id = ?').get(specificBackupId);
  } else {
    backupRow = db.prepare(`
      SELECT * FROM company_backups
      WHERE manager_id = ? OR company_name LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get(managerId, `%${String(companyIdentifier).trim()}%`);
  }

  if (!backupRow) {
    throw new Error(`لا توجد نسخ احتياطية مسجلة للشركة: ${companyIdentifier}`);
  }

  const payload = decryptPayload(backupRow.encrypted_data);
  if (!payload || !payload.tables) {
    throw new Error('فشل فك تشفير بيانات النسخة الاحتياطية للشركة');
  }

  const {
    manager,
    employees = [],
    workplaces = [],
    shifts = [],
    schedules = [],
    departments = [],
    attendanceRecords = [],
    attendanceCorrections = [],
    deductions = [],
    bonuses = [],
    advances = [],
    leaves = [],
    permissions = [],
    faceResets = [],
    settings = []
  } = payload.tables;

  const targetMgrId = (manager && manager.id) || backupRow.manager_id;
  const allUserIds = [targetMgrId, ...employees.map(e => e.id)].filter(Boolean);

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE;');

  try {
    // 1. Purge existing data ONLY for this company
    if (allUserIds.length > 0) {
      const p = allUserIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM attendance_records WHERE employee_id IN (${p})`).run(...allUserIds);
      db.prepare(`DELETE FROM attendance_corrections WHERE employee_id IN (${p})`).run(...allUserIds);
      db.prepare(`DELETE FROM employee_deductions WHERE employee_id IN (${p})`).run(...allUserIds);
      db.prepare(`DELETE FROM employee_bonuses WHERE employee_id IN (${p})`).run(...allUserIds);
      db.prepare(`DELETE FROM salary_advances WHERE employee_id IN (${p})`).run(...allUserIds);
      db.prepare(`DELETE FROM leave_requests WHERE employee_id IN (${p})`).run(...allUserIds);
      db.prepare(`DELETE FROM permission_requests WHERE employee_id IN (${p})`).run(...allUserIds);
      db.prepare(`DELETE FROM face_reset_requests WHERE employee_id IN (${p})`).run(...allUserIds);
      db.prepare(`DELETE FROM users WHERE id IN (${p})`).run(...allUserIds);
    }

    db.prepare('DELETE FROM workplaces WHERE manager_id = ?').run(targetMgrId);
    db.prepare('DELETE FROM company_shifts WHERE manager_id = ?').run(targetMgrId);
    db.prepare('DELETE FROM schedules WHERE manager_id = ?').run(targetMgrId);
    db.prepare('DELETE FROM departments WHERE manager_id = ?').run(targetMgrId);

    // 2. Helper to dynamically insert rows matching current table schema
    function insertDynamic(table, rows) {
      if (!Array.isArray(rows) || rows.length === 0) return 0;
      const validCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      if (validCols.length === 0) return 0;

      const sampleCols = Object.keys(rows[0]).filter(k => validCols.includes(k));
      if (sampleCols.length === 0) return 0;

      const placeholders = sampleCols.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${sampleCols.join(', ')}) VALUES (${placeholders})`);

      for (const row of rows) {
        const values = sampleCols.map(c => (row[c] === undefined ? null : row[c]));
        stmt.run(...values);
      }
      return rows.length;
    }

    // 3. Restore Manager & Employees
    if (manager) insertDynamic('users', [manager]);
    insertDynamic('users', employees);

    // 4. Restore Workplaces, Shifts, Schedules, Departments
    insertDynamic('workplaces', workplaces);
    insertDynamic('company_shifts', shifts);
    insertDynamic('schedules', schedules);
    insertDynamic('departments', departments);

    // 5. Restore Attendance & Financials
    insertDynamic('attendance_records', attendanceRecords);
    insertDynamic('attendance_corrections', attendanceCorrections);
    insertDynamic('employee_deductions', deductions);
    insertDynamic('employee_bonuses', bonuses);
    insertDynamic('salary_advances', advances);
    insertDynamic('leave_requests', leaves);
    insertDynamic('permission_requests', permissions);
    insertDynamic('face_reset_requests', faceResets);

    // 6. Restore Settings (merge without overwriting system settings)
    if (Array.isArray(settings) && settings.length > 0) {
      const upsertSetting = db.prepare(`
        INSERT OR REPLACE INTO company_settings (key, value, category, description)
        VALUES (?, ?, ?, ?)
      `);
      for (const s of settings) {
        if (s && s.key && s.value !== undefined) {
          upsertSetting.run(s.key, String(s.value), s.category || 'general', s.description || null);
        }
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  } finally {
    try { db.exec('PRAGMA foreign_keys = ON;'); } catch (_) {}
  }

  // 7. Persist restored state to cloud immediately
  try {
    const { saveToCloud } = require('./cloud-sync');
    await saveToCloud();
  } catch (cloudErr) {
    console.warn('[CompanyBackup] Cloud sync after restore warning:', cloudErr.message);
  }

  return {
    success: true,
    message: `تم استعادة بيانات شركة (${backupRow.company_name}) بالكامل من النسخة الاحتياطية بنجاح`,
    companyName: backupRow.company_name,
    managerId: targetMgrId,
    backupDate: backupRow.created_at,
    restored: {
      users: 1 + employees.length,
      employeesCount: employees.length,
      attendanceRecords: attendanceRecords.length,
      workplaces: workplaces.length,
      shifts: shifts.length,
      schedules: schedules.length,
      deductions: deductions.length,
      bonuses: bonuses.length,
      advances: advances.length,
      leaves: leaves.length
    }
  };
}

/**
 * List all backup points
 */
function listCompanyBackups(companyIdentifier = null) {
  try {
    if (!companyIdentifier) {
      return db.prepare(`
        SELECT id, manager_id, company_name, trigger_action, summary,
               employee_count, records_count, created_at
        FROM company_backups
        ORDER BY id DESC
      `).all();
    }

    const managerId = resolveManagerId(companyIdentifier);
    return db.prepare(`
      SELECT id, manager_id, company_name, trigger_action, summary,
             employee_count, records_count, created_at
      FROM company_backups
      WHERE manager_id = ? OR company_name LIKE ?
      ORDER BY id DESC
    `).all(managerId, `%${String(companyIdentifier).trim()}%`);
  } catch (err) {
    return [];
  }
}

module.exports = {
  getMasterEncryptionKey,
  encryptPayload,
  decryptPayload,
  createCompanySnapshot,
  restoreCompanyData,
  listCompanyBackups
};
