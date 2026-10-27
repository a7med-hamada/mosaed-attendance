const assert = require('node:assert/strict');
const { db } = require('../server/database');
const {
  encryptPayload,
  decryptPayload,
  createCompanySnapshot,
  restoreCompanyData,
  listCompanyBackups
} = require('../server/company-backup');

async function testCompanyBackupSystem() {
  console.log('Testing company backup & encryption system...');

  // 1. Test Encryption & Decryption
  const sampleData = {
    company: 'mosaed',
    secretNotes: 'حضور وبصمات سرية',
    biometricVector: [0.12, -0.45, 0.88],
    recordsCount: 46
  };
  const encrypted = encryptPayload(sampleData);
  assert.equal(typeof encrypted, 'string');
  const parsed = JSON.parse(encrypted);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.algorithm, 'aes-256-gcm');
  assert.ok(parsed.iv);
  assert.ok(parsed.authTag);
  assert.ok(parsed.ciphertext);

  const decrypted = decryptPayload(encrypted);
  assert.deepEqual(decrypted, sampleData);
  console.log('AES-256-GCM encryption & decryption verified.');

  // 2. Test Snapshot Creation
  const snapshot = createCompanySnapshot(1, 'unit_test', 'اختبار النسخ الاحتياطي المشفر');
  assert.ok(snapshot);
  assert.equal(snapshot.managerId, 1);
  assert.equal(snapshot.companyName, 'mosaed');
  assert.ok(snapshot.backupId > 0);
  console.log('Company snapshot creation verified.');

  // 3. Test List Backups
  const list = listCompanyBackups(1);
  assert.ok(list.length > 0);
  assert.equal(list[0].company_name, 'mosaed');
  console.log('List company backups verified.');

  // 4. Test Restoration
  const restoreResult = await restoreCompanyData('mosaed', snapshot.backupId);
  assert.equal(restoreResult.success, true);
  assert.equal(restoreResult.companyName, 'mosaed');
  assert.equal(restoreResult.restored.users, 3);
  assert.equal(restoreResult.restored.employeesCount, 2);
  assert.ok(restoreResult.restored.attendanceRecords >= 46);
  console.log('Company point-in-time restoration verified.');

  console.log('All company backup tests passed successfully.');
}

testCompanyBackupSystem().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
