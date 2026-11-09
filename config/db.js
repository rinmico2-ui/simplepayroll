const mysql = require('mysql2/promise');
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'simple_payroll',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true,
  connectTimeout: 10000,
};
const useSSL = ['true', '1', 'yes'].includes(String(process.env.DB_SSL).toLowerCase()) || String(poolConfig.host).includes('tidbcloud.com');
if (useSSL) poolConfig.ssl = { rejectUnauthorized: false };
const pool = mysql.createPool(poolConfig);
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
module.exports = { pool, query };
