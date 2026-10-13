const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, logAudit, createNotification, calculateHaversineDistance, uploadsDir, getTodayString, getCurrentTimeString } = require('./database');
const { authenticateToken, requireManager } = require('./auth');
const {
  sendWhatsAppMessage,
  buildLateAlertMessage,
  getWhatsAppSettings,
  generateWhatsAppLink
} = require('./whatsapp');

const router = express.Router();

// Helper to parse "HH:MM" or "HH:MM:SS" into minutes from midnight
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

// Save base64 photo (returns data URI for cloud persistence and optionally saves to disk locally)
function saveBase64Image(base64Data, prefix = 'att') {
  if (!base64Data) return null;
  try {
    if (!process.env.VERCEL) {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer;
      let ext = 'jpg';
      if (matches && matches.length === 3) {
        ext = matches[1].includes('png') ? 'png' : 'jpg';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(base64Data, 'base64');
      }
      const fileName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
      const filePath = path.join(uploadsDir, fileName);
      fs.writeFileSync(filePath, buffer);
    }
  } catch (err) {
    // Ignore local disk write error on read-only environments
  }
  return base64Data.startsWith('data:image') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
}

// Automatic absence check logic
function checkAndMarkAutoAbsences() {
  try {
    const today = getTodayString();
    const currentTime = getCurrentTimeString();
    const currentMins = timeToMinutes(currentTime);

    // Get all active employees with their schedules
    const employees = db.prepare(`
      SELECT u.id, u.full_name, u.schedule_id,
             COALESCE(s.start_time, '09:00') as start_time,
             COALESCE(s.end_time, '17:00') as end_time,
             COALESCE(s.absence_threshold, '13:00') as absence_threshold,
             COALESCE(s.working_days, '0,1,2,3,4') as working_days
      FROM users u
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE u.is_active = 1 AND u.role = 'employee'
    `).all();

    const dayOfWeek = String(new Date(today + 'T12:00:00').getDay());
    const absenceRateSetting = db.prepare(`SELECT value FROM company_settings WHERE key = 'deduction_absence_rate'`).get();
    const absenceDeduction = absenceRateSetting ? parseFloat(absenceRateSetting.value) : 250;

    for (const emp of employees) {
      // Check if today is a working day for this employee
      const workingDays = emp.working_days.split(',');
      if (!workingDays.includes(dayOfWeek)) continue;

      // Check if employee has an approved leave today
      const approvedLeave = db.prepare(`
        SELECT id, leave_type FROM leave_requests
        WHERE employee_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
      `).get(emp.id, today);

      if (approvedLeave) {
        const existing = db.prepare(`SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?`).get(emp.id, today);
        if (!existing) {
          const leaveLabel = approvedLeave.leave_type === 'sick' ? 'إجازة مرضية معتمدة' :
                             approvedLeave.leave_type === 'annual' ? 'إجازة سنوية معتمدة' :
                             approvedLeave.leave_type === 'casual' ? 'إجازة عارضة معتمدة' : 'إجازة رسمية معتمدة';
          db.prepare(`
            INSERT INTO attendance_records (
              employee_id, date, status, scheduled_start, scheduled_end,
              worked_hours, estimated_deduction, verification_status, notes
            ) VALUES (?, ?, 'On Leave', ?, ?, 0, 0, 'approved_leave', ?)
          `).run(emp.id, today, emp.start_time, emp.end_time, leaveLabel);
        }
        continue;
      }

      const absenceMins = timeToMinutes(emp.absence_threshold);
      if (currentMins >= absenceMins) {
        // Check if attendance record exists for today
        const existing = db.prepare(`SELECT id, check_in_time, status FROM attendance_records WHERE employee_id = ? AND date = ?`).get(emp.id, today);
        if (!existing) {
          // Insert absent record
          db.prepare(`
            INSERT INTO attendance_records (
              employee_id, date, status, scheduled_start, scheduled_end,
              worked_hours, estimated_deduction, verification_status, notes
            ) VALUES (?, ?, 'Absent', ?, ?, 0, ?, 'system_auto', 'تسجيل غياب آلي لتجاوز وقت الحضور المسموح به')
          `).run(emp.id, today, emp.start_time, emp.end_time, absenceDeduction);

          createNotification(emp.id, 'تسجيل غياب آلي', `تم تسجيل حالة غياب لك اليوم (${today}) لتجاوز موعد الحضور المحدد.`, 'danger');
          createNotification(null, 'تسجيل غياب موظف', `تم تسجيل الموظف ${emp.full_name} كغائب اليوم آلياً.`, 'warning');
        }
      }
    }
  } catch (err) {
    console.error('Auto absence check error:', err);
  }
}

// Run auto absence check on server interval (every 10 minutes)
setInterval(checkAndMarkAutoAbsences, 10 * 60 * 1000);

