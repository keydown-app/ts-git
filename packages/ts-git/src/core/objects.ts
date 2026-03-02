import { zlibSync, unzlibSync } from 'fflate';
import { FSAdapter } from '../fs/types.js';
import { joinPaths, dirname } from '../utils/path.js';
import { bufferToHex, stringToBuffer, concatBuffers } from '../utils/buffer.js';
import { sha1 } from './hash.js';
import { ObjectNotFoundError, InvalidObjectTypeError } from '../errors.js';
import { readObjectFromPackfile, hasObjectInPackfile } from './packfile.js';

export type GitObjectType = 'blob' | 'tree' | 'commit' | 'tag';

export interface ObjectHeader {
  type: GitObjectType;
  size: number;
}

export function parseObjectHeader(data: Uint8Array): ObjectHeader | null {
  const nullIndex = data.indexOf(0);
  if (nullIndex === -1) return null;

  const headerStr = new TextDecoder().decode(data.slice(0, nullIndex));
  const match = headerStr.match(/^(\w+) (\d+)$/);

  if (!match) return null;

  return {
    type: match[1] as GitObjectType,
    size: parseInt(match[2], 10),
  };
}

export function serializeObject(
  type: GitObjectType,
  content: Uint8Array,
): Uint8Array {
  const headerStr = `${type} ${content.length}\0`;
  const header = stringToBuffer(headerStr);
  return concatBuffers(header, content);
}

export function deserializeObject(data: Uint8Array): {
  type: GitObjectType;
  content: Uint8Array;
} {
  const header = parseObjectHeader(data);
  if (!header) {
    throw new InvalidObjectTypeError('Invalid object format: missing header');
  }

  const nullIndex = data.indexOf(0);
  const content = data.slice(nullIndex + 1);

  return {
    type: header.type,
    content,
  };
}

export function objectToRaw(
  type: GitObjectType,
  content: Uint8Array,
): Uint8Array {
  const serialized = serializeObject(type, content);
  const compressed = zlibSync(serialized); // Use zlib format (RFC 1950) for Git compatibility
  return compressed;
}

export function rawToObject(data: Uint8Array): {
  type: GitObjectType;
  content: Uint8Array;
} {
  const decompressed = unzlibSync(data); // Use zlib format (RFC 1950) for Git compatibility
  return deserializeObject(decompressed);
}

export async function computeOid(
  type: GitObjectType,
  content: Uint8Array,
): Promise<string> {
  const serialized = serializeObject(type, content);
  return (await sha1(serialized)).oid;
}

export function objectPath(oid: string, gitdir: string): string {
  return joinPaths(gitdir, 'objects', oid.slice(0, 2), oid.slice(2));
}

export async function readObject(
  fs: FSAdapter,
  gitdir: string,
  oid: string,
): Promise<{ type: GitObjectType; content: Uint8Array; oid: string }> {
  const path = objectPath(oid, gitdir);

  // Check if loose object exists first
  if (await fs.exists(path)) {
    const compressed = await fs.readFile(path);
    const { type, content } = rawToObject(compressed);
    return { type, content, oid };
  }

  // No loose object - try packfile
  const packObject = await readObjectFromPackfile(fs, gitdir, oid);
  if (packObject) {
    return { type: packObject.type, content: packObject.content, oid };
  }

  throw new ObjectNotFoundError(`Object ${oid} not found`, oid);
}

export async function writeObject(
  fs: FSAdapter,
  gitdir: string,
  type: GitObjectType,
  content: Uint8Array,
): Promise<string> {
  const oid = await computeOid(type, content);
  const path = objectPath(oid, gitdir);

  const dir = dirname(path);
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir, { recursive: true });
  }

  const raw = objectToRaw(type, content);
  await fs.writeFile(path, raw);

  return oid;
}

export async function hasObject(
  fs: FSAdapter,
  gitdir: string,
  oid: string,
): Promise<boolean> {
  const path = objectPath(oid, gitdir);
  if (await fs.exists(path)) {
    return true;
  }
  return hasObjectInPackfile(fs, gitdir, oid);
}

export function serializeBlob(content: Uint8Array): Uint8Array {
  return content;
}

export function deserializeBlob(content: Uint8Array): Uint8Array {
  return content;
}

export interface TreeEntryRaw {
  mode: string;
  path: string;
  oid: string;
}

