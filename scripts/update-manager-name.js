const { db } = require('../server/database');

const res = db.prepare(`UPDATE users SET full_name = 'محمد حماده' WHERE role = 'manager' AND (id = 1 OR email = 'admin@workforce.local')`).run();
console.log('Update result:', res);

const mgr = db.prepare(`SELECT id, full_name, email, role FROM users WHERE role = 'manager' AND id = 1`).get();
console.log('Manager in DB:', mgr);
