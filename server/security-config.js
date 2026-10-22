const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const configuredJwtSecret = process.env.JWT_SECRET;
const DEFAULT_JWT_SECRET = 'workforce-secret-super-key-2026-secure-jwt-token-string';
const JWT_SECRET = (configuredJwtSecret && configuredJwtSecret.length >= 16) ? configuredJwtSecret : DEFAULT_JWT_SECRET;

const DEFAULT_SUPERADMIN_HASH = bcrypt.hashSync('19931993', 10);

function getSuperAdminConfig() {
  const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@waqty.com').trim().toLowerCase();
  let passwordHash = process.env.SUPER_ADMIN_PASSWORD_HASH;
  if (!passwordHash || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
    passwordHash = DEFAULT_SUPERADMIN_HASH;
  }
  const jwtSecret = (process.env.SUPER_ADMIN_JWT_SECRET && process.env.SUPER_ADMIN_JWT_SECRET.length >= 16)
    ? process.env.SUPER_ADMIN_JWT_SECRET
    : JWT_SECRET;

  return { email, passwordHash, jwtSecret };
}

module.exports = { JWT_SECRET, getSuperAdminConfig };
