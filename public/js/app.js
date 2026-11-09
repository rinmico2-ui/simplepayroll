const $ = s => document.querySelector(s);
const money = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(msg) { $('#toast').textContent = msg; setTimeout(() => $('#toast').textContent = '', 3000); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let departments = [], employees = [], currentUser = null;
const titles = { dashboard: 'Dashboard', employees: 'Employee Management', departments: 'Department Management', attendance: 'Attendance Management', payroll: 'Payroll Processing', reports: 'Reports & Analytics', settings: 'Settings', audit: 'Audit Logs', myPayroll: 'My Payslips' };
function showView(v) {
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== 'view-' + v);
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#viewTitle').textContent = titles[v] || v;
  ({ dashboard: loadDashboard, employees: loadEmployees, departments: loadDepartments, attendance: loadAttendance, payroll: loadPayroll, reports: loadReports, settings: loadSettings, audit: loadAudit, myPayroll: loadMyPayroll }[v] || (() => {}))();
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => showView(b.dataset.view));

function drawBar(canvas, data, labelKey, valueKey) {
  if (!canvas) return; const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!data.length) { ctx.fillText('No data', 20, 30); return; }
  const max = Math.max(...data.map(d => Number(d[valueKey] || 0)), 1), bw = Math.min(60, (canvas.width - 40) / data.length - 10);
  ctx.fillStyle = '#0f766e'; ctx.font = '12px sans-serif';
  data.forEach((d, i) => { const h = (Number(d[valueKey] || 0) / max) * 150, x = 30 + i * (bw + 14); ctx.fillRect(x, 180 - h, bw, h); ctx.fillStyle = '#334155'; ctx.fillText(String(d[labelKey] || '').slice(0, 12), x, 195); ctx.fillStyle = '#0f766e'; });
}
function drawLine(canvas, data) {
  if (!canvas) return; const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!data.length) { ctx.fillText('No data', 20, 30); return; }
  const max = Math.max(...data.map(d => Number(d.net || 0)), 1);
  ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 2; ctx.beginPath();
  data.forEach((d, i) => { const x = 30 + i * ((canvas.width - 60) / Math.max(data.length - 1, 1)), y = 180 - (Number(d.net || 0) / max) * 150; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke(); ctx.fillStyle = '#334155'; ctx.font = '11px sans-serif'; data.forEach((d, i) => { const x = 30 + i * ((canvas.width - 60) / Math.max(data.length - 1, 1)); ctx.fillText(String(d.label || '').slice(0, 10), x, 200); });
}

async function loadDashboard() {
  const d = await api('/dashboard');
  $('#dashCards').innerHTML = [
    ['Total Employees', d.totalEmployees], ['Active Employees', d.activeEmployees],
    ['Total Payroll (Net)', money(d.payroll.net)], ['Pending Records', d.payroll.pending || 0],
    ['Current Period', d.currentPeriod ? esc(d.currentPeriod.label) : 'None']
  ].map(([l, v]) => `<div class="card"><span>${l}</span><b>${v}</b></div>`).join('');
  $('#recentTx').innerHTML = d.recentTx.map(r => `<tr><td>${esc(r.full_name)} (${esc(r.employee_code)})</td><td>${money(r.net_pay)}</td><td>${esc(r.status)}</td></tr>`).join('') || '<tr><td colspan=3>No payroll yet. Create a period and calculate.</td></tr>';
  $('#recentEmp').innerHTML = d.recentEmp.map(r => `<tr><td>${esc(r.employee_code)}</td><td>${esc(r.full_name)}</td><td>${esc(r.department)}</td></tr>`).join('');
  drawBar($('#deptChart'), d.deptChart, 'department', 'c');
  drawLine($('#trendChart'), d.monthly);
}

async function loadEmployees() {
  const params = new URLSearchParams({ search: $('#empSearch').value, department: $('#empDeptFilter').value, status: $('#empStatusFilter').value, archived: $('#empArchived').checked ? '1' : '0' });
  employees = await api('/employees?' + params);
  $('#empTable').innerHTML = employees.map(e => `<tr><td>${esc(e.employee_code)}</td><td>${esc(e.full_name)}</td><td>${esc(e.department)}</td><td>${esc(e.position)}</td><td>${esc(e.status)}</td><td>${money(e.basic_monthly_salary)}</td><td><button class="btn" onclick="viewEmp(${e.id})">View</button> <button class="btn" onclick="editEmp(${e.id})">Edit</button> ${e.is_archived ? `<button class="btn" onclick="restoreEmp(${e.id})">Restore</button>` : `<button class="btn danger" onclick="archiveEmp(${e.id})">Archive</button>`} ${accountButton(e)}</td></tr>`).join('');
  const attSel = document.querySelector('#attForm select[name=employee_id]');
  if (attSel) attSel.innerHTML = employees.filter(e => !e.is_archived).map(e => `<option value="${e.id}">${esc(e.employee_code)} - ${esc(e.full_name)}</option>`).join('');
  const hist = $('#histEmp'); if (hist) hist.innerHTML = employees.map(e => `<option value="${e.id}">${esc(e.full_name)}</option>`).join('');
}
function accountButton(e) {
  if (e.account_username) return `<button class="btn" disabled title="Employee login account">Account: ${esc(e.account_username)}</button>`;
  if (!currentUser || currentUser.role !== 'admin') return '';
  return `<button class="btn" onclick="createAccount(${e.id})">Create Account</button>`;
}
function suggestUsername(fullName) {
  const parts = String(fullName || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean);
  return parts.length ? parts[0][0] + parts[parts.length - 1] : '';
}
async function createAccount(id) {
  const e = employees.find(x => x.id === id);
  openModal(`Create Employee Account — ${e.full_name}`, [
    { name: 'username', label: 'Username', value: suggestUsername(e.full_name), required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
    { name: 'confirm', label: 'Confirm Password', type: 'password', required: true }
  ], 'Create Account', async d => {
    if (d.password !== d.confirm) throw new Error('Passwords do not match');
    await api('/users', { method: 'POST', body: JSON.stringify({ username: d.username, password: d.password, full_name: e.full_name, role: 'employee', employee_id: id }) });
    await loadEmployees();
  });
}
['empSearch', 'empDeptFilter', 'empStatusFilter'].forEach(id => $('#' + id).addEventListener('input', loadEmployees));
$('#empArchived').addEventListener('change', loadEmployees);

function openModal(title, fields, submitText, onSubmit) {
  $('#modalTitle').textContent = title;
  $('#modalForm').innerHTML = fields.map(f => `<label>${f.label}<input name="${f.name}" ${f.type ? `type="${f.type}"` : ''} value="${esc(f.value ?? '')}" ${f.required ? 'required' : ''} ${f.options ? '' : ''}>${f.options ? `<select name="${f.name}">${f.options.map(o => `<option ${o === f.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}</label>`).join('') + `<button class="btn primary">${submitText}</button>`;
  $('#modal').hidden = false;
  $('#modalForm').onsubmit = async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); try { await onSubmit(data); $('#modal').hidden = true; toast('Saved'); } catch (err) { toast(err.message); } };
}
$('#modalClose').onclick = () => $('#modal').hidden = true;

$('#addEmpBtn').onclick = () => openModal('Add Employee', [
  { name: 'full_name', label: 'Full Name', required: true }, { name: 'email', label: 'Email' }, { name: 'phone', label: 'Phone' }, { name: 'address', label: 'Address' },
  { name: 'department', label: 'Department', options: departments.map(d => d.name) }, { name: 'department_id', label: 'Department ID (optional)', type: 'number' },
  { name: 'position', label: 'Position' }, { name: 'employment_date', label: 'Employment Date', type: 'date' },
  { name: 'basic_monthly_salary', label: 'Basic Monthly Salary', type: 'number', required: true }, { name: 'allowances', label: 'Allowances', type: 'number' },
  { name: 'status', label: 'Status', options: ['Active', 'Inactive', 'Resigned', 'Terminated'] }, { name: 'payment_method', label: 'Payment Method' }, { name: 'bank_account', label: 'Bank Account' }
], 'Create', async data => { data.basic_monthly_salary = Number(data.basic_monthly_salary); data.allowances = Number(data.allowances || 0); data.department_id = data.department_id ? Number(data.department_id) : null; await api('/employees', { method: 'POST', body: JSON.stringify(data) }); loadEmployees(); });
async function editEmp(id) { const e = await api('/employees/' + id); openModal('Edit Employee ' + e.employee_code, [
  { name: 'full_name', label: 'Full Name', value: e.full_name }, { name: 'email', label: 'Email', value: e.email }, { name: 'phone', label: 'Phone', value: e.phone }, { name: 'address', label: 'Address', value: e.address },
  { name: 'department', label: 'Department', value: e.department, options: departments.map(d => d.name) }, { name: 'position', label: 'Position', value: e.position }, { name: 'employment_date', label: 'Employment Date', type: 'date', value: e.employment_date || '' },
  { name: 'basic_monthly_salary', label: 'Basic Salary', type: 'number', value: e.basic_monthly_salary }, { name: 'allowances', label: 'Allowances', type: 'number', value: e.allowances },
  { name: 'status', label: 'Status', value: e.status, options: ['Active', 'Inactive', 'Resigned', 'Terminated'] }, { name: 'payment_method', label: 'Payment Method', value: e.payment_method }, { name: 'bank_account', label: 'Bank Account', value: e.bank_account }
], 'Save', async data => { data.basic_monthly_salary = Number(data.basic_monthly_salary); data.allowances = Number(data.allowances || 0); data.department_id = e.department_id; await api('/employees/' + id, { method: 'PUT', body: JSON.stringify(data) }); loadEmployees(); }); }
async function viewEmp(id) { const e = await api('/employees/' + id); openModal('Employee Profile', [], 'Close', async () => {}); $('#modalForm').innerHTML = `<div style="grid-column:1/-1"><p><b>${esc(e.employee_code)}</b> — ${esc(e.full_name)}</p><p>${esc(e.department)} / ${esc(e.position)} | ${esc(e.status)}</p><p>${esc(e.email)} | ${esc(e.phone)}</p><p>${esc(e.address)}</p><p>Hired: ${esc(e.employment_date || '-')} | Basic: ${money(e.basic_monthly_salary)} | Allowances: ${money(e.allowances)}</p><p>Payment: ${esc(e.payment_method)} ${esc(e.bank_account)}</p></div>`; }
async function archiveEmp(id) { if (confirm('Archive this employee?')) { await api('/employees/' + id, { method: 'DELETE' }); loadEmployees(); } }
async function restoreEmp(id) { await api('/employees/' + id + '/restore', { method: 'POST' }); loadEmployees(); }

async function loadDepartments() {
  departments = await api('/departments');
  $('#deptTable').innerHTML = departments.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.description)}</td><td>${d.employee_count}</td><td><button class="btn" onclick="editDept(${d.id})">Edit</button> <button class="btn danger" onclick="delDept(${d.id})">Delete</button></td></tr>`).join('');
  $('#empDeptFilter').innerHTML = '<option value="">All Departments</option>' + departments.map(d => `<option>${esc(d.name)}</option>`).join('');
  $('#reportDept').innerHTML = '<option value="">All Departments</option>' + departments.map(d => `<option>${esc(d.name)}</option>`).join('');
}
$('#addDeptBtn').onclick = () => openModal('Add Department', [{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description' }], 'Create', async d => { await api('/departments', { method: 'POST', body: JSON.stringify(d) }); loadDepartments(); });
async function editDept(id) { const d = departments.find(x => x.id === id); openModal('Edit Department', [{ name: 'name', label: 'Name', value: d.name }, { name: 'description', label: 'Description', value: d.description }], 'Save', async data => { await api('/departments/' + id, { method: 'PUT', body: JSON.stringify(data) }); loadDepartments(); }); }
async function delDept(id) { if (confirm('Delete department?')) { try { await api('/departments/' + id, { method: 'DELETE' }); loadDepartments(); } catch (e) { toast(e.message); } } }

async function loadAttendance() {
  const params = new URLSearchParams({ from: $('#attFrom').value, to: $('#attTo').value });
  const rows = await api('/attendance?' + params);
  $('#attTable').innerHTML = rows.map(a => `<tr><td>${esc(a.date)}</td><td>${esc(a.full_name)}</td><td>${esc(a.time_in || '-')}</td><td>${esc(a.time_out || '-')}</td><td>${esc(a.status)}</td><td>${a.working_hours}</td><td>${a.late_minutes}</td><td>${a.overtime_hours}</td><td><button class="btn danger" onclick="delAtt(${a.id})">Delete</button></td></tr>`).join('');
}
$('#attSearch').onclick = loadAttendance;
$('#attForm').onsubmit = async e => { e.preventDefault(); try { await api('/attendance', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); toast('Attendance saved'); loadAttendance(); } catch (err) { toast(err.message); } };
async function delAtt(id) { if (confirm('Delete attendance record?')) { await api('/attendance/' + id, { method: 'DELETE' }); loadAttendance(); } }
$('#attSummaryBtn').onclick = async () => { const params = new URLSearchParams({ from: $('#attFrom').value, to: $('#attTo').value }); const rows = await api('/attendance/summary?' + params); $('#attSummary').innerHTML = '<div class="panel"><h3>Attendance Summary</h3><table class="table"><thead><tr><th>Employee</th><th>Days</th><th>Hours</th><th>Late (min)</th><th>OT (h)</th><th>Absent</th></tr></thead><tbody>' + rows.map(r => `<tr><td>${esc(r.full_name)}</td><td>${r.days}</td><td>${r.hours}</td><td>${r.late_minutes}</td><td>${r.overtime_hours}</td><td>${r.absences}</td></tr>`).join('') + '</tbody></table></div>'; };

let payrollPeriods = [], payrollRecords = [];
const badge = s => s ? `<span class="badge ${esc(s)}">${esc(s)}</span>` : '';

async function loadPayroll() {
  payrollPeriods = await api('/payroll-periods');
  $('#periodSelect').innerHTML = payrollPeriods.map(p => `<option value="${p.id}">${esc(p.label)} — ${esc(p.type)}</option>`).join('') || '<option value="">No periods yet</option>';
  await loadPayrollRecords();
}
async function loadPayrollRecords() {
  const pid = $('#periodSelect').value;
  const period = payrollPeriods.find(p => String(p.id) === String(pid));
  const status = period ? period.status : '';
  $('#periodBadge').innerHTML = badge(status);
  if (!period) {
    payrollRecords = [];
    $('#payrollTable').innerHTML = '<tr><td colspan="17">Create a payroll period first.</td></tr>';
    $('#payrollSummary').textContent = '';
    return setPayrollButtons('', false);
  }
  payrollRecords = await api('/payroll-records?period_id=' + pid);
  $('#payrollTable').innerHTML = payrollRecords.map(r => `<tr><td>${esc(r.full_name)} (${esc(r.employee_code)})</td><td>${money(r.basic_pay)}</td><td>${money(r.overtime_pay)}</td><td>${money(r.allowances)}</td><td>${money(r.other_earnings)}</td><td><b>${money(r.gross_pay)}</b></td><td>${money(r.late_deduction)}</td><td>${money(r.absence_deduction)}</td><td>${money(r.sss)}</td><td>${money(r.philhealth)}</td><td>${money(r.pagibig)}</td><td>${money(r.tax)}</td><td>${money(r.other_deductions)}</td><td>${money(r.total_deductions)}</td><td><b>${money(r.net_pay)}</b></td><td>${badge(r.status)}</td><td><button class="btn" onclick="showPayslip(${r.id})">Payslip</button>${(!isReadOnly() && r.status === 'Pending') ? ` <button class="btn" onclick="adjustRecord(${r.id})">Adjust</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="17">No records yet. Click Calculate Payroll.</td></tr>';
  const sum = k => payrollRecords.reduce((a, r) => a + Number(r[k] || 0), 0);
  $('#payrollSummary').innerHTML = payrollRecords.length
    ? `<b>${payrollRecords.length}</b> records · Gross <b>${money(sum('gross_pay'))}</b> · Deductions <b>${money(sum('total_deductions'))}</b> · Net <b>${money(sum('net_pay'))}</b>`
    : '';
  setPayrollButtons(status, payrollRecords.length > 0);
}
const isReadOnly = () => currentUser && (currentUser.role === 'viewer' || currentUser.role === 'employee');
function setPayrollButtons(status, hasRecords) {
  const ro = isReadOnly();
  $('#calcBtn').disabled = ro || status !== 'Draft';
  $('#approveBtn').disabled = ro || !(status === 'Draft' && hasRecords);
  $('#paidBtn').disabled = ro || status !== 'Approved';
  $('#reopenBtn').disabled = ro;
  $('#reopenBtn').hidden = status !== 'Approved';
  const createBtn = $('#periodForm button[type=submit], #periodForm .btn.primary'); if (createBtn) createBtn.disabled = ro;
}
async function adjustRecord(id) {
  const r = payrollRecords.find(x => x.id === id);
  openModal(`Adjust — ${r.full_name}`, [
    { name: 'other_earnings', label: 'Other Earnings (₱)', type: 'number', value: r.other_earnings },
    { name: 'other_deductions', label: 'Other Deductions (₱)', type: 'number', value: r.other_deductions }
  ], 'Save & Recompute', async d => {
    await api('/payroll-records/' + id + '/adjust', { method: 'PUT', body: JSON.stringify({ other_earnings: Number(d.other_earnings || 0), other_deductions: Number(d.other_deductions || 0) }) });
    await loadPayrollRecords();
  });
}
$('#periodSelect').onchange = loadPayrollRecords;
$('#periodForm').onsubmit = async e => { e.preventDefault(); try { await api('/payroll-periods', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); toast('Period created'); loadPayroll(); } catch (err) { toast(err.message); } };
$('#calcBtn').onclick = async () => {
  if (!confirm('Calculate payroll for this period?\n\n· New employees are added\n· Pending records are recomputed (manual adjustments are kept)\n· Approved/Paid records are untouched')) return;
  try {
    const r = await api('/payroll/calculate', { method: 'POST', body: JSON.stringify({ period_id: Number($('#periodSelect').value) }) });
    $('#calcResult').textContent = `Created ${r.created} · updated ${r.updated} · skipped ${r.skipped}`;
    await loadPayrollRecords();
  } catch (err) { toast(err.message); }
};
$('#approveBtn').onclick = async () => { if (!confirm('Approve this payroll? Approved records can no longer be recalculated.')) return; try { await api('/payroll-periods/' + $('#periodSelect').value + '/status', { method: 'PUT', body: JSON.stringify({ status: 'Approved' }) }); toast('Payroll approved'); await loadPayroll(); } catch (err) { toast(err.message); } };
$('#paidBtn').onclick = async () => { if (!confirm('Mark this payroll as Paid? This is final.')) return; try { await api('/payroll-periods/' + $('#periodSelect').value + '/status', { method: 'PUT', body: JSON.stringify({ status: 'Paid' }) }); toast('Marked as Paid'); await loadPayroll(); } catch (err) { toast(err.message); } };
$('#reopenBtn').onclick = async () => { if (!confirm('Reopen this payroll back to Draft for corrections?')) return; try { await api('/payroll-periods/' + $('#periodSelect').value + '/status', { method: 'PUT', body: JSON.stringify({ status: 'Draft' }) }); toast('Reopened to Draft'); await loadPayroll(); } catch (err) { toast(err.message); } };

async function showPayslip(id) {
  const { payslip: p, company } = await api('/payslip/' + id);
  renderPayslip(p, company);
}
async function showMyPayslip(id) {
  const { payslip: p, company } = await api('/my/payslip/' + id);
  renderPayslip(p, company);
}
function renderPayslip(p, company) {
  $('#payslipBody').innerHTML = `<div class="payslip"><h2>${esc(company.name)}</h2><p>${esc(company.address)}<br>${esc(company.contact)}</p><hr><h3>Employee Payslip</h3><table class="table"><tr><td>Employee</td><td>${esc(p.full_name)} (${esc(p.employee_code)})</td><td>Period</td><td>${esc(p.period_label)} (${esc(p.start_date)} to ${esc(p.end_date)})</td></tr><tr><td>Department / Position</td><td>${esc(p.department)} / ${esc(p.position)}</td><td>Payment Date</td><td>${esc(p.payment_date || '')}</td></tr><tr><td>Payment Method</td><td colspan=3>${esc(p.payment_method || '')} ${esc(p.bank_account || '')}</td></tr></table><h4>Earnings</h4><table class="table"><tr><td>Basic Pay</td><td>${money(p.basic_pay)}</td></tr><tr><td>Overtime Pay (${p.overtime_hours}h)</td><td>${money(p.overtime_pay)}</td></tr><tr><td>Allowances</td><td>${money(p.allowances)}</td></tr><tr><td>Other Earnings</td><td>${money(p.other_earnings)}</td></tr><tr><td><b>Gross Pay</b></td><td><b>${money(p.gross_pay)}</b></td></tr></table><h4>Deductions</h4><table class="table"><tr><td>Late (${p.late_minutes} min)</td><td>${money(p.late_deduction)}</td></tr><tr><td>Absence (${p.absent_days} days)</td><td>${money(p.absence_deduction)}</td></tr><tr><td>SSS</td><td>${money(p.sss)}</td></tr><tr><td>PhilHealth</td><td>${money(p.philhealth)}</td></tr><tr><td>Pag-IBIG</td><td>${money(p.pagibig)}</td></tr><tr><td>Tax</td><td>${money(p.tax)}</td></tr><tr><td>Other</td><td>${money(p.other_deductions)}</td></tr><tr><td><b>Total Deductions</b></td><td><b>${money(p.total_deductions)}</b></td></tr></table><h3>Net Pay: ${money(p.net_pay)}</h3><p>Present days: ${p.present_days} | Status: ${esc(p.status)}</p></div>`;
  $('#payslipModal').hidden = false;
}
async function loadMyPayroll() {
  try {
    const p = await api('/my/profile');
    $('#myProfile').innerHTML = `<b>${esc(p.full_name)}</b> (${esc(p.employee_code)}) · ${esc(p.department)} / ${esc(p.position)} · ${esc(p.email || '-')} · ${esc(p.phone || '-')}`;
    const rows = await api('/my/payslips');
    $('#myPayslips').innerHTML = rows.map(r => `<tr><td>${esc(r.period_label)} <span class="hint">(${esc(r.start_date)} → ${esc(r.end_date)})</span></td><td>${money(r.gross_pay)}</td><td>${money(r.total_deductions)}</td><td><b>${money(r.net_pay)}</b></td><td>${badge(r.status)}</td><td><button class="btn" onclick="showMyPayslip(${r.id})">View / Print</button></td></tr>`).join('') || '<tr><td colspan="6">No finalized payslips yet.</td></tr>';
  } catch (err) {
    $('#myProfile').textContent = err.status === 403 || /employee/i.test(err.message) ? 'Your account is not linked to an employee record. Ask an admin to link it to view your payslips.' : err.message;
    $('#myPayslips').innerHTML = '';
  }
}
$('#closePayslip').onclick = () => $('#payslipModal').hidden = true;
$('#printPayslip').onclick = () => { document.body.classList.add('print-payslip'); window.onafterprint = () => document.body.classList.remove('print-payslip'); window.print(); setTimeout(() => document.body.classList.remove('print-payslip'), 1000); };

async function loadReports() { if (currentUser && currentUser.role === 'employee') { const hp = $('#histPanel'); if (hp) hp.hidden = true; return; } await loadDepartments(); }
$('#reportBtn').onclick = async () => { const rows = await api('/reports/monthly?department=' + encodeURIComponent($('#reportDept').value)); $('#reportTable').innerHTML = rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.department)}</td><td>${r.headcount}</td><td>${money(r.gross)}</td><td>${money(r.deductions)}</td><td>${money(r.net)}</td><td>${money(r.overtime)}</td><td>${money(r.sss)}</td><td>${money(r.philhealth)}</td><td>${money(r.pagibig)}</td><td>${money(r.tax)}</td></tr>`).join('') || '<tr><td colspan=11>No data</td></tr>'; };
$('#histBtn').onclick = async () => { const rows = await api('/reports/employee-history?employee_id=' + $('#histEmp').value); $('#histOut').innerHTML = '<table class="table"><thead><tr><th>Period</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th></tr></thead><tbody>' + rows.map(r => `<tr><td>${esc(r.period_label)}</td><td>${money(r.gross_pay)}</td><td>${money(r.total_deductions)}</td><td>${money(r.net_pay)}</td><td>${esc(r.status)}</td></tr>`).join('') + '</tbody></table>'; };
function exportCsv(type) { window.open('/api/reports/export.csv?type=' + type, '_blank'); }

