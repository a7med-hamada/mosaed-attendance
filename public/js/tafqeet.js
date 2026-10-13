/**
 * Arabic Number to Words Converter (Tafqeet / التفقيط العربي بالجنيه المصري)
 * Professional HR & Payroll Payslip generator helper for شركة مساعد
 */
(function (global) {
  'use strict';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertHundreds(n) {
    let result = '';
    const h = Math.floor(n / 100);
    const rem = n % 100;

    if (h > 0) {
      result += hundreds[h];
    }

    if (rem > 0) {
      if (h > 0) result += ' و';
      if (rem < 10) {
        result += ones[rem];
      } else if (rem >= 10 && rem <= 19) {
        result += teens[rem - 10];
      } else {
        const t = Math.floor(rem / 10);
        const o = rem % 10;
        if (o > 0) {
          result += ones[o] + ' و' + tens[t];
        } else {
          result += tens[t];
        }
      }
    }

    return result;
  }

  function numberToArabicWords(num) {
    if (num === 0) return 'صفر';
    if (num < 0) return 'سالب ' + numberToArabicWords(Math.abs(num));

    let n = Math.floor(num);
    let parts = [];

    // Billions
    const billions = Math.floor(n / 1000000000);
    n %= 1000000000;
    if (billions > 0) {
      if (billions === 1) parts.push('مليار');
      else if (billions === 2) parts.push('ملياران');
      else if (billions >= 3 && billions <= 10) parts.push(convertHundreds(billions) + ' مليارات');
      else parts.push(convertHundreds(billions) + ' مليار');
    }

    // Millions
    const millions = Math.floor(n / 1000000);
    n %= 1000000;
    if (millions > 0) {
      if (millions === 1) parts.push('مليون');
      else if (millions === 2) parts.push('مليونان');
      else if (millions >= 3 && millions <= 10) parts.push(convertHundreds(millions) + ' ملايين');
      else parts.push(convertHundreds(millions) + ' مليون');
    }

    // Thousands
    const thousands = Math.floor(n / 1000);
    n %= 1000;
    if (thousands > 0) {
      if (thousands === 1) parts.push('ألف');
      else if (thousands === 2) parts.push('ألفان');
      else if (thousands >= 3 && thousands <= 10) parts.push(convertHundreds(thousands) + ' آلاف');
      else parts.push(convertHundreds(thousands) + ' ألف');
    }

    // Remaining hundreds & units
    if (n > 0) {
      parts.push(convertHundreds(n));
    }

    return parts.join(' و');
  }

  function tafqeetCurrency(amount) {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      return 'صفر جنيه مصري لا غير';
    }

    const integerPart = Math.floor(val);
    const fractionPart = Math.round((val - integerPart) * 100);

    let text = 'فقط ' + numberToArabicWords(integerPart);

    if (integerPart === 1) {
      text += ' جنيه مصري';
    } else if (integerPart === 2) {
      text = 'فقط جنيهان مصريان';
    } else if (integerPart >= 3 && integerPart <= 10) {
      text += ' جنيهات مصرية';
    } else {
      text += ' جنيهاً مصرياً';
    }

    if (fractionPart > 0) {
      text += ' و' + numberToArabicWords(fractionPart) + ' قرشاً';
    }

    text += ' لا غير';
    return text;
  }

  function formatMonthNameArabic(monthStr) {
    if (!monthStr) return '';
    const parts = monthStr.split('-');
    const year = parts[0];
    const monthNum = parseInt(parts[1] || '1', 10);
    const names = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return `${names[monthNum - 1] || monthStr} ${year}`;
  }

  // Trigger A4 Print
  function executePayslipPrint() {
    document.body.classList.add('printing-payslip');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-payslip');
    }, 1500);
  }

  // Render & Show Official Payslip Modal
  function showPayslipModal(data, isManager = true) {
    const modal = document.getElementById('payslip-modal');
    if (!modal) return;

    const emp = data.employee || {};
    const stats = data.stats || {};
    const month = data.month || '';
    const advances = (data.advances || []).filter(a => a.status === 'approved');
    const bonuses = data.bonuses || [];

    const baseSalary = stats.baseSalary || parseFloat(emp.base_salary || 3000);
    const totalBonuses = stats.totalBonuses !== undefined ? stats.totalBonuses : bonuses.reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    const totalLateDeductions = stats.totalLateDeductions || 0;
    const totalAbsenceDeductions = stats.totalAbsenceDeductions || 0;
    const totalAdvances = stats.totalAdvances !== undefined ? stats.totalAdvances : advances.reduce((s, a) => s + parseFloat(a.amount || 0), 0);

    const totalEarnings = parseFloat((baseSalary + totalBonuses).toFixed(2));
    const totalDeductions = parseFloat((totalLateDeductions + totalAbsenceDeductions + totalAdvances).toFixed(2));
    const netSalary = Math.max(0, parseFloat((totalEarnings - totalDeductions).toFixed(2)));

    const tafqeetText = tafqeetCurrency(netSalary);
    const todayDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const monthNameAr = formatMonthNameArabic(month);

    modal.innerHTML = `
      <div class="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <div class="bg-white text-slate-900 rounded-3xl max-w-4xl w-full p-4 sm:p-7 shadow-2xl modal-enter text-xs max-h-[96vh] flex flex-col">

          <!-- Top Control Header (Never Printed) -->
          <div class="flex items-center justify-between pb-3.5 mb-2 border-b border-slate-200 no-print flex-shrink-0">
            <div class="flex items-center gap-2">
              <span class="p-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center gap-1.5">
                <i data-lucide="file-check" class="w-4 h-4 text-emerald-600"></i>
                <span>قسيمة ومفردات الراتب الرسمية</span>
              </span>
              <span class="text-xs text-slate-500 font-semibold hidden sm:inline">جاهزة للطباعة مقاس A4 أو الحفظ كملف PDF</span>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="window.Tafqeet.executePayslipPrint()"
                class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-500/25 transition-transform active:scale-95">
                <i data-lucide="printer" class="w-4 h-4"></i>
                <span>طباعة قسيمة الراتب (A4) / حفظ PDF</span>
              </button>
              <button onclick="document.getElementById('payslip-modal').innerHTML=''"
                class="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors" title="إغلاق">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>
          </div>

          <!-- Printable Area (A4 Layout) -->
          <div id="payslip-print-container" class="overflow-y-auto pr-1 flex-1 py-2 font-sans text-slate-900">
            
            <!-- 1. Executive Official Header -->
            <div class="p-5 rounded-2xl border-2 border-slate-800 bg-white mb-4">
              <div class="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-4">
                <!-- Company Logo & Title -->
                <div class="text-right">
                  <div class="flex items-center gap-2 mb-1">
                    <img src="/icons/icon-192.png" alt="وقتي" class="w-8 h-8 rounded-lg object-contain bg-[#080f20] p-0.5 shadow-xs" />
                    <h2 class="text-xl font-black text-slate-900 tracking-tight">وقتي <span class="text-emerald-600 font-mono text-sm">WAQTY</span></h2>
                  </div>
                  <span class="text-[11px] font-bold text-slate-500 block">إدارة الموارد البشرية والرواتب (HR & Payroll)</span>
                  <span class="text-[10px] text-slate-400 font-mono">نظام إدارة الحضور والانصراف ومسير الرواتب الذكي</span>
                </div>

                <!-- Center Title Badge -->
                <div class="text-center px-6 py-2 rounded-xl bg-slate-50 border border-slate-300">
                  <h1 class="text-base sm:text-lg font-black text-slate-900">قسيمة راتب ومفردات مرتب شهري</h1>
                  <span class="text-xs font-bold text-emerald-700 block mt-0.5">شهر: ${monthNameAr} (${month})</span>
                  <span class="text-[9px] text-slate-400 font-mono uppercase tracking-wider">Salary Payslip Voucher</span>
                </div>

                <!-- Voucher Meta Details -->
                <div class="text-left text-xs space-y-1">
                  <div><span class="text-slate-500 font-medium">رقم القسيمة:</span> <span class="font-mono font-bold">PAY-${month.replace('-', '')}-${emp.employee_code}</span></div>
                  <div><span class="text-slate-500 font-medium">تاريخ التحرير:</span> <span class="font-bold">${todayDate}</span></div>
                  <div><span class="text-slate-500 font-medium">طريقة الصرف:</span> <span class="font-bold text-emerald-700">نقداً / تحويل بنكي</span></div>
                </div>
              </div>

              <!-- 2. Employee Profile 2x4 Data Grid -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span class="text-slate-400 text-[10px] block font-semibold">اسم الموظف:</span>
                  <span class="font-black text-slate-900 text-sm block">${emp.full_name}</span>
                </div>
                <div>
                  <span class="text-slate-400 text-[10px] block font-semibold">كود الموظف:</span>
                  <span class="font-mono font-bold text-slate-800 block">${emp.employee_code}</span>
                </div>
                <div>
                  <span class="text-slate-400 text-[10px] block font-semibold">المسمى الوظيفي:</span>
                  <span class="font-bold text-slate-800 block">${emp.job_title || 'موظف'}</span>
                </div>
                <div>
                  <span class="text-slate-400 text-[10px] block font-semibold">القسم / الإدارة:</span>
                  <span class="font-bold text-slate-800 block">${emp.department_name || 'الإدارة العامة'}</span>
                </div>
                <div>
                  <span class="text-slate-400 text-[10px] block font-semibold">رقم الهاتف:</span>
                  <span class="font-mono font-bold text-slate-700 block">${emp.phone || '—'}</span>
                </div>
                <div>
                  <span class="text-slate-400 text-[10px] block font-semibold">تاريخ التعيين:</span>
                  <span class="font-mono text-slate-700 block">${emp.hire_date || '—'}</span>
                </div>
                <div>
                  <span class="text-slate-400 text-[10px] block font-semibold">أيام الحضور الفعلية:</span>
                  <span class="font-mono font-bold text-emerald-700 block">${stats.presentDays || 0} يوم</span>
                </div>
                <div>
                  <span class="text-slate-400 text-[10px] block font-semibold">إجمالي ساعات العمل:</span>
                  <span class="font-mono font-bold text-blue-700 block">${stats.totalWorkedHours || 0} ساعة</span>
                </div>
              </div>

              <!-- 3. Attendance & Disciplinary Strip -->
              <div class="mt-2.5 grid grid-cols-4 gap-2 text-center text-[11px] p-2 bg-slate-100/70 rounded-xl border border-slate-200">
                <div>
                  <span class="text-slate-500 block">حضور في الموعد</span>
                  <span class="font-bold text-slate-900 font-mono">${stats.onTimeDays || 0} يوم</span>
                </div>
                <div>
                  <span class="text-slate-500 block">أيام التأخير</span>
                  <span class="font-bold text-amber-700 font-mono">${stats.lateDays || 0} يوم (${stats.totalLateMinutes || 0} دقيقة)</span>
                </div>
                <div>
                  <span class="text-slate-500 block">أيام الغياب</span>
                  <span class="font-bold text-rose-700 font-mono">${stats.absentDays || 0} يوم</span>
                </div>
                <div>
                  <span class="text-slate-500 block">حالة الاعتماد</span>
                  <span class="font-bold text-emerald-700">معتمد للصرف ✓</span>
                </div>
              </div>
            </div>

            <!-- 4. Accounting Financial Breakdown (Earnings vs Deductions) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

              <!-- RIGHT: الاستحقاقات والأرباح (Earnings) -->
              <div class="border-2 border-emerald-600 rounded-2xl overflow-hidden bg-white">
                <div class="bg-emerald-600 text-white px-4 py-2.5 flex items-center justify-between font-bold text-xs">
                  <span class="flex items-center gap-1.5">
                    <i data-lucide="trending-up" class="w-4 h-4"></i> الاستحقاقات والأرباح (Earnings)
                  </span>
                  <span>المبلغ (ج.م)</span>
                </div>
                <div class="p-3 space-y-2 text-xs">
                  <div class="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <span class="font-semibold text-slate-700">المرتب الأساسي المتفق عليه:</span>
                    <span class="font-mono font-black text-slate-900">${baseSalary.toLocaleString('ar-EG')} ج.م</span>
                  </div>

                  <!-- Bonuses Breakdown -->
                  ${bonuses.length === 0 ? `
                    <div class="flex items-center justify-between py-1.5 border-b border-slate-100 text-slate-400">
                      <span>المكافآت والحوافز الإضافية:</span>
                      <span class="font-mono">0.00 ج.م</span>
                    </div>
                  ` : bonuses.map(b => `
                    <div class="flex items-center justify-between py-1.5 border-b border-slate-100">
                      <div>
                        <span class="font-bold text-emerald-700 block">🎁 ${b.reason}</span>
                        <span class="text-[10px] text-slate-400 font-mono">${b.date}</span>
                      </div>
                      <span class="font-mono font-black text-emerald-700">+${parseFloat(b.amount).toLocaleString('ar-EG')} ج.م</span>
                    </div>
                  `).join('')}

                  <div class="pt-2 flex items-center justify-between font-black text-sm text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                    <span>إجمالي الاستحقاقات:</span>
                    <span class="font-mono">${totalEarnings.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                </div>
              </div>

              <!-- LEFT: الاستقطاعات والخصومات (Deductions) -->
              <div class="border-2 border-rose-600 rounded-2xl overflow-hidden bg-white">
                <div class="bg-rose-600 text-white px-4 py-2.5 flex items-center justify-between font-bold text-xs">
                  <span class="flex items-center gap-1.5">
                    <i data-lucide="trending-down" class="w-4 h-4"></i> الاستقطاعات والخصومات (Deductions)
                  </span>
                  <span>المبلغ (ج.م)</span>
                </div>
                <div class="p-3 space-y-2 text-xs">
                  <div class="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <div>
                      <span class="font-semibold text-slate-700">خصومات التأخير (نظام الشرائح):</span>
                      ${stats.lateDays > 0 ? `<span class="text-[10px] text-amber-600 block">${stats.lateDays} يوم تأخير</span>` : ''}
                    </div>
                    <span class="font-mono font-bold text-rose-600">-${totalLateDeductions.toLocaleString('ar-EG')} ج.م</span>
                  </div>

                  <div class="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <div>
                      <span class="font-semibold text-slate-700">خصومات الغياب غير المصرح:</span>
                      ${stats.absentDays > 0 ? `<span class="text-[10px] text-rose-500 block">${stats.absentDays} يوم غياب</span>` : ''}
                    </div>
                    <span class="font-mono font-bold text-rose-600">-${totalAbsenceDeductions.toLocaleString('ar-EG')} ج.م</span>
                  </div>

                  <!-- Advances Breakdown -->
                  ${advances.length === 0 ? `
                    <div class="flex items-center justify-between py-1.5 border-b border-slate-100 text-slate-400">
                      <span>السلف والمسحوبات المستردة:</span>
                      <span class="font-mono">0.00 ج.م</span>
                    </div>
                  ` : advances.map(a => `
                    <div class="flex items-center justify-between py-1.5 border-b border-slate-100">
                      <div>
                        <span class="font-bold text-amber-700 block">💸 سلفة: ${a.reason || 'سلفة على الراتب'}</span>
                        <span class="text-[10px] text-slate-400 font-mono">${a.date}</span>
                      </div>
                      <span class="font-mono font-black text-rose-600">-${parseFloat(a.amount).toLocaleString('ar-EG')} ج.م</span>
                    </div>
                  `).join('')}

                  <div class="pt-2 flex items-center justify-between font-black text-sm text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                    <span>إجمالي الاستقطاعات:</span>
                    <span class="font-mono">-${totalDeductions.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 5. Net Payable Prominent Banner with Tafqeet -->
            <div class="p-4 sm:p-5 rounded-2xl border-2 border-emerald-600 bg-emerald-50/70 mb-5">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200 pb-3 mb-3">
                <div>
                  <span class="text-xs font-bold text-emerald-800 uppercase block tracking-wider">صافي الراتب المستحق للصرف (Net Payable Salary)</span>
                  <span class="text-[11px] text-slate-600">المبلغ النهائي بعد إضافة المكافآت وخصم التأخيرات والغياب والسلف</span>
                </div>
                <div class="text-left sm:text-right">
                  <span class="text-2xl sm:text-3xl font-black text-emerald-700 font-mono tracking-tight block">
                    ${netSalary.toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2 text-xs font-bold text-slate-800">
                <span class="text-slate-500">المبلغ بالحروف:</span>
                <span class="text-emerald-900 underline decoration-emerald-400 decoration-2">${tafqeetText}</span>
              </div>
            </div>

            <!-- 6. Official Signatures Strip -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t-2 border-slate-300 text-xs text-center">
              <!-- Employee Signature -->
              <div class="p-3.5 rounded-xl border border-slate-300 bg-slate-50/60 flex flex-col justify-between min-h-[120px]">
                <div>
                  <span class="font-bold text-slate-800 block">توقيع الموظف بالاستلام</span>
                  <p class="text-[9px] text-slate-500 mt-1 leading-tight">
                    أقر أنا الموظف الموقع أدناه باستلام كامل مستحقاتي الموضحة أعلاه نقداً / تحويلاً دون أي اعتراض.
                  </p>
                </div>
                <div class="pt-6 border-b border-dotted border-slate-400 text-[10px] text-slate-400">
                  التوقيع: ............................................
                </div>
              </div>

              <!-- HR / Accountant Signature -->
              <div class="p-3.5 rounded-xl border border-slate-300 bg-slate-50/60 flex flex-col justify-between min-h-[120px]">
                <div>
                  <span class="font-bold text-slate-800 block">المحاسب المالي / الموارد البشرية</span>
                  <p class="text-[9px] text-slate-500 mt-1 leading-tight">
                    تمت مراجعة ساعات العمل والخصومات والمكافآت والسلف وتدقيق الحسابات المالية.
                  </p>
                </div>
                <div class="pt-6 border-b border-dotted border-slate-400 text-[10px] text-slate-400">
                  التوقيع: ............................................
                </div>
              </div>

              <!-- General Manager / Official Stamp -->
              <div class="p-3.5 rounded-xl border border-slate-300 bg-slate-50/60 flex flex-col justify-between min-h-[120px]">
                <div>
                  <span class="font-bold text-slate-800 block">المدير العام / الاعتماد الرسمي</span>
                  <p class="text-[9px] text-slate-500 mt-1 leading-tight">
                    يعتمد كشف المرتبات الرسمي ويصرح بالصرف.
                  </p>
                </div>
                <div class="pt-6 border-b border-dotted border-slate-400 text-[10px] text-slate-400 flex items-center justify-between">
                  <span>الختم الرسمي:</span>
                  <span class="text-[9px] text-emerald-700 font-bold">[ وقتي - WAQTY ]</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  }

  global.Tafqeet = {
    numberToArabicWords,
    tafqeetCurrency,
    formatMonthNameArabic,
    executePayslipPrint,
    showPayslipModal
  };

  global.executePayslipPrint = executePayslipPrint;
})(window);
