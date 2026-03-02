import { FSAdapter } from '../fs/types.js';
import { joinPaths, normalizeRepoRelativePath } from '../utils/path.js';
import {
  readUint32BE,
  writeUint32BE,
  readUint16BE,
  writeUint16BE,
  bufferToHex,
  hexToBuffer,
  concatBuffers,
} from '../utils/buffer.js';
import { sha1 } from './hash.js';
import { IndexParseError } from '../errors.js';

export interface IndexEntry {
  ctimeSeconds: number;
  ctimeNanoseconds: number;
  mtimeSeconds: number;
  mtimeNanoseconds: number;
  dev: number;
  ino: number;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  oid: string;
  flags: number;
  path: string;
}

export interface Index {
  version: number;
  entries: IndexEntry[];
}

const INDEX_SIGNATURE = 0x44495243;
const INDEX_VERSION_2 = 2;
const INDEX_VERSION_3 = 3;
const INDEX_VERSION_4 = 4;

/** Git index: CE_EXTENDED — extra uint16 (extended flags) appears before the path. */
export const CE_EXTENDED = 0x4000;

/** Stage bits in flags: 0 = merged, 1/2/3 = unmerged stages. */
export function indexEntryStage(flags: number): number {
  return (flags >> 12) & 3;
}

/** Group index entries by normalized path (multiple stages = unmerged). */
export function groupIndexEntriesByPath(
  entries: IndexEntry[],
): Map<string, IndexEntry[]> {
  const m = new Map<string, IndexEntry[]>();
  for (const e of entries) {
    const p = normalizeRepoRelativePath(e.path);
    const list = m.get(p) ?? [];
    list.push(e);
    m.set(p, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => indexEntryStage(a.flags) - indexEntryStage(b.flags));
  }
  return m;
}

/**
 * One entry per path for status/diff: merged (stage 0), else "ours" (stage 2), else last stage.
 */
export function pickRepresentativeIndexEntry(
  entries: IndexEntry[],
): IndexEntry | undefined {
  if (entries.length === 0) return undefined;
  const stage0 = entries.find((e) => indexEntryStage(e.flags) === 0);
  if (stage0) return stage0;
  const ours = entries.find((e) => indexEntryStage(e.flags) === 2);
  if (ours) return ours;
  return entries[entries.length - 1];
}

export function parseIndex(data: Uint8Array): Index {
  // Git index has 12-byte header + entries + 20-byte SHA-1 checksum
  if (data.length < 32) {
    throw new IndexParseError('Index file too small');
  }

  const signature = readUint32BE(data, 0);
  if (signature !== INDEX_SIGNATURE) {
    throw new IndexParseError(
      `Invalid index signature: ${signature.toString(16)}`,
    );
  }

  const version = readUint32BE(data, 4);
  if (version === INDEX_VERSION_4) {
    throw new IndexParseError(
      'Index version 4 is not supported. Rebuild the index with Git version 2 or 3 (e.g. `git config core.indexVersion 3` and `git read-tree HEAD` or `git add --all`).',
    );
  }
  if (version !== INDEX_VERSION_2 && version !== INDEX_VERSION_3) {
    throw new IndexParseError(`Unsupported index version: ${version}`);
  }

  const entryCount = readUint32BE(data, 8);
  const entries: IndexEntry[] = [];

  let offset = 12;

  // Git index ends with 20-byte SHA-1 checksum, don't parse it as entries
  const checksumEnd = data.length - 20;

  for (let i = 0; i < entryCount; i++) {
    if (offset >= checksumEnd) {
      throw new IndexParseError(`Unexpected end of index at entry ${i}`);
    }

    const { entry, byteLength } = parseIndexEntry(data, offset, version);
    entries.push(entry);
    offset += byteLength;
  }

  return { version, entries };
}

function parseIndexEntry(
  data: Uint8Array,
  offset: number,
  _version: number,
): { entry: IndexEntry; byteLength: number } {
  const ctimeSeconds = readUint32BE(data, offset);
  const ctimeNanoseconds = readUint32BE(data, offset + 4);
  const mtimeSeconds = readUint32BE(data, offset + 8);
  const mtimeNanoseconds = readUint32BE(data, offset + 12);
  const dev = readUint32BE(data, offset + 16);
  const ino = readUint32BE(data, offset + 20);
  const mode = readUint32BE(data, offset + 24);
  const uid = readUint32BE(data, offset + 28);
  const gid = readUint32BE(data, offset + 32);
  const size = readUint32BE(data, offset + 36);
  const oid = bufferToHex(data.slice(offset + 40, offset + 60));
  const flags = readUint16BE(data, offset + 60);

  const pathLength = flags & 0xfff;
  let pathStart = offset + 62;
  if (flags & CE_EXTENDED) {
    pathStart += 2;
  }

  const pathEnd = pathStart + pathLength;
  const pathData = data.slice(pathStart, pathEnd);
  const rawPath = new TextDecoder().decode(pathData);
  const path = normalizeRepoRelativePath(rawPath);

  const byteLength = (pathStart - offset + pathLength + 1 + 7) & ~7;

  const entry: IndexEntry = {
    ctimeSeconds,
    ctimeNanoseconds,
    mtimeSeconds,
    mtimeNanoseconds,
    dev,
    ino,
    mode,
    uid,
    gid,
    size,
    oid,
    flags,
    path,
  };

  return { entry, byteLength };
}

