const express = require('express');
const { db } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const router = express.Router();

// GET /api/audit (Manager only)
router.get('/', authenticateToken, requireManager, (req, res) => {
  try {
    const { action, target_type, date_from, date_to, search } = req.query;

    let query = `
      SELECT
        a.*
      FROM audit_logs a
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      query += ` AND a.action = ? `;
      params.push(action);
    }
    if (target_type) {
      query += ` AND a.target_type = ? `;
      params.push(target_type);
    }
    if (date_from) {
      query += ` AND a.created_at >= ? `;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND a.created_at <= ? `;
      params.push(date_to + ' 23:59:59');
    }
    if (search) {
      query += ` AND (a.user_name LIKE ? OR a.reason LIKE ? OR a.action LIKE ?) `;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY a.created_at DESC LIMIT 200 `;

    const logs = db.prepare(query).all(...params);

    res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد سجل العمليات الرقابي' });
  }
});

module.exports = router;
