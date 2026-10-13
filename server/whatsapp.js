const express = require('express');
const { db, getTodayString } = require('./database');
const { authenticateToken, requireManager } = require('./auth');

const router = express.Router();

// Helper to format Egyptian & international phone numbers for WhatsApp
function formatPhoneForWhatsApp(rawPhone) {
  if (!rawPhone) return '';
  let cleaned = String(rawPhone).trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  
  // Egyptian mobile numbers (11 digits starting with 010, 011, 012, 015)
  if (/^01[0125][0-9]{8}$/.test(cleaned)) {
    return '2' + cleaned; // e.g. 201097026035
  }
  // Egyptian mobile without leading 0 (10 digits starting with 10, 11, 12, 15)
  if (/^1[0125][0-9]{8}$/.test(cleaned)) {
    return '20' + cleaned;
  }
  // If already starts with 201 and is 12 digits
  if (/^201[0125][0-9]{8}$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

// Helper to generate direct WhatsApp link (opens on mobile or WhatsApp Web/Desktop)
function generateWhatsAppLink(phone, messageText) {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(messageText);
  return `https://wa.me/${formattedPhone}?text=${encoded}`;
}

// Helper to format time as 12-hour (ص / م)
function formatTime12(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === 'null') return '-';
  const parts = String(timeStr).trim().split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');
    if (!isNaN(hours)) {
      const period = hours >= 12 ? 'م' : 'ص';
      hours = hours % 12 || 12;
      return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
    }
  }
  return timeStr;
}

// Helper to retrieve company WhatsApp settings
function getWhatsAppSettings() {
  const settingsRows = db.prepare(`SELECT key, value FROM company_settings WHERE category = 'whatsapp' OR key IN ('company_name')`).all();
  const settings = {
    whatsapp_enabled: '1',
    whatsapp_provider: 'direct',
    whatsapp_api_url: '',
    whatsapp_instance_id: '',
    whatsapp_api_token: '',
    whatsapp_manager_phone: '01227580963',
    whatsapp_auto_late_alert: '1',
    company_name: 'وقتي - WAQTY'
  };
  settingsRows.forEach(r => {
    settings[r.key] = r.value;
  });
  return settings;
}

// Log WhatsApp message in database
function logWhatsAppMessage({ phone, name, role, type, message, status, details }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO whatsapp_logs (recipient_phone, recipient_name, recipient_role, message_type, message_text, status, response_details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      phone || 'unknown',
      name || 'غير معروف',
      role || 'employee',
      type || 'custom',
      message || '',
      status || 'sent',
      details ? JSON.stringify(details) : null
    );
    return info.lastInsertRowid;
  } catch (err) {
    console.error('Failed to log WhatsApp message:', err);
    return null;
  }
}

// Dispatch message: either via external API (UltraMsg/GreenAPI/Custom) or direct link
async function sendWhatsAppMessage({ phone, name, role = 'employee', type = 'custom', message }) {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  const waLink = generateWhatsAppLink(phone, message);
  const settings = getWhatsAppSettings();

  if (settings.whatsapp_enabled !== '1') {
    return { success: false, error: 'خدمة إشعارات الواتساب معطلة حالياً', waLink };
  }

  // If configured with an external API provider and token exists
  if (settings.whatsapp_provider !== 'direct' && settings.whatsapp_api_token) {
    try {
      let apiUrl = settings.whatsapp_api_url;
      let headers = { 'Content-Type': 'application/json' };
      let body;

      if (settings.whatsapp_provider === 'ultramsg') {
        const instance = settings.whatsapp_instance_id;
        apiUrl = apiUrl || `https://api.ultramsg.com/${instance}/messages/chat`;
        headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        body = new URLSearchParams({
          token: settings.whatsapp_api_token,
          to: '+' + formattedPhone,
          body: message
        }).toString();
      } else if (settings.whatsapp_provider === 'greenapi') {
        const instance = settings.whatsapp_instance_id;
        apiUrl = apiUrl || `https://api.green-api.com/waInstance${instance}/sendMessage/${settings.whatsapp_api_token}`;
        body = JSON.stringify({
          chatId: `${formattedPhone}@c.us`,
          message: message
        });
      } else {
        // Custom gateway
        body = JSON.stringify({
          phone: formattedPhone,
          message: message
        });
        headers['Authorization'] = `Bearer ${settings.whatsapp_api_token}`;
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body
      });
      const resJson = await res.json().catch(() => ({ status: res.status }));

      logWhatsAppMessage({
        phone: formattedPhone,
        name,
        role,
        type,
        message,
        status: res.ok ? 'sent' : 'failed',
        details: resJson
      });

      return {
        success: res.ok,
        provider: settings.whatsapp_provider,
        apiDelivered: res.ok,
        waLink,
        phone: formattedPhone
      };
    } catch (apiErr) {
      console.error('WhatsApp API dispatch error:', apiErr);
      logWhatsAppMessage({
        phone: formattedPhone,
        name,
        role,
        type,
        message,
        status: 'failed',
        details: { error: apiErr.message }
      });
      // Fallback to direct link
      return {
        success: false,
        apiDelivered: false,
        error: apiErr.message,
        waLink,
        phone: formattedPhone
      };
    }
  }

  // Default / Direct Link mode (Zero cost, instant WhatsApp Web / App opener)
  logWhatsAppMessage({
    phone: formattedPhone,
    name,
    role,
    type,
    message,
    status: 'direct_ready',
    details: { mode: 'direct_link' }
  });

  return {
    success: true,
    provider: 'direct',
    apiDelivered: false,
    waLink,
    phone: formattedPhone
  };
}

