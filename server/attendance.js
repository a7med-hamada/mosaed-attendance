const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, logAudit, createNotification, calculateHaversineDistance, uploadsDir, getTodayString, getCurrentTimeString, getCurrentMonthString } = require('./database');
const { authenticateToken, requireManager, isManagedEmployee, isManagedResource } = require('./auth');
const {
  sendWhatsAppMessage,
  buildLateAlertMessage,
  getWhatsAppSettings,
  generateWhatsAppLink
} = require('./whatsapp');
const { syncMissingAbsencesForMonth, syncAbsencesForDateRange } = require('./absence-sync');

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
    syncMissingAbsencesForMonth(getCurrentMonthString());
    const today = getTodayString();
    const currentTime = getCurrentTimeString();
    const currentMins = timeToMinutes(currentTime);

    // Check if manager attendance is enabled
    const mgrAttSetting = db.prepare(`SELECT value FROM company_settings WHERE key = 'manager_track_attendance'`).get();
    const isMgrTracked = mgrAttSetting && mgrAttSetting.value === '1';
    const mgrStartDateSetting = db.prepare(`SELECT value FROM company_settings WHERE key = 'manager_attendance_start_date'`).get();
    const mgrStartDate = mgrStartDateSetting ? mgrStartDateSetting.value : today;

    // Get all active employees (and manager if manager attendance is enabled)
    let roleCondition = "u.role = 'employee'";
    if (isMgrTracked && today >= mgrStartDate) {
      roleCondition = "(u.role = 'employee' OR u.role = 'manager')";
    }

    // Get all active employees with their schedules
    const employees = db.prepare(`
      SELECT u.id, u.full_name, u.schedule_id, u.role, u.base_salary,
             COALESCE(s.start_time, '09:00') as start_time,
             COALESCE(s.end_time, '17:00') as end_time,
             COALESCE(s.absence_threshold, '13:00') as absence_threshold,
             COALESCE(s.working_days, '0,1,2,3,4') as working_days
      FROM users u
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE u.is_active = 1 AND ${roleCondition}
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
          const finalAbsenceDeduction = (emp.role === 'manager' && emp.base_salary > 0)
            ? Math.round(emp.base_salary / 30)
            : absenceDeduction;

          // Insert absent record
          db.prepare(`
            INSERT INTO attendance_records (
              employee_id, date, status, scheduled_start, scheduled_end,
              worked_hours, estimated_deduction, verification_status, notes
            ) VALUES (?, ?, 'Absent', ?, ?, 0, ?, 'system_auto', 'تسجيل غياب آلي لتجاوز وقت الحضور المسموح به')
          `).run(emp.id, today, emp.start_time, emp.end_time, finalAbsenceDeduction);

          createNotification(emp.id, 'تسجيل غياب آلي', `تم تسجيل حالة غياب لك اليوم (${today}) لتجاوز موعد الحضور المحدد.`, 'danger');
          if (emp.role !== 'manager') {
            createNotification(null, 'تسجيل غياب موظف', `تم تسجيل الموظف ${emp.full_name} كغائب اليوم آلياً.`, 'warning');
          }
        }
      }
    }
  } catch (err) {
    console.error('Auto absence check error:', err);
  }
}

// Automatic checkout check logic (runs periodically and on-demand)
function checkAndApplyAutoCheckouts() {
  try {
    const today = getTodayString();
    const currentTime = getCurrentTimeString();
    const currentMins = timeToMinutes(currentTime);

    // 1. Process TODAY's records where check_in_time is present but check_out_time is null
    const openRecordsToday = db.prepare(`
      SELECT ar.id, ar.employee_id, ar.date, ar.check_in_time, ar.notes, ar.status,
             ar.scheduled_start, ar.scheduled_end, ar.shift_id, ar.shift_name,
             u.full_name, u.manager_id, u.shift_id as emp_shift_id
      FROM attendance_records ar
      JOIN users u ON ar.employee_id = u.id
      WHERE ar.date = ? AND ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL
    `).all(today);

    for (const rec of openRecordsToday) {
      const mgrId = rec.manager_id || 1;
      let wp = db.prepare(`SELECT schedule_mode FROM workplaces WHERE manager_id = ? LIMIT 1`).get(mgrId);
      if (!wp && mgrId === 1) wp = db.prepare(`SELECT schedule_mode FROM workplaces WHERE id = 1 LIMIT 1`).get();
      const schedMode = wp ? (wp.schedule_mode || 'normal') : 'normal';

      let effectiveEnd = rec.scheduled_end;
      let matchedShift = null;

      if (schedMode === 'shifts') {
        const shifts = db.prepare('SELECT * FROM company_shifts WHERE manager_id = ? AND is_active = 1 ORDER BY start_time ASC').all(mgrId);
        if (rec.shift_id) {
          matchedShift = shifts.find(s => s.id === rec.shift_id);
        }
        if (!matchedShift && rec.emp_shift_id) {
          matchedShift = shifts.find(s => s.id === rec.emp_shift_id);
        }
        if (!matchedShift && shifts.length > 0) {
          matchedShift = shifts.find(s => {
            if (!s.assigned_employee_ids) return false;
            try {
              const ids = typeof s.assigned_employee_ids === 'string'
                ? (s.assigned_employee_ids.startsWith('[') ? JSON.parse(s.assigned_employee_ids) : s.assigned_employee_ids.split(',').map(Number))
                : s.assigned_employee_ids;
              return Array.isArray(ids) && ids.includes(rec.employee_id);
            } catch(e) { return false; }
          });
        }
        if (!matchedShift && shifts.length > 0) {
          const refMins = timeToMinutes(rec.check_in_time || rec.scheduled_start || currentTime);
          matchedShift = shifts.reduce((closest, s) => {
            const diff1 = Math.abs(timeToMinutes(s.start_time) - refMins);
            const diff2 = Math.abs(timeToMinutes(closest.start_time) - refMins);
            return diff1 < diff2 ? s : closest;
          }, shifts[0]);
        }
        if (matchedShift) {
          effectiveEnd = matchedShift.end_time;
        }
      } else {
        if (!effectiveEnd) {
          let s = db.prepare(`SELECT end_time FROM schedules WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(mgrId);
          if (!s && mgrId === 1) s = db.prepare(`SELECT end_time FROM schedules WHERE id = 1 LIMIT 1`).get();
          effectiveEnd = (s && s.end_time) || '17:00';
        }
      }

      if (!effectiveEnd) effectiveEnd = '17:00';
      const endMins = timeToMinutes(effectiveEnd);

      // If current time reached or passed the employee's scheduled end time
      if (currentMins >= endMins) {
        const checkOutTime = effectiveEnd.length === 5 ? `${effectiveEnd}:00` : effectiveEnd;
        let workedHours = 8.0;
        if (rec.check_in_time) {
          const inMins = timeToMinutes(rec.check_in_time);
          workedHours = Math.max(0, Math.round(((endMins - inMins) / 60) * 10) / 10);
        }

        const autoNote = 'تم الانصراف التلقائي بنهاية مواعيد العمل الرسمية';
        const finalNotes = rec.notes ? `${rec.notes} | ${autoNote}` : autoNote;

        db.prepare(`
          UPDATE attendance_records SET
            check_out_time = ?,
            worked_hours = ?,
            early_leave_minutes = 0,
            verification_status = 'system_auto_checkout',
            notes = ?,
            scheduled_start = COALESCE(?, scheduled_start),
            scheduled_end = COALESCE(?, scheduled_end),
            shift_id = COALESCE(?, shift_id),
            shift_name = COALESCE(?, shift_name),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          checkOutTime, workedHours, finalNotes,
          matchedShift ? matchedShift.start_time : null,
          matchedShift ? matchedShift.end_time : null,
          matchedShift ? matchedShift.id : null,
          matchedShift ? matchedShift.name : null,
          rec.id
        );

        createNotification(
          rec.employee_id,
          'انصراف تلقائي',
          `تم تسجيل انصرافك تلقائياً بحلول نهاية مواعيد العمل المقررة (${effectiveEnd}).`,
          'info'
        );
      }
    }

    // 2. Process PAST unclosed shifts (date < today)
    const openRecordsPast = db.prepare(`
      SELECT ar.id, ar.employee_id, ar.date, ar.check_in_time, ar.notes, ar.status,
             COALESCE(ar.scheduled_end, s.end_time, '17:00') as scheduled_end,
             u.full_name
      FROM attendance_records ar
      JOIN users u ON ar.employee_id = u.id
      LEFT JOIN schedules s ON u.schedule_id = s.id
      WHERE ar.date < ? AND ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL
    `).all(today);

    for (const rec of openRecordsPast) {
      const checkOutTime = rec.scheduled_end.length === 5 ? `${rec.scheduled_end}:00` : rec.scheduled_end;
      const endMins = timeToMinutes(rec.scheduled_end || '17:00');
      let workedHours = 8.0;
      if (rec.check_in_time) {
        const inMins = timeToMinutes(rec.check_in_time);
        workedHours = Math.max(0, Math.round(((endMins - inMins) / 60) * 10) / 10);
      }

      const autoNote = 'تم الانصراف التلقائي بنهاية مواعيد العمل الرسمية';
      const finalNotes = rec.notes ? `${rec.notes} | ${autoNote}` : autoNote;

      db.prepare(`
        UPDATE attendance_records SET
          check_out_time = ?,
          worked_hours = ?,
          verification_status = 'system_auto_checkout',
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(checkOutTime, workedHours, finalNotes, rec.id);
    }
  } catch (err) {
    console.error('Auto checkout check error:', err);
  }
}

