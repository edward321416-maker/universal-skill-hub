import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createManifest, verifyRelease, safePath } from './orca-bootstrap.mjs';

// Explicit operator action after full verification, not a startup repair path.
const [root, pin, output] = process.argv.slice(2);
if (!root || !pin || !output || !path.isAbsolute(root) || !path.isAbsolute(output)) {
  throw new Error('Usage: orca-seal-release.mjs <absolute-release-root> <approved-sha> <new-manifest-path>');
}
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== pin) throw new Error('PIN_MISMATCH');
if (git('remote', 'get-url', 'origin') !== 'https://github.com/edward321416-maker/universal-skill-hub.git') throw new Error('ORIGIN_MISMATCH');
if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('SOURCE_DIRTY');
const manifest = createManifest(safePath(root), pin);
verifyRelease(manifest);
safePath(output);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ pin, sealedFiles: Object.keys(manifest.files).length, status: 'SEALED', prerequisite: 'operator full verification' }));
