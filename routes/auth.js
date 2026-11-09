const router = require('../middleware/asyncRouter')();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { requireAuth, requireRole, requireStaff, readOnlyViewer, audit } = require('../middleware/auth');
const { validBrackets } = require('../services/payrollCalc');

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const rows = await query('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const u = rows[0];
  if (!await bcrypt.compare(password, u.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.userId = u.id; req.session.role = u.role; req.session.username = u.username;
  req.session.employeeId = u.employee_id || null;
  await audit(u.id, 'LOGIN', username);
  res.json({ user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role, employee_id: u.employee_id || null } });
});
router.post('/auth/logout', requireAuth, async (req, res) => {
  await audit(req.session.userId, 'LOGOUT', req.session.username);
  req.session.destroy(() => res.json({ ok: true }));
});
router.get('/auth/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const rows = await query('SELECT id, username, full_name, role, employee_id FROM users WHERE id = ?', [req.session.userId]);
  if (!rows.length) return res.status(401).json({ error: 'User not found' });
  res.json({ user: rows[0] });
});
router.get('/dashboard', requireStaff, async (req, res) => {
  const [emp] = await query('SELECT COUNT(*) c, SUM(status="Active") active FROM employees WHERE is_archived=0');
  const [periods] = await query('SELECT * FROM payroll_periods ORDER BY id DESC LIMIT 1');
  let payroll = { gross: 0, net: 0, pending: 0 };
  let recentTx = [], recentEmp = [];
  if (periods) {
    const [p] = await query(`SELECT COALESCE(SUM(gross_pay),0) gross, COALESCE(SUM(net_pay),0) net, COALESCE(SUM(status='Pending'),0) pending FROM payroll_records WHERE period_id=?`, [periods.id]);
    payroll = p;
    recentTx = await query(`SELECT pr.*, e.full_name, e.employee_code FROM payroll_records pr JOIN employees e ON e.id=pr.employee_id WHERE pr.period_id=? ORDER BY pr.id DESC LIMIT 8`, [periods.id]);
  }
  recentEmp = await query('SELECT id, employee_code, full_name, department, position, created_at FROM employees WHERE is_archived=0 ORDER BY id DESC LIMIT 5');
  const deptChart = await query('SELECT department, COUNT(*) c FROM employees WHERE is_archived=0 GROUP BY department');
  const monthly = await query(`SELECT pp.label, COALESCE(SUM(pr.net_pay),0) net FROM payroll_periods pp LEFT JOIN payroll_records pr ON pr.period_id=pp.id GROUP BY pp.id ORDER BY pp.id DESC LIMIT 6`);
  res.json({ totalEmployees: Number(emp.c || 0), activeEmployees: Number(emp.active || 0), payroll, currentPeriod: periods || null, recentTx, recentEmp, deptChart, monthly: monthly.reverse() });
});
router.get('/departments', requireStaff, async (req, res) => {
  res.json(await query('SELECT d.*, (SELECT COUNT(*) FROM employees e WHERE e.department_id=d.id AND e.is_archived=0) employee_count FROM departments d ORDER BY d.name'));
});
router.post('/departments', requireStaff, readOnlyViewer, async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = await query('INSERT INTO departments (name, description) VALUES (?,?)', [name, description || '']);
  await audit(req.session.userId, 'CREATE_DEPARTMENT', name);
  res.status(201).json({ id: r.insertId });
});
router.put('/departments/:id', requireStaff, readOnlyViewer, async (req, res) => {
  await query('UPDATE departments SET name=?, description=? WHERE id=?', [req.body.name, req.body.description || '', req.params.id]);
  res.json({ ok: true });
});
router.delete('/departments/:id', requireStaff, readOnlyViewer, async (req, res) => {
  const [c] = await query('SELECT COUNT(*) c FROM employees WHERE department_id=? AND is_archived=0', [req.params.id]);
  if (Number(c.c) > 0) return res.status(400).json({ error: 'Cannot delete department with employees' });
  await query('DELETE FROM departments WHERE id=?', [req.params.id]); res.json({ ok: true });
});
router.get('/settings', requireStaff, async (req, res) => {
  const rows = await query('SELECT config_key, config_value FROM payroll_config');
  const out = {}; rows.forEach(r => out[r.config_key] = r.config_value);
  res.json(out);
});
router.put('/settings', requireRole('admin'), async (req, res) => {
  const body = req.body || {};
  if (Object.prototype.hasOwnProperty.call(body, 'tax_brackets')) {
    let parsed;
    try { parsed = JSON.parse(body.tax_brackets); } catch { return res.status(400).json({ error: 'Tax brackets must be valid JSON' }); }
    if (!validBrackets(parsed)) return res.status(400).json({ error: 'Tax brackets must be a non-empty array of { up_to, rate } with strictly increasing up_to and rate between 0 and 1' });
    body.tax_brackets = JSON.stringify(parsed);
  }
  for (const [k, v] of Object.entries(body)) {
    await query('INSERT INTO payroll_config (config_key, config_value) VALUES (?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value)', [k, String(v)]);
  }
  await audit(req.session.userId, 'UPDATE_SETTINGS', Object.keys(body).join(','));
  res.json({ ok: true });
});
router.get('/audit-logs', requireStaff, async (req, res) => {
  res.json(await query('SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100'));
});
router.get('/users', requireRole('admin'), async (req, res) => {
  res.json(await query('SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.employee_id, e.full_name employee_name, u.created_at FROM users u LEFT JOIN employees e ON e.id=u.employee_id'));
});
router.post('/users', requireRole('admin'), async (req, res) => {
  const { username, password, full_name, role, employee_id } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username/password required' });
  const finalRole = role || 'viewer';
  if (!['admin', 'hr', 'viewer', 'employee'].includes(finalRole)) return res.status(400).json({ error: 'Invalid role' });
  if (finalRole === 'employee' && !employee_id) return res.status(400).json({ error: 'Employee accounts must be linked to an employee record' });
  if (finalRole !== 'employee' && employee_id) return res.status(400).json({ error: 'Only employee accounts can be linked to an employee record' });
  if (employee_id) {
    const emp = await query('SELECT id, full_name FROM employees WHERE id=?', [employee_id]);
    if (!emp.length) return res.status(400).json({ error: 'Employee record not found' });
    const linked = await query('SELECT username FROM users WHERE employee_id=?', [employee_id]);
    if (linked.length) return res.status(400).json({ error: `Employee already has an account (username: ${linked[0].username})` });
  }
  const hash = await bcrypt.hash(password, 10);
  let r;
  try {
    r = await query('INSERT INTO users (username, password_hash, full_name, role, employee_id) VALUES (?,?,?,?,?)', [username, hash, full_name || username, finalRole, employee_id || null]);
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username already taken or employee already linked' });
    throw e;
  }
  await audit(req.session.userId, 'CREATE_USER', `${username} (${finalRole}${employee_id ? ', employee #' + employee_id : ''})`);
  res.status(201).json({ id: r.insertId });
});
module.exports = router;
