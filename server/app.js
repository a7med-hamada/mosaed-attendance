const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const { seedDatabase } = require('./seed');
const authModule = require('./auth');
const attendanceRouter = require('./attendance');
const correctionsRouter = require('./corrections');
const employeesRouter = require('./employees');
const departmentsRouter = require('./departments');
const schedulesRouter = require('./schedules');
const settingsRouter = require('./settings');
const reportsRouter = require('./reports');
const notificationsRouter = require('./notifications');
const auditRouter = require('./audit');
const { advancesRouter, bonusesRouter } = require('./advances-bonuses');
const { leavesRouter, permissionsRouter } = require('./leaves-permissions');
const whatsappModule = require('./whatsapp');
const superAdminRouter = require('./super-admin');
const supportModule = require('./support');
const { cloudSyncMiddleware, loadFromCloud } = require('./cloud-sync');

// Auto seed on boot
seedDatabase();
loadFromCloud(true).catch(() => {});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Support large body for camera selfies in base64
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static files directory
const publicDir = path.join(__dirname, '..', 'public');

// Dedicated secret URL routes for Platform Owner Dashboard (strictly isolated from main site navigation)
app.use((req, res, next) => {
  const normPath = req.path.toLowerCase().replace(/\/+$/, '');
  if (
    normPath === '/super-admin' ||
    normPath === '/super-admin/index.html' ||
    normPath === '/super-admin.html' ||
    normPath === '/owner' ||
    normPath === '/owner/index.html' ||
    normPath === '/owner-portal' ||
    normPath === '/owner-portal/index.html' ||
    normPath === '/platform-admin'
  ) {
    const targetFile = fs.existsSync(path.join(publicDir, 'super-admin', 'index.html'))
      ? path.join(publicDir, 'super-admin', 'index.html')
      : path.join(publicDir, 'super-admin.html');
    return res.sendFile(targetFile, { dotfiles: 'allow' });
  }
  next();
});

// Serve static assets
app.use(express.static(publicDir));
app.use('/uploads', express.static(path.join(publicDir, 'uploads')));

// Cloud Persistence Sync Middleware (preserves all settings, attendance check-in/out, and user data across deployments)
app.use(cloudSyncMiddleware);

// API Routes
app.use('/api/auth', authModule.router);
app.use('/api/attendance', attendanceRouter);
app.use('/api/corrections', correctionsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/advances', advancesRouter);
app.use('/api/bonuses', bonusesRouter);
app.use('/api/leaves', leavesRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/whatsapp', whatsappModule.router);
app.use('/api/super-admin', superAdminRouter);
app.use('/api/support', supportModule.router);

// Fallback to SPA index.html
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'نقطة النهاية غير موجودة' });
  }
  res.sendFile(path.join(publicDir, 'index.html'), { dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Workforce Attendance & HR System is running!`);
  console.log(`📡 URL: http://0.0.0.0:${PORT}`);
  console.log(`👑 Admin Login:    admin@workforce.local  / admin123`);
  console.log(`👤 Employee Login: sara@workforce.local   / emp123`);
  console.log(`=======================================================`);
});

module.exports = app;