export function serializeTree(entries: TreeEntryRaw[]): Uint8Array {
  const parts: Uint8Array[] = [];

  for (const entry of entries) {
    const modeBuffer = stringToBuffer(entry.mode + ' ');
    const pathBuffer = stringToBuffer(entry.path);
    const oidBuffer = hexToBuffer(entry.oid);
    const nullByte = new Uint8Array([0]);

    parts.push(modeBuffer, pathBuffer, nullByte, oidBuffer);
  }

  return concatBuffers(...parts);
}

function hexToBuffer(hex: string): Uint8Array {
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    array[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return array;
}

export function deserializeTree(content: Uint8Array): TreeEntryRaw[] {
  const entries: TreeEntryRaw[] = [];
  let offset = 0;

  while (offset < content.length) {
    const spaceIndex = content.indexOf(0x20, offset);
    if (spaceIndex === -1) break;

    const mode = new TextDecoder().decode(content.slice(offset, spaceIndex));
    const nullIndex = content.indexOf(0, spaceIndex);
    if (nullIndex === -1) break;

    const path = new TextDecoder().decode(
      content.slice(spaceIndex + 1, nullIndex),
    );
    const oid = bufferToHex(content.slice(nullIndex + 1, nullIndex + 21));

    entries.push({ mode, path, oid });
    offset = nullIndex + 21;
  }

  return entries;
}

export function serializeCommit(commit: {
  tree: string;
  parent: string[];
  author: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  };
  committer: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  };
  message: string;
  gpgsig?: string;
}): Uint8Array {
  const lines: string[] = [];

  if (commit.gpgsig) {
    lines.push(`gpgsig ${commit.gpgsig}`);
  }

  lines.push(`tree ${commit.tree}`);

  for (const parent of commit.parent) {
    lines.push(`parent ${parent}`);
  }

  const authorTime = `${commit.author.timestamp} ${formatTimezone(commit.author.timezoneOffset)}`;
  lines.push(
    `author ${commit.author.name} <${commit.author.email}> ${authorTime}`,
  );

  const committerTime = `${commit.committer.timestamp} ${formatTimezone(commit.committer.timezoneOffset)}`;
  lines.push(
    `committer ${commit.committer.name} <${commit.committer.email}> ${committerTime}`,
  );

  lines.push('');
  lines.push(commit.message);

  return stringToBuffer(lines.join('\n'));
}

function formatTimezone(offset: number): string {
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `${sign}${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
}

export function deserializeCommit(content: Uint8Array): {
  tree: string;
  parent: string[];
  author: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  };
  committer: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  };
  message: string;
  gpgsig?: string;
} {
  const str = new TextDecoder().decode(content);
  const lines = str.split('\n');

  let tree = '';
  const parent: string[] = [];
  let author: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  } | null = null;
  let committer: {
    name: string;
    email: string;
    timestamp: number;
    timezoneOffset: number;
  } | null = null;
  let gpgsig: string | undefined;

  let messageStart = 0;
  let inMessage = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inMessage) {
      messageStart = i;
      break;
    }

    if (line === '') {
      inMessage = true;
      continue;
    }

    const spaceIndex = line.indexOf(' ');
    if (spaceIndex === -1) continue;

    const key = line.slice(0, spaceIndex);
    const value = line.slice(spaceIndex + 1);

    switch (key) {
      case 'tree':
        tree = value;
        break;
      case 'parent':
        parent.push(value);
        break;
      case 'author':
        author = parseIdentity(value);
        break;
      case 'committer':
        committer = parseIdentity(value);
        break;
      case 'gpgsig':
        gpgsig = value;
        break;
    }
  }

  const message = lines.slice(messageStart).join('\n');

  return {
    tree,
    parent,
    author: author!,
    committer: committer!,
    message: message.replace(/^\n+/, ''),
    gpgsig,
  };
}

function parseIdentity(value: string): {
  name: string;
  email: string;
  timestamp: number;
  timezoneOffset: number;
} {
  const match = value.match(/^(.+?) <(.+?)> (\d+) ([+-]\d{4})$/);
  if (!match) {
    return {
      name: '',
      email: '',
      timestamp: 0,
      timezoneOffset: 0,
    };
  }

  const [, name, email, timestamp, tz] = match;
  const timezoneOffset = parseTimezone(tz);

  return {
    name,
    email,
    timestamp: parseInt(timestamp, 10),
    timezoneOffset,
  };
}

function parseTimezone(tz: string): number {
  const match = tz.match(/([+-])(\d{2})(\d{2})/);
  if (!match) return 0;

  const [, sign, hours, minutes] = match;
  const offset = parseInt(hours, 10) * 60 + parseInt(minutes, 10);
  return sign === '+' ? -offset : offset;
}