// -------------------------------------------------------------
// Message Template Builders
// -------------------------------------------------------------

function buildLateAlertMessage(employeeName, lateMinutes, deduction, checkInTime) {
  const timeStr = formatTime12(checkInTime);
  return `صباح الخير ${employeeName || ''} ☀️\n` +
    `تم تسجيل حضورك اليوم ${timeStr ? `(الساعة ${timeStr})` : ''} متأخراً ${lateMinutes} دقيقة - الخصم المطبق ${deduction} ج.م.\n\n` +
    `نتمنى لك يوماً موفقاً ومثمراً في العمل! 💼`;
}

function buildMorningBriefingMessage(companyName, date, stats, lateList, absentList, onLeaveList = [], topEmployee = null) {
  let msg = `🏢 *تقرير الصباح اليومي - ${companyName || 'حضور وانصراف الشركة'}*\n`;
  msg += `📅 *التاريخ:* ${date}\n\n`;
  msg += `📊 *ملخص حضور اليوم:*\n`;
  msg += `👥 إجمالي الموظفين: ${stats.total}\n`;
  msg += `✅ الحضور في الموعد: ${stats.onTime}\n`;
  msg += `⏰ المتأخرين: ${lateList.length}\n`;
  msg += `🌴 إجازات معتمدة: ${onLeaveList.length}\n`;
  msg += `❌ لم يحضروا بعد / غياب: ${absentList.length}\n\n`;

  if (topEmployee && topEmployee.score >= 70) {
    msg += `🌟 *الموظف الأكثر التزاماً لهذا الشهر:*\n`;
    msg += `• *${topEmployee.name}* (نسبة الالتزام: ${topEmployee.score}% - الحضور في الموعد: ${topEmployee.onTimeDays || topEmployee.streak || 0} يوم)\n\n`;
  }

  if (lateList.length > 0) {
    msg += `⏰ *تفاصيل المتأخرين:*\n`;
    lateList.forEach(emp => {
      msg += `• *${emp.name}*: تأخير ${emp.lateMinutes} دقيقة (حضور ${emp.time12}) - خصم ${emp.deduction} ج.م\n`;
    });
    msg += `\n`;
  } else {
    msg += `⏰ *المتأخرين:* لا يوجد متأخرين اليوم 🎉\n\n`;
  }

  if (onLeaveList.length > 0) {
    msg += `🌴 *الموظفون في إجازة معتمدة اليوم:*\n`;
    onLeaveList.forEach(emp => {
      const typeLabel = emp.leaveType === 'sick' ? 'إجازة مرضية' : emp.leaveType === 'casual' ? 'إجازة عارضة' : 'إجازة سنوية';
      msg += `• *${emp.name}*: ${typeLabel} معتمدة ✓\n`;
    });
    msg += `\n`;
  }

  if (absentList.length > 0) {
    msg += `❌ *قائمة من لم يسجلوا الحضور بعد (غياب بدون إذن):*\n`;
    absentList.forEach(emp => {
      msg += `• *${emp.name}* (${emp.code})${emp.phone ? ` - 📞 ${emp.phone}` : ''}\n`;
    });
    msg += `\n`;
  } else {
    msg += `🌟 *اكتمل حضور جميع الموظفين اليوم بنجاح!*\n\n`;
  }

  msg += `_تم الإرسال آلياً عبر نظام الحضور الذكي 🚀_`;
  return msg;
}

