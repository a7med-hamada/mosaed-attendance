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

// 1. Client IP resolution supporting Cloudflare, reverse proxies, and direct sockets
function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const cfConnectingIp = req.headers && (req.headers['cf-connecting-ip'] || req.headers['true-client-ip']);
  if (cfConnectingIp) {
    return String(cfConnectingIp).trim();
  }
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

// 2. Friendly Device Parser for login audit and alerts
function parseDeviceInfo(userAgent) {
  if (!userAgent || typeof userAgent !== 'string' || userAgent === 'غير معروف') {
    return 'جهاز غير محدد';
  }
  let os = 'كمبيوتر';
  if (/Android/i.test(userAgent)) os = 'هاتف أندرويد';
  else if (/iPhone/i.test(userAgent)) os = 'هاتف آيفون';
  else if (/iPad/i.test(userAgent)) os = 'جهاز آيباد';
  else if (/Windows/i.test(userAgent)) os = 'جهاز ويندوز';
  else if (/Macintosh|Mac OS X/i.test(userAgent)) os = 'جهاز ماك';
  else if (/Linux/i.test(userAgent)) os = 'نظام لينكس';

  let browser = 'متصفح ويب';
  if (/Edg\//i.test(userAgent)) browser = 'Edge';
  else if (/Chrome\//i.test(userAgent)) browser = 'Chrome';
  else if (/Firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) browser = 'Safari';

  return `${os} (${browser})`;
}

// 3. Strict Password Complexity Policy (NIST / OWASP aligned)
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'كلمة المرور مطلوبة' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'يجب أن لا تقل كلمة المرور عن 8 خانات' };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password);

  // Require uppercase, lowercase, and at least one number or special character
  if (!hasUpper || !hasLower || (!hasDigit && !hasSpecial)) {
    return {
      valid: false,
      error: 'يجب أن تتكون كلمة المرور من 8 خانات على الأقل، وتتضمن أحرفاً كبيرة (A-Z) وصغيرة (a-z) وأرقاماً (0-9) أو رموزاً خاصة'
    };
  }
  return { valid: true };
}

// 4. HttpOnly & Secure Cookie Helpers
function setAuthCookie(res, token) {
  if (!res || typeof res.cookie !== 'function') return;
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days matching JWT expiration
    path: '/'
  });
}

function clearAuthCookie(res) {
  if (!res || typeof res.clearCookie !== 'function') return;
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/'
  });
}

// 5. Dual Token Extractor (Authorization Bearer Header + HttpOnly Cookie + Query Token for Exports)
function extractToken(req) {
  if (!req) return null;
  const authHeader = req.headers && req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (authHeader && authHeader.split(' ')[1]) {
    return authHeader.split(' ')[1].trim();
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  if (req.headers && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  if (req.query && req.query.token && (req.path.includes('/export') || (req.baseUrl && req.baseUrl.includes('/export')) || (req.originalUrl && req.originalUrl.includes('/export')))) {
    return req.query.token;
  }
  return null;
}

module.exports = {
  JWT_SECRET,
  getSuperAdminConfig,
  getClientIp,
  parseDeviceInfo,
  validatePasswordStrength,
  setAuthCookie,
  clearAuthCookie,
  extractToken
};
