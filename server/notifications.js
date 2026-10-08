const express = require('express');
const { db } = require('./database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/notifications
router.get('/', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    let query = `SELECT * FROM notifications WHERE `;
    const params = [];

    if (isManager) {
      // Manager sees system notifications (user_id IS NULL) or specifically for them
      query += `(user_id IS NULL OR user_id = ?)`;
      params.push(req.user.id);
    } else {
      query += `user_id = ?`;
      params.push(req.user.id);
    }

    query += ` ORDER BY created_at DESC LIMIT 50`;

    const notifications = db.prepare(query).all(...params);
    const unreadCount = notifications.filter(n => n.is_read === 0).length;

    res.json({ success: true, count: notifications.length, unreadCount, notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد الإشعارات' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticateToken, (req, res) => {
  try {
    const notifId = req.params.id;
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(notifId);
    res.json({ success: true, message: 'تم تحديث حالة الإشعار' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث الإشعار' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    if (isManager) {
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id IS NULL OR user_id = ?`).run(req.user.id);
    } else {
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user.id);
    }
    res.json({ success: true, message: 'تم تحديد جميع الإشعارات كمقروءة' });
  } catch (error) {
    console.error('Read all error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحديث الإشعارات' });
  }
});

// DELETE /api/notifications/clear-all (Clear all notifications for user)
router.delete('/clear-all', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    if (isManager) {
      db.prepare(`DELETE FROM notifications WHERE user_id IS NULL OR user_id = ?`).run(req.user.id);
    } else {
      db.prepare(`DELETE FROM notifications WHERE user_id = ?`).run(req.user.id);
    }
    res.json({ success: true, message: 'تم مسح جميع الإشعارات بنجاح' });
  } catch (error) {
    console.error('Clear all notifications error:', error);
    res.status(500).json({ success: false, error: 'فشل في مسح الإشعارات' });
  }
});

// DELETE /api/notifications/:id (Delete single notification)
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const notifId = parseInt(req.params.id, 10);
    db.prepare(`DELETE FROM notifications WHERE id = ?`).run(notifId);
    res.json({ success: true, message: 'تم حذف الإشعار' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف الإشعار' });
  }
});

module.exports = router;