// Run auto absence check on server interval (every 10 minutes)
setInterval(checkAndMarkAutoAbsences, 10 * 60 * 1000);
// Run auto checkout check on server interval (every 1 minute)
setInterval(checkAndApplyAutoCheckouts, 60 * 1000);
// Initial check on startup
checkAndApplyAutoCheckouts();

// ==========================================
// 1. Employee Check-in (POST /api/attendance/check-in)
// ==========================================
router.post('/check-in', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const { latitude, longitude, accuracy } = req.body;
    const photo = req.body.photo || req.body.photo_data;

    // Lookup employee's manager, assigned shift, and biometric face descriptor
    const empUser = db.prepare('SELECT manager_id, schedule_id, shift_id, face_descriptor FROM users WHERE id = ?').get(employeeId);
    const isManagerSelf = req.user.role === 'manager';
    const managerId = isManagerSelf ? req.user.id : (empUser ? (empUser.manager_id || 1) : 1);

    // Get active workplace location & allowed radius for this manager
    let workplace = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!workplace && (managerId === 1 || isManagerSelf)) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }
    if (!workplace) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 LIMIT 1`).get();
    }

    // Get employee schedule rules for this manager
    let userSchedule = null;
    if (empUser && empUser.schedule_id) {
      userSchedule = db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(empUser.schedule_id);
    }
    if (!userSchedule) {
      userSchedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    }
    if (!userSchedule && (managerId === 1 || isManagerSelf)) {
      userSchedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }
    if (!userSchedule) {
      userSchedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 LIMIT 1`).get();
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

    // Biometric Face ID Verification (if employee has enrolled face)
    if (empUser && empUser.face_descriptor) {
      try {
        const registeredDesc = typeof empUser.face_descriptor === 'string' ? JSON.parse(empUser.face_descriptor) : empUser.face_descriptor;
        if (registeredDesc && Array.isArray(registeredDesc) && registeredDesc.length === 128) {
          const incomingDesc = req.body.face_descriptor;
          if (!incomingDesc || !Array.isArray(incomingDesc) || incomingDesc.length !== 128) {
            return res.status(400).json({
              success: false,
              biometricRequired: true,
              error: 'التحقق من بصمة الوجه إلزامي لتسجيل الحضور. يرجى توجيه الكاميرا نحو وجهك بوضوح.'
            });
          }
          let sum = 0;
          for (let i = 0; i < 128; i++) {
            const diff = registeredDesc[i] - incomingDesc[i];
            sum += diff * diff;
          }
          const distance = Math.sqrt(sum);
          if (distance > 0.58) {
            const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            logAudit(employeeId, req.user.full_name, 'BIOMETRIC_MISMATCH_CHECKIN', 'attendance_records', null, null, { distance }, 'محاولة تسجيل حضور ببصمة وجه غير مطابقة', clientIp);
            return res.status(400).json({
              success: false,
              biometricMismatch: true,
              error: 'فشل التحقق البيومتري: ملامح الوجه لا تتطابق مع الموظف المسجل بهذا الحساب! لا يمكن تسجيل الحضور نيابة عن شخص آخر.'
            });
          }
        }
      } catch (faceErr) {
        console.warn('Biometric check error:', faceErr);
      }
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

    // ----------------------------------------------------
    // Shift & Schedule Resolution (Normal vs Multi-Shift)
    // ----------------------------------------------------
    let startTime = userSchedule ? userSchedule.start_time : '09:00';
    let endTime = userSchedule ? userSchedule.end_time : '17:00';
    let gracePeriod = userSchedule ? userSchedule.grace_period_minutes : 15;
    let halfDayThreshold = userSchedule ? userSchedule.half_day_threshold : '12:00';
    let matchedShiftId = null;
    let matchedShiftName = null;

    const isShiftsMode = workplace && workplace.schedule_mode === 'shifts';
    if (isShiftsMode) {
      const activeShifts = db.prepare(`
        SELECT * FROM company_shifts WHERE manager_id = ? AND is_active = 1 ORDER BY start_time ASC
      `).all(managerId);

      if (activeShifts.length > 0) {
        let chosenShift = null;

        // 1. Explicit shift_id requested from employee UI
        if (req.body.shift_id) {
          chosenShift = activeShifts.find(s => s.id === parseInt(req.body.shift_id, 10));
        }

        // 2. Pre-assigned shift for this employee in users table (Solution 2)
        if (!chosenShift && empUser && empUser.shift_id) {
          chosenShift = activeShifts.find(s => s.id === empUser.shift_id);
        }

        // 3. Fallback: check legacy assigned_employee_ids
        if (!chosenShift) {
          chosenShift = activeShifts.find(s => {
            if (!s.assigned_employee_ids) return false;
            try {
              const ids = typeof s.assigned_employee_ids === 'string'
                ? (s.assigned_employee_ids.startsWith('[') ? JSON.parse(s.assigned_employee_ids) : s.assigned_employee_ids.split(',').map(Number))
                : s.assigned_employee_ids;
              return Array.isArray(ids) && ids.includes(employeeId);
            } catch(e) { return false; }
          });
        }

        // 3. Smart Fallback: Check active/upcoming shifts where currentMins <= shift.end_time
        const currentMinsNow = timeToMinutes(currentTime);
        if (!chosenShift) {
          const openShifts = activeShifts.filter(s => currentMinsNow <= timeToMinutes(s.end_time));
          if (openShifts.length === 1) {
            // Previous shift already ended and closed, so this is unambiguously the active shift!
            chosenShift = openShifts[0];
          } else if (openShifts.length > 1) {
            // Pick the one closest to current time
            chosenShift = openShifts.reduce((closest, s) => {
              const diff1 = Math.abs(timeToMinutes(s.start_time) - currentMinsNow);
              const diff2 = Math.abs(timeToMinutes(closest.start_time) - currentMinsNow);
              return diff1 < diff2 ? s : closest;
            }, openShifts[0]);
          } else {
            // All shifts ended today, fallback to latest or first
            chosenShift = activeShifts[activeShifts.length - 1];
          }
        }

        if (chosenShift) {
          matchedShiftId = chosenShift.id;
          matchedShiftName = chosenShift.name;
          startTime = chosenShift.start_time;
          endTime = chosenShift.end_time;
          gracePeriod = chosenShift.grace_period_minutes !== undefined ? chosenShift.grace_period_minutes : 15;

          // Midpoint for half day
          const sMins = timeToMinutes(startTime);
          const eMins = timeToMinutes(endTime);
          const midMins = sMins + Math.round((eMins - sMins) / 2);
          const midH = String(Math.floor(midMins / 60)).padStart(2, '0');
          const midM = String(midMins % 60).padStart(2, '0');
          halfDayThreshold = `${midH}:${midM}`;
        }
      }
    }

    // Calculate late status
    const currentMins = timeToMinutes(currentTime);
    const startMins = timeToMinutes(startTime);
    const graceMins = startMins + gracePeriod;
    const halfDayMins = timeToMinutes(halfDayThreshold);

    let status = 'On Time';
    let lateMinutes = 0;
    let deduction = 0;
    let notes = matchedShiftName ? `فترة العمل: ${matchedShiftName}` : 'تم تسجيل الحضور بنجاح مع التحقق الجغرافي والصورة الشخصية';

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
        } else {
          deduction = parseFloat(settings['deduction_late_rate'] || '50');
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
          estimated_deduction = ?, verification_status = ?, ip_address = ?, user_agent = ?, notes = ?,
          shift_id = ?, shift_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        currentTime, latitude, longitude, distanceMeters, clientAccuracy,
        photoUrl, status, startTime, endTime, lateMinutes,
        deduction, verificationStatus, clientIp, userAgent, notes,
        matchedShiftId, matchedShiftName, existingRecord.id
      );
      recordId = existingRecord.id;
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO attendance_records (
          employee_id, date, check_in_time, check_in_lat, check_in_lng, check_in_distance, check_in_accuracy,
          check_in_photo, status, scheduled_start, scheduled_end, late_minutes,
          estimated_deduction, verification_status, ip_address, user_agent, notes,
          shift_id, shift_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      recordId = insertStmt.run(
        employeeId, today, currentTime, latitude, longitude, distanceMeters, clientAccuracy,
        photoUrl, status, startTime, endTime, lateMinutes,
        deduction, verificationStatus, clientIp, userAgent, notes,
        matchedShiftId, matchedShiftName
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

    const empUser = db.prepare('SELECT manager_id, shift_id, face_descriptor FROM users WHERE id = ?').get(employeeId);
    const isManagerSelf = req.user.role === 'manager';
    const managerId = isManagerSelf ? req.user.id : (empUser ? (empUser.manager_id || 1) : 1);
    let workplace = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!workplace && (managerId === 1 || isManagerSelf)) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }
    if (!workplace) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 LIMIT 1`).get();
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

    // Biometric Face ID Verification on checkout if photo and registered descriptor exist
    if (photo && empUser && empUser.face_descriptor && req.body.face_descriptor) {
      try {
        const registeredDesc = typeof empUser.face_descriptor === 'string' ? JSON.parse(empUser.face_descriptor) : empUser.face_descriptor;
        if (registeredDesc && Array.isArray(registeredDesc) && registeredDesc.length === 128) {
          const incomingDesc = req.body.face_descriptor;
          if (Array.isArray(incomingDesc) && incomingDesc.length === 128) {
            let sum = 0;
            for (let i = 0; i < 128; i++) {
              const diff = registeredDesc[i] - incomingDesc[i];
              sum += diff * diff;
            }
            const distance = Math.sqrt(sum);
            if (distance > 0.58) {
              const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
              logAudit(employeeId, req.user.full_name, 'BIOMETRIC_MISMATCH_CHECKOUT', 'attendance_records', null, null, { distance }, 'محاولة انصراف ببصمة وجه غير مطابقة', clientIp);
              return res.status(400).json({
                success: false,
                biometricMismatch: true,
                error: 'فشل التحقق البيومتري: ملامح الوجه لا تتطابق مع الموظف المسجل بهذا الحساب!'
              });
            }
          }
        }
      } catch (faceErr) {
        console.warn('Checkout biometric error:', faceErr);
      }
    }

    const photoUrl = photo ? saveBase64Image(photo, `checkout_emp${employeeId}`) : null;

    // Calculate worked hours
    const inMins = timeToMinutes(record.check_in_time);
    const outMins = timeToMinutes(currentTime);
    const workedMinutes = Math.max(0, outMins - inMins);
    const workedHours = parseFloat((workedMinutes / 60).toFixed(2));

    // Determine company schedule mode (mutually exclusive: shifts vs normal)
    const scheduleMode = (workplace && workplace.schedule_mode) || 'normal';
    let scheduledEnd = '17:00';
    let earlyGraceMins = 0;
    let matchedShift = null;

    if (scheduleMode === 'shifts') {
      const activeShifts = db.prepare(`SELECT * FROM company_shifts WHERE manager_id = ? AND is_active = 1 ORDER BY start_time ASC`).all(managerId);

      if (record.shift_id) {
        matchedShift = activeShifts.find(s => s.id === record.shift_id);
      }
      if (!matchedShift && empUser && empUser.shift_id) {
        matchedShift = activeShifts.find(s => s.id === empUser.shift_id);
      }
      if (!matchedShift && activeShifts.length > 0) {
        matchedShift = activeShifts.find(s => {
          if (!s.assigned_employee_ids) return false;
          try {
            const ids = typeof s.assigned_employee_ids === 'string'
              ? (s.assigned_employee_ids.startsWith('[') ? JSON.parse(s.assigned_employee_ids) : s.assigned_employee_ids.split(',').map(Number))
              : s.assigned_employee_ids;
            return Array.isArray(ids) && ids.includes(employeeId);
          } catch(e) { return false; }
        });
      }
      if (!matchedShift && activeShifts.length > 0) {
        const refMins = timeToMinutes(record.check_in_time || record.scheduled_start || currentTime);
        matchedShift = activeShifts.reduce((closest, s) => {
          const diff1 = Math.abs(timeToMinutes(s.start_time) - refMins);
          const diff2 = Math.abs(timeToMinutes(closest.start_time) - refMins);
          return diff1 < diff2 ? s : closest;
        }, activeShifts[0]);
      }

      if (matchedShift) {
        scheduledEnd = matchedShift.end_time;
        earlyGraceMins = (matchedShift.early_leave_grace_minutes !== undefined && matchedShift.early_leave_grace_minutes !== null)
          ? matchedShift.early_leave_grace_minutes : 15;
      } else if (record.scheduled_end) {
        scheduledEnd = record.scheduled_end;
      }
    } else {
      // Normal schedule mode
      let schedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
      if (!schedule && managerId === 1) {
        schedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 LIMIT 1`).get();
      }
      earlyGraceMins = schedule ? (schedule.early_leave_grace_minutes || 0) : 0;
      scheduledEnd = (schedule && schedule.end_time) || record.scheduled_end || '17:00';
    }

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
    } else {
      earlyLeaveMinutes = 0;
      if (status === 'Early Leave') {
        status = (record.late_minutes && record.late_minutes > 0) ? 'Late' : 'On Time';
      }
      if (!record.late_minutes || record.late_minutes === 0) {
        deduction = 0;
      }
    }

    // Update attendance record
    db.prepare(`
      UPDATE attendance_records SET
        check_out_time = ?, check_out_lat = ?, check_out_lng = ?, check_out_distance = ?,
        check_out_accuracy = ?, check_out_photo = ?, worked_hours = ?,
        early_leave_minutes = ?, status = ?, estimated_deduction = ?,
        scheduled_start = COALESCE(?, scheduled_start),
        scheduled_end = COALESCE(?, scheduled_end),
        shift_id = COALESCE(?, shift_id),
        shift_name = COALESCE(?, shift_name),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      currentTime, latitude || null, longitude || null, distanceMeters,
      clientAccuracy, photoUrl, workedHours, earlyLeaveMinutes, status, deduction,
      matchedShift ? matchedShift.start_time : null,
      matchedShift ? matchedShift.end_time : null,
      matchedShift ? matchedShift.id : null,
      matchedShift ? matchedShift.name : null,
      record.id
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
    checkAndApplyAutoCheckouts();
    const today = getTodayString();
    const record = db.prepare(`
      SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?
    `).get(req.user.id, today);

    // Get employee's manager and assigned shift
    const empUser = db.prepare('SELECT manager_id, schedule_id, shift_id FROM users WHERE id = ?').get(req.user.id);
    const managerId = req.user.role === 'manager' ? req.user.id : (empUser ? (empUser.manager_id || 1) : 1);

    let workplace = db.prepare(`SELECT * FROM workplaces WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!workplace && managerId === 1) {
      workplace = db.prepare(`SELECT * FROM workplaces WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }

    const settings = {};
    db.prepare(`SELECT key, value FROM company_settings`).all().forEach(r => settings[r.key] = r.value);

    const scheduleMode = workplace ? (workplace.schedule_mode || 'normal') : 'normal';
    let shifts = [];
    if (scheduleMode === 'shifts') {
      const rawShifts = db.prepare('SELECT id, manager_id, name, start_time, end_time, grace_period_minutes, early_leave_grace_minutes, COALESCE(early_checkin_minutes, 60) as early_checkin_minutes, assigned_employee_ids, is_active FROM company_shifts WHERE manager_id = ? AND is_active = 1 ORDER BY start_time ASC').all(managerId);
      shifts = rawShifts.map(s => {
        let empIds = [];
        try {
          if (s.assigned_employee_ids) {
            empIds = typeof s.assigned_employee_ids === 'string'
              ? (s.assigned_employee_ids.startsWith('[') ? JSON.parse(s.assigned_employee_ids) : s.assigned_employee_ids.split(',').map(Number))
              : s.assigned_employee_ids;
          }
        } catch(e) { empIds = []; }
        return { ...s, early_checkin_minutes: s.early_checkin_minutes || 60, assigned_employee_ids: empIds };
      });

      // Synchronize employee's record with active shift if not yet tagged or mismatched
      if (record && shifts.length > 0) {
        let matchedShift = null;
        if (record.shift_id) {
          matchedShift = shifts.find(s => s.id === record.shift_id);
        }
        if (!matchedShift && empUser && empUser.shift_id) {
          matchedShift = shifts.find(s => s.id === empUser.shift_id);
        }
        if (!matchedShift) {
          matchedShift = shifts.find(s => Array.isArray(s.assigned_employee_ids) && s.assigned_employee_ids.includes(req.user.id));
        }
        if (!matchedShift) {
          const refMins = timeToMinutes(record.check_in_time || record.scheduled_start || '09:00');
          matchedShift = shifts.reduce((closest, s) => {
            const diff1 = Math.abs(timeToMinutes(s.start_time) - refMins);
            const diff2 = Math.abs(timeToMinutes(closest.start_time) - refMins);
            return diff1 < diff2 ? s : closest;
          }, shifts[0]);
        }
        if (matchedShift && (record.shift_id !== matchedShift.id || record.scheduled_end !== matchedShift.end_time || (record.check_out_time && record.early_leave_minutes > 0))) {
          let earlyLeaveMinutes = record.early_leave_minutes || 0;
          let status = record.status;
          let deduction = record.estimated_deduction || 0;

          if (record.check_out_time) {
            const outMins = timeToMinutes(record.check_out_time);
            const shiftEndMins = timeToMinutes(matchedShift.end_time);
            const grace = matchedShift.early_leave_grace_minutes !== undefined ? matchedShift.early_leave_grace_minutes : 15;

            if (outMins < (shiftEndMins - grace)) {
              earlyLeaveMinutes = shiftEndMins - outMins;
              if (status === 'On Time') status = 'Early Leave';
            } else {
              earlyLeaveMinutes = 0;
              if (status === 'Early Leave') {
                status = (record.late_minutes && record.late_minutes > 0) ? 'Late' : 'On Time';
                const earlyLeaveRateSetting = db.prepare(`SELECT value FROM company_settings WHERE key = 'deduction_early_leave_rate'`).get();
                if (earlyLeaveRateSetting && deduction >= parseFloat(earlyLeaveRateSetting.value)) {
                  deduction = Math.max(0, deduction - parseFloat(earlyLeaveRateSetting.value));
                }
              }
            }
          }

          db.prepare(`
            UPDATE attendance_records SET
              shift_id = ?, shift_name = ?, scheduled_start = ?, scheduled_end = ?,
              early_leave_minutes = ?, status = ?, estimated_deduction = ?
            WHERE id = ?
          `).run(matchedShift.id, matchedShift.name, matchedShift.start_time, matchedShift.end_time, earlyLeaveMinutes, status, deduction, record.id);
          record.shift_id = matchedShift.id;
          record.shift_name = matchedShift.name;
          record.scheduled_start = matchedShift.start_time;
          record.scheduled_end = matchedShift.end_time;
          record.early_leave_minutes = earlyLeaveMinutes;
          record.status = status;
          record.estimated_deduction = deduction;
        }
      }
    }

    // Get employee schedule for this manager
    let schedule = db.prepare(`SELECT * FROM schedules WHERE manager_id = ? AND is_configured = 1 LIMIT 1`).get(managerId);
    if (!schedule && managerId === 1) {
      schedule = db.prepare(`SELECT * FROM schedules WHERE id = 1 AND is_configured = 1 LIMIT 1`).get();
    }

    const isFullyConfigured = !!workplace && (scheduleMode === 'shifts' ? shifts.length > 0 : !!schedule);

    // Check if today is an official weekend day or registered holiday for this company
    const dayOfWeek = String(new Date(today + 'T12:00:00').getDay());
    const weekendDaysStr = settings['weekend_days'] || (schedule && schedule.working_days ? (function(wStr) {
      const workdays = (wStr || '0,1,2,3,4').split(',').map(s => s.trim());
      const allDays = ['0', '1', '2', '3', '4', '5', '6'];
      return allDays.filter(d => !workdays.includes(d)).join(',') || 'none';
    })(schedule.working_days) : '5');
    const isWeekend = (weekendDaysStr !== 'none' && weekendDaysStr) ? weekendDaysStr.split(',').map(s => s.trim()).includes(dayOfWeek) : false;
    let holiday = null;
    try {
      holiday = db.prepare('SELECT name FROM holidays WHERE (manager_id = ? OR manager_id IS NULL) AND date = ? LIMIT 1').get(managerId, today);
    } catch (_) {}
    const isOffDay = isWeekend || !!holiday;
    const offDayReason = holiday ? `عطلة رسمية: ${holiday.name}` : (isWeekend ? 'عطلة أسبوعية رسمية للمنشأة' : null);

    res.json({
      success: true,
      today,
      record: record || null,
      notConfigured: !isFullyConfigured,
      schedule_mode: scheduleMode,
      shifts: shifts,
      assigned_shift_id: empUser ? empUser.shift_id : null,
      is_off_day: isOffDay,
      off_day_reason: offDayReason,
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
    const managerId = req.user.manager_id || req.user.id;

    // Trigger auto-absence & auto-checkout checks
    checkAndMarkAutoAbsences();
    checkAndApplyAutoCheckouts();

    // Query active employees for this manager with today's record (LEFT JOIN)
    const records = db.prepare(`
      SELECT
        u.id as employee_id, u.employee_code, u.full_name, u.email, u.job_title, u.profile_photo,
        d.name as department_name,
        COALESCE(ar.scheduled_start, s.start_time) as scheduled_start,
        COALESCE(ar.scheduled_end, s.end_time) as scheduled_end,
        ar.shift_id, ar.shift_name,
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

    // Manager Attendance Tracking Status & Today Record
    let managerAttendance = null;
    const trackSetting = db.prepare('SELECT value FROM company_settings WHERE key = ?').get('manager_track_attendance');
    if (trackSetting && trackSetting.value === '1') {
      const mgrUser = db.prepare('SELECT id, full_name, profile_photo, face_descriptor, face_enrolled_at, base_salary FROM users WHERE id = ?').get(req.user.id);
      const todayMgrRecord = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?').get(req.user.id, today);
      managerAttendance = {
        enabled: true,
        manager_id: req.user.id,
        manager_name: mgrUser ? mgrUser.full_name : '',
        has_face_enrolled: !!(mgrUser && mgrUser.face_descriptor),
        face_enrolled_at: mgrUser ? mgrUser.face_enrolled_at : null,
        record: todayMgrRecord || null
      };
    }

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
      records,
      manager_attendance: managerAttendance
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
    checkAndApplyAutoCheckouts();
    const isManager = req.user.role === 'manager';
    const { date_from, date_to, employee_id, department_id, status, verification_status, search } = req.query;

    const managerId = req.user.manager_id || req.user.id;
    syncAbsencesForDateRange(date_from, date_to, isManager ? managerId : null);

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

    // Security: Employee can ONLY view their own records, Manager views their company's records
    if (!isManager) {
      query += ` AND ar.employee_id = ? `;
      params.push(req.user.id);
    } else {
      query += ` AND (u.manager_id = ? OR u.id = ? OR (u.manager_id IS NULL AND ? = 1)) `;
      params.push(managerId, managerId, managerId);
      if (employee_id) {
        query += ` AND ar.employee_id = ? `;
        params.push(employee_id);
      }
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

// Helper to evaluate attendance status & deductions automatically
function evaluateAttendanceStatusAndDeduction(checkInTime, schedStartTime, gracePeriodMins, waiveDeductions = false) {
  if (waiveDeductions) {
    return { status: 'On Time', lateMinutes: 0, deduction: 0 };
  }
  if (!checkInTime) {
    const absenceRate = db.prepare(`SELECT value FROM company_settings WHERE key = 'deduction_absence_rate'`).get();
    return { status: 'Absent', lateMinutes: 0, deduction: absenceRate ? parseFloat(absenceRate.value) : 100 };
  }

  const inM = timeToMinutes(checkInTime);
  const startM = timeToMinutes(schedStartTime || '09:00');
  const grace = gracePeriodMins !== undefined ? parseInt(gracePeriodMins, 10) : 15;
  const diff = inM - startM;

  if (diff <= grace) {
    return { status: 'On Time', lateMinutes: 0, deduction: 0 };
  }

  // Employee is Late
  const lateMinutes = diff;
  let deduction = 0;

  const settingsRows = db.prepare(`SELECT key, value FROM company_settings`).all();
  const settings = {};
  settingsRows.forEach(r => settings[r.key] = r.value);

  let delayTiers = [];
  try {
    if (settings['delay_deduction_tiers']) {
      delayTiers = JSON.parse(settings['delay_deduction_tiers']);
    }
  } catch (_) { delayTiers = []; }

  if (Array.isArray(delayTiers) && delayTiers.length > 0) {
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
    } else {
      deduction = parseFloat(settings['deduction_late_rate'] || '50');
    }
  }

  return { status: 'Late', lateMinutes, deduction };
}

// ==========================================
// 6. Manual Edit Attendance Record (PUT /api/attendance/:id) - Manager Only
// ==========================================
router.put('/:id', authenticateToken, requireManager, (req, res) => {
  try {
    const recordId = req.params.id;
    const { check_in_time, check_out_time, notes, reason, waive_deductions, shift_id } = req.body;

    const oldRecord = db.prepare(`SELECT * FROM attendance_records WHERE id = ?`).get(recordId);
    if (!oldRecord) {
      return res.status(404).json({ success: false, error: 'سجل الحضور غير موجود' });
    }
    if (!isManagedEmployee(req.user.manager_id || req.user.id, oldRecord.employee_id)) {
      return res.status(403).json({ success: false, error: 'غير مصرح بتعديل سجل تابع لمنشأة أخرى' });
    }

    const cleanReason = (reason && reason.trim()) || 'تعديل موعد الحضور بناء على مراجعة الإدارة';

    // 1. Shift handling
    let newShiftId = oldRecord.shift_id;
    let newShiftName = oldRecord.shift_name;
    let schedStart = oldRecord.scheduled_start || '09:00';
    let schedEnd = oldRecord.scheduled_end || '17:00';
    let graceMins = 15;

    if (shift_id !== undefined && shift_id !== null && shift_id !== '') {
      const managerId = req.user.manager_id || req.user.id;
      if (!isManagedResource('company_shifts', managerId, shift_id)) {
        return res.status(403).json({ success: false, error: 'لا يمكن استخدام وردية تابعة لمنشأة أخرى' });
      }
      const chosenShift = db.prepare('SELECT * FROM company_shifts WHERE id = ?').get(parseInt(shift_id, 10));
      if (chosenShift) {
        newShiftId = chosenShift.id;
        newShiftName = chosenShift.name;
        schedStart = chosenShift.start_time;
        schedEnd = chosenShift.end_time;
        if (chosenShift.grace_period_minutes !== undefined) graceMins = chosenShift.grace_period_minutes;
      }
    } else if (shift_id === '' || shift_id === null) {
      newShiftId = null;
      newShiftName = null;
    } else if (oldRecord.shift_id) {
      const currentShift = db.prepare('SELECT * FROM company_shifts WHERE id = ?').get(oldRecord.shift_id);
      if (currentShift) {
        schedStart = currentShift.start_time;
        schedEnd = currentShift.end_time;
        if (currentShift.grace_period_minutes !== undefined) graceMins = currentShift.grace_period_minutes;
      }
    } else {
      // Get schedule grace period for employee
      const empUser = db.prepare(`
        SELECT u.id, COALESCE(s.start_time, '09:00') as start_time, COALESCE(s.grace_period_minutes, 15) as grace_period_minutes
        FROM users u
        LEFT JOIN schedules s ON u.schedule_id = s.id
        WHERE u.id = ?
      `).get(oldRecord.employee_id);

      if (empUser) {
        schedStart = empUser.start_time;
        graceMins = empUser.grace_period_minutes;
      }
    }

    // Determine final check-out time: if passed as null or empty string, clear it!
    let finalCheckOut = oldRecord.check_out_time;
    if (check_out_time !== undefined) {
      finalCheckOut = (check_out_time && String(check_out_time).trim()) ? String(check_out_time).trim() : null;
    }

    const finalCheckIn = check_in_time !== undefined ? (check_in_time && String(check_in_time).trim() ? String(check_in_time).trim() : null) : oldRecord.check_in_time;

    // Recompute worked hours if both times exist
    let workedHours = 0;
    if (finalCheckIn && finalCheckOut) {
      const inM = timeToMinutes(finalCheckIn);
      const outM = timeToMinutes(finalCheckOut);
      workedHours = parseFloat((Math.max(0, outM - inM) / 60).toFixed(2));
    }

    // Determine status & deductions automatically
    const evalResult = evaluateAttendanceStatusAndDeduction(finalCheckIn, schedStart, graceMins, waive_deductions);

    const verificationStatus = finalCheckOut ? 'manual_override' : 'verified';

    const newValues = {
      check_in_time: finalCheckIn,
      check_out_time: finalCheckOut,
      status: evalResult.status,
      worked_hours: workedHours,
      late_minutes: evalResult.lateMinutes,
      estimated_deduction: evalResult.deduction,
      notes: notes !== undefined ? notes : oldRecord.notes,
      verification_status: verificationStatus,
      shift_id: newShiftId,
      shift_name: newShiftName,
      scheduled_start: schedStart,
      scheduled_end: schedEnd
    };

    db.prepare(`
      UPDATE attendance_records SET
        check_in_time = ?, check_out_time = ?, status = ?, worked_hours = ?,
        late_minutes = ?, estimated_deduction = ?,
        notes = ?, verification_status = ?,
        shift_id = ?, shift_name = ?, scheduled_start = ?, scheduled_end = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      newValues.check_in_time, newValues.check_out_time, newValues.status,
      newValues.worked_hours, newValues.late_minutes, newValues.estimated_deduction,
      newValues.notes, newValues.verification_status,
      newValues.shift_id, newValues.shift_name, newValues.scheduled_start, newValues.scheduled_end,
      recordId
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
      cleanReason,
      clientIp
    );

    // Notify employee
    createNotification(
      oldRecord.employee_id,
      'تعديل في سجل الحضور الخاص بك',
      `قام مدير النظام بتعديل سجل حضورك ليوم ${oldRecord.date}. السبب: ${cleanReason}`,
      'info'
    );

    res.json({ success: true, message: 'تم تحديث سجل الحضور والوردية بنجاح واحتساب الحالة تلقائياً' });
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
    const { employee_id, date, check_in_time, check_out_time, reason, waive_deductions, shift_id } = req.body;

    if (!employee_id || !date) {
      return res.status(400).json({ success: false, error: 'يرجى اختيار الموظف والتاريخ' });
    }

    const cleanReason = (reason && reason.trim()) || 'توثيق حضور إداري';

    const emp = db.prepare(`
      SELECT u.id, u.full_name, u.schedule_id, u.shift_id as emp_shift_id,
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
    if (!isManagedEmployee(req.user.manager_id || req.user.id, employee_id)) {
      return res.status(403).json({ success: false, error: 'غير مصرح بتسجيل حضور لموظف تابع لمنشأة أخرى' });
    }

    let targetShiftId = shift_id !== undefined ? (shift_id ? parseInt(shift_id, 10) : null) : (emp.emp_shift_id || null);
    let targetShiftName = null;
    let schedStart = emp.start_time;
    let schedEnd = emp.end_time;
    let graceMins = emp.grace_period_minutes;

    if (targetShiftId) {
      if (!isManagedResource('company_shifts', req.user.manager_id || req.user.id, targetShiftId)) {
        return res.status(403).json({ success: false, error: 'لا يمكن استخدام وردية تابعة لمنشأة أخرى' });
      }
      const chosenShift = db.prepare('SELECT * FROM company_shifts WHERE id = ?').get(targetShiftId);
      if (chosenShift) {
        targetShiftName = chosenShift.name;
        schedStart = chosenShift.start_time;
        schedEnd = chosenShift.end_time;
        if (chosenShift.grace_period_minutes !== undefined) graceMins = chosenShift.grace_period_minutes;
      }
    }

    // Compute worked hours
    let workedHours = 0;
    if (check_in_time && check_out_time) {
      const inM = timeToMinutes(check_in_time);
      const outM = timeToMinutes(check_out_time);
      workedHours = parseFloat((Math.max(0, outM - inM) / 60).toFixed(2));
    } else if (check_in_time && !check_out_time) {
      workedHours = 0;
    }

    // Automatically determine status & late minutes & deduction
    const evalResult = evaluateAttendanceStatusAndDeduction(check_in_time, schedStart, graceMins, waive_deductions);

    // Check if record exists for this date and employee
    const existing = db.prepare(`SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?`).get(employee_id, date);

    let recordId;
    if (existing) {
      recordId = existing.id;
      db.prepare(`
        UPDATE attendance_records SET
          check_in_time = ?, check_out_time = ?, status = ?, worked_hours = ?,
          late_minutes = ?, estimated_deduction = ?, verification_status = ?,
          notes = ?, shift_id = ?, shift_name = ?, scheduled_start = ?, scheduled_end = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        check_in_time || null, check_out_time || null, evalResult.status, workedHours,
        evalResult.lateMinutes, evalResult.deduction, check_out_time ? 'manual_admin' : 'verified',
        cleanReason, targetShiftId, targetShiftName, schedStart, schedEnd, recordId
      );
    } else {
      const info = db.prepare(`
        INSERT INTO attendance_records (
          employee_id, date, check_in_time, check_out_time, scheduled_start, scheduled_end,
          status, worked_hours, late_minutes, early_leave_minutes, estimated_deduction,
          verification_status, notes, shift_id, shift_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `).run(
        employee_id, date, check_in_time || null, check_out_time || null, schedStart, schedEnd,
        evalResult.status, workedHours, evalResult.lateMinutes, evalResult.deduction,
        check_out_time ? 'manual_admin' : 'verified', cleanReason, targetShiftId, targetShiftName
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
      { employee_id, date, check_in_time, check_out_time, status: evalResult.status, workedHours, lateMinutes: evalResult.lateMinutes, deduction: evalResult.deduction },
      `تسجيل/تعديل حضور يدوي بأثر رجعي: ${cleanReason}`,
      clientIp
    );

    createNotification(
      employee_id,
      'تسجيل/تعديل حضور يدوي بأثر رجعي',
      `قام مدير النظام بتوثيق حضورك ليوم ${date} بموعد ${check_in_time || 'معتمد'}. المبرر: ${cleanReason}`,
      'info'
    );

    res.json({
      success: true,
      message: 'تم حفظ وتوثيق سجل الحضور بنجاح واحتساب الحالة تلقائياً',
      recordId,
      status: evalResult.status
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
    if (!isManagedEmployee(req.user.manager_id || req.user.id, record.employee_id)) {
      return res.status(403).json({ success: false, error: 'غير مصرح بحذف سجل تابع لمنشأة أخرى' });
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

    const managerId = req.user.manager_id || req.user.id;

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
        WHERE u.id = ? AND u.role = 'employee'
      `).get(employee_id);
      if (!emp) return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
      if (!isManagedEmployee(managerId, employee_id)) {
        return res.status(403).json({ success: false, error: 'غير مصرح بإضافة حضور لموظف تابع لمنشأة أخرى' });
      }
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
          AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1))
      `).all(managerId, managerId);
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

// ==========================================
// 10. Multi-Row Manual Attendance (POST /api/attendance/batch-manual-records) - Manager Only
// Adds multiple attendance rows with different employees, dates, times
// ==========================================
router.post('/batch-manual-records', authenticateToken, requireManager, (req, res) => {
  try {
    const { items } = req.body; // Array of { employee_id, date, check_in_time, check_out_time, reason, waive_deductions }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'يرجى تقديم صف حضور واحد على الأقل' });
    }

    const managerId = req.user.manager_id || req.user.id;
    for (const item of items) {
      const employeeId = parseInt(item.employee_id, 10);
      if (!employeeId || !isManagedEmployee(managerId, employeeId)) {
        return res.status(403).json({ success: false, error: 'تحتوي البيانات على موظف غير تابع لمنشأتك' });
      }
      if (item.shift_id && !isManagedResource('company_shifts', managerId, item.shift_id)) {
        return res.status(403).json({ success: false, error: 'تحتوي البيانات على وردية غير تابعة لمنشأتك' });
      }
    }

    let insertedCount = 0;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    for (const item of items) {
      const empId = parseInt(item.employee_id, 10);
      const date = item.date;
      if (!empId || !date) continue;

      const inTime = item.check_in_time || null;
      const outTime = item.check_out_time || null;
      const cleanReason = (item.reason && item.reason.trim()) || 'توثيق حضور إداري';
      const waive = !!item.waive_deductions;
      const shiftId = item.shift_id ? parseInt(item.shift_id, 10) : null;

      const emp = db.prepare(`
        SELECT u.id, u.full_name, u.schedule_id, u.shift_id as emp_shift_id,
               COALESCE(s.start_time, '09:00') as start_time,
               COALESCE(s.end_time, '17:00') as end_time,
               COALESCE(s.grace_period_minutes, 15) as grace_period_minutes
        FROM users u
        LEFT JOIN schedules s ON u.schedule_id = s.id
        WHERE u.id = ?
      `).get(empId);

      if (!emp) continue;

      let targetShiftId = shiftId !== null ? shiftId : (emp.emp_shift_id || null);
      let targetShiftName = null;
      let schedStart = emp.start_time;
      let schedEnd = emp.end_time;
      let graceMins = emp.grace_period_minutes;

      if (targetShiftId) {
        const chosenShift = db.prepare('SELECT * FROM company_shifts WHERE id = ?').get(targetShiftId);
        if (chosenShift) {
          targetShiftName = chosenShift.name;
          schedStart = chosenShift.start_time;
          schedEnd = chosenShift.end_time;
          if (chosenShift.grace_period_minutes !== undefined) graceMins = chosenShift.grace_period_minutes;
        }
      }

      // Calculate worked hours
      let workedHours = 0;
      if (inTime && outTime) {
        const inM = timeToMinutes(inTime);
        const outM = timeToMinutes(outTime);
        workedHours = parseFloat((Math.max(0, outM - inM) / 60).toFixed(2));
      } else if (inTime && !outTime) {
        workedHours = 0;
      }

      // Automatically determine status & late minutes & deduction
      const evalResult = evaluateAttendanceStatusAndDeduction(inTime, schedStart, graceMins, waive);

      // Upsert record
      const existing = db.prepare(`SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?`).get(empId, date);

      if (existing) {
        db.prepare(`
          UPDATE attendance_records SET
            check_in_time = ?, check_out_time = ?, status = ?, worked_hours = ?,
            late_minutes = ?, estimated_deduction = ?, verification_status = ?,
            notes = ?, shift_id = ?, shift_name = ?, scheduled_start = ?, scheduled_end = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          inTime, outTime, evalResult.status, workedHours,
          evalResult.lateMinutes, evalResult.deduction, outTime ? 'manual_admin' : 'verified',
          cleanReason, targetShiftId, targetShiftName, schedStart, schedEnd, existing.id
        );
      } else {
        db.prepare(`
          INSERT INTO attendance_records (
            employee_id, date, check_in_time, check_out_time, scheduled_start, scheduled_end,
            status, worked_hours, late_minutes, early_leave_minutes, estimated_deduction,
            verification_status, notes, shift_id, shift_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
        `).run(
          empId, date, inTime, outTime, schedStart, schedEnd,
          evalResult.status, workedHours, evalResult.lateMinutes, evalResult.deduction,
          outTime ? 'manual_admin' : 'verified', cleanReason, targetShiftId, targetShiftName
        );
      }

      insertedCount++;
    }

    logAudit(
      req.user.id,
      req.user.full_name,
      'BATCH_MANUAL_ATTENDANCE',
      'attendance_records',
      null,
      null,
      { count: insertedCount },
      `إضافة وتوثيق (${insertedCount}) سجلات حضور دفعة واحدة بتوقيتات متعددة`,
      clientIp
    );

    res.json({
      success: true,
      count: insertedCount,
      message: `تم بنجاح حفظ وتوثيق (${insertedCount}) سجلات حضور في النظام`
    });
  } catch (error) {
    console.error('Batch manual records error:', error);
    res.status(500).json({ success: false, error: 'فشل في حفظ سجلات الحضور: ' + error.message });
  }
});

