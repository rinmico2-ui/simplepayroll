const router = require('../middleware/asyncRouter')();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { parseConfigRows } = require('../services/payrollCalc');
router.use('/my', requireAuth);
router.use('/my', (req, res, next) => {
  if (req.session.role !== 'employee' || !req.session.employeeId) return res.status(403).json({ error: 'Employee account required' });
  next();
});

router.get('/my/profile', async (req, res) => {
  const rows = await query('SELECT employee_code, full_name, email, phone, address, department, position, employment_date, status, payment_method FROM employees WHERE id=?', [req.session.employeeId]);
  if (!rows.length) return res.status(404).json({ error: 'Employee record not found' });
  res.json(rows[0]);
});
router.get('/my/payslips', async (req, res) => {
  res.json(await query(
    `SELECT pr.id, pr.basic_pay, pr.overtime_pay, pr.allowances, pr.gross_pay, pr.total_deductions, pr.net_pay, pr.status,
            pp.label period_label, pp.start_date, pp.end_date, pp.payment_date
     FROM payroll_records pr JOIN payroll_periods pp ON pp.id=pr.period_id
     WHERE pr.employee_id=? AND pp.status IN ('Approved','Paid')
     ORDER BY pr.id DESC`,
    [req.session.employeeId]));
});
router.get('/my/payslip/:id', async (req, res) => {
  const rows = await query(
    `SELECT pr.*, e.full_name, e.employee_code, e.department, e.position, e.bank_account, e.payment_method,
            pp.label period_label, pp.start_date, pp.end_date, pp.payment_date
     FROM payroll_records pr JOIN employees e ON e.id=pr.employee_id JOIN payroll_periods pp ON pp.id=pr.period_id
     WHERE pr.id=? AND pr.employee_id=? AND pp.status IN ('Approved','Paid')`,
    [req.params.id, req.session.employeeId]);
  if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });
  const config = parseConfigRows(await query('SELECT config_key, config_value FROM payroll_config'));
  const company = {
    name: config.company_name || process.env.COMPANY_NAME || 'Simple Payroll',
    address: config.company_address || process.env.COMPANY_ADDRESS || '',
    contact: config.company_contact || process.env.COMPANY_CONTACT || ''
  };
  await query('INSERT IGNORE INTO payslips (record_id) VALUES (?)', [req.params.id]);
  res.json({ payslip: rows[0], company });
});
module.exports = router;
