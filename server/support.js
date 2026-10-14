const express = require('express');
const { db, logAudit } = require('./database');

const router = express.Router();

const PACKAGES = [
  {
    id: 'monthly',
    name: 'الباقة الشهرية',
    duration_days: 30,
    price: 199,
    currency: 'ج.م',
    period_label: 'شهرياً (30 يوم)',
    popular: false,
    badge: null,
    features: [
      'تسجيل حضور وانصراف دقيق بالبصمة الحية وGPS',
      'إدارة كاملة للموظفين دون حد أقصى',
      'تقارير شهرية مفصلة مع تصدير Excel وPDF',
      'حساب فوري للخصومات والتأخيرات والغياب'
    ]
  },
  {
    id: 'quarterly',
    name: 'الباقة ربع السنوية',
    duration_days: 90,
    price: 499,
    currency: 'ج.م',
    period_label: 'كل 3 شهور (90 يوم)',
    popular: true,
    badge: 'الأكثر طلباً 🔥',
    features: [
      'جميع ميزات الباقة الشهرية كاملة',
      'نظام السلف والمكافآت وإدارة مسيرات الرواتب',
      'إدارة طلبات الإجازات والأذونات الرسمية',
      'أولوية في الدعم الفني والمساعدة المباشرة'
    ]
  },
  {
    id: 'semi_annual',
    name: 'الباقة نصف السنوية',
    duration_days: 180,
    price: 899,
    currency: 'ج.م',
    period_label: 'كل 6 شهور (180 يوم)',
    popular: false,
    badge: 'توفير متميز ✨',
    features: [
      'جميع ميزات الباقة ربع السنوية',
      'مؤشرات أداء الموظفين ونسبة الانضباط الشهرية',
      'إشعارات وتقارير ذكية دورية',
      'توفير ملحوظ مقارنة بالاشتراك الشهري'
    ]
  },
  {
    id: 'annual',
    name: 'الباقة السنوية',
    duration_days: 365,
    price: 1599,
    currency: 'ج.م',
    period_label: 'سنوياً (365 يوم)',
    popular: false,
    badge: 'أعلى توفير ⭐',
    features: [
      'سنة كاملة مستمرة بدون توقف',
      'كافة التحديثات والميزات الجديدة مجاناً',
      'دعم فني خاص على مدار الساعة VIP',
      'أعلى نسبة توفير وضمان ثبات السعر'
    ]
  }
];

const SUPPORT_WHATSAPP = '01093320211';

// GET /api/support/packages - Public subscription packages info
router.get('/packages', (req, res) => {
  res.json({
    success: true,
    packages: PACKAGES,
    support_phone: SUPPORT_WHATSAPP,
    whatsapp_url: `https://wa.me/201093320211`
  });
});

// POST /api/support/tickets - Submit a technical support ticket from main site
router.post('/tickets', (req, res) => {
  try {
    const { sender_name, sender_phone, sender_email, company_name, role, subject, message } = req.body;

    if (!sender_name || !sender_phone || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'يرجى ملء جميع الحقول الإلزامية (الاسم، رقم الهاتف، عنوان المشكلة، وتفاصيلها)'
      });
    }

    const stmt = db.prepare(`
      INSERT INTO support_tickets (sender_name, sender_phone, sender_email, company_name, role, subject, message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
    `);

    const result = stmt.run(
      sender_name.trim(),
      sender_phone.trim(),
      sender_email ? sender_email.trim() : null,
      company_name ? company_name.trim() : null,
      role ? role.trim() : 'user',
      subject.trim(),
      message.trim()
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logAudit(
      0,
      sender_name,
      'SUPPORT_TICKET_SUBMITTED',
      'support_tickets',
      result.lastInsertRowid,
      null,
      { subject, sender_phone },
      `تقديم تذكرة دعم فني جديدة: "${subject}" من ${sender_name} (${sender_phone})`,
      clientIp
    );

    res.json({
      success: true,
      message: 'تم إرسال مشكلتك إلى فريق الدعم الفني بنجاح، وسيتم التواصل معك عبر الواتساب في أقرب وقت ✅',
      ticket_id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Submit support ticket error:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إرسال تذكرة الدعم' });
  }
});

module.exports = {
  router,
  PACKAGES,
  SUPPORT_WHATSAPP
};
