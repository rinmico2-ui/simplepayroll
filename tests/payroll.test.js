const assert = require('assert');
const { round2, parseConfigRows, computeTax, calculatePayroll, DEFAULT_BRACKETS } = require('../services/payrollCalc');

let passed = 0, failed = 0;
const close = (a, b, msg) => { try { assert.ok(Math.abs(a - b) < 0.011, `${msg}: expected ${b}, got ${a}`); console.log(`PASS - ${msg}`); passed++; } catch (e) { console.log(`FAIL - ${e.message}`); failed++; } };
const eq = (a, b, msg) => { try { assert.strictEqual(a, b, `${msg}: expected ${b}, got ${a}`); console.log(`PASS - ${msg}`); passed++; } catch (e) { console.log(`FAIL - ${e.message}`); failed++; } };

const config = parseConfigRows([
  { config_key: 'monthly_divisor', config_value: '22' },
  { config_key: 'hours_per_day', config_value: '8' },
  { config_key: 'overtime_multiplier', config_value: '1.25' },
  { config_key: 'sss_rate', config_value: '0.045' }, { config_key: 'sss_cap', config_value: '900' },
  { config_key: 'philhealth_rate', config_value: '0.025' }, { config_key: 'philhealth_cap', config_value: '1250' },
  { config_key: 'pagibig_rate', config_value: '0.02' }, { config_key: 'pagibig_cap', config_value: '200' },
  { config_key: 'tax_brackets', config_value: JSON.stringify(DEFAULT_BRACKETS) },
]);
const none = { present_days: 0, absent_days: 0, late_minutes: 0, overtime_hours: 0 };
const monthly = { type: 'Monthly' }, semi = { type: 'Semi-Monthly' };

console.log('--- Config parsing ---');
eq(config.monthly_divisor, 22, 'divisor parsed');
eq(config.tax_brackets.length, 6, 'tax brackets parsed');
eq(parseConfigRows([]).monthly_divisor, 22, 'divisor default when empty');
eq(parseConfigRows([{ config_key: 'monthly_divisor', config_value: '0' }]).monthly_divisor, 22, 'divisor 0 falls back to 22');
eq(parseConfigRows([{ config_key: 'tax_brackets', config_value: 'not-json' }]).tax_brackets.length, 6, 'invalid tax JSON falls back to defaults');

console.log('--- Tax brackets (TRAIN 2023+ monthly, marginal) ---');
close(computeTax(20833, DEFAULT_BRACKETS), 0, 'no tax at 20833');
close(computeTax(33333, DEFAULT_BRACKETS), 1875, 'tax at 33333 = TRAIN fixed 1,875');
close(computeTax(66667, DEFAULT_BRACKETS), 8541.8, 'tax at 66667 ~ TRAIN fixed 8,542');
close(computeTax(50000, DEFAULT_BRACKETS), 5208.4, 'tax at 50000');

console.log('--- Case 1: Monthly, no attendance ---');
const c1 = calculatePayroll({ basic_monthly_salary: 45000, allowances: 5000 }, monthly, none, config);
close(c1.basic_pay, 45000, 'basic = full salary');
close(c1.gross_pay, 50000, 'gross = basic + allowances');
close(c1.sss, 900, 'SSS capped at 900');
close(c1.philhealth, 1125, 'PhilHealth = 2.5%');
close(c1.pagibig, 200, 'Pag-IBIG capped at 200');
close(c1.tax, 5208.4, 'withholding tax');
close(c1.total_deductions, 7433.4, 'total deductions');
close(c1.net_pay, 42566.6, 'net pay');

console.log('--- Case 2: Monthly, late + absenteeism + overtime ---');
const c2 = calculatePayroll({ basic_monthly_salary: 45000, allowances: 5000 }, monthly, { present_days: 19, absent_days: 2, late_minutes: 60, overtime_hours: 3 }, config);
close(c2.absence_deduction, 4090.91, 'absence deduction (2 days x 2045.45)');
close(c2.late_deduction, 255.68, 'late deduction (60 min x 255.68/hr)');
close(c2.overtime_pay, 958.81, 'OT pay (3h x 255.68 x 1.25)');
close(c2.basic_pay, 40909.09, 'basic after absence');
close(c2.gross_pay, 46867.9, 'gross = basic + OT + allowances');
close(c2.tax, 4581.98, 'tax on gross');
close(c2.total_deductions, 11051.3, 'total deductions');
close(c2.net_pay, 35816.6, 'net pay');
eq(c2.present_days, 19, 'present days carried');
eq(c2.absent_days, 2, 'absent days carried');

console.log('--- Case 3: Semi-monthly ---');
const c3 = calculatePayroll({ basic_monthly_salary: 30000, allowances: 3000 }, semi, none, config);
close(c3.basic_pay, 15000, 'half basic');
close(c3.allowances, 1500, 'half allowances');
close(c3.gross_pay, 16500, 'gross');
close(c3.sss, 450, 'SSS cap halved to 450');
close(c3.philhealth, 375, 'PhilHealth 2.5% of 15000');
close(c3.pagibig, 100, 'Pag-IBIG cap halved to 100');
close(c3.tax, 912.53, 'half of monthly tax on 33000');
close(c3.total_deductions, 1837.53, 'total deductions');
close(c3.net_pay, 14662.47, 'net pay');

console.log('--- Case 4: Manual adjustments preserved ---');
const c4 = calculatePayroll({ basic_monthly_salary: 45000, allowances: 5000 }, monthly, none, config, { other_earnings: 1000, other_deductions: 500 });
close(c4.other_earnings, 1000, 'other earnings kept');
close(c4.other_deductions, 500, 'other deductions kept');
close(c4.gross_pay, 51000, 'gross includes other earnings');
close(c4.net_pay, 42866.6, 'net includes adjustments (tax recomputed on higher gross)');

console.log('--- Case 5: Zero salary / missing data (no NaN) ---');
const c5 = calculatePayroll({ basic_monthly_salary: 0, allowances: 0 }, monthly, {}, config);
eq(c5.net_pay, 0, 'net pay is 0');
eq(c5.gross_pay, 0, 'gross is 0');
assert.ok(Object.values(c5).every(v => typeof v === 'number' && !Number.isNaN(v)), 'no NaN values');
console.log('PASS - no NaN anywhere'); passed++;

console.log('--- Case 6: Consistent identities ---');
[['case1', c1], ['case2', c2], ['case3', c3], ['case4', c4]].forEach(([name, c]) => {
  eq(round2(c.gross_pay - c.total_deductions), c.net_pay, `${name}: net = gross - deductions`);
  eq(round2(c.basic_pay + c.overtime_pay + c.allowances + c.other_earnings), c.gross_pay, `${name}: gross = basic + OT + allowances + other`);
  eq(round2(c.late_deduction + c.absence_deduction + c.sss + c.philhealth + c.pagibig + c.tax + c.other_deductions), c.total_deductions, `${name}: total = sum of deductions`);
});

console.log(`\n${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
