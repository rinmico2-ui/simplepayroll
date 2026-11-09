const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

const DEFAULT_BRACKETS = [
  { up_to: 20833, rate: 0 }, { up_to: 33333, rate: 0.15 }, { up_to: 66667, rate: 0.20 },
  { up_to: 166667, rate: 0.25 }, { up_to: 666667, rate: 0.30 }, { up_to: 999999999, rate: 0.35 }];

function validBrackets(b) {
  if (!Array.isArray(b) || !b.length) return false;
  let prev = -Infinity;
  for (const x of b) {
    const up = Number(x && x.up_to), rate = Number(x && x.rate);
    if (!Number.isFinite(up) || up <= prev) return false;
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) return false;
    prev = up;
  }
  return true;
}
function parseTaxBrackets(raw) {
  if (Array.isArray(raw)) return validBrackets(raw) ? raw : DEFAULT_BRACKETS;
  try { const b = JSON.parse(raw || '[]'); return validBrackets(b) ? b : DEFAULT_BRACKETS; } catch { return DEFAULT_BRACKETS; }
}
function parseConfigRows(rows) {
  const c = { monthly_divisor: 22, hours_per_day: 8, overtime_multiplier: 1.25, sss_rate: 0.045, sss_cap: 900, philhealth_rate: 0.025, philhealth_cap: 1250, pagibig_rate: 0.02, pagibig_cap: 200, tax_brackets: '[]' };
  (rows || []).forEach(r => { c[r.config_key] = r.config_value; });
  for (const k of ['monthly_divisor', 'hours_per_day', 'overtime_multiplier', 'sss_rate', 'sss_cap', 'philhealth_rate', 'philhealth_cap', 'pagibig_rate', 'pagibig_cap']) c[k] = parseFloat(c[k]) || 0;
  if (!c.monthly_divisor) c.monthly_divisor = 22;
  if (!c.hours_per_day) c.hours_per_day = 8;
  c.tax_brackets = parseTaxBrackets(c.tax_brackets);
  return c;
}
function computeTax(monthlyGross, brackets) {
  let tax = 0, prev = 0;
  for (const b of brackets) {
    const up = b.up_to === Infinity || b.up_to === 'Infinity' ? Infinity : Number(b.up_to);
    if (monthlyGross <= prev) break;
    tax += (Math.min(monthlyGross, up) - prev) * Number(b.rate || 0);
    prev = up;
  }
  return round2(tax);
}
function calculatePayroll(employee, period, attendance, config, keep = {}) {
  const isSemi = period.type === 'Semi-Monthly';
  const capDiv = isSemi ? 2 : 1;
  const salary = Number(employee.basic_monthly_salary) || 0;
  const daily = config.monthly_divisor ? salary / config.monthly_divisor : 0;
  const hourly = config.hours_per_day ? daily / config.hours_per_day : 0;
  const basePeriod = isSemi ? salary / 2 : salary;
  const presentDays = Number(attendance.present_days) || 0;
  const absents = Number(attendance.absent_days) || 0;
  const lateMin = Number(attendance.late_minutes) || 0;
  const otHours = Number(attendance.overtime_hours) || 0;
  const absenceDed = round2(absents * daily);
  const lateDed = round2((lateMin / 60) * hourly);
  const overtimePay = round2(otHours * hourly * (config.overtime_multiplier || 0));
  const allowances = round2((Number(employee.allowances) || 0) / capDiv);
  const otherEarnings = round2(keep.other_earnings);
  const otherDeductions = round2(keep.other_deductions);
  const basicPay = round2(basePeriod - absenceDed);
  const gross = round2(basicPay + overtimePay + allowances + otherEarnings);
  const sss = Math.min(round2(basicPay * (config.sss_rate || 0)), round2((config.sss_cap || 0) / capDiv));
  const phil = Math.min(round2(basicPay * (config.philhealth_rate || 0)), round2((config.philhealth_cap || 0) / capDiv));
  const pagibig = Math.min(round2(basicPay * (config.pagibig_rate || 0)), round2((config.pagibig_cap || 0) / capDiv));
  const tax = round2(computeTax(isSemi ? gross * 2 : gross, config.tax_brackets || DEFAULT_BRACKETS) / capDiv);
  const totalDed = round2(lateDed + absenceDed + sss + phil + pagibig + tax + otherDeductions);
  const net = round2(gross - totalDed);
  return {
    basic_pay: basicPay, overtime_pay: overtimePay, allowances, other_earnings: otherEarnings, gross_pay: gross,
    late_deduction: lateDed, absence_deduction: absenceDed, sss, philhealth: phil, pagibig, tax,
    other_deductions: otherDeductions, total_deductions: totalDed, net_pay: net,
    present_days: presentDays, absent_days: absents, late_minutes: lateMin, overtime_hours: otHours
  };
}
module.exports = { round2, DEFAULT_BRACKETS, parseTaxBrackets, validBrackets, parseConfigRows, computeTax, calculatePayroll };