// ==========================================
// 1. Employee Check-in (POST /api/attendance/check-in)
// ==========================================
router.post('/check-in', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const { latitude, longitude, accuracy } = req.body;
    const photo = req.body.photo || req.body.photo_data;

    // Lookup employee's manager
    const empUser = db.prepare('SELECT manager_id, schedule_id FROM users WHERE id = ?').get(employeeId);
    const managerId = empUser ? (empUser.manager_id || 1) : 1;

    // Get active workplace location & allowed radius for this manager
    let workplace = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!workplace && managerId === 1) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }

    // Get employee schedule rules for this manager
    let userSchedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!userSchedule && managerId === 1) {
      userSchedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }

    // Prevent attendance before configuration
    if (!workplace || !userSchedule) {
      return res.status(400).json({
        success: false,
        notConfigured: true,
        error: 'لم يتم إعداد نظام الحضور بالكامل من قِبل الإدارة.'
      });
    }

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, error: 'إحداثيات الموقع الجغرافي (GPS) مطلوبة لتسجيل الحضور' });
    }

    if (!photo) {
      return res.status(400).json({ success: false, error: 'التقاط صورة سيلفي لإثبات التواجد مطلوب لإتمام الحضور' });
    }

    const today = getTodayString();
    const currentTime = getCurrentTimeString();

    // Check if already checked in today
    const existingRecord = db.prepare(`
      SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?
    `).get(employeeId, today);

    if (existingRecord && existingRecord.check_in_time) {
      return res.status(400).json({
        success: false,
        error: 'لقد قمت بالفعل بتسجيل الحضور لهذا اليوم في الساعة ' + existingRecord.check_in_time
      });
    }

    // Calculate distance server-side
    const distanceMeters = calculateHaversineDistance(
      parseFloat(latitude),
      parseFloat(longitude),
      workplace.latitude,
      workplace.longitude
    );

    // Geofencing verification
    const allowedRadius = workplace.allowed_radius_meters;
    const maxAccuracy = workplace.max_gps_accuracy_meters || 150;
    const clientAccuracy = parseFloat(accuracy) || 20;

    let verificationStatus = 'verified';
    if (distanceMeters > allowedRadius) {
      // Outside radius - BLOCK check-in
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      logAudit(
        employeeId,
        req.user.full_name,
        'CHECK_IN_BLOCKED_OUTSIDE_RADIUS',
        'attendance_records',
        null,
        null,
        { distanceMeters, allowedRadius, latitude, longitude },
        `محاولة تسجيل حضور فاشلة خارج النطاق (${distanceMeters}م)`,
        clientIp
      );

      createNotification(
        null,
        'محاولة حضور خارج النطاق الجغرافي',
        `حاول الموظف ${req.user.full_name} تسجيل الحضور وهو على بعد ${distanceMeters} متر من مقر العمل (المسموح ${allowedRadius}م).`,
        'danger'
      );

      return res.status(400).json({
        success: false,
        blocked: true,
        outsideRadius: true,
        error: `لا يمكنك تسجيل الحضور لأنك خارج نطاق موقع العمل. أنت على بعد ${distanceMeters} متر من مكان العمل. (الحد الأقصى المسموح ${allowedRadius} متر).`,
        distance: distanceMeters,
        allowedRadius
      });
    }

    if (clientAccuracy > maxAccuracy) {
      verificationStatus = 'poor_gps';
    }

    const startTime = userSchedule ? userSchedule.start_time : '09:00';
    const endTime = userSchedule ? userSchedule.end_time : '17:00';
    const gracePeriod = userSchedule ? userSchedule.grace_period_minutes : 15;
    const halfDayThreshold = userSchedule ? userSchedule.half_day_threshold : '12:00';

    // Calculate late status
    const currentMins = timeToMinutes(currentTime);
    const startMins = timeToMinutes(startTime);
    const graceMins = startMins + gracePeriod;
    const halfDayMins = timeToMinutes(halfDayThreshold);

    let status = 'On Time';
    let lateMinutes = 0;
    let deduction = 0;
    let notes = 'تم تسجيل الحضور بنجاح مع التحقق الجغرافي والصورة الشخصية';

    // Get deduction rules
    const settingsRows = db.prepare(`SELECT key, value FROM company_settings`).all();
    const settings = {};
    settingsRows.forEach(r => settings[r.key] = r.value);

    // Deduction rules with Dynamic Tiered Delay Deductions
    const deductionsEnabled = settings['enable_salary_deductions'] === '1';
    let delayTiers = [];
    try {
      if (settings['delay_deduction_tiers']) {
        delayTiers = JSON.parse(settings['delay_deduction_tiers']);
      }
    } catch (e) {
      delayTiers = [];
    }

    if (currentMins >= halfDayMins) {
      status = 'Half Day';
      lateMinutes = Math.max(0, currentMins - startMins);
      if (deductionsEnabled) {
        deduction = parseFloat(settings['deduction_half_day_rate'] || '100.0');
      }
      notes = `حضور متأخر بعد حد نصف اليوم (${halfDayThreshold})`;
    } else if (currentMins > graceMins) {
      status = 'Late';
      lateMinutes = currentMins - startMins;
      if (deductionsEnabled) {
        if (Array.isArray(delayTiers) && delayTiers.length > 0) {
          // Non-cumulative tier evaluation: highest reached tier overwrites earlier tiers ("يمسح الأولاني")
          delayTiers.sort((a, b) => parseFloat(a.minutes) - parseFloat(b.minutes));
          for (const tier of delayTiers) {
            const min = parseFloat(tier.minutes);
            const amt = parseFloat(tier.amount);
            if (lateMinutes >= min && !isNaN(amt)) {
              deduction = amt;
            }
          }
        } else {
          const latePerMin = parseFloat(settings['deduction_late_per_minute'] || '2.0');
          const lateThreshold = parseInt(settings['deduction_late_threshold_mins'] || '15', 10);
          if (lateMinutes >= lateThreshold) {
            deduction = lateMinutes * latePerMin;
          }
        }
      }
      notes = `حضور متأخر بمقدار ${lateMinutes} دقيقة` + (deduction > 0 ? ` (خصم تأخير: ${deduction} ج.م)` : '');
    } else {
      status = 'On Time';
    }

    // Check if employee has an approved permission for today (late_arrival or during_day)
    const approvedPerm = db.prepare(`
      SELECT * FROM permission_requests
      WHERE employee_id = ? AND date = ? AND status = 'approved' AND permission_type IN ('late_arrival', 'during_day')
    `).get(employeeId, today);

    if (approvedPerm && (status === 'Late' || status === 'Half Day')) {
      const permMins = Math.round((approvedPerm.hours_count || 1) * 60);
      if (lateMinutes <= permMins) {
        status = 'On Time';
        lateMinutes = 0;
        deduction = 0;
        notes = `حضور بإذن تأخير معتمد (${approvedPerm.hours_count} ساعة)`;
      } else {
        lateMinutes = Math.max(0, lateMinutes - permMins);
        notes = `تأخير مخفف بإذن معتمد (${approvedPerm.hours_count} ساعة)`;
      }
    }

    // Save photo to file
    const photoUrl = saveBase64Image(photo, `checkin_emp${employeeId}`);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Browser';

    // Check for suspicious same-IP activity if enabled
    if (settings['suspicious_ip_detection'] === '1' && clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
      const recentSameIp = db.prepare(`
        SELECT COUNT(DISTINCT employee_id) as count FROM attendance_records
        WHERE date = ? AND ip_address = ? AND employee_id != ?
      `).get(today, clientIp, employeeId);
      if (recentSameIp && recentSameIp.count >= 3) {
        verificationStatus = 'suspicious';
        notes += ' (تنبيه أمني: تم رصد تسجيلات متعددة لنفس عنوان IP)';
      }
    }

    // Insert or update record
    let recordId;
    if (existingRecord) {
      // In case an absent placeholder was created earlier today
      db.prepare(`
        UPDATE attendance_records SET
          check_in_time = ?, check_in_lat = ?, check_in_lng = ?, check_in_distance = ?, check_in_accuracy = ?,
          check_in_photo = ?, status = ?, scheduled_start = ?, scheduled_end = ?, late_minutes = ?,
          estimated_deduction = ?, verification_status = ?, ip_address = ?, user_agent = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        currentTime, latitude, longitude, distanceMeters, clientAccuracy,
        photoUrl, status, startTime, endTime, lateMinutes,
        deduction, verificationStatus, clientIp, userAgent, notes, existingRecord.id
      );
      recordId = existingRecord.id;
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO attendance_records (
          employee_id, date, check_in_time, check_in_lat, check_in_lng, check_in_distance, check_in_accuracy,
          check_in_photo, status, scheduled_start, scheduled_end, late_minutes,
          estimated_deduction, verification_status, ip_address, user_agent, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      recordId = insertStmt.run(
        employeeId, today, currentTime, latitude, longitude, distanceMeters, clientAccuracy,
        photoUrl, status, startTime, endTime, lateMinutes,
        deduction, verificationStatus, clientIp, userAgent, notes
      ).lastInsertRowid;
    }

    // Log in Audit Log
    logAudit(
      employeeId,
      req.user.full_name,
      'CHECK_IN',
      'attendance_records',
      recordId,
      null,
      { check_in_time: currentTime, status, distanceMeters, verificationStatus },
      notes,
      clientIp
    );

    // Notifications
    createNotification(employeeId, 'تم تسجيل حضورك بنجاح', `وقت الحضور: ${currentTime} - الحالة: ${status === 'On Time' ? 'في الموعد' : status === 'Late' ? 'متأخر' : 'نصف يوم'}`, status === 'On Time' ? 'success' : 'warning');

    if (status === 'Late' || status === 'Half Day') {
      createNotification(null, `تسجيل حضور متأخر: ${req.user.full_name}`, `الموظف ${req.user.full_name} سجل حضوره في ${currentTime} (${status === 'Late' ? `متأخر ${lateMinutes} دقيقة` : 'نصف يوم'}).`, 'warning');
    }

    // Automatic WhatsApp notification if late
    let whatsappAlert = null;
    const waSettings = getWhatsAppSettings();
    if ((status === 'Late' || status === 'Half Day') && waSettings.whatsapp_enabled === '1') {
      try {
        const empUserRow = db.prepare('SELECT phone, full_name FROM users WHERE id = ?').get(employeeId);
        const empPhone = empUserRow ? (empUserRow.phone || req.user.phone) : req.user.phone;
        if (empPhone) {
          const lateMsg = buildLateAlertMessage(req.user.full_name, lateMinutes, deduction, currentTime);
          const waRes = await sendWhatsAppMessage({
            phone: empPhone,
            name: req.user.full_name,
            role: 'employee',
            type: 'late_alert',
            message: lateMsg
          });
          whatsappAlert = {
            sent: waRes.apiDelivered || false,
            phone: waRes.phone,
            message: lateMsg,
            waLink: waRes.waLink
          };
        }
      } catch (waErr) {
        console.error('Auto WhatsApp late alert error:', waErr);
      }
    }

    res.json({
      success: true,
      message: 'تم تسجيل الحضور بنجاح' + (whatsappAlert ? ' (تم إشعار التأخير عبر واتساب)' : ''),
      record: {
        id: recordId,
        date: today,
        check_in_time: currentTime,
        status,
        late_minutes: lateMinutes,
        distance_meters: distanceMeters,
        verification_status: verificationStatus,
        photo_url: photoUrl
      },
      whatsapp_alert: whatsappAlert
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ في الخادم أثناء تسجيل الحضور' });
  }
});

// ==========================================
// 2. Employee Check-out (POST /api/attendance/check-out)
// ==========================================
router.post('/check-out', authenticateToken, (req, res) => {
  try {
    const employeeId = req.user.id;
    const { latitude, longitude, accuracy, photo } = req.body;

    const today = getTodayString();
    const currentTime = getCurrentTimeString();

    // Check today's record (prioritize checked-in record)
    const record = db.prepare(`SELECT * FROM attendance_records WHERE employee_id = ? AND date = ? AND check_in_time IS NOT NULL ORDER BY id DESC LIMIT 1`).get(employeeId, today)
      || db.prepare(`SELECT * FROM attendance_records WHERE employee_id = ? AND date = ? ORDER BY id DESC LIMIT 1`).get(employeeId, today);
    if (!record || !record.check_in_time) {
      return res.status(400).json({ success: false, error: 'لا يمكنك تسجيل الانصراف قبل تسجيل الحضور أولاً لهذا اليوم' });
    }

    if (record.check_out_time) {
      return res.status(400).json({ success: false, error: `تم تسجيل الانصراف مسبقاً لهذا اليوم في الساعة ${record.check_out_time}` });
    }

    const empUser = db.prepare('SELECT manager_id FROM users WHERE id = ?').get(employeeId);
    const managerId = empUser ? (empUser.manager_id || 1) : 1;
    let workplace = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!workplace && managerId === 1) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }

    let distanceMeters = null;
    const clientAccuracy = parseFloat(accuracy) || 20;

    if (latitude !== undefined && longitude !== undefined && workplace) {
      distanceMeters = calculateHaversineDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        workplace.latitude,
        workplace.longitude
      );
    }

    // Check manager setting for checkout photo requirement
    const reqPhotoSetting = db.prepare(`SELECT value FROM company_settings WHERE key = 'require_checkout_photo'`).get();
    const isPhotoRequired = reqPhotoSetting && reqPhotoSetting.value === '1';

    if (isPhotoRequired && !photo) {
      return res.status(400).json({ success: false, error: 'يتطلب النظام التقاط صورة إثبات تواجد عند تسجيل الانصراف' });
    }

    const photoUrl = photo ? saveBase64Image(photo, `checkout_emp${employeeId}`) : null;

    // Calculate worked hours
    const inMins = timeToMinutes(record.check_in_time);
    const outMins = timeToMinutes(currentTime);
    const workedMinutes = Math.max(0, outMins - inMins);
    const workedHours = parseFloat((workedMinutes / 60).toFixed(2));

    // Lookup schedule for early leave calculation
    let schedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!schedule && managerId === 1) {
      schedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 LIMIT 1`).get();
    }
    const earlyGraceMins = schedule ? (schedule.early_leave_grace_minutes || 0) : 0;
    const scheduledEnd = (schedule && schedule.end_time) || record.scheduled_end || '17:00';
    const scheduledEndMins = timeToMinutes(scheduledEnd);

    let earlyLeaveMinutes = 0;
    let status = record.status;
    let deduction = record.estimated_deduction || 0;

    if (outMins < (scheduledEndMins - earlyGraceMins)) {
      earlyLeaveMinutes = scheduledEndMins - outMins;

      // Check if employee has an approved early departure permission
      const approvedEarlyPerm = db.prepare(`
        SELECT * FROM permission_requests
        WHERE employee_id = ? AND date = ? AND status = 'approved' AND permission_type IN ('early_departure', 'during_day')
      `).get(employeeId, today);

      if (approvedEarlyPerm) {
        earlyLeaveMinutes = 0;
        // Don't add early leave deduction if approved permission exists
      } else {
        if (status === 'On Time') {
          status = 'Early Leave';
        }
        const earlyLeaveRateSetting = db.prepare(`SELECT value FROM company_settings WHERE key = 'deduction_early_leave_rate'`).get();
        if (earlyLeaveRateSetting) {
          deduction += parseFloat(earlyLeaveRateSetting.value);
        }
      }
    }

    // Update attendance record
    db.prepare(`
      UPDATE attendance_records SET
        check_out_time = ?, check_out_lat = ?, check_out_lng = ?, check_out_distance = ?,
        check_out_accuracy = ?, check_out_photo = ?, worked_hours = ?,
        early_leave_minutes = ?, status = ?, estimated_deduction = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      currentTime, latitude || null, longitude || null, distanceMeters,
      clientAccuracy, photoUrl, workedHours, earlyLeaveMinutes, status, deduction, record.id
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      employeeId,
      req.user.full_name,
      'CHECK_OUT',
      'attendance_records',
      record.id,
      null,
      { check_out_time: currentTime, workedHours, earlyLeaveMinutes },
      `تسجيل انصراف (ساعات العمل: ${workedHours} ساعة)`,
      clientIp
    );

    createNotification(employeeId, 'تم تسجيل الانصراف بنجاح', `وقت الانصراف: ${currentTime} - إجمالي ساعات العمل: ${workedHours} ساعة`, 'info');

    res.json({
      success: true,
      message: 'تم تسجيل الانصراف بنجاح',
      record: {
        id: record.id,
        check_out_time: currentTime,
        worked_hours: workedHours,
        early_leave_minutes: earlyLeaveMinutes,
        status
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ في الخادم أثناء تسجيل الانصراف' });
  }
});

// ==========================================
// 3. Today's Status for Current Employee (GET /api/attendance/my-today)
// ==========================================
router.get('/my-today', authenticateToken, (req, res) => {
  try {
    const today = getTodayString();
    const record = db.prepare(`
      SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?
    `).get(req.user.id, today);

    // Get employee's manager
    const empUser = db.prepare('SELECT manager_id, schedule_id FROM users WHERE id = ?').get(req.user.id);
    const managerId = empUser ? (empUser.manager_id || 1) : 1;

    let workplace = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!workplace && managerId === 1) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }

    const settings = {};
    db.prepare(`SELECT key, value FROM company_settings`).all().forEach(r => settings[r.key] = r.value);

    // Get employee schedule for this manager
    let schedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!schedule && managerId === 1) {
      schedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }

    const isFullyConfigured = !!workplace && !!schedule;

    res.json({
      success: true,
      today,
      record: record || null,
      notConfigured: !isFullyConfigured,
      workplace: workplace ? {
        company_name: workplace.company_name,
        name: workplace.name,
        latitude: workplace.latitude,
        longitude: workplace.longitude,
        allowed_radius_meters: workplace.allowed_radius_meters,
        max_gps_accuracy_meters: workplace.max_gps_accuracy_meters
      } : null,
      schedule: schedule || { start_time: '09:00', end_time: '17:00', grace_period_minutes: 15 },
      settings: {
        require_checkout_photo: settings['require_checkout_photo'] === '1'
      }
    });
  } catch (error) {
    console.error('My-today error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد حالة حضور اليوم' });
  }
});

// ==========================================
// 4. Live Attendance Feed for Today (GET /api/attendance/live-today) - Manager
// ==========================================
router.get('/live-today', authenticateToken, requireManager, (req, res) => {
  try {
    const today = getTodayString();
    const managerId = req.user.id;

    // Trigger auto-absence check
    checkAndMarkAutoAbsences();

    // Query active employees for this manager with today's record (LEFT JOIN)
    const records = db.prepare(`
      SELECT
        u.id as employee_id, u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        d.name as department_name,
        s.start_time as scheduled_start, s.end_time as scheduled_end,
        ar.id as record_id, ar.date, ar.check_in_time, ar.check_out_time,
        ar.check_in_lat, ar.check_in_lng, ar.check_in_distance, ar.check_in_accuracy, ar.check_in_photo,
        ar.check_out_lat, ar.check_out_lng, ar.check_out_distance, ar.check_out_accuracy, ar.check_out_photo,
        ar.status, ar.late_minutes, ar.early_leave_minutes, ar.worked_hours,
        ar.estimated_deduction, ar.verification_status, ar.notes
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      LEFT JOIN attendance_records ar ON (u.id = ar.employee_id AND ar.date = ?)
      WHERE u.is_active = 1 AND u.role = 'employee' AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1))
      ORDER BY
        CASE
          WHEN ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL THEN 1 -- Working now
          WHEN ar.check_in_time IS NOT NULL THEN 2 -- Checked out
          WHEN ar.status = 'Absent' THEN 3
          ELSE 4 -- Not arrived yet
        END,
        u.full_name ASC
    `).all(today, managerId, managerId);

    // Calculate metrics
    const totalEmployees = records.length;
    let presentCount = 0;
    let onTimeCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    let absentCount = 0;
    let workingNowCount = 0;
    let checkedOutCount = 0;

    records.forEach(r => {
      if (r.check_in_time) {
        presentCount++;
        if (r.status === 'On Time') onTimeCount++;
        if (r.status === 'Late') lateCount++;
        if (r.status === 'Half Day') halfDayCount++;

        if (r.check_out_time) {
          checkedOutCount++;
        } else {
          workingNowCount++;
        }
      } else if (r.status === 'Absent') {
        absentCount++;
      }
    });

    const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

    // Check configuration status for this manager
    const wp = db.prepare(`SELECT is_configured FROM workplaces WHERE manager_id = ? LIMIT 1`).get(managerId);
    const sched = db.prepare(`SELECT is_configured FROM schedules WHERE manager_id = ? LIMIT 1`).get(managerId);
    const hasWorkplace = !!wp && wp.is_configured === 1;
    const hasSchedule = !!sched && sched.is_configured === 1;
    const checklist = {
      hasManager: true,
      hasEmployees: totalEmployees > 0,
      employeeCount: totalEmployees,
      hasWorkplace,
      hasSchedule,
      hasRules: hasWorkplace && hasSchedule,
      isFullyConfigured: totalEmployees > 0 && hasWorkplace && hasSchedule
    };

    res.json({
      success: true,
      today,
      metrics: {
        totalEmployees,
        presentCount,
        onTimeCount,
        lateCount,
        halfDayCount,
        absentCount,
        workingNowCount,
        checkedOutCount,
        attendanceRate
      },
      checklist,
      records
    });
  } catch (error) {
    console.error('Live today error:', error);
    res.status(500).json({ success: false, error: 'فشل في تحميل الحضور المباشر' });
  }
});

// ==========================================
// 5. Attendance History (GET /api/attendance/history)
// ==========================================
router.get('/history', authenticateToken, (req, res) => {
  try {
    const isManager = req.user.role === 'manager';
    const { date_from, date_to, employee_id, department_id, status, verification_status, search } = req.query;

    let query = `
      SELECT
        ar.*,
        u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        d.name as department_name, d.id as department_id
      FROM attendance_records ar
      JOIN users u ON ar.employee_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    // Security: Employee can ONLY view their own records
    if (!isManager) {
      query += ` AND ar.employee_id = ? `;
      params.push(req.user.id);
    } else if (employee_id) {
      query += ` AND ar.employee_id = ? `;
      params.push(employee_id);
    }

    if (date_from) {
      query += ` AND ar.date >= ? `;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND ar.date <= ? `;
      params.push(date_to);
    }
    if (department_id) {
      query += ` AND u.department_id = ? `;
      params.push(department_id);
    }
    if (status) {
      query += ` AND ar.status = ? `;
      params.push(status);
    }
    if (verification_status) {
      query += ` AND ar.verification_status = ? `;
      params.push(verification_status);
    }
    if (search && isManager) {
      query += ` AND (u.full_name LIKE ? OR u.employee_code LIKE ?) `;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY ar.date DESC, ar.check_in_time DESC LIMIT 500 `;

    const records = db.prepare(query).all(...params);
    res.json({ success: true, count: records.length, records });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ success: false, error: 'فشل في استرداد سجل الحضور' });
  }
});

