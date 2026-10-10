const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pwa = process.argv[2] === 'pwa';

function run(args) {
  return spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
}

function exitOnClose(child) {
  child.on('exit', (code) => process.exit(code ?? 1));
}

if (!pwa) {
  exitOnClose(run([
    path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'),
    'serve',
    ...process.argv.slice(2),
  ]));
  return;
}

const build = run([
  path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'),
  'build',
  '--configuration',
  'production',
]);

build.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const browser = path.join(root, 'dist', 'saloon-pos', 'browser');
  const index = path.join(browser, 'index.html');
  if (!fs.existsSync(index)) {
    console.error('Build output was not found at dist/saloon-pos/browser.');
    process.exit(1);
  }

  fs.copyFileSync(index, path.join(browser, '404.html'));
  console.log('\nPeeple Tree PWA: http://localhost:8080\n');

  exitOnClose(run([
    path.join(root, 'node_modules', 'http-server', 'bin', 'http-server'),
    browser,
    '-p',
    '8080',
    '-c-1',
    '-o',
  ]));
});
