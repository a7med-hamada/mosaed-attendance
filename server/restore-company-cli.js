const { restoreCompanyData, createCompanySnapshot, listCompanyBackups } = require('./company-backup');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
Company Backup & Recovery CLI:
  node server/restore-company-cli.js list                - List all company backups
  node server/restore-company-cli.js backup [id|name]    - Create instant encrypted snapshot for company
  node server/restore-company-cli.js restore [id|name]   - Restore company data from latest encrypted snapshot
  node server/restore-company-cli.js restore [id|name] [backupId] - Restore specific backup ID
    `);
    process.exit(0);
  }

  if (command === 'list') {
    const filter = args[1] || null;
    const backups = listCompanyBackups(filter);
    console.log(JSON.stringify(backups, null, 2));
    return;
  }

  if (command === 'backup') {
    const target = args[1] || 1;
    const snapshot = createCompanySnapshot(target, 'cli_manual_snapshot', 'نسخة احتياطية مشفرة يدوية من موجه الأوامر');
    console.log('Snapshot created successfully:', JSON.stringify(snapshot, null, 2));
    return;
  }

  if (command === 'restore') {
    const target = args[1] || 1;
    const backupId = args[2] ? parseInt(args[2], 10) : null;
    console.log(`Restoring company data for: ${target}...`);
    const result = await restoreCompanyData(target, backupId);
    console.log('Restoration completed successfully:', JSON.stringify(result, null, 2));
    return;
  }

  // Default: interpret argument as company to restore
  console.log(`Restoring company data for: ${command}...`);
  const result = await restoreCompanyData(command);
  console.log('Restoration completed successfully:', JSON.stringify(result, null, 2));
  return;
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