// ==========================================
// 6. Manual Edit Attendance Record (PUT /api/attendance/:id) - Manager Only
// ==========================================
router.put('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const recordId = req.params.id;
    const { check_in_time, check_out_time, status, notes, reason, waive_deductions } = req.body;

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'سبب التعديل اليدوي إلزامي للتوثيق في سجل العمليات الرقابي (Audit Log)' });
    }

    const oldRecord = db.prepare(`SELECT * FROM attendance_records WHERE id = ?`).get(recordId);
    if (!oldRecord) {
      return res.status(404).json({ success: false, error: 'سجل الحضور غير موجود' });
    }

    // Recompute worked hours if both times exist
    let workedHours = oldRecord.worked_hours;
    if (check_in_time && check_out_time) {
      const inM = timeToMinutes(check_in_time);
      const outM = timeToMinutes(check_out_time);
      workedHours = parseFloat((Math.max(0, outM - inM) / 60).toFixed(2));
    }

    // Determine late minutes & deductions
    let lateMinutes = oldRecord.late_minutes;
    let deduction = oldRecord.estimated_deduction;
    const finalStatus = status || oldRecord.status;

    if (waive_deductions || finalStatus === 'On Time' || finalStatus === 'On Leave') {
      lateMinutes = 0;
      deduction = 0;
    } else if (check_in_time && oldRecord.scheduled_start) {
      const schedStartM = timeToMinutes(oldRecord.scheduled_start);
      const inM = timeToMinutes(check_in_time);
      const diff = inM - schedStartM;
      if (diff <= 15) {
        lateMinutes = 0;
        deduction = 0;
      } else {
        lateMinutes = diff;
      }
    }

    const newValues = {
      check_in_time: check_in_time !== undefined ? check_in_time : oldRecord.check_in_time,
      check_out_time: check_out_time !== undefined ? check_out_time : oldRecord.check_out_time,
      status: finalStatus,
      worked_hours: workedHours,
      late_minutes: lateMinutes,
      estimated_deduction: deduction,
      notes: notes !== undefined ? notes : oldRecord.notes,
      verification_status: 'manual_override'
    };

    db.prepare(`
      UPDATE attendance_records SET
        check_in_time = ?, check_out_time = ?, status = ?, worked_hours = ?,
        late_minutes = ?, estimated_deduction = ?,
        notes = ?, verification_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      newValues.check_in_time, newValues.check_out_time, newValues.status,
      newValues.worked_hours, newValues.late_minutes, newValues.estimated_deduction,
      newValues.notes, newValues.verification_status, recordId
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'MANUAL_EDIT_ATTENDANCE',
      'attendance_records',
      recordId,
      oldRecord,
      newValues,
      reason,
      clientIp
    );

    // Notify employee
    createNotification(
      oldRecord.employee_id,
      'تعديل في سجل الحضور الخاص بك',
      `قام مدير النظام بتعديل سجل حضورك ليوم ${oldRecord.date}. السبب: ${reason}`,
      'info'
    );

    res.json({ success: true, message: 'تم تحديث سجل الحضور بنجاح وتسجيل الإجراء في سجل الرقابة' });
  } catch (error) {
    console.error('Manual edit error:', error);
    res.status(500).json({ success: false, error: 'فشل في تعديل سجل الحضور' });
  }
});

// ==========================================
// 7. Manual Add Past Attendance Record (POST /api/attendance/manual-record) - Manager Only
// ==========================================
router.post('/manual-record', authenticateToken, requireManager, (req, res) => {
  try {
    const { employee_id, date, check_in_time, check_out_time, status, reason, waive_deductions } = req.body;

    if (!employee_id || !date) {
      return res.status(400).json({ success: false, error: 'يرجى اختيار الموظف والتاريخ' });
    }

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'سبب الإضافة/التعديل اليدوي إلزامي للتوثيق في سجل العمليات الرقابي' });
    }

    const emp = db.prepare(`
      SELECT u.id, u.full_name, u.schedule_id,
             COALESCE(s.start_time, '09:00') as start_time,
             COALESCE(s.end_time, '17:00') as end_time,
             COALESCE(s.grace_period_minutes, 15) as grace_period_minutes
      FROM users u
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE u.id = ?
    `).get(employee_id);

    if (!emp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    // Compute worked hours
    let workedHours = 0;
    if (check_in_time && check_out_time) {
      const inM = timeToMinutes(check_in_time);
      const outM = timeToMinutes(check_out_time);
      workedHours = parseFloat((Math.max(0, outM - inM) / 60).toFixed(2));
    } else if (check_in_time) {
      workedHours = 8.0;
    }

    // Determine status & late minutes
    let finalStatus = status || 'On Time';
    let lateMinutes = 0;
    let deduction = 0;

    if (waive_deductions || finalStatus === 'On Time' || finalStatus === 'On Leave') {
      lateMinutes = 0;
      deduction = 0;
      if (finalStatus !== 'On Leave') finalStatus = 'On Time';
    } else if (check_in_time) {
      const schedStartM = timeToMinutes(emp.start_time);
      const inM = timeToMinutes(check_in_time);
      const diff = inM - schedStartM;
      if (diff > emp.grace_period_minutes) {
        lateMinutes = diff;
        finalStatus = finalStatus || 'Late';
        const lateRate = db.prepare(`SELECT value FROM company_settings WHERE key = 'deduction_late_rate'`).get();
        deduction = lateRate ? parseFloat(lateRate.value) : 50;
      } else {
        lateMinutes = 0;
        finalStatus = 'On Time';
        deduction = 0;
      }
    } else if (finalStatus === 'Absent') {
      const absenceRate = db.prepare(`SELECT value FROM company_settings WHERE key = 'deduction_absence_rate'`).get();
      deduction = absenceRate ? parseFloat(absenceRate.value) : 250;
    }

    // Check if record exists for this date and employee
    const existing = db.prepare(`SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?`).get(employee_id, date);

    let recordId;
    if (existing) {
      recordId = existing.id;
      db.prepare(`
        UPDATE attendance_records SET
          check_in_time = ?, check_out_time = ?, status = ?, worked_hours = ?,
          late_minutes = ?, estimated_deduction = ?, verification_status = 'manual_admin',
          notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        check_in_time || null, check_out_time || null, finalStatus, workedHours,
        lateMinutes, deduction, reason, recordId
      );
    } else {
      const info = db.prepare(`
        INSERT INTO attendance_records (
          employee_id, date, check_in_time, check_out_time, scheduled_start, scheduled_end,
          status, worked_hours, late_minutes, early_leave_minutes, estimated_deduction,
          verification_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'manual_admin', ?)
      `).run(
        employee_id, date, check_in_time || null, check_out_time || null, emp.start_time, emp.end_time,
        finalStatus, workedHours, lateMinutes, deduction, reason
      );
      recordId = info.lastInsertRowid;
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'MANUAL_RECORD_ATTENDANCE',
      'attendance_records',
      recordId,
      existing || null,
      { employee_id, date, check_in_time, check_out_time, status: finalStatus, workedHours, lateMinutes, deduction },
      `تسجيل/تعديل حضور يدوي بأثر رجعي: ${reason}`,
      clientIp
    );

    createNotification(
      employee_id,
      'تسجيل/تعديل حضور يدوي بأثر رجعي',
      `قام مدير النظام بتوثيق حضورك ليوم ${date} بموعد ${check_in_time || 'معتمد'}. المبرر: ${reason}`,
      'info'
    );

    res.json({
      success: true,
      message: 'تم حفظ وتوثيق سجل الحضور بنجاح',
      recordId
    });
  } catch (error) {
    console.error('Manual record error:', error);
    res.status(500).json({ success: false, error: 'فشل في حفظ سجل الحضور' });
  }
});