// ==========================================
// BIOMETRIC FACE ID RESET REQUESTS & REVIEW
// ==========================================

// 1. Employee submits Face Reset Request (POST /api/attendance/face-reset-request)
router.post('/face-reset-request', authenticateToken, (req, res) => {
  try {
    const employeeId = req.user.id;
    const { reason } = req.body;

    const emp = db.prepare('SELECT id, full_name, manager_id, face_descriptor FROM users WHERE id = ?').get(employeeId);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
    }

    if (!emp.face_descriptor) {
      return res.status(400).json({ success: false, error: 'لا توجد بصمة وجه مسجلة لهذا الحساب حالياً ليتم تغييرها' });
    }

    // Check if employee already has a pending request
    const pending = db.prepare(`SELECT id FROM face_reset_requests WHERE employee_id = ? AND status = 'pending'`).get(employeeId);
    if (pending) {
      return res.status(400).json({ success: false, error: 'لديك طلب معلق بالفعل قيد مراجعة المدير' });
    }

    const managerId = emp.manager_id || 1;
    const info = db.prepare(`
      INSERT INTO face_reset_requests (employee_id, manager_id, reason, status)
      VALUES (?, ?, ?, 'pending')
    `).run(employeeId, managerId, (reason || '').trim() || null);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(employeeId, emp.full_name, 'REQUEST_FACE_RESET', 'face_reset_requests', info.lastInsertRowid, null, { reason }, 'طلب إعادة تعيين بصمة الوجه', clientIp);

    // Notify manager with action-ready notification
    createNotification(
      managerId,
      'طلب تغيير بصمة الوجه',
      `طلب الموظف ${emp.full_name} إعادة تعيين بصمة الوجه الخاصة به${reason ? ': ' + reason : ''}`,
      'face_reset_request',
      info.lastInsertRowid
    );

    res.json({
      success: true,
      message: 'تم إرسال طلب إعادة تعيين بصمة الوجه إلى المدير بنجاح، وستتلقى إشعاراً فور مراجعته.'
    });
  } catch (err) {
    console.error('Face reset request error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إرسال طلب تغيير البصمة' });
  }
});

