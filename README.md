# Simple Payroll Management System

Modern payroll system for small businesses: employee records, attendance, payroll calculation (configurable rates), payslips, reports.

## Stack
HTML5 / CSS3 / JavaScript (vanilla SPA) · Node.js + Express · MySQL (XAMPP/phpMyAdmin)

## Quick Start (XAMPP)
1. Start Apache/MySQL in XAMPP. Create DB via phpMyAdmin or CLI:
   `mysql -u root < database/schema.sql` (or import `database/schema.sql` in phpMyAdmin)
2. Copy `.env.example` to `.env` and set DB credentials:
   ```
   PORT=3000
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=
   DB_NAME=simple_payroll
   SESSION_SECRET=long-random-string
   ```
3. Install & run:
   ```
   npm install
   npm start
   ```
4. Open http://localhost:3000 — login **admin / admin123** (staff). Demo employee account: **msantos / employee123** (linked to EMP-0001).

## How employees view their payroll
1. Admin calculates and **approves** a payroll period (employees never see Draft payroll).
2. Create the employee's account — either **Employees → Create Account** (button on each row; suggested username pre-filled) or **Settings → Users** (role `employee` + Link Employee).
3. Employees with an account show as **Account: username** on the Employees list; one account per employee.
4. The employee logs in at the same login page and only sees **My Payslips** — their own payslips with Print/PDF. Their session is blocked from every staff module (employees, attendance, payroll, reports, users).
5. Admin can still print any payslip from Payroll for employees without accounts.

## Features
- **Authentication**: bcrypt hashing, sessions, protected routes, audit logs
- **Dashboard**: counts, payroll totals, recent transactions/employees, bar + trend charts (canvas)
- **Employees**: CRUD, search/filter, archive/restore, departments
- **Departments**: CRUD with employee counts
- **Attendance**: record/correct (upsert by employee+date), auto hours/late/OT, summary, CSV export
- **Payroll**: periods (Monthly/Semi-Monthly) with a guided flow —
  1. Create period
  2. Calculate (re-running recalculates only Pending records and keeps manual adjustments)
  3. Review / Adjust (other earnings & deductions per record)
  4. Approve (locks records)
  5. Mark as Paid (final) — Reopen returns an Approved period to Draft
  Duplicate-prevention via unique (period, employee) constraint; confirmation before each irreversible step.
- **Calculation** (`Gross = Basic + OT + Allowances + Other`, `Net = Gross - Deductions`, `payrollCalc.js`): all rates configurable in Settings — divisor, OT multiplier, SSS/PhilHealth/Pag-IBIG rates+caps, tax brackets JSON. Semi-monthly halves base pay, allowances and contribution caps.
- **Payslips**: itemized earnings/deductions, company info from Settings, Print → Save as PDF
- **Employee self-service portal**: link a login to an employee record (Settings → Users → role `employee`). Employees log in and see only their **own** approved/paid payslips — never other employees' data. Draft payroll is hidden until approved.
- **Reports**: monthly by department, employee history, CSV export, Print/PDF
- **Security**: parameterized queries (mysql2 `execute`), input validation, session cookies (httpOnly, sameSite), role-based route guards

## Roles
| Role | Can do |
|---|---|
| admin | Everything (settings, users, payroll, employees, attendance, reports) |
| hr | Everything except Settings and user management |
| viewer | Read-only access to staff modules |
| employee | Own profile + own approved/paid payslips only (`/api/my/*`) |

## Project Structure
```
server.js               Express entry, session, static
config/db.js            MySQL pool + query helper
services/payrollCalc.js Pure calculation engine (rates, taxes, deductions)
middleware/auth.js      requireAuth / requireRole / audit
routes/auth.js          login/logout/me, dashboard, departments, settings, users, audit
routes/employees.js     employee CRUD
routes/attendance.js    attendance + summary
routes/payroll.js       periods, calculation, records, payslip, reports, CSV
public/                 index.html, css/style.css, js/app.js (SPA)
tests/payroll.test.js   Unit tests for the calculation engine
database/schema.sql     Full schema + sample data + default admin
```

## Tests
```
node tests/payroll.test.js
```
Covers tax brackets, SSS/PhilHealth/Pag-IBIG caps, late/absence/OT math, monthly vs semi-monthly, manual adjustments, zero-data safety and gross/net identities.

## Testing Checklist
Login → Dashboard loads → Add employee → Add department → Record attendance → Create period → Calculate (run twice: second run updates, no duplicates) → Adjust a pending record → Recalculate (adjustment kept) → Approve (Calculate/Adjust become blocked) → Mark as Paid → Payslip → Print PDF → Reports + CSV export → Reopen (only while Approved).

## Troubleshooting
- **Login says "Cannot connect to MySQL at localhost:3306…"** — MySQL is not running. Open the XAMPP Control Panel → Start MySQL. The server now stays up and returns clear 503 messages until the database is available.
- **"Database simple_payroll not found"** — import `database/schema.sql` in phpMyAdmin (http://localhost/phpmyadmin) or run `mysql -u root < database/schema.sql`.
- **"MySQL access denied"** — set `DB_USER` / `DB_PASS` in `.env` to your MySQL credentials.
- **Port 3000 already in use** — change `PORT` in `.env`.

## Sample Data
5 employees across 5 departments, 1 payroll period (Oct 2026), sample attendance rows. Delete/adjust as needed.