// ==========================================
// 8. Delete Attendance Record (DELETE /api/attendance/:id) - Manager Only
// ==========================================
router.delete('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    if (!recordId) {
      return res.status(400).json({ success: false, error: 'معرف السجل غير صالح' });
    }

    const record = db.prepare(`
      SELECT ar.*, u.full_name, u.employee_code 
      FROM attendance_records ar
      JOIN users u ON ar.employee_id = u.id
      WHERE ar.id = ?
    `).get(recordId);

    if (!record) {
      return res.status(404).json({ success: false, error: 'السجل غير موجود أو تم حذفه مسبقاً' });
    }

    db.prepare(`DELETE FROM attendance_records WHERE id = ?`).run(recordId);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      req.user.id,
      req.user.full_name,
      'DELETE_ATTENDANCE_RECORD',
      'attendance_records',
      recordId,
      record,
      null,
      `حذف سجل حضور ${record.full_name} ليوم ${record.date}`,
      clientIp
    );

    res.json({
      success: true,
      message: `تم حذف سجل الحضور ليوم ${record.date} للموظف ${record.full_name} بنجاح`
    });
  } catch (error) {
    console.error('Delete attendance record error:', error);
    res.status(500).json({ success: false, error: 'فشل في حذف سجل الحضور: ' + error.message });
  }
});

