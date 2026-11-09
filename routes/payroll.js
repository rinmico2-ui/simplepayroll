const router = require('../middleware/asyncRouter')();
const { query } = require('../config/db');
const { requirePayrollView, audit } = require('../middleware/auth');
const { round2, parseConfigRows, calculatePayroll } = require('../services/payrollCalc');
router.use(requirePayrollView);

async function getConfig() {
  return parseConfigRows(await query('SELECT config_key, config_value FROM payroll_config'));
}
async function calculateForEmployee(emp, period, config, keep = {}) {
  const rows = await query(
    `SELECT SUM(status IN ('Present','Late','Half-Day')) present, SUM(status='Absent') absent,
            COALESCE(SUM(late_minutes),0) late, COALESCE(SUM(overtime_hours),0) ot
     FROM attendance WHERE employee_id=? AND date BETWEEN ? AND ?`,
    [emp.id, period.start_date, period.end_date]);
  const a = rows[0] || {};
  const attendance = {
    present_days: Number(a.present || 0), absent_days: Number(a.absent || 0),
    late_minutes: Number(a.late || 0), overtime_hours: Number(a.ot || 0)
  };
  return calculatePayroll(emp, period, attendance, config, keep);
}

router.get('/payroll-periods', async (req, res) => { res.json(await query('SELECT * FROM payroll_periods ORDER BY id DESC')); });
router.post('/payroll-periods', async (req, res) => {
  const b = req.body || {};
  if (!b.label || !b.start_date || !b.end_date) return res.status(400).json({ error: 'label, start_date, end_date required' });
  if (b.end_date < b.start_date) return res.status(400).json({ error: 'End date must be after start date' });
  const dup = await query('SELECT id FROM payroll_periods WHERE start_date=? AND end_date=?', [b.start_date, b.end_date]);
  if (dup.length) return res.status(400).json({ error: 'A payroll period already exists for this date range' });
  const r = await query('INSERT INTO payroll_periods (label, start_date, end_date, type, payment_date) VALUES (?,?,?,?,?)', [b.label, b.start_date, b.end_date, b.type || 'Monthly', b.payment_date || b.end_date]);
  await audit(req.session.userId, 'CREATE_PERIOD', b.label);
  res.status(201).json({ id: r.insertId });
});
router.put('/payroll-periods/:id/status', async (req, res) => {
  const { status } = req.body || {};
  const [period] = await query('SELECT * FROM payroll_periods WHERE id=?', [req.params.id]);
  if (!period) return res.status(404).json({ error: 'Period not found' });
  if (status === 'Approved') {
    if (period.status !== 'Draft') return res.status(400).json({ error: `Only Draft periods can be approved (current: ${period.status})` });
    const [c] = await query('SELECT COUNT(*) c FROM payroll_records WHERE period_id=?', [period.id]);
    if (!Number(c.c)) return res.status(400).json({ error: 'No payroll records yet. Click Calculate Payroll first.' });
    await query("UPDATE payroll_periods SET status='Approved' WHERE id=?", [period.id]);
    await query("UPDATE payroll_records SET status='Approved' WHERE period_id=?", [period.id]);
  } else if (status === 'Paid') {
    if (period.status !== 'Approved') return res.status(400).json({ error: `Only Approved periods can be marked as Paid (current: ${period.status})` });
    await query("UPDATE payroll_periods SET status='Paid' WHERE id=?", [period.id]);
    await query("UPDATE payroll_records SET status='Paid' WHERE period_id=?", [period.id]);
  } else if (status === 'Draft') {
    if (period.status !== 'Approved') return res.status(400).json({ error: 'Only approved periods can be reopened' });
    await query("UPDATE payroll_periods SET status='Draft' WHERE id=?", [period.id]);
    await query("UPDATE payroll_records SET status='Pending' WHERE period_id=?", [period.id]);
  } else {
    return res.status(400).json({ error: 'Invalid status' });
  }
  await audit(req.session.userId, `PERIOD_${status.toUpperCase()}`, `${period.label} (#${period.id})`);
  res.json({ ok: true, status });
});

