const { spawn } = require('node:child_process');
const path = require('node:path');
/** @param {string} root @param {{command: string, data?: string}} options */
function storageRequest(root, options) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      path.join(
        __dirname.replace('app.asar', 'app.asar.unpacked'),
        'bin/sunto-storage',
      ),
      [root],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    let error = '';
    process.stdout.on('data', (chunk) => {
      output += chunk;
    });
    process.stderr.on('data', (chunk) => {
      error += chunk;
    });
    process.on('error', reject);
    process.on('close', (code) => {
      if (code !== 0) reject(new Error(error || 'Storage helper failed'));
      else {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(e);
        }
      }
    });
    process.stdin.on('error', reject);
    process.stdin.end(JSON.stringify(options));
  });
}
module.exports = { storageRequest };
