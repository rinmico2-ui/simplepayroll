const { query } = require('../config/db');
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Unauthorized. Please login.' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (roles.length && !roles.includes(req.session.role)) return res.status(403).json({ error: 'Forbidden: insufficient role' });
    next();
  };
}
function requireStaff(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.role === 'employee') return res.status(403).json({ error: 'Forbidden: staff access only' });
  next();
}
function requirePayrollView(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!['admin', 'hr', 'viewer', 'employee'].includes(req.session.role)) return res.status(403).json({ error: 'Forbidden' });
  if (req.method !== 'GET' && (req.session.role === 'viewer' || req.session.role === 'employee')) {
    return res.status(403).json({ error: 'Forbidden: read-only access' });
  }
  next();
}
function readOnlyViewer(req, res, next) {
  if (req.method !== 'GET' && req.session.role === 'viewer') return res.status(403).json({ error: 'Forbidden: viewers have read-only access' });
  next();
}
async function audit(userId, action, details = '') {
  try { await query('INSERT INTO audit_logs (user_id, action, details) VALUES (?,?,?)', [userId, action, details]); } catch (e) { console.error('audit', e.message); }
}
module.exports = { requireAuth, requireRole, requireStaff, requirePayrollView, readOnlyViewer, audit };