// ==========================================
// 9. Bulk Manual Attendance Records (POST /api/attendance/bulk-manual-records) - Manager Only
// ==========================================
router.post('/bulk-manual-records', authenticateToken, requireManager, (req, res) => {
  try {
    const {
      employee_id,
      date_from,
      date_to,
      exclude_weekends = true,
      check_in_time,
      check_out_time,
      status = 'On Time',
      waive_deductions = true,
      reason
    } = req.body;

    if (!date_from || !date_to) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد تاريخ البداية وتاريخ النهاية' });
    }

    if (new Date(date_from) > new Date(date_to)) {
      return res.status(400).json({ success: false, error: 'تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية' });
    }

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'سبب الإضافة الجماعية إلزامي للتوثيق في سجل العمليات الرقابي' });
    }

    // Determine target employees
    let employees = [];
    if (employee_id && employee_id !== 'all') {
      const emp = db.prepare(`
        SELECT u.id, u.full_name, u.schedule_id,
               COALESCE(s.start_time, '09:00') as start_time,
               COALESCE(s.end_time, '17:00') as end_time,
               COALESCE(s.grace_period_minutes, 15) as grace_period_minutes,
               COALESCE(s.working_days, '0,1,2,3,4') as working_days
        FROM users u
        LEFT JOIN schedules s ON u.schedule_id = s.id
        WHERE u.id = ?
      `).get(employee_id);
      if (!emp) return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
      employees = [emp];
    } else {
      employees = db.prepare(`
        SELECT u.id, u.full_name, u.schedule_id,
               COALESCE(s.start_time, '09:00') as start_time,
               COALESCE(s.end_time, '17:00') as end_time,
               COALESCE(s.grace_period_minutes, 15) as grace_period_minutes,
               COALESCE(s.working_days, '0,1,2,3,4') as working_days
        FROM users u
        LEFT JOIN schedules s ON u.schedule_id = s.id
        WHERE u.is_active = 1 AND u.role = 'employee'
      `).all();
    }

    if (employees.length === 0) {
      return res.status(400).json({ success: false, error: 'لم يتم العثور على موظفين نشطين' });
    }

    // Build dates list
    const dates = [];
    let cur = new Date(date_from + 'T12:00:00');
    const end = new Date(date_to + 'T12:00:00');
    let loopCount = 0;
    while (cur <= end && loopCount < 100) {
      dates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
      loopCount++;
    }

    let insertedOrUpdated = 0;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    for (const emp of employees) {
      const workingDays = (emp.working_days || '0,1,2,3,4').split(',');

      for (const d of dates) {
        const dayOfWeek = String(new Date(d + 'T12:00:00').getDay());
        if (exclude_weekends && !workingDays.includes(dayOfWeek)) {
          continue; // Skip off-day / weekend
        }

        const inTime = check_in_time || emp.start_time;
        const outTime = check_out_time || emp.end_time;
        let workedHours = 0;
        if (inTime && outTime) {
          const inM = timeToMinutes(inTime);
          const outM = timeToMinutes(outTime);
          workedHours = parseFloat((Math.max(0, outM - inM) / 60).toFixed(2));
        } else if (inTime) {
          workedHours = 8.0;
        }

        let finalStatus = status || 'On Time';
        let lateMinutes = 0;
        let deduction = 0;

        if (waive_deductions || finalStatus === 'On Time' || finalStatus === 'On Leave') {
          lateMinutes = 0;
          deduction = 0;
          if (finalStatus !== 'On Leave') finalStatus = 'On Time';
        } else if (inTime) {
          const schedStartM = timeToMinutes(emp.start_time);
          const inM = timeToMinutes(inTime);
          const diff = inM - schedStartM;
          if (diff > emp.grace_period_minutes) {
            lateMinutes = diff;
            finalStatus = 'Late';
            const lateRate = db.prepare(`SELECT value FROM company_settings WHERE key = 'deduction_late_rate'`).get();
            deduction = lateRate ? parseFloat(lateRate.value) : 50;
          }
        }

        const existing = db.prepare(`SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?`).get(emp.id, d);

        if (existing) {
          db.prepare(`
            UPDATE attendance_records SET
              check_in_time = ?, check_out_time = ?, status = ?, worked_hours = ?,
              late_minutes = ?, estimated_deduction = ?, verification_status = 'manual_admin',
              notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(inTime, outTime, finalStatus, workedHours, lateMinutes, deduction, reason, existing.id);
        } else {
          db.prepare(`
            INSERT INTO attendance_records (
              employee_id, date, check_in_time, check_out_time, scheduled_start, scheduled_end,
              status, worked_hours, late_minutes, early_leave_minutes, estimated_deduction,
              verification_status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'manual_admin', ?)
          `).run(
            emp.id, d, inTime, outTime, emp.start_time, emp.end_time,
            finalStatus, workedHours, lateMinutes, deduction, reason
          );
        }
        insertedOrUpdated++;
      }

      createNotification(
        emp.id,
        'توثيق حضور بأثر رجعي لفترة محددة',
        `قام مدير النظام بتوثيق حضورك للفترة من ${date_from} إلى ${date_to}. المبرر: ${reason}`,
        'info'
      );
    }

    logAudit(
      req.user.id,
      req.user.full_name,
      'BULK_MANUAL_ATTENDANCE',
      'attendance_records',
      null,
      null,
      { employee_id, date_from, date_to, total_records: insertedOrUpdated },
      `إضافة حضور جماعي من ${date_from} إلى ${date_to} بإجمالي (${insertedOrUpdated}) سجل: ${reason}`,
      clientIp
    );

    res.json({
      success: true,
      message: `تم بنجاح توثيق الحضور الجماعي (${insertedOrUpdated} سجل) للفترة من ${date_from} إلى ${date_to}`,
      count: insertedOrUpdated
    });
  } catch (error) {
    console.error('Bulk manual attendance error:', error);
    res.status(500).json({ success: false, error: 'فشل في حفظ الحضور الجماعي: ' + error.message });
  }
});

module.exports = router;
