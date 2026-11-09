CREATE DATABASE IF NOT EXISTS simple_payroll CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE simple_payroll;

CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL,
  description VARCHAR(255) DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY, employee_code VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL, email VARCHAR(150) DEFAULT '', phone VARCHAR(30) DEFAULT '',
  address VARCHAR(255) DEFAULT '', department_id INT NULL, department VARCHAR(100) DEFAULT '',
  position VARCHAR(100) DEFAULT '', employment_date DATE NULL,
  status ENUM('Active','Inactive','Resigned','Terminated') DEFAULT 'Active',
  basic_monthly_salary DECIMAL(12,2) NOT NULL DEFAULT 0, allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'Bank', bank_account VARCHAR(100) DEFAULT '',
  is_archived TINYINT(1) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_status (status), INDEX idx_dept (department)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL, full_name VARCHAR(100) NOT NULL,
  role ENUM('admin','hr','viewer','employee') DEFAULT 'admin', is_active TINYINT(1) DEFAULT 1,
  employee_id INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_employee (employee_id),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL, date DATE NOT NULL,
  time_in TIME NULL, time_out TIME NULL, status ENUM('Present','Absent','Late','Half-Day') DEFAULT 'Present',
  working_hours DECIMAL(5,2) DEFAULT 0, late_minutes INT DEFAULT 0, overtime_hours DECIMAL(5,2) DEFAULT 0,
  remarks VARCHAR(255) DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY uq_emp_date (employee_id, date), INDEX idx_date (date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payroll_periods (
  id INT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL, end_date DATE NOT NULL, type ENUM('Monthly','Semi-Monthly') DEFAULT 'Monthly',
  payment_date DATE NULL, status ENUM('Draft','Approved','Paid') DEFAULT 'Draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_range (start_date, end_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payroll_records (
  id INT AUTO_INCREMENT PRIMARY KEY, period_id INT NOT NULL, employee_id INT NOT NULL,
  basic_pay DECIMAL(12,2) DEFAULT 0, overtime_pay DECIMAL(12,2) DEFAULT 0, allowances DECIMAL(12,2) DEFAULT 0,
  other_earnings DECIMAL(12,2) DEFAULT 0, gross_pay DECIMAL(12,2) DEFAULT 0,
  late_deduction DECIMAL(12,2) DEFAULT 0, absence_deduction DECIMAL(12,2) DEFAULT 0,
  sss DECIMAL(12,2) DEFAULT 0, philhealth DECIMAL(12,2) DEFAULT 0, pagibig DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0, other_deductions DECIMAL(12,2) DEFAULT 0, total_deductions DECIMAL(12,2) DEFAULT 0,
  net_pay DECIMAL(12,2) DEFAULT 0, present_days INT DEFAULT 0, absent_days INT DEFAULT 0,
  late_minutes INT DEFAULT 0, overtime_hours DECIMAL(5,2) DEFAULT 0,
  status ENUM('Pending','Approved','Paid') DEFAULT 'Pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY uq_period_emp (period_id, employee_id)
) ENGINE=InnoDB;

-- Legacy / extensible tables kept for spec compatibility (earnings/deductions itemized via columns above)
CREATE TABLE IF NOT EXISTS payroll_earnings (id INT AUTO_INCREMENT PRIMARY KEY, record_id INT NOT NULL, label VARCHAR(100), amount DECIMAL(12,2) DEFAULT 0, FOREIGN KEY (record_id) REFERENCES payroll_records(id) ON DELETE CASCADE) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS payroll_deductions (id INT AUTO_INCREMENT PRIMARY KEY, record_id INT NOT NULL, label VARCHAR(100), amount DECIMAL(12,2) DEFAULT 0, FOREIGN KEY (record_id) REFERENCES payroll_records(id) ON DELETE CASCADE) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS payslips (id INT AUTO_INCREMENT PRIMARY KEY, record_id INT NOT NULL UNIQUE, generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (record_id) REFERENCES payroll_records(id) ON DELETE CASCADE) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payroll_config (
  id INT AUTO_INCREMENT PRIMARY KEY, config_key VARCHAR(50) UNIQUE NOT NULL, config_value VARCHAR(500) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NULL, action VARCHAR(100) NOT NULL,
  details VARCHAR(500) DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO payroll_config (config_key, config_value) VALUES
('monthly_divisor','22'),('hours_per_day','8'),('overtime_multiplier','1.25'),
('sss_rate','0.045'),('sss_cap','900'),('philhealth_rate','0.025'),('philhealth_cap','1250'),
('pagibig_rate','0.02'),('pagibig_cap','200'),
('tax_brackets','[{"up_to":20833,"rate":0},{"up_to":33333,"rate":0.15},{"up_to":66667,"rate":0.20},{"up_to":166667,"rate":0.25},{"up_to":666667,"rate":0.30},{"up_to":999999999,"rate":0.35}]'),
('company_name','SimplePayroll Inc.'),('company_address','123 Business St, Manila, Philippines'),('company_contact','hr@simplepayroll.example | (02) 8555-0100');

INSERT IGNORE INTO departments (name, description) VALUES ('Human Resources','People and culture'),('Finance','Accounting and payroll'),('Operations','Day-to-day operations'),('IT','Information technology'),('Sales','Sales and marketing');

INSERT IGNORE INTO employees (employee_code, full_name, email, phone, address, department_id, department, position, employment_date, status, basic_monthly_salary, allowances, payment_method, bank_account) VALUES
('EMP-0001','Maria Santos','maria.santos@example.com','0917-000-0001','Manila',1,'Human Resources','HR Manager','2022-01-15','Active',45000.00,5000.00,'Bank','BPI-1001'),
('EMP-0002','Juan Dela Cruz','juan.delacruz@example.com','0917-000-0002','Quezon City',3,'Operations','Operations Supervisor','2021-06-01','Active',38000.00,3000.00,'Bank','BPI-1002'),
('EMP-0003','Ana Reyes','ana.reyes@example.com','0917-000-0003','Makati',2,'Finance','Accountant','2023-02-10','Active',40000.00,4000.00,'Bank','BPI-1003'),
('EMP-0004','Mark Aquino','mark.aquino@example.com','0917-000-0004','Pasig',4,'IT','Software Developer','2023-08-21','Active',55000.00,5000.00,'Bank','BPI-1004'),
('EMP-0005','Liza Ramos','liza.ramos@example.com','0917-000-0005','Taguig',5,'Sales','Sales Associate','2024-03-04','Active',28000.00,2000.00,'GCash','GCash-1005');

-- Default admin: username admin / password admin123 (bcrypt cost 10)
INSERT IGNORE INTO users (username, password_hash, full_name, role) VALUES ('admin','$2a$10$W1KN//rCdVOqpuXIhE5lku9ahLgBGCxeIxTzZw9uimZYZFPr1ASCe','System Administrator','admin');
-- Demo employee account: username msantos / password employee123 (linked to EMP-0001)
INSERT IGNORE INTO users (username, password_hash, full_name, role, employee_id)
  SELECT 'msantos','$2a$10$LcKhAiEH7VtpvF22XhlTEOnaJlxd8Qou6aIPb223/CtJnKp5THcpK','Maria Santos','employee', id FROM employees WHERE employee_code='EMP-0001';

INSERT IGNORE INTO payroll_periods (label, start_date, end_date, type, payment_date, status) VALUES ('October 2026','2026-10-01','2026-10-31','Monthly','2026-11-05','Draft');

-- Sample attendance for Oct 2026 (subset, weekdays)
INSERT IGNORE INTO attendance (employee_id, date, time_in, time_out, status, working_hours, late_minutes, overtime_hours) VALUES
(1,'2026-10-01','08:00:00','17:00:00','Present',8.00,0,0.00),
(1,'2026-10-02','08:10:00','18:00:00','Late',9.00,10,1.00),
(2,'2026-10-01','08:00:00','17:00:00','Present',8.00,0,0.00),
(2,'2026-10-02',NULL,NULL,'Absent',0.00,0,0.00),
(3,'2026-10-01','08:00:00','17:00:00','Present',8.00,0,0.00),
(4,'2026-10-01','08:00:00','19:00:00','Present',10.00,0,2.00),
(5,'2026-10-01','09:00:00','17:00:00','Late',7.00,60,0.00);
