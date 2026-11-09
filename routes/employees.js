const router = require('../middleware/asyncRouter')();
const { query } = require('../config/db');
const { requireAuth, requireStaff, readOnlyViewer, audit } = require('../middleware/auth');
router.use(requireAuth, requireStaff, readOnlyViewer);

router.get('/employees', async (req, res) => {
  const { search = '', department = '', status = '', archived = '0' } = req.query;
  const where = ['e.is_archived = ?'], params = [archived === '1' ? 1 : 0];
  if (search) { where.push('(e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (department) { where.push('e.department = ?'); params.push(department); }
  if (status) { where.push('e.status = ?'); params.push(status); }
  res.json(await query(`SELECT e.*, u.username account_username FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE ${where.join(' AND ')} ORDER BY e.id DESC`, params));
});
router.get('/employees/:id', async (req, res) => {
  const rows = await query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});
router.post('/employees', async (req, res) => {
  const b = req.body || {};
  if (!b.full_name || b.basic_monthly_salary == null) return res.status(400).json({ error: 'Full name and basic salary required' });
  const [max] = await query('SELECT COUNT(*) c FROM employees');
  const code = b.employee_code || `EMP-${String((max.c || 0) + 1).padStart(4, '0')}`;
  const r = await query(`INSERT INTO employees (employee_code, full_name, email, phone, address, department_id, department, position, employment_date, status, basic_monthly_salary, allowances, payment_method, bank_account)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [code, b.full_name, b.email || '', b.phone || '', b.address || '', b.department_id || null, b.department || '', b.position || '', b.employment_date || null, b.status || 'Active', b.basic_monthly_salary, b.allowances || 0, b.payment_method || 'Bank', b.bank_account || '']);
  await audit(req.session.userId, 'CREATE_EMPLOYEE', `${code} ${b.full_name}`);
  res.status(201).json({ id: r.insertId, employee_code: code });
});
router.put('/employees/:id', async (req, res) => {
  const b = req.body || {};
  await query(`UPDATE employees SET full_name=?, email=?, phone=?, address=?, department_id=?, department=?, position=?, employment_date=?, status=?, basic_monthly_salary=?, allowances=?, payment_method=?, bank_account=? WHERE id=?`,
    [b.full_name, b.email || '', b.phone || '', b.address || '', b.department_id || null, b.department || '', b.position || '', b.employment_date || null, b.status || 'Active', b.basic_monthly_salary, b.allowances || 0, b.payment_method || 'Bank', b.bank_account || '', req.params.id]);
  await audit(req.session.userId, 'UPDATE_EMPLOYEE', String(req.params.id));
  res.json({ ok: true });
});
router.delete('/employees/:id', async (req, res) => {
  await query('UPDATE employees SET is_archived=1 WHERE id=?', [req.params.id]);
  await audit(req.session.userId, 'ARCHIVE_EMPLOYEE', String(req.params.id));
  res.json({ ok: true });
});
router.post('/employees/:id/restore', async (req, res) => {
  await query('UPDATE employees SET is_archived=0 WHERE id=?', [req.params.id]); res.json({ ok: true });
});
module.exports = router;
