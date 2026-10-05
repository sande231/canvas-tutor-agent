// Install the small legacy PowerPoint text reader locally; no sudo or email setup.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const version = '0.97.2';
const checksum = 'd3673f7638b6d07bfa70aeae4fe1ab07ec3977c3bc1db045846f7c3e3d65a82a';
async function main() {
  if (process.platform === 'win32') throw Error('On Windows, install LibreOffice and set LIBREOFFICE_PATH to soffice.exe.');
  const prefix = path.resolve(__dirname, '../.tools/catdoc');
  const executable = path.join(prefix, 'bin/catppt');
  if (fs.existsSync(executable)) {
    execFileSync(executable, ['-V'], { stdio: 'inherit' });
    console.log('Legacy PowerPoint reader is already installed.');
    return;
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-catdoc-'));
  try {
    const response = await fetch(`https://github.com/skierpage/catdoc/releases/download/v${version}/catdoc-${version}-dist.tar.gz`, {signal: AbortSignal.timeout(120000)});
    if (!response.ok) throw Error(`Reader download returned ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(archive).digest('hex') !== checksum) throw Error('Reader download checksum mismatch; installation stopped.');
    const tarball = path.join(temporary, 'catdoc.tar.gz');
    fs.writeFileSync(tarball, archive);
    execFileSync('tar', ['-xzf', tarball, '-C', temporary], { timeout: 30000 });
    const options = { cwd: path.join(temporary, `catdoc-${version}`), stdio: 'inherit', timeout: 120000 };
    execFileSync('./configure', [`--prefix=${prefix}`, '--disable-wordview'], options);
    execFileSync('make', ['-j2'], options);
    execFileSync('make', ['install'], options);
    execFileSync(executable, ['-V'], { stdio: 'inherit' });
    console.log('Legacy PowerPoint reader installed. Restart npm run preview, then retry the module.');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
main().catch(error => { console.error(`PowerPoint reader setup failed: ${error.message}`); process.exitCode = 1; });
