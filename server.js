try { const fs=require('fs'); const envPath=require('path').join(__dirname,'.env'); if(fs.existsSync(envPath)){ fs.readFileSync(envPath,'utf8').split(/\r?\n/).forEach(l=>{ const m=l.match(/^\s*([^#=]+)=(.*)$/); if(m) process.env[m[1].trim()] ??= m[2].trim(); }); } } catch(e) {}
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use(session({ secret: process.env.SESSION_SECRET || 'simple-payroll-dev-secret-change-me', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 } }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/self'));
app.use('/api', require('./routes/employees'));
app.use('/api', require('./routes/attendance'));
app.use('/api', require('./routes/payroll'));
app.use((err, req, res, next) => {
  const code = err.code || (err.errors && err.errors[0] && err.errors[0].code);
  if (code === 'ECONNREFUSED') return res.status(503).json({ error: `Cannot connect to MySQL at ${process.env.DB_HOST || 'localhost'}:3306. Start MySQL in the XAMPP Control Panel, then try again.` });
  if (code === 'ER_BAD_DB_ERROR') return res.status(503).json({ error: 'Database "simple_payroll" not found. Import database/schema.sql in phpMyAdmin first.' });
  if (code === 'ER_ACCESS_DENIED_ERROR') return res.status(503).json({ error: 'MySQL access denied. Check DB_USER and DB_PASS in the .env file.' });
  console.error(err);
  res.status(500).json({ error: 'Server error. Check the terminal for details.' });
});
process.on('unhandledRejection', err => console.error('Unhandled rejection:', (err && (err.message || err.code)) || err));
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`Simple Payroll running at http://${HOST}:${PORT}`);
  require('./config/db').query('SELECT 1')
    .then(() => console.log('MySQL connected.'))
    .catch(e => console.warn(`WARNING: MySQL not reachable (${e.code || e.message}). Start MySQL in the XAMPP Control Panel. The app stays up; requests will return 503 until the database is available.`));
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