router.post('/payroll/calculate', async (req, res) => {
  const period_id = Number(req.body?.period_id);
  if (!period_id) return res.status(400).json({ error: 'period_id required' });
  const [period] = await query('SELECT * FROM payroll_periods WHERE id=?', [period_id]);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });
  if (period.status !== 'Draft') return res.status(400).json({ error: `Cannot calculate a ${period.status} period. Reopen it to make changes.` });
  const config = await getConfig();
  const employees = await query(`SELECT * FROM employees WHERE is_archived=0 AND status='Active' AND (employment_date IS NULL OR employment_date <= ?)`, [period.end_date]);
  let created = 0, updated = 0, skipped = 0;
  for (const emp of employees) {
    const existing = await query('SELECT id, status, other_earnings, other_deductions FROM payroll_records WHERE period_id=? AND employee_id=?', [period_id, emp.id]);
    const calc = await calculateForEmployee(emp, period, config, existing[0] || {});
    if (!existing.length) {
      await query(`INSERT INTO payroll_records (period_id, employee_id, basic_pay, overtime_pay, allowances, other_earnings, gross_pay, late_deduction, absence_deduction, sss, philhealth, pagibig, tax, other_deductions, total_deductions, net_pay, present_days, absent_days, late_minutes, overtime_hours, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'Pending')`,
        [period_id, emp.id, calc.basic_pay, calc.overtime_pay, calc.allowances, calc.other_earnings, calc.gross_pay, calc.late_deduction, calc.absence_deduction, calc.sss, calc.philhealth, calc.pagibig, calc.tax, calc.other_deductions, calc.total_deductions, calc.net_pay, calc.present_days, calc.absent_days, calc.late_minutes, calc.overtime_hours]);
      created++;
    } else if (existing[0].status === 'Pending') {
      await query(`UPDATE payroll_records SET basic_pay=?, overtime_pay=?, allowances=?, other_earnings=?, gross_pay=?, late_deduction=?, absence_deduction=?, sss=?, philhealth=?, pagibig=?, tax=?, other_deductions=?, total_deductions=?, net_pay=?, present_days=?, absent_days=?, late_minutes=?, overtime_hours=? WHERE id=?`,
        [calc.basic_pay, calc.overtime_pay, calc.allowances, calc.other_earnings, calc.gross_pay, calc.late_deduction, calc.absence_deduction, calc.sss, calc.philhealth, calc.pagibig, calc.tax, calc.other_deductions, calc.total_deductions, calc.net_pay, calc.present_days, calc.absent_days, calc.late_minutes, calc.overtime_hours, existing[0].id]);
      updated++;
    } else skipped++;
  }
  await audit(req.session.userId, 'CALCULATE_PAYROLL', `${period.label}: ${created} created, ${updated} updated, ${skipped} skipped`);
  res.json({ created, updated, skipped, employees: employees.length });
});
router.put('/payroll-records/:id/adjust', async (req, res) => {
  const [rec] = await query('SELECT * FROM payroll_records WHERE id=?', [req.params.id]);
  if (!rec) return res.status(404).json({ error: 'Record not found' });
  if (rec.status !== 'Pending') return res.status(400).json({ error: `Only Pending records can be adjusted (current: ${rec.status})` });
  const otherEarnings = round2(req.body?.other_earnings);
  const otherDeductions = round2(req.body?.other_deductions);
  const gross = round2(rec.basic_pay + rec.overtime_pay + rec.allowances + otherEarnings);
  const totalDed = round2(rec.late_deduction + rec.absence_deduction + rec.sss + rec.philhealth + rec.pagibig + rec.tax + otherDeductions);
  const net = round2(gross - totalDed);
  await query('UPDATE payroll_records SET other_earnings=?, other_deductions=?, gross_pay=?, total_deductions=?, net_pay=? WHERE id=?', [otherEarnings, otherDeductions, gross, totalDed, net, rec.id]);
  await audit(req.session.userId, 'ADJUST_PAYROLL_RECORD', `record #${rec.id}: other earnings ${otherEarnings}, other deductions ${otherDeductions}`);
  res.json({ gross_pay: gross, total_deductions: totalDed, net_pay: net });
});
router.get('/payroll-records', async (req, res) => {
  const { period_id = '', employee_id = '', department = '' } = req.query;
  const where = [], params = [];
  if (period_id) { where.push('pr.period_id=?'); params.push(period_id); }
  if (employee_id) { where.push('pr.employee_id=?'); params.push(employee_id); }
  if (department) { where.push('e.department=?'); params.push(department); }
  res.json(await query(`SELECT pr.*, e.full_name, e.employee_code, e.department, e.position, pp.label period_label FROM payroll_records pr JOIN employees e ON e.id=pr.employee_id JOIN payroll_periods pp ON pp.id=pr.period_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY pr.id DESC LIMIT 500`, params));
});
router.get('/payroll-records/:id', async (req, res) => {
  const rows = await query(`SELECT pr.*, e.full_name, e.employee_code, e.department, e.position, pp.label period_label, pp.start_date, pp.end_date, pp.payment_date FROM payroll_records pr JOIN employees e ON e.id=pr.employee_id JOIN payroll_periods pp ON pp.id=pr.period_id WHERE pr.id=?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});
router.get('/payslip/:recordId', async (req, res) => {
  const rows = await query(`SELECT pr.*, e.full_name, e.employee_code, e.department, e.position, e.bank_account, e.payment_method, pp.label period_label, pp.start_date, pp.end_date, pp.payment_date FROM payroll_records pr JOIN employees e ON e.id=pr.employee_id JOIN payroll_periods pp ON pp.id=pr.period_id WHERE pr.id=?`, [req.params.recordId]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const config = await getConfig();
  const company = {
    name: config.company_name || process.env.COMPANY_NAME || 'Simple Payroll',
    address: config.company_address || process.env.COMPANY_ADDRESS || '',
    contact: config.company_contact || process.env.COMPANY_CONTACT || ''
  };
  await query('INSERT IGNORE INTO payslips (record_id) VALUES (?)', [req.params.recordId]);
  res.json({ payslip: rows[0], company });
});
router.get('/reports/monthly', async (req, res) => {
  const { department = '', period_id = '' } = req.query;
  const where = [], params = [];
  if (department) { where.push('e.department=?'); params.push(department); }
  if (period_id) { where.push('pr.period_id=?'); params.push(period_id); }
  res.json(await query(`SELECT pp.label, e.department, COUNT(*) headcount, SUM(pr.gross_pay) gross, SUM(pr.total_deductions) deductions, SUM(pr.net_pay) net, SUM(pr.overtime_pay) overtime, SUM(pr.sss) sss, SUM(pr.philhealth) philhealth, SUM(pr.pagibig) pagibig, SUM(pr.tax) tax FROM payroll_records pr JOIN employees e ON e.id=pr.employee_id JOIN payroll_periods pp ON pp.id=pr.period_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} GROUP BY pp.id, e.department ORDER BY pp.id DESC`, params));
});
router.get('/reports/employee-history', async (req, res) => {
  const { employee_id = '' } = req.query;
  if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
  res.json(await query(`SELECT pr.*, pp.label period_label FROM payroll_records pr JOIN payroll_periods pp ON pp.id=pr.period_id WHERE pr.employee_id=? ORDER BY pr.id DESC`, [employee_id]));
});
router.get('/reports/export.csv', async (req, res) => {
  const { type = 'payroll' } = req.query;
  let rows, headers;
  if (type === 'attendance') { rows = await query('SELECT a.date, e.employee_code, e.full_name, a.time_in, a.time_out, a.status, a.working_hours, a.late_minutes, a.overtime_hours FROM attendance a JOIN employees e ON e.id=a.employee_id ORDER BY a.date DESC'); headers = ['date', 'employee_code', 'full_name', 'time_in', 'time_out', 'status', 'working_hours', 'late_minutes', 'overtime_hours']; }
  else { rows = await query('SELECT pp.label, e.employee_code, e.full_name, e.department, pr.basic_pay, pr.overtime_pay, pr.allowances, pr.gross_pay, pr.total_deductions, pr.net_pay FROM payroll_records pr JOIN employees e ON e.id=pr.employee_id JOIN payroll_periods pp ON pp.id=pr.period_id ORDER BY pr.id DESC'); headers = ['period', 'employee_code', 'full_name', 'department', 'basic_pay', 'overtime_pay', 'allowances', 'gross_pay', 'total_deductions', 'net_pay']; }
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`); res.send(csv);
});
module.exports = router;
