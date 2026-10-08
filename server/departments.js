const express = require('express');
const { db, logAudit } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const router = express.Router();

// GET /api/departments (all authenticated users can list)
router.get('/', authenticateToken, (req, res) => {
  try {
    const departments = db.prepare(`
      SELECT d.*, COUNT(u.id) as employee_count
      FROM departments d
      LEFT JOIN users u ON (d.id = u.department_id AND u.is_active = 1 AND u.role = 'employee')
      GROUP BY d.id
      ORDER BY d.id ASC
    `).all();

    res.json({ success: true, count: departments.length, departments });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد الأقسام' });
  }
});

// POST /api/departments (Manager only)
router.post('/', authenticateToken, requireManager, (req, res) => {
  try {
    const { name, description, manager_name } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'اسم القسم مطلوب' });
    }

    const stmt = db.prepare(`INSERT INTO departments (name, description, manager_name) VALUES (?, ?, ?)`);
    const result = stmt.run(name.trim(), description || null, manager_name || null);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'CREATE_DEPARTMENT', 'departments', result.lastInsertRowid, null, req.body, 'إضافة قسم جديد', clientIp);

    res.json({ success: true, message: 'تمت إضافة القسم بنجاح', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Add department error:', error);
    res.status(500).json({ success: false, error: 'فشل في إضافة القسم' });
  }
});

// PUT /api/departments/:id (Manager only)
router.put('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { name, description, manager_name } = req.body;

    const oldDept = db.prepare(`SELECT * FROM departments WHERE id = ?`).get(targetId);
    if (!oldDept) {
      return res.status(404).json({ success: false, error: 'القسم غير موجود' });
    }

    db.prepare(`UPDATE departments SET name = ?, description = ?, manager_name = ? WHERE id = ?`).run(
      name || oldDept.name,
      description !== undefined ? description : oldDept.description,
      manager_name !== undefined ? manager_name : oldDept.manager_name,
      targetId
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'UPDATE_DEPARTMENT', 'departments', targetId, oldDept, req.body, 'تعديل بيانات القسم', clientIp);

    res.json({ success: true, message: 'تم تعديل القسم بنجاح' });
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ success: false, error: 'فشل في تعديل القسم' });
  }
});

// DELETE /api/departments/:id (Manager only)
router.delete('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const oldDept = db.prepare(`SELECT * FROM departments WHERE id = ?`).get(targetId);
    if (!oldDept) {
      return res.status(404).json({ success: false, error: 'القسم غير موجود' });
    }

    // Set department_id to NULL for employees in this dept
    db.prepare(`UPDATE users SET department_id = NULL WHERE department_id = ?`).run(targetId);
    db.prepare(`DELETE FROM departments WHERE id = ?`).run(targetId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(req.user.id, req.user.full_name, 'DELETE_DEPARTMENT', 'departments', targetId, oldDept, null, 'حذف قسم', clientIp);

    res.json({ success: true, message: 'تم حذف القسم بنجاح' });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف القسم' });
  }
});

module.exports = router;
