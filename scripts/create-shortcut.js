const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const userProfile = process.env.USERPROFILE || 'C:\\Users\\A7MD';
const desktop = path.join(userProfile, 'Desktop');
const icoPath = path.join(userProfile, 'mosaed-app.ico');
const sourceIco = path.join(__dirname, 'public', 'icons', 'app.ico');

// Ensure icon
if (fs.existsSync(sourceIco)) {
  fs.copyFileSync(sourceIco, icoPath);
  console.log('Icon copied to:', icoPath);
}

// Clean up
['MosaedApp.lnk', 'حضور شركة مساعد.lnk', 'حضور شركة مساعد   نظام الحضور والانصراف الذكي (Ahmed).lnk'].forEach(name => {
  const p = path.join(desktop, name);
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch (e) {}
  }
});

const edgeX86 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edge64 = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let targetExe = edgeX86;
if (!fs.existsSync(targetExe)) {
  if (fs.existsSync(edge64)) targetExe = edge64;
  else if (fs.existsSync(chromeExe)) targetExe = chromeExe;
}

const targetUrl = 'https://mosaedattendance-hllzqpnc.b4a.run/';
const tempShortcutPath = path.join(desktop, 'MosaedApp.lnk');
const finalShortcutPath = path.join(desktop, 'حضور شركة مساعد.lnk');

// Build PowerShell script cleanly using an array of lines without unescaped JS template interpolation
const psLines = [
  '$wsh = New-Object -ComObject WScript.Shell',
  '$sc = $wsh.CreateShortcut("' + tempShortcutPath.replace(/\\/g, '\\\\') + '")',
  '$sc.TargetPath = "' + targetExe.replace(/\\/g, '\\\\') + '"',
  '$sc.Arguments = "--app=' + targetUrl + '"',
  '$sc.Description = "حضور شركة مساعد - تطبيق مستقل"',
  '$sc.IconLocation = "' + icoPath.replace(/\\/g, '\\\\') + ',0"',
  '$sc.WorkingDirectory = "' + path.dirname(targetExe).replace(/\\/g, '\\\\') + '"',
  '$sc.Save()'
];
const psCode = psLines.join('\r\n');

const base64Ps = Buffer.from(psCode, 'utf16le').toString('base64');
execSync('powershell.exe -NoProfile -EncodedCommand ' + base64Ps);

if (fs.existsSync(tempShortcutPath)) {
  fs.renameSync(tempShortcutPath, finalShortcutPath);
  console.log('Shortcut created and renamed successfully to: حضور شركة مساعد.lnk');
} else {
  console.error('Failed to create shortcut file!');
}
