const router = require('../middleware/asyncRouter')();
const { query } = require('../config/db');
const { requireAuth, requireStaff, readOnlyViewer, audit } = require('../middleware/auth');
router.use(requireAuth, requireStaff, readOnlyViewer);

function toMinutes(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }

router.get('/attendance', async (req, res) => {
  const { employee_id = '', from = '', to = '' } = req.query;
  const where = [], params = [];
  if (employee_id) { where.push('employee_id = ?'); params.push(employee_id); }
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to) { where.push('date <= ?'); params.push(to); }
  const sql = `SELECT a.*, e.full_name, e.employee_code FROM attendance a JOIN employees e ON e.id=a.employee_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.date DESC, a.id DESC LIMIT 500`;
  res.json(await query(sql, params));
});
router.post('/attendance', async (req, res) => {
  const b = req.body || {};
  if (!b.employee_id || !b.date) return res.status(400).json({ error: 'employee_id and date required' });
  const tin = toMinutes(b.time_in), tout = toMinutes(b.time_out);
  let hours = 0, late = 0, overtime = 0;
  if (tin != null && tout != null) {
    const gross = tout > tin ? tout - tin : tout + 1440 - tin;
    hours = Math.max(0, gross / 60 - 1); // minus 1h lunch
    overtime = Math.max(0, hours - 8);
    const sched = toMinutes(b.schedule_in || '08:00');
    late = tin > sched ? tin - sched : 0;
  }
  const status = b.status || (tin == null ? 'Absent' : (late > 0 ? 'Late' : 'Present'));
  const existing = await query('SELECT id FROM attendance WHERE employee_id=? AND date=?', [b.employee_id, b.date]);
  if (existing.length) {
    await query('UPDATE attendance SET time_in=?, time_out=?, status=?, working_hours=?, late_minutes=?, overtime_hours=?, remarks=? WHERE id=?',
      [b.time_in || null, b.time_out || null, status, hours, late, overtime, b.remarks || '', existing[0].id]);
    await audit(req.session.userId, 'CORRECT_ATTENDANCE', `${b.employee_id} ${b.date}`);
    return res.json({ ok: true, corrected: true, id: existing[0].id });
  }
  const r = await query('INSERT INTO attendance (employee_id, date, time_in, time_out, status, working_hours, late_minutes, overtime_hours, remarks) VALUES (?,?,?,?,?,?,?,?,?)',
    [b.employee_id, b.date, b.time_in || null, b.time_out || null, status, hours, late, overtime, b.remarks || '']);
  await audit(req.session.userId, 'RECORD_ATTENDANCE', `${b.employee_id} ${b.date}`);
  res.status(201).json({ id: r.insertId, working_hours: hours, late_minutes: late, overtime_hours: overtime });
});
router.delete('/attendance/:id', async (req, res) => {
  await query('DELETE FROM attendance WHERE id=?', [req.params.id]); res.json({ ok: true });
});
router.get('/attendance/summary', async (req, res) => {
  const { from = '', to = '' } = req.query;
  const where = [], params = [];
  if (from) { where.push('a.date >= ?'); params.push(from); }
  if (to) { where.push('a.date <= ?'); params.push(to); }
  res.json(await query(`SELECT e.id, e.employee_code, e.full_name, e.department, COUNT(*) days, SUM(a.working_hours) hours, SUM(a.late_minutes) late_minutes, SUM(a.overtime_hours) overtime_hours, SUM(a.status='Absent') absences, SUM(a.status='Present') present FROM attendance a JOIN employees e ON e.id=a.employee_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} GROUP BY e.id`, params));
});
module.exports = router;
