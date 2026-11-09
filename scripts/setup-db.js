const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim();
  });
}

async function migrate(conn, db) {
  const [t] = await conn.query(`SELECT COUNT(*) c FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='users'`, [db]);
  if (!Number(t[0].c)) return;
  const [col] = await conn.query(`SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users' AND COLUMN_NAME='employee_id'`, [db]);
  if (!Number(col[0].c)) {
    console.log('Migrating: adding users.employee_id (employee self-service) ...');
    await conn.query(`ALTER TABLE \`${db}\`.users ADD COLUMN employee_id INT NULL, ADD UNIQUE KEY uq_user_employee (employee_id), ADD CONSTRAINT fk_user_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL`);
  }
  const [role] = await conn.query(`SELECT COLUMN_TYPE ct FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users' AND COLUMN_NAME='role'`, [db]);
  if (role.length && !String(role[0].ct).includes('employee')) {
    console.log('Migrating: adding employee role ...');
    await conn.query(`ALTER TABLE \`${db}\`.users MODIFY COLUMN role ENUM('admin','hr','viewer','employee') DEFAULT 'admin'`);
  }
}

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true
  });
  const db = process.env.DB_NAME || 'simple_payroll';
  console.log('Connected to MySQL.');
  await migrate(conn, db);
  console.log('Importing database/schema.sql ...');
  await conn.query(sql);
  const [tables] = await conn.query(`SHOW TABLES FROM \`${db}\``);
  const names = tables.map(t => Object.values(t)[0]);
  const [emp] = await conn.query(`SELECT COUNT(*) c FROM \`${db}\`.employees`);
  const [att] = await conn.query(`SELECT COUNT(*) c FROM \`${db}\`.attendance`);
  const [usr] = await conn.query(`SELECT COUNT(*) c FROM \`${db}\`.users`);
  const [per] = await conn.query(`SELECT COUNT(*) c FROM \`${db}\`.payroll_periods`);
  console.log(`Done. Tables (${names.length}): ${names.join(', ')}`);
  console.log(`Sample data: employees=${emp[0].c}, attendance=${att[0].c}, payroll_periods=${per[0].c}, users=${usr[0].c}`);
  console.log('Login with admin / admin123');
  await conn.end();
})().catch(e => {
  console.error('Import failed:', e.code || e.message);
  if (e.code === 'ECONNREFUSED') console.error('MySQL is not running. Start it in the XAMPP Control Panel.');
  if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('Check DB_USER / DB_PASS in .env');
  process.exit(1);
});
