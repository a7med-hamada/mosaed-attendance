const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workforce-security-'));
const port = 31000 + Math.floor(Math.random() * 20000);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--experimental-sqlite', 'server/app.js'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    JWT_SECRET: crypto.randomBytes(48).toString('base64'),
    DATABASE_PATH: path.join(tempDir, 'attendance.db'),
    UPLOADS_DIR: path.join(tempDir, 'uploads'),
    CORS_ORIGINS: 'https://trusted.example',
    CLOUD_SYNC_ENABLED: 'false',
    SEED_DEMO_DATA: 'false'
  },
  stdio: ['ignore', 'ignore', 'pipe']
});

let stderr = '';
server.stderr.on('data', chunk => {
  stderr += chunk.toString();
});
server.once('close', () => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function request(method, url, { body, token, origin } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { response, data };
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited during startup: ${stderr}`);
    try {
      await fetch(baseUrl);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Server did not start in time: ${stderr}`);
}

async function run() {
  await waitForServer();

  const managerA = await request('POST', '/api/auth/register-manager', {
    body: {
      full_name: 'Security Manager A',
      email: 'manager-a@example.test',
      password: 'ManagerPasswordA123',
      company_name: 'Company A'
    }
  });
  assert.equal(managerA.response.status, 200);
  const managerB = await request('POST', '/api/auth/register-manager', {
    body: {
      full_name: 'Security Manager B',
      email: 'manager-b@example.test',
      password: 'ManagerPasswordB123',
      company_name: 'Company B'
    }
  });
  assert.equal(managerB.response.status, 200);

  const employeeA = await request('POST', '/api/employees', {
    token: managerA.data.token,
    body: {
      full_name: 'Employee A',
      email: 'employee-a@example.test',
      password: 'EmployeePasswordA123'
    }
  });
  const employeeB = await request('POST', '/api/employees', {
    token: managerB.data.token,
    body: {
      full_name: 'Employee B',
      email: 'employee-b@example.test',
      password: 'EmployeePasswordB123'
    }
  });
  assert.equal(employeeA.response.status, 200, JSON.stringify(employeeA.data));
  assert.equal(employeeB.response.status, 200, JSON.stringify(employeeB.data));

  const crossCompanyRead = await request('GET', `/api/employees/${employeeB.data.id}`, {
    token: managerA.data.token
  });
  assert.equal(crossCompanyRead.response.status, 403);

  const crossCompanyReport = await request(
    'GET',
    `/api/reports/employee-month-details?employee_id=${employeeB.data.id}&month=2026-10`,
    { token: managerA.data.token }
  );
  assert.equal(crossCompanyReport.response.status, 403);

  const crossCompanyAttendance = await request('POST', '/api/attendance/manual-record', {
    token: managerA.data.token,
    body: { employee_id: employeeB.data.id, date: '2026-10-22' }
  });
  assert.equal(crossCompanyAttendance.response.status, 403);

  const branchRequest = await request('POST', '/api/branches/request', {
    token: managerA.data.token,
    body: {
      branch_name: 'Secure Branch',
      branch_manager_name: 'Branch Manager',
      branch_phone: '+10000000000',
      branch_email: 'branch@example.test',
      branch_password: 'BranchManagerPassword123'
    }
  });
  assert.equal(branchRequest.response.status, 200);
  const branches = await request('GET', '/api/branches', { token: managerA.data.token });
  assert.equal(branches.response.status, 200);
  assert.equal('branch_password' in branches.data.requests[0], false);
  assert.equal('branch_password_hash' in branches.data.requests[0], false);

  const queryToken = await request('GET', `/api/employees?token=${encodeURIComponent(managerA.data.token)}`);
  assert.equal(queryToken.response.status, 401);

  // Log in as employeeA to get employee token
  const employeeLogin = await request('POST', '/api/auth/login', {
    body: { identifier: 'employee-a@example.test', password: 'EmployeePasswordA123' }
  });
  assert.equal(employeeLogin.response.status, 200);
  const employeeToken = employeeLogin.data.token;

  // Verification: Unauthenticated & Employee attempts to add attendance or deduction
  const unauthAttendance = await request('POST', '/api/attendance/manual-record', {
    body: { employee_id: employeeA.data.id, date: '2026-10-27', check_in_time: '09:00' }
  });
  assert.equal(unauthAttendance.response.status, 401);

  const employeeAttendanceInjection = await request('POST', '/api/attendance/manual-record', {
    token: employeeToken,
    body: { employee_id: employeeA.data.id, date: '2026-10-27', check_in_time: '09:00' }
  });
  assert.equal(employeeAttendanceInjection.response.status, 403);

  const unauthDeduction = await request('POST', '/api/deductions', {
    body: { employee_id: employeeA.data.id, amount: 100, reason: 'Test' }
  });
  assert.equal(unauthDeduction.response.status, 401);

  const employeeDeductionInjection = await request('POST', '/api/deductions', {
    token: employeeToken,
    body: { employee_id: employeeA.data.id, amount: 100, reason: 'Test' }
  });
  assert.equal(employeeDeductionInjection.response.status, 403);

  const crossCompanyDeduction = await request('POST', '/api/deductions', {
    token: managerA.data.token,
    body: { employee_id: employeeB.data.id, amount: 50, reason: 'Cross' }
  });
  assert.equal(crossCompanyDeduction.response.status, 403);

  const blockedOrigin = await request('POST', '/api/auth/login', {
    origin: 'https://untrusted.example',
    body: { identifier: 'unknown@example.test', password: 'wrong' }
  });
  assert.equal(blockedOrigin.response.headers.get('access-control-allow-origin'), null);

  for (let attempt = 0; attempt < 10; attempt++) {
    await request('POST', '/api/auth/login', {
      body: { identifier: 'unknown@example.test', password: 'wrong' }
    });
  }
  const rateLimitedLogin = await request('POST', '/api/auth/login', {
    body: { identifier: 'unknown@example.test', password: 'wrong' }
  });
  assert.equal(rateLimitedLogin.response.status, 429);

  const unconfiguredOwner = await request('POST', '/api/super-admin/login', {
    body: { email: 'owner@example.test', password: 'unused' }
  });
  assert.equal(unconfiguredOwner.response.status, 401);

  console.log('Security hardening tests passed.');
}

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
  });