export async function serializeIndex(index: Index): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];

  parts.push(writeUint32BE(INDEX_SIGNATURE));
  parts.push(writeUint32BE(index.version));
  parts.push(writeUint32BE(index.entries.length));

  const sortedEntries = [...index.entries].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  for (const entry of sortedEntries) {
    parts.push(serializeIndexEntry(entry, index.version));
  }

  // Git index requires a 20-byte SHA-1 checksum of all preceding content
  const data = concatBuffers(...parts);
  const checksum = await sha1(data);
  const checksumBytes = hexToBuffer(checksum.oid);

  return concatBuffers(data, checksumBytes);
}

function serializeIndexEntry(entry: IndexEntry, _version: number): Uint8Array {
  const parts: Uint8Array[] = [];

  parts.push(writeUint32BE(entry.ctimeSeconds));
  parts.push(writeUint32BE(entry.ctimeNanoseconds));
  parts.push(writeUint32BE(entry.mtimeSeconds));
  parts.push(writeUint32BE(entry.mtimeNanoseconds));
  parts.push(writeUint32BE(entry.dev));
  parts.push(writeUint32BE(entry.ino));
  parts.push(writeUint32BE(entry.mode));
  parts.push(writeUint32BE(entry.uid));
  parts.push(writeUint32BE(entry.gid));
  parts.push(writeUint32BE(entry.size));
  parts.push(hexToBuffer(entry.oid));
  parts.push(writeUint16BE(entry.flags));

  if (entry.flags & CE_EXTENDED) {
    parts.push(writeUint16BE(0));
  }

  const pathBytes = stringToBuffer(entry.path);
  parts.push(pathBytes);
  parts.push(new Uint8Array([0]));

  const base = 62 + ((entry.flags & CE_EXTENDED) !== 0 ? 2 : 0);
  const entryLength = (base + entry.path.length + 1 + 7) & ~7;
  const padding = entryLength - base - entry.path.length - 1;
  if (padding > 0) {
    parts.push(new Uint8Array(padding));
  }

  return concatBuffers(...parts);
}

function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export async function readIndex(fs: FSAdapter, gitdir: string): Promise<Index> {
  const indexPath = joinPaths(gitdir, 'index');

  if (!(await fs.exists(indexPath))) {
    return { version: INDEX_VERSION_2, entries: [] };
  }

  const data = await fs.readFile(indexPath);
  return parseIndex(data);
}

export async function writeIndex(
  fs: FSAdapter,
  gitdir: string,
  index: Index,
): Promise<void> {
  const indexPath = joinPaths(gitdir, 'index');
  const data = await serializeIndex(index);
  await fs.writeFile(indexPath, data);
}

export function createIndexEntry(options: {
  path: string;
  oid: string;
  mode: number;
  mtimeMs: number;
  size: number;
}): IndexEntry {
  const now = Math.floor(Date.now() / 1000);
  const mtimeSeconds = Math.floor(options.mtimeMs / 1000);
  const mtimeNanoseconds = Math.floor((options.mtimeMs % 1000) * 1000000);

  return {
    ctimeSeconds: now,
    ctimeNanoseconds: 0,
    mtimeSeconds,
    mtimeNanoseconds,
    dev: 0,
    ino: 0,
    mode: options.mode,
    uid: 0,
    gid: 0,
    size: options.size,
    oid: options.oid,
    flags: createFlags(options.path),
    path: normalizeRepoRelativePath(options.path),
  };
}

export function createFlags(path: string): number {
  const pathLength = Math.min(path.length, 0xfff);
  const flags = pathLength & 0xfff;
  return flags;
}

export function updateIndexEntry(index: Index, entry: IndexEntry): Index {
  const normalizedPath = normalizeRepoRelativePath(entry.path);
  const existingIndex = index.entries.findIndex(
    (e) => normalizeRepoRelativePath(e.path) === normalizedPath,
  );

  if (existingIndex >= 0) {
    index.entries[existingIndex] = entry;
  } else {
    index.entries.push(entry);
  }

  return index;
}

export function removeIndexEntry(index: Index, path: string): Index {
  const np = normalizeRepoRelativePath(path);
  index.entries = index.entries.filter(
    (e) => normalizeRepoRelativePath(e.path) !== np,
  );
  return index;
}

export function findIndexEntry(
  index: Index,
  path: string,
): IndexEntry | undefined {
  const np = normalizeRepoRelativePath(path);
  return index.entries.find((e) => normalizeRepoRelativePath(e.path) === np);
}