// 2. Employee gets latest Face Reset Status (GET /api/attendance/face-reset-status)
router.get('/face-reset-status', authenticateToken, (req, res) => {
  try {
    const employeeId = req.user.id;
    const latest = db.prepare(`
      SELECT id, employee_id, status, reason, reviewed_at, created_at
      FROM face_reset_requests
      WHERE employee_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(employeeId);

    res.json({ success: true, request: latest || null });
  } catch (err) {
    console.error('Get face reset status error:', err);
    res.status(500).json({ success: false, error: 'فشل في جلب حالة طلب البصمة' });
  }
});

// 3. Manager lists Face Reset Requests (GET /api/attendance/face-reset-requests)
router.get('/face-reset-requests', authenticateToken, requireManager, (req, res) => {
  try {
    const managerId = req.user.manager_id || req.user.id;
    const requests = db.prepare(`
      SELECT r.*, u.full_name as employee_name, u.employee_code, u.profile_photo
      FROM face_reset_requests r
      JOIN users u ON r.employee_id = u.id
      WHERE (r.manager_id = ? OR (r.manager_id IS NULL AND ? = 1))
        AND (u.manager_id = ? OR (u.manager_id IS NULL AND ? = 1))
      ORDER BY r.created_at DESC LIMIT 50
    `).all(managerId, managerId, managerId, managerId);

    res.json({ success: true, requests });
  } catch (err) {
    console.error('Get face reset requests error:', err);
    res.status(500).json({ success: false, error: 'فشل في جلب طلبات تغيير البصمة' });
  }
});

// 4. Manager reviews Face Reset Request (PUT /api/attendance/face-reset-requests/:id/review)
router.put('/face-reset-requests/:id/review', authenticateToken, requireManager, (req, res) => {
  try {
    const rawId = parseInt(req.params.id, 10);
    const { action, notes, notif_id } = req.body;

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ success: false, error: 'إجراء غير صالح، يجب أن يكون قبول أو رفض' });
    }

    const managerId = req.user.manager_id || req.user.id;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const nowIso = new Date().toISOString();

    // 1. Try to find request by ID
    let resetReq = rawId ? db.prepare(`SELECT * FROM face_reset_requests WHERE id = ?`).get(rawId) : null;

    // 2. If not found by rawId, check if rawId or notif_id is a notification ID
    let notif = null;
    const candidateNotifId = notif_id || rawId;
    if (candidateNotifId) {
      notif = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(candidateNotifId);
      if (notif && notif.related_id && !resetReq) {
        resetReq = db.prepare(`SELECT * FROM face_reset_requests WHERE id = ?`).get(notif.related_id);
      }
    }

    // 3. If still not found, check any pending request for this manager
    if (!resetReq) {
      resetReq = db.prepare(`
        SELECT * FROM face_reset_requests 
        WHERE (manager_id = ? OR (manager_id IS NULL AND ? = 1)) AND status = 'pending' 
        ORDER BY id DESC LIMIT 1
      `).get(managerId, managerId);
    }
    if (resetReq && !isManagedEmployee(managerId, resetReq.employee_id)) {
      return res.status(403).json({ success: false, error: 'غير مصرح بمراجعة طلب تابع لمنشأة أخرى' });
    }

    // Determine target employee
    let targetEmployeeId = null;
    let targetEmployeeName = '';

    if (resetReq) {
      targetEmployeeId = resetReq.employee_id;
      const emp = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(targetEmployeeId);
      if (emp) targetEmployeeName = emp.full_name;
    } else if (notif) {
      // Find employee mentioned in notification message
      const employees = db.prepare("SELECT id, full_name FROM users WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1))").all(managerId, managerId);
      const matchedEmp = employees.find(e => notif.message && notif.message.includes(e.full_name));
      if (matchedEmp) {
        targetEmployeeId = matchedEmp.id;
        targetEmployeeName = matchedEmp.full_name;
      }
    }

    if (!targetEmployeeId) {
      const anyEmp = db.prepare("SELECT id, full_name FROM users WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1)) AND face_descriptor IS NOT NULL LIMIT 1").get(managerId, managerId)
        || db.prepare("SELECT id, full_name FROM users WHERE role = 'employee' AND (manager_id = ? OR (manager_id IS NULL AND ? = 1)) LIMIT 1").get(managerId, managerId);
      if (anyEmp) {
        targetEmployeeId = anyEmp.id;
        targetEmployeeName = anyEmp.full_name;
      }
    }

    if (targetEmployeeId && !isManagedEmployee(managerId, targetEmployeeId)) {
      return res.status(403).json({ success: false, error: 'غير مصرح بتعديل بصمة موظف تابع لمنشأة أخرى' });
    }

    if (action === 'approved') {
      if (targetEmployeeId) {
        db.prepare(`
          UPDATE users SET
            face_descriptor = NULL,
            face_photo = NULL,
            face_enrolled_at = NULL
          WHERE id = ?
        `).run(targetEmployeeId);

        createNotification(
          targetEmployeeId,
          'تم قبول طلب تغيير بصمة الوجه',
          'وافق المدير على طلب إعادة تعيين بصمة الوجه الخاصة بك. يمكنك الآن تسجيل بصمتك الجديدة فوراً.',
          'success',
          resetReq ? resetReq.id : null
        );

        logAudit(req.user.id, req.user.full_name, 'APPROVE_FACE_RESET', 'users', targetEmployeeId, null, null, `موافقة على إعادة تعيين بصمة الموظف ${targetEmployeeName}`, clientIp);
      }

      if (resetReq) {
        db.prepare(`
          UPDATE face_reset_requests SET
            status = 'approved',
            reviewed_by = ?,
            reviewed_at = ?
          WHERE id = ?
        `).run(req.user.id, nowIso, resetReq.id);
        db.prepare(`UPDATE notifications SET is_read = 1 WHERE related_id = ? AND type = 'face_reset_request'`).run(resetReq.id);
      }

      if (candidateNotifId) {
        db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(candidateNotifId);
      }
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE type = 'face_reset_request' AND (user_id = ? OR user_id IS NULL)`).run(managerId);

      return res.json({
        success: true,
        status: 'approved',
        message: `تمت الموافقة على إعادة تعيين بصمة الموظف ${targetEmployeeName} بنجاح، ويمكنه الآن تسجيل وجهه مجدداً.`
      });
    } else {
      // Rejection
      if (resetReq) {
        db.prepare(`
          UPDATE face_reset_requests SET
            status = 'rejected',
            reviewed_by = ?,
            reviewed_at = ?
          WHERE id = ?
        `).run(req.user.id, nowIso, resetReq.id);
        db.prepare(`UPDATE notifications SET is_read = 1 WHERE related_id = ? AND type = 'face_reset_request'`).run(resetReq.id);
      }

      if (targetEmployeeId) {
        createNotification(
          targetEmployeeId,
          'تم رفض طلب تغيير بصمة الوجه',
          'نحيطكم علماً بأن المدير قد رفض طلب إعادة تعيين بصمة الوجه.' + (notes ? ` السبب: ${notes}` : ''),
          'danger',
          resetReq ? resetReq.id : null
        );
        logAudit(req.user.id, req.user.full_name, 'REJECT_FACE_RESET', 'users', targetEmployeeId, null, { notes }, `رفض إعادة تعيين بصمة الموظف ${targetEmployeeName}`, clientIp);
      }

      if (candidateNotifId) {
        db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(candidateNotifId);
      }
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE type = 'face_reset_request' AND (user_id = ? OR user_id IS NULL)`).run(managerId);

      return res.json({
        success: true,
        status: 'rejected',
        message: `تم رفض طلب إعادة تعيين بصمة الموظف ${targetEmployeeName}.`
      });
    }
  } catch (err) {
    console.error('Review face reset error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء مراجعة الطلب' });
  }
});

router.evaluateAttendanceStatusAndDeduction = evaluateAttendanceStatusAndDeduction;
router.timeToMinutes = timeToMinutes;

module.exports = router;