function buildPayslipMessage(companyName, month, emp) {
  return `📋 *كشف مفردات الراتب - ${companyName || 'الشركة'}*\n` +
    `📅 *شهر:* ${month}\n\n` +
    `👤 *الموظف:* ${emp.name}\n` +
    `🏷️ *الكود:* ${emp.code}\n` +
    `💼 *الوظيفة:* ${emp.jobTitle || 'موظف'}\n` +
    `══════════════════\n` +
    `💰 *الراتب الأساسي:* ${emp.baseSalary} ج.م\n` +
    `📅 *أيام الحضور:* ${emp.presentDays} يوم\n` +
    `🎁 *المكافآت والحوافز:* +${emp.bonuses} ج.م\n` +
    `⚠️ *الخصومات وجزاءات التأخير:* -${emp.deductions} ج.م\n` +
    `💳 *السلف المستقطعة:* -${emp.advances} ج.م\n` +
    `══════════════════\n` +
    `💵 *صافي الراتب المستحق:* *${emp.netSalary} ج.م*\n` +
    (emp.netSalaryTafqeet ? `(${emp.netSalaryTafqeet})\n` : '') +
    `══════════════════\n` +
    `مع خالص تحيات الإدارة وتمنياتنا لك بالتوفيق الدائم! 🌟`;
}

// -------------------------------------------------------------
// Routes
// -------------------------------------------------------------

// GET /api/whatsapp/settings
router.get('/settings', authenticateToken, requireManager, (req, res) => {
  try {
    const settings = getWhatsAppSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في استرداد إعدادات الواتساب' });
  }
});

