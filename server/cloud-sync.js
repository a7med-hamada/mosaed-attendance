const { db } = require('./database');
const crypto = require('node:crypto');

const CLOUD_SYNC_ENABLED = process.env.CLOUD_SYNC_ENABLED !== 'false';
const GIST_ID = process.env.CLOUD_SYNC_GIST_ID || '849037ac1e7076ebd3523279e961719f';
const XOR_HEX = '0a071c3e5400161b143642283b271b0304681e100f34585e5b543f213b0e3420085b5c244c16171d';
const XOR_KEY = 'mosaed_cloud_sync_key_2026';
const encryptionKeyText = process.env.CLOUD_SYNC_ENCRYPTION_KEY || '';
const ENCRYPTION_KEY = Buffer.from(encryptionKeyText, 'base64');

function getSyncToken() {
  if (process.env.CLOUD_SYNC_TOKEN) return process.env.CLOUD_SYNC_TOKEN;
  const buf = Buffer.from(XOR_HEX, 'hex');
  return Buffer.from(buf.map((b, i) => b ^ XOR_KEY.charCodeAt(i % XOR_KEY.length))).toString('utf8');
}

function encryptSnapshot(snapshot) {
  if (ENCRYPTION_KEY.length !== 32) {
    return JSON.stringify(snapshot);
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(snapshot), 'utf8'),
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

function decryptSnapshot(content) {
  if (!content) return null;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.warn('[CloudSync] Failed to parse snapshot JSON:', e.message);
    return null;
  }

  // Handle plain snapshot JSON
  if (parsed && parsed.tables) {
    return parsed;
  }

  // Handle encrypted envelope version 2
  if (parsed && parsed.version === 2 && parsed.algorithm === 'aes-256-gcm') {
    if (ENCRYPTION_KEY.length !== 32) {
      console.warn('[CloudSync] Encrypted snapshot detected but CLOUD_SYNC_ENCRYPTION_KEY is not a valid 32-byte key.');
      return null;
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      ENCRYPTION_KEY,
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
    return JSON.parse(plaintext);
  }

  return parsed;
}

const SYNC_TABLES = [
  'departments',
  'schedules',
  'workplaces',
  'users',
  'company_settings',
  'holidays',
  'attendance_records',
  'attendance_corrections',
  'salary_advances',
  'employee_bonuses',
  'employee_deductions',
  'leave_requests',
  'permission_requests',
  'whatsapp_logs',
  'notifications',
  'company_shifts',
  'support_tickets',
  'branch_requests'
];

let initialLoadDone = false;
let lastSyncTime = 0;
let lastKnownUpdatedAt = null;
let syncInProgress = null;

function applySnapshotToDatabase(snapshot) {
  if (!snapshot || !snapshot.tables) return;

  try {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN IMMEDIATE;');

    for (const table of SYNC_TABLES) {
      const rows = snapshot.tables[table];
      if (!Array.isArray(rows)) continue;

      const validCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      if (validCols.length === 0) continue;

      if (table === 'company_settings') {
        // Merge settings so new default keys from code updates remain while user-configured values take priority
        const upsertStmt = db.prepare(`
          INSERT OR REPLACE INTO company_settings (key, value, category, description)
          VALUES (?, ?, ?, ?)
        `);
        for (const r of rows) {
          if (r && r.key !== undefined && r.value !== undefined) {
            upsertStmt.run(r.key, String(r.value), r.category || 'general', r.description || null);
          }
        }
        continue;
      }

      // Replace table rows with cloud state while respecting current schema columns
      db.exec(`DELETE FROM ${table};`);
      if (rows.length === 0) continue;

      const sampleCols = Object.keys(rows[0]).filter(k => validCols.includes(k));
      if (sampleCols.length === 0) continue;

      const placeholders = sampleCols.map(() => '?').join(', ');
      const insertStmt = db.prepare(
        `INSERT OR REPLACE INTO ${table} (${sampleCols.join(', ')}) VALUES (${placeholders})`
      );

      for (const row of rows) {
        const values = sampleCols.map(c => (row[c] === undefined ? null : row[c]));
        insertStmt.run(...values);
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    console.error('[CloudSync] Failed to apply snapshot:', err.message);
  } finally {
    try { db.exec('PRAGMA foreign_keys = ON;'); } catch (_) {}
    postSyncShiftAlignment();
  }
}

function postSyncShiftAlignment() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const shifts = db.prepare(`SELECT * FROM company_shifts WHERE is_active = 1`).all();
    if (!shifts || shifts.length === 0) return;

    const timeToMinutes = (t) => {
      if (!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const records = db.prepare(`
      SELECT ar.*, u.manager_id, w.schedule_mode
      FROM attendance_records ar
      JOIN users u ON ar.employee_id = u.id
      LEFT JOIN workplaces w ON (w.manager_id = u.manager_id OR (u.manager_id IS NULL AND w.manager_id = 1))
      WHERE ar.date = ? AND ar.check_out_time IS NOT NULL
    `).all(today);

    const updateStmt = db.prepare(`
      UPDATE attendance_records
      SET scheduled_start = ?, scheduled_end = ?, shift_id = ?, shift_name = ?, early_leave_minutes = ?, status = ?
      WHERE id = ?
    `);

    for (const rec of records) {
      if (rec.schedule_mode !== 'shifts' && !rec.shift_id) continue;

      let matched = null;
      if (rec.shift_id) {
        matched = shifts.find(s => s.id === rec.shift_id);
      }
      if (!matched && rec.shift_name) {
        matched = shifts.find(s => s.name === rec.shift_name);
      }
      if (!matched) {
        matched = shifts.find(s => {
          if (!s.assigned_employee_ids) return false;
          try {
            const ids = typeof s.assigned_employee_ids === 'string'
              ? (s.assigned_employee_ids.startsWith('[') ? JSON.parse(s.assigned_employee_ids) : s.assigned_employee_ids.split(',').map(Number))
              : s.assigned_employee_ids;
            return Array.isArray(ids) && ids.includes(rec.employee_id);
          } catch(e) { return false; }
        });
      }
      if (!matched) {
        const refMins = timeToMinutes(rec.check_in_time || rec.scheduled_start || '09:00');
        const mgrShifts = shifts.filter(s => s.manager_id === rec.manager_id || (rec.manager_id === 1 && !s.manager_id));
        const pool = mgrShifts.length > 0 ? mgrShifts : shifts;
        matched = pool.reduce((closest, s) => {
          const diff1 = Math.abs(timeToMinutes(s.start_time) - refMins);
          const diff2 = Math.abs(timeToMinutes(closest.start_time) - refMins);
          return diff1 < diff2 ? s : closest;
        }, pool[0]);
      }

      if (!matched) continue;

      const outMins = timeToMinutes(rec.check_out_time);
      const shiftEndMins = timeToMinutes(matched.end_time);
      const grace = matched.early_leave_grace_minutes || 0;

      let earlyLeave = 0;
      let status = rec.status;
      if (outMins < (shiftEndMins - grace)) {
        earlyLeave = shiftEndMins - outMins;
        if (status === 'On Time') status = 'Early Leave';
      } else {
        earlyLeave = 0;
        if (status === 'Early Leave') {
          status = (rec.late_minutes && rec.late_minutes > 0) ? 'Late' : 'On Time';
        }
      }

      updateStmt.run(
        matched.start_time,
        matched.end_time,
        matched.id,
        matched.name,
        earlyLeave,
        status,
        rec.id
      );
    }
  } catch (err) {
    console.warn('[CloudSync] postSyncShiftAlignment warning:', err.message);
  }
}

async function loadFromCloud(force = false) {
  if (!CLOUD_SYNC_ENABLED) return;

  const now = Date.now();
  if (!force && initialLoadDone && (now - lastSyncTime < 4000)) {
    return;
  }

  if (syncInProgress) {
    return syncInProgress;
  }

  syncInProgress = (async () => {
    try {
      const token = getSyncToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(GIST_ID)}?t=${now}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'mosaed-attendance-cloud',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`GitHub Gist load failed with status ${res.status}.`);

      const data = await res.json();
      const file = data.files && data.files['mosaed_cloud_db.json'];
      if (!file) return;

      let rawContent = file.content;
      if (file.truncated && file.raw_url) {
        const rawRes = await fetch(file.raw_url, {
          headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
        });
        if (rawRes.ok) {
          rawContent = await rawRes.text();
        } else {
          throw new Error(`GitHub Gist content load failed with status ${rawRes.status}.`);
        }
      }

      if (!rawContent) return;
      const snapshot = decryptSnapshot(rawContent);

      if (!initialLoadDone || force || snapshot.updatedAt !== lastKnownUpdatedAt) {
        applySnapshotToDatabase(snapshot);
        lastKnownUpdatedAt = snapshot.updatedAt;
      }
      initialLoadDone = true;
      lastSyncTime = Date.now();
    } catch (err) {
      console.warn('[CloudSync] Load warning:', err.message);
    } finally {
      syncInProgress = null;
    }
  })();

  return syncInProgress;
}

async function saveToCloud() {
  if (!CLOUD_SYNC_ENABLED) return;

  try {
    const userCount = db.prepare('SELECT count(*) as c FROM users').get().c;
    if (userCount === 0) {
      console.warn('[CloudSync] Refusing to save empty database to cloud.');
      return;
    }

    initialLoadDone = true;
    const token = getSyncToken();
    const updatedAt = new Date().toISOString();
    const snapshot = {
      updatedAt,
      version: 1,
      tables: {}
    };

    for (const table of SYNC_TABLES) {
      try {
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        snapshot.tables[table] = rows;
      } catch (_) {
        snapshot.tables[table] = [];
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(GIST_ID)}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'mosaed-attendance-cloud'
      },
      body: JSON.stringify({
        files: {
          'mosaed_cloud_db.json': {
            content: encryptSnapshot(snapshot)
          }
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      lastKnownUpdatedAt = updatedAt;
      lastSyncTime = Date.now();
      initialLoadDone = true;
    } else {
      throw new Error(`GitHub Gist save failed with status ${res.status}.`);
    }
  } catch (err) {
    console.warn('[CloudSync] Save warning:', err.message);
  }
}

async function cloudSyncMiddleware(req, res, next) {
  if (!CLOUD_SYNC_ENABLED || !req.path.startsWith('/api')) {
    return next();
  }

  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  const isAuthRoute = req.path.includes('/login') || req.path.includes('/register') || req.path.includes('/refresh');

  try {
    await loadFromCloud(isMutation && !isAuthRoute);
  } catch (error) {
    console.error('[CloudSync] Request-time load failed:', error.message);
  }

  if (isMutation && !isAuthRoute) {
    const origJson = res.json.bind(res);
    res.json = async function (body) {
      if (res.statusCode < 400 && (!body || body.success !== false)) {
        await saveToCloud();
      }
      return origJson(body);
    };
  }

  next();
}

module.exports = {
  loadFromCloud,
  saveToCloud,
  cloudSyncMiddleware
};
