import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safePath } from './orca-bootstrap.mjs';

const read = file => { try { return fs.readFileSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const equal = (a, b) => a === null ? b === null : b !== null && a.equals(b);
const fail = code => { throw new Error(code); };

export function checkAction(root, action, expected) {
  const file = safePath(root, path.relative(root, action.file));
  if (!equal(read(file), expected)) fail('CONCURRENT_TARGET_CHANGE');
  const dir = path.dirname(file);
  if (fs.existsSync(dir)) {
    const names = fs.readdirSync(dir);
    if (names.some(n => n !== 'SKILL.md')) fail('CONFLICT_EXTRA_FILES');
    if (expected === null && (names.length || action.action === 'create')) fail('UNMANAGED');
  }
}

function atomicReplace(root, file, bytes, expected) {
  const checked = () => safePath(root, path.relative(root, file));
  if (!equal(read(checked()), expected)) fail('CONCURRENT_TARGET_CHANGE');
  const temp = checked() + '.ush-tmp-' + randomUUID();
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx' });
    if (!equal(read(checked()), expected)) fail('CONCURRENT_TARGET_CHANGE');
    fs.renameSync(temp, checked());
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(safePath(root, path.relative(root, temp)));
  }
}

// Caller holds the project lock. Journal is a durable preimage, not authority
// to overwrite later edits. A crash or conflicting rollback requires review;
// the next reconciliation refuses a pending journal rather than adopting files.
export function commitPlacement({ root, folder, receiptFile, receiptBytes, nextReceipt, actions }) {
  const journal = safePath(root, folder + '/.ush-project-scope.pending.json');
  if (fs.existsSync(journal)) fail('RECOVERY_REQUIRED');
  if (!equal(read(safePath(root, path.relative(root, receiptFile))), receiptBytes)) fail('CONCURRENT_RECEIPT_CHANGE');
  for (const a of actions) checkAction(root, a, a.before);
  fs.writeFileSync(journal, JSON.stringify({ version: 1, root, folder, receiptBefore: receiptBytes?.toString('base64') ?? null,
    actions: actions.map(a => ({ id: a.id, action: a.action, relative: path.relative(root, a.file), before: a.before?.toString('base64') ?? null, after: a.after?.toString('base64') ?? null })) }) + '\n', { flag: 'wx' });
  const attempted = [];
  const createdDirectories = new Set();
  let committed = false;
  try {
    for (const a of actions) {
      if (a.action === 'unchanged') continue;
      checkAction(root, a, a.before);
      attempted.push(a);
      if (a.action === 'remove') { fs.unlinkSync(a.file); fs.rmdirSync(path.dirname(a.file)); }
      else {
        const directory = safePath(root, path.relative(root, path.dirname(a.file)));
        fs.mkdirSync(directory, { recursive: true });
        if (a.action === 'create') createdDirectories.add(directory);
        atomicReplace(root, a.file, a.after, a.before);
      }
    }
    atomicReplace(root, receiptFile, Buffer.from(nextReceipt), receiptBytes);
    committed = true;
    fs.unlinkSync(journal);
  } catch (error) {
    if (committed) throw error; // durable receipt is current; leave journal for review
    try {
      for (const a of attempted.reverse()) {
        const file = safePath(root, path.relative(root, a.file));
        const current = read(file);
        if (equal(current, a.before)) {
          if (current === null && createdDirectories.has(path.dirname(file))) fs.rmdirSync(path.dirname(file));
          continue;
        }
        if (!equal(current, a.after)) fail('ROLLBACK_CONFLICT');
        checkAction(root, a, a.after);
        if (a.before === null) { fs.unlinkSync(file); fs.rmdirSync(path.dirname(file)); }
        else { fs.mkdirSync(path.dirname(file), { recursive: true }); atomicReplace(root, file, a.before, a.after); }
      }
      fs.unlinkSync(journal);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'RECOVERY_REQUIRED: rollback refused; journal preserved');
    }
    throw error;
  }
}