// PUT /api/whatsapp/settings
router.put('/settings', authenticateToken, requireManager, (req, res) => {
  try {
    const {
      whatsapp_enabled,
      whatsapp_provider,
      whatsapp_api_url,
      whatsapp_instance_id,
      whatsapp_api_token,
      whatsapp_manager_phone,
      whatsapp_auto_late_alert
    } = req.body;

    const updates = [
      { key: 'whatsapp_enabled', val: whatsapp_enabled !== undefined ? String(whatsapp_enabled) : '1' },
      { key: 'whatsapp_provider', val: whatsapp_provider || 'direct' },
      { key: 'whatsapp_api_url', val: whatsapp_api_url || '' },
      { key: 'whatsapp_instance_id', val: whatsapp_instance_id || '' },
      { key: 'whatsapp_api_token', val: whatsapp_api_token || '' },
      { key: 'whatsapp_manager_phone', val: whatsapp_manager_phone || '' },
      { key: 'whatsapp_auto_late_alert', val: whatsapp_auto_late_alert !== undefined ? String(whatsapp_auto_late_alert) : '1' }
    ];

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO company_settings (key, value, category, description)
      VALUES (?, ?, 'whatsapp', 'WhatsApp Notification Setting')
    `);

    updates.forEach(u => stmt.run(u.key, u.val));

    res.json({ success: true, message: 'تم حفظ إعدادات الواتساب بنجاح' });
  } catch (error) {
    console.error('Save WhatsApp settings error:', error);
    res.status(500).json({ success: false, error: 'فشل في حفظ إعدادات الواتساب' });
  }
});

// GET /api/whatsapp/morning-briefing (Preview & generate data)
router.get('/morning-briefing', authenticateToken, requireManager, (req, res) => {
  try {
    const today = req.query.date || getTodayString();
    const settings = getWhatsAppSettings();

    // Active employees for this manager
    const employees = db.prepare(`
      SELECT id, employee_code, full_name, phone, job_title
      FROM users
      WHERE role = 'employee' AND is_active = 1
      ORDER BY full_name ASC
    `).all();

    // Today's attendance records
    const records = db.prepare(`
      SELECT employee_id, check_in_time, status, late_minutes, estimated_deduction
      FROM attendance_records
      WHERE date = ?
    `).all(today);

    const recordMap = new Map();
    records.forEach(r => recordMap.set(r.employee_id, r));

    let onTimeCount = 0;
    const lateList = [];
    const absentList = [];
    const onLeaveList = [];

    employees.forEach(emp => {
      const rec = recordMap.get(emp.id);
      const approvedLeave = db.prepare(`
        SELECT leave_type FROM leave_requests
        WHERE employee_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
      `).get(emp.id, today);

      if (approvedLeave) {
        onLeaveList.push({
          id: emp.id,
          name: emp.full_name,
          code: emp.employee_code,
          phone: emp.phone,
          leaveType: approvedLeave.leave_type
        });
      } else if (!rec || !rec.check_in_time) {
        absentList.push({
          id: emp.id,
          name: emp.full_name,
          code: emp.employee_code,
          phone: emp.phone
        });
      } else if (rec.status === 'Late' || rec.late_minutes > 0 || rec.status === 'Half Day') {
        lateList.push({
          id: emp.id,
          name: emp.full_name,
          code: emp.employee_code,
          phone: emp.phone,
          time12: formatTime12(rec.check_in_time),
          lateMinutes: rec.late_minutes || 0,
          deduction: rec.estimated_deduction || 0
        });
      } else {
        onTimeCount++;
      }
    });

    const stats = {
      total: employees.length,
      present: records.length,
      onTime: onTimeCount,
      late: lateList.length,
      onLeave: onLeaveList.length,
      absent: absentList.length
    };

    let topEmployee = null;
    try {
      const reportsModule = require('./reports');
      if (reportsModule.getLeaderboardData) {
        const lb = reportsModule.getLeaderboardData(today.substring(0, 7), req.user.id);
        if (lb && lb.employeeOfTheMonth && lb.employeeOfTheMonth.score >= 70) {
          topEmployee = {
            name: lb.employeeOfTheMonth.employee.full_name,
            score: lb.employeeOfTheMonth.score,
            streak: lb.employeeOfTheMonth.streak
          };
        }
      }
    } catch (lbErr) {
      // Non-fatal
    }

    const messageText = buildMorningBriefingMessage(settings.company_name, today, stats, lateList, absentList, onLeaveList, topEmployee);
    const managerPhone = settings.whatsapp_manager_phone || req.user.phone || '01227580963';
    const waLink = generateWhatsAppLink(managerPhone, messageText);

    res.json({
      success: true,
      today,
      managerPhone,
      stats,
      lateList,
      absentList,
      topEmployee,
      messageText,
      waLink
    });
  } catch (error) {
    console.error('Morning briefing error:', error);
    res.status(500).json({ success: false, error: 'فشل في إعداد تقرير الصباح' });
  }
});

// POST /api/whatsapp/morning-briefing/send
router.post('/morning-briefing/send', authenticateToken, requireManager, async (req, res) => {
  try {
    const today = req.body.date || getTodayString();
    const settings = getWhatsAppSettings();

    const employees = db.prepare(`SELECT id, employee_code, full_name, phone FROM users WHERE role = 'employee' AND is_active = 1`).all();
    const records = db.prepare(`SELECT employee_id, check_in_time, status, late_minutes, estimated_deduction FROM attendance_records WHERE date = ?`).all(today);

    const recordMap = new Map();
    records.forEach(r => recordMap.set(r.employee_id, r));

    let onTimeCount = 0;
    const lateList = [];
    const absentList = [];
    const onLeaveList = [];

    employees.forEach(emp => {
      const rec = recordMap.get(emp.id);
      const approvedLeave = db.prepare(`
        SELECT leave_type FROM leave_requests
        WHERE employee_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
      `).get(emp.id, today);

      if (approvedLeave) {
        onLeaveList.push({
          id: emp.id,
          name: emp.full_name,
          code: emp.employee_code,
          phone: emp.phone,
          leaveType: approvedLeave.leave_type
        });
      } else if (!rec || !rec.check_in_time) {
        absentList.push({ id: emp.id, name: emp.full_name, code: emp.employee_code, phone: emp.phone });
      } else if (rec.status === 'Late' || rec.late_minutes > 0 || rec.status === 'Half Day') {
        lateList.push({
          id: emp.id,
          name: emp.full_name,
          code: emp.employee_code,
          phone: emp.phone,
          time12: formatTime12(rec.check_in_time),
          lateMinutes: rec.late_minutes || 0,
          deduction: rec.estimated_deduction || 0
        });
      } else {
        onTimeCount++;
      }
    });

    const stats = {
      total: employees.length,
      present: records.length,
      onTime: onTimeCount,
      late: lateList.length,
      onLeave: onLeaveList.length,
      absent: absentList.length
    };

    let topEmployee = null;
    try {
      const reportsModule = require('./reports');
      if (reportsModule.getLeaderboardData) {
        const lb = reportsModule.getLeaderboardData(today.substring(0, 7), req.user.id);
        if (lb && lb.employeeOfTheMonth && lb.employeeOfTheMonth.score >= 70) {
          topEmployee = {
            name: lb.employeeOfTheMonth.employee.full_name,
            score: lb.employeeOfTheMonth.score,
            streak: lb.employeeOfTheMonth.streak
          };
        }
      }
    } catch (lbErr) {
      // Non-fatal
    }

    const messageText = buildMorningBriefingMessage(settings.company_name, today, stats, lateList, absentList, onLeaveList, topEmployee);
    const targetPhone = req.body.phone || settings.whatsapp_manager_phone || req.user.phone || '01227580963';

    const dispatchResult = await sendWhatsAppMessage({
      phone: targetPhone,
      name: req.user.full_name,
      role: 'manager',
      type: 'morning_briefing',
      message: messageText
    });

    res.json({
      success: true,
      message: dispatchResult.apiDelivered ? 'تم إرسال تقرير الصباح للمدير بنجاح عبر الواتساب' : 'تم تجهيز تقرير الصباح ورابط الواتساب بنجاح',
      dispatchResult,
      messageText,
      waLink: dispatchResult.waLink
    });
  } catch (error) {
    console.error('Send morning briefing error:', error);
    res.status(500).json({ success: false, error: 'فشل في إرسال تقرير الصباح' });
  }
});

// POST /api/whatsapp/send-payslip (Single Employee)
router.post('/send-payslip', authenticateToken, requireManager, async (req, res) => {
  try {
    const { employee_id, month, tafqeet } = req.body;
    if (!employee_id || !month) {
      return res.status(400).json({ success: false, error: 'معرف الموظف والشهر مطلوبان' });
    }

    const emp = db.prepare(`
      SELECT id, employee_code, full_name, phone, job_title, base_salary
      FROM users WHERE id = ?
    `).get(employee_id);

    if (!emp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    if (!emp.phone) {
      return res.status(400).json({ success: false, error: `لا يوجد رقم هاتف مسجل للموظف ${emp.full_name}` });
    }

    // Attendance stats for month
    const attRecords = db.prepare(`
      SELECT status, estimated_deduction
      FROM attendance_records
      WHERE employee_id = ? AND date LIKE ?
    `).all(employee_id, `${month}-%`);

    const presentDays = attRecords.filter(r => r.status !== 'Absent').length;
    let totalDeductions = 0;
    attRecords.forEach(r => totalDeductions += (r.estimated_deduction || 0));

    // Advances
    const advRow = db.prepare(`
      SELECT SUM(amount) as total FROM salary_advances
      WHERE employee_id = ? AND month = ? AND status = 'approved'
    `).get(employee_id, month);
    const totalAdvances = advRow && advRow.total ? parseFloat(advRow.total) : 0;

    // Bonuses
    const bonRow = db.prepare(`
      SELECT SUM(amount) as total FROM employee_bonuses
      WHERE employee_id = ? AND month = ?
    `).get(employee_id, month);
    const totalBonuses = bonRow && bonRow.total ? parseFloat(bonRow.total) : 0;

    const baseSalary = parseFloat(emp.base_salary || 0);
    const netSalary = Math.max(0, parseFloat((baseSalary + totalBonuses - totalDeductions - totalAdvances).toFixed(2)));

    const settings = getWhatsAppSettings();
    const messageText = buildPayslipMessage(settings.company_name, month, {
      name: emp.full_name,
      code: emp.employee_code,
      jobTitle: emp.job_title,
      baseSalary: baseSalary.toLocaleString('en-US'),
      presentDays,
      bonuses: totalBonuses.toLocaleString('en-US'),
      deductions: totalDeductions.toLocaleString('en-US'),
      advances: totalAdvances.toLocaleString('en-US'),
      netSalary: netSalary.toLocaleString('en-US'),
      netSalaryTafqeet: tafqeet || ''
    });

    const dispatchResult = await sendWhatsAppMessage({
      phone: emp.phone,
      name: emp.full_name,
      role: 'employee',
      type: 'payslip',
      message: messageText
    });

    res.json({
      success: true,
      message: dispatchResult.apiDelivered ? `تم إرسال كشف الراتب للموظف ${emp.full_name} بنجاح` : `تم تجهيز كشف الراتب ورابط الواتساب للموظف ${emp.full_name}`,
      dispatchResult,
      waLink: dispatchResult.waLink,
      messageText
    });
  } catch (error) {
    console.error('Send payslip error:', error);
    res.status(500).json({ success: false, error: 'فشل في إرسال كشف الراتب' });
  }
});

// POST /api/whatsapp/send-all-payslips (Bulk Send)
router.post('/send-all-payslips', authenticateToken, requireManager, async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) {
      return res.status(400).json({ success: false, error: 'الشهر مطلوب' });
    }

    const employees = db.prepare(`
      SELECT id, employee_code, full_name, phone, job_title, base_salary
      FROM users WHERE role = 'employee' AND is_active = 1
    `).all();

    const settings = getWhatsAppSettings();
    const results = [];

    for (const emp of employees) {
      if (!emp.phone) {
        results.push({ name: emp.full_name, phone: null, status: 'skipped', error: 'لا يوجد رقم هاتف' });
        continue;
      }

      const attRecords = db.prepare(`
        SELECT status, estimated_deduction
        FROM attendance_records
        WHERE employee_id = ? AND date LIKE ?
      `).all(emp.id, `${month}-%`);

      const presentDays = attRecords.filter(r => r.status !== 'Absent').length;
      let totalDeductions = 0;
      attRecords.forEach(r => totalDeductions += (r.estimated_deduction || 0));

      const advRow = db.prepare(`
        SELECT SUM(amount) as total FROM salary_advances
        WHERE employee_id = ? AND month = ? AND status = 'approved'
      `).get(emp.id, month);
      const totalAdvances = advRow && advRow.total ? parseFloat(advRow.total) : 0;

      const bonRow = db.prepare(`
        SELECT SUM(amount) as total FROM employee_bonuses
        WHERE employee_id = ? AND month = ?
      `).get(emp.id, month);
      const totalBonuses = bonRow && bonRow.total ? parseFloat(bonRow.total) : 0;

      const baseSalary = parseFloat(emp.base_salary || 0);
      const netSalary = Math.max(0, parseFloat((baseSalary + totalBonuses - totalDeductions - totalAdvances).toFixed(2)));

      const messageText = buildPayslipMessage(settings.company_name, month, {
        name: emp.full_name,
        code: emp.employee_code,
        jobTitle: emp.job_title,
        baseSalary: baseSalary.toLocaleString('en-US'),
        presentDays,
        bonuses: totalBonuses.toLocaleString('en-US'),
        deductions: totalDeductions.toLocaleString('en-US'),
        advances: totalAdvances.toLocaleString('en-US'),
        netSalary: netSalary.toLocaleString('en-US')
      });

      const dispatchResult = await sendWhatsAppMessage({
        phone: emp.phone,
        name: emp.full_name,
        role: 'employee',
        type: 'payslip',
        message: messageText
      });

      results.push({
        id: emp.id,
        name: emp.full_name,
        phone: emp.phone,
        status: dispatchResult.apiDelivered ? 'sent' : 'direct_ready',
        waLink: dispatchResult.waLink
      });
    }

    res.json({
      success: true,
      message: `تم تجهيز كشوف الرواتب لعدد ${results.length} موظف بنجاح`,
      results
    });
  } catch (error) {
    console.error('Send all payslips error:', error);
    res.status(500).json({ success: false, error: 'فشل في إرسال كشوف الرواتب للجميع' });
  }
});

// POST /api/whatsapp/test (Test message)
router.post('/test', authenticateToken, requireManager, async (req, res) => {
  try {
    const { phone } = req.body;
    const targetPhone = phone || '01227580963';
    const message = `👋 مرحباً بك! هذه رسالة تجريبية من نظام وقتي (WAQTY) لإدارة الحضور والانصراف للتأكد من اتصال خدمة إشعارات الواتساب بنجاح 🚀`;

    const dispatch = await sendWhatsAppMessage({
      phone: targetPhone,
      name: 'تجربة النظام',
      role: 'manager',
      type: 'test',
      message
    });

    res.json({
      success: true,
      message: dispatch.apiDelivered ? 'تم إرسال الرسالة التجريبية بنجاح عبر بوابة الواتساب' : 'تم إنشاء رابط الرسالة التجريبية بنجاح',
      dispatch,
      waLink: dispatch.waLink
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/whatsapp/logs (Recent WhatsApp logs)
router.get('/logs', authenticateToken, requireManager, (req, res) => {
  try {
    const logs = db.prepare(`SELECT * FROM whatsapp_logs ORDER BY created_at DESC LIMIT 50`).all();
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'فشل في استرداد سجل الواتساب' });
  }
});

module.exports = {
  router,
  formatPhoneForWhatsApp,
  generateWhatsAppLink,
  sendWhatsAppMessage,
  formatTime12,
  buildLateAlertMessage,
  buildMorningBriefingMessage,
  buildPayslipMessage,
  getWhatsAppSettings
};