async function loadSettings() {
  const s = await api('/settings');
  const f = $('#settingsForm'); Object.entries(s).forEach(([k, v]) => { const el = f.elements[k]; if (el) el.value = v; });
  const isAdmin = currentUser && currentUser.role === 'admin';
  document.querySelectorAll('#settingsForm input, #settingsForm textarea, #settingsSaveBtn').forEach(el => { el.disabled = !isAdmin; });
  const usersPanel = $('#usersPanel'); if (usersPanel) usersPanel.hidden = !isAdmin;
  if (isAdmin) {
    try {
      const emps = await api('/employees');
      const sel = $('#userForm select[name=employee_id]');
      if (sel) sel.innerHTML = '<option value="">— none (staff) —</option>' + emps.filter(e => !e.is_archived).map(e => `<option value="${e.id}">${esc(e.employee_code)} - ${esc(e.full_name)}</option>`).join('');
      const users = await api('/users'); $('#userList').innerHTML = users.map(u => `<p>${esc(u.username)} — ${esc(u.full_name)} (${esc(u.role)}${u.employee_name ? ' → ' + esc(u.employee_name) : ''})</p>`).join('');
    } catch (err) { toast(err.message); }
  }
}
$('#settingsForm').onsubmit = async e => { e.preventDefault(); try { await api('/settings', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); toast('Settings saved'); } catch (err) { toast(err.message); } };
$('#userForm').onsubmit = async e => { e.preventDefault(); const form = e.target; const d = Object.fromEntries(new FormData(form)); if (!d.employee_id) delete d.employee_id; try { await api('/users', { method: 'POST', body: JSON.stringify(d) }); toast('User created'); form.reset(); loadSettings(); } catch (err) { toast(err.message); } };

async function loadAudit() { const rows = await api('/audit-logs'); $('#auditTable').innerHTML = rows.map(r => `<tr><td>${r.id}</td><td>${esc(r.username || '')}</td><td>${esc(r.action)}</td><td>${esc(r.details)}</td><td>${esc(r.created_at)}</td></tr>`).join(''); }

$('#loginForm').onsubmit = async e => { e.preventDefault(); $('#loginError').textContent = ''; try { const d = await api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); enterApp(d.user); } catch (err) { $('#loginError').textContent = err.message; } };
$('#logoutBtn').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); };
function enterApp(user) {
  currentUser = user;
  $('#loginView').hidden = true; $('#appView').hidden = false;
  $('#userLabel').textContent = `${user.full_name} (${user.role})`;
  if (user.role === 'employee') {
    document.querySelectorAll('#nav button').forEach(b => { b.hidden = !['payroll', 'reports', 'myPayroll'].includes(b.dataset.view); });
    showView('payroll');
  } else {
    document.querySelectorAll('#nav button').forEach(b => { b.hidden = b.dataset.view === 'myPayroll'; });
    showView('dashboard');
    loadEmployees();
  }
}
(async () => { try { const d = await api('/auth/me'); enterApp(d.user); } catch {} })();
