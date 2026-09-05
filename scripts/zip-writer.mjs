/**
 * Minimal, dependency-free, deterministic ZIP writer (STORE/no-compression
 * method — sizes here are tiny, and STORE avoids any zlib-version-dependent
 * deflate output differences, which would break byte-for-byte determinism).
 * Only what claude.ai / OpenAI API skill-bundle uploads need: a flat set of
 * {path, content} entries, each placed under a single top-level folder.
 *
 * Not a general-purpose ZIP library — no directories-as-entries, no
 * extra fields, no Zip64. Fine for a skill bundle (a few small text files).
 */
import crypto from 'node:crypto';

// Fixed DOS date/time (2026-01-01 00:00:00) so output never depends on
// wall-clock time — required for "deterministic output".
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertSafeRelativePath(p) {
  if (/^([A-Za-z]:)?[\\/]/.test(p) || /\.\./.test(p)) {
    throw new Error(`entry path must be a safe relative path (no absolute path, no ".."): "${p}"`);
  }
}

export function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    assertSafeRelativePath(entry.path);
    const nameBuf = Buffer.from(entry.path.replace(/\\/g, '/'), 'utf8');
    // Buffer.from(buf) copies raw bytes with no encoding reinterpretation
    // when the input is already a Buffer/Uint8Array — only a string input
    // goes through the 'utf8' decode. This is what makes binary content
    // (images, PDFs, etc.) safe to pass through unchanged.
    const dataBuf = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf8');
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // general purpose flag: UTF-8 filenames
    localHeader.writeUInt16LE(0, 8); // compression method: STORE
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: regular file, 0644
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralDirSize = centralParts.reduce((sum, b) => sum + b.length, 0);
  const centralDirOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // records on this disk
  eocd.writeUInt16LE(entries.length, 10); // total records
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

/**
 * Minimal reader matching buildZip's own output exactly (STORE method,
 * UTF-8 filenames, no Zip64) — used to unit-test round-trip byte fidelity
 * without depending on an external unzip binary being present. Not a
 * general-purpose ZIP reader.
 */
export function readZip(buf) {
  const eocdSig = buf.readUInt32LE(buf.length - 22);
  if (eocdSig !== 0x06054b50) throw new Error('not a valid zip produced by buildZip: missing EOCD signature');
  const entryCount = buf.readUInt16LE(buf.length - 22 + 10);
  const centralDirOffset = buf.readUInt32LE(buf.length - 22 + 16);

  const entries = [];
  let cdPos = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(cdPos) !== 0x02014b50) throw new Error(`expected central directory signature at offset ${cdPos}`);
    const compressedSize = buf.readUInt32LE(cdPos + 20);
    const nameLen = buf.readUInt16LE(cdPos + 28);
    const localHeaderOffset = buf.readUInt32LE(cdPos + 42);
    const name = buf.toString('utf8', cdPos + 46, cdPos + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const content = buf.subarray(dataStart, dataStart + compressedSize); // STORE only: compressed === raw

    entries.push({ path: name, content: Buffer.from(content) });
    cdPos += 46 + nameLen;
  }
  return entries;
}

export function sha256OfBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
