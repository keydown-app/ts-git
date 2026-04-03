import { FSAdapter } from '../fs/types.js';
import { joinPaths } from '../utils/path.js';
import { bufferToHex } from '../utils/buffer.js';
import { unzlibSync } from 'fflate';
import { GitObjectType } from './objects.js';

const PACK_SIGNATURE = 0x5041434b;
const INDEX_V2_SIGNATURE = 0xff744f63;
const INDEX_V1_SIGNATURE = 0xff744f62;

interface PackIndexV2 {
  version: 2;
  fanout: Uint32Array;
  oids: string[];
  crcs: Uint32Array;
  offsets: Uint32Array;
  packChecksum: string;
  idxChecksum: string;
}

interface PackIndexV1 {
  version: 1;
  fanout: Uint32Array;
  offsets: Uint32Array;
  oids: string[];
}

type PackIndex = PackIndexV2 | PackIndexV1;

function readUint32BE(buffer: Uint8Array, offset: number): number {
  return (
    ((buffer[offset] << 24) |
      (buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3]) >>>
    0
  );
}

function readUint64BE(buffer: Uint8Array, offset: number): bigint {
  const high = BigInt(readUint32BE(buffer, offset));
  const low = BigInt(readUint32BE(buffer, offset + 4));
  return (high << BigInt(32)) | low;
}

async function readPackIndex(
  fs: FSAdapter,
  idxPath: string,
): Promise<PackIndex | null> {
  if (!(await fs.exists(idxPath))) {
    return null;
  }

  const data = await fs.readFile(idxPath);
  const signature = readUint32BE(data, 0);

  if (signature === INDEX_V2_SIGNATURE) {
    return parseIndexV2(data);
  } else if (signature === INDEX_V1_SIGNATURE) {
    return parseIndexV1(data);
  }

  const fanoutFirst = readUint32BE(data, 0);
  if (fanoutFirst === 0) {
    return parseIndexV1Legacy(data);
  }

  return null;
}

function parseIndexV2(data: Uint8Array): PackIndexV2 {
  const fanout = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    fanout[i] = readUint32BE(data, 8 + i * 4);
  }

  const objectCount = fanout[255];
  const oids: string[] = [];
  let offset = 8 + 256 * 4;

  for (let i = 0; i < objectCount; i++) {
    const oid = bufferToHex(data.slice(offset, offset + 20));
    oids.push(oid);
    offset += 20;
  }

  const crcs = new Uint32Array(objectCount);
  for (let i = 0; i < objectCount; i++) {
    crcs[i] = readUint32BE(data, offset);
    offset += 4;
  }

  const offsets = new Uint32Array(objectCount);
  for (let i = 0; i < objectCount; i++) {
    offsets[i] = readUint32BE(data, offset);
    offset += 4;
  }

  const packChecksum = bufferToHex(data.slice(offset, offset + 20));
  offset += 20;
  const idxChecksum = bufferToHex(data.slice(offset, offset + 20));

  return {
    version: 2,
    fanout,
    oids,
    crcs,
    offsets,
    packChecksum,
    idxChecksum,
  };
}

function parseIndexV1(data: Uint8Array): PackIndexV1 {
  const fanout = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    fanout[i] = readUint32BE(data, i * 4);
  }

  const objectCount = fanout[255];
  const offsets = new Uint32Array(objectCount);
  let offset = 256 * 4;

  for (let i = 0; i < objectCount; i++) {
    offsets[i] = readUint32BE(data, offset);
    offset += 4;
  }

  const oids: string[] = [];
  for (let i = 0; i < objectCount; i++) {
    const oid = bufferToHex(data.slice(offset, offset + 20));
    oids.push(oid);
    offset += 20;
  }

  return {
    version: 1,
    fanout,
    offsets,
    oids,
  };
}

function parseIndexV1Legacy(data: Uint8Array): PackIndexV1 {
  const fanout = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    fanout[i] = readUint32BE(data, i * 4);
  }

  const objectCount = fanout[255];
  const offsets = new Uint32Array(objectCount);
  const oids: string[] = [];
  let offset = 256 * 4;

  for (let i = 0; i < objectCount; i++) {
    offsets[i] = readUint32BE(data, offset);
    offset += 4;
  }

  for (let i = 0; i < objectCount; i++) {
    const oid = bufferToHex(data.slice(offset, offset + 20));
    oids.push(oid);
    offset += 20;
  }

  return {
    version: 1,
    fanout,
    offsets,
    oids,
  };
}

async function getPackOffsets(
  fs: FSAdapter,
  gitdir: string,
): Promise<Map<string, { packPath: string; offset: number }>> {
  const packDir = joinPaths(gitdir, 'objects', 'pack');

  if (!(await fs.exists(packDir))) {
    return new Map();
  }

  const entries = await fs.readdir(packDir);
  const idxFiles = entries.filter((e) => e.name.endsWith('.idx'));

  const offsets = new Map<string, { packPath: string; offset: number }>();

  for (const idxFile of idxFiles) {
    const idxPath = joinPaths(packDir, idxFile.name);
    const packName = idxFile.name.replace(/\.idx$/, '');
    const packPath = joinPaths(packDir, `${packName}.pack`);

    const idx = await readPackIndex(fs, idxPath);
    if (!idx) continue;

    for (let i = 0; i < idx.oids.length; i++) {
      const oid = idx.oids[i];
      let offset: number;

      if (idx.version === 2) {
        offset = idx.offsets[i];
        if (offset & 0x80000000) {
          const largeOffsetIdx = offset & 0x7fffffff;
          const packData = await fs.readFile(packPath);
          offset = Number(readUint64BE(packData, largeOffsetIdx * 8));
        }
      } else {
        offset = idx.offsets[i];
      }

      offsets.set(oid, { packPath, offset });
    }
  }

  return offsets;
}

const PACK_CACHE_KEY = '__pack_offsets_cache__';

async function getPackOffsetsCached(
  fs: FSAdapter,
  gitdir: string,
): Promise<Map<string, { packPath: string; offset: number }>> {
  const cached = (fs as any)[PACK_CACHE_KEY];
  if (cached && cached.gitdir === gitdir) {
    return cached.offsets;
  }

  const offsets = await getPackOffsets(fs, gitdir);
  (fs as any)[PACK_CACHE_KEY] = { gitdir, offsets };
  return offsets;
}

export function invalidatePackCache(fs: FSAdapter): void {
  delete (fs as any)[PACK_CACHE_KEY];
}

const OBJECT_TYPES: GitObjectType[] = ['commit', 'tree', 'blob', 'tag'];

function decompressAtOffset(data: Uint8Array, offset: number): Uint8Array {
  return unzlibSync(data.slice(offset));
}

async function readObjectAtOffset(
  fs: FSAdapter,
  packPath: string,
  offset: number,
): Promise<{ type: GitObjectType; content: Uint8Array }> {
  const packData = await fs.readFile(packPath);

  const signature = readUint32BE(packData, 0);
  if (signature !== PACK_SIGNATURE) {
    throw new Error('Invalid pack file signature');
  }

  const version = readUint32BE(packData, 4);
  if (version !== 2 && version !== 3) {
    throw new Error(`Unsupported pack version: ${version}`);
  }

  return readPackObject(packData, offset, fs, packPath);
}

async function readPackObject(
  packData: Uint8Array,
  offset: number,
  fs: FSAdapter,
  packPath: string,
): Promise<{ type: GitObjectType; content: Uint8Array }> {
  const byte = packData[offset];
  const typeBits = (byte >> 4) & 0x07;

  let typeNum: number;
  if (typeBits === 6) {
    typeNum = 6; // OBJ_OFS_DELTA
  } else if (typeBits === 7) {
    typeNum = 7; // OBJ_REF_DELTA
  } else if (typeBits >= 1 && typeBits <= 4) {
    typeNum = typeBits;
  } else {
    throw new Error(`Invalid object type: ${typeBits}`);
  }

  let size = byte & 0x0f;
  let shift = 4;
  let pos = offset + 1;
  let currentByte = byte;

  while (currentByte & 0x80) {
    currentByte = packData[pos++];
    size |= (currentByte & 0x7f) << shift;
    shift += 7;
  }

  // size is calculated but not used in this function - it's part of the packfile format parsing
  void size;

  if (typeNum === 6) {
    // OBJ_OFS_DELTA
    const { baseOffset, consumedBytes } = readOfsDeltaOffset(packData, pos);
    const deltaOffset = offset - baseOffset;

    const deltaContent = decompressAtOffset(packData, pos + consumedBytes);

    const baseObject = await readPackObject(
      packData,
      deltaOffset,
      fs,
      packPath,
    );
    const content = applyDelta(deltaContent, baseObject.content);

    return { type: baseObject.type, content };
  } else if (typeNum === 7) {
    // OBJ_REF_DELTA
    const baseOid = bufferToHex(packData.slice(pos, pos + 20));
    pos += 20;

    const deltaContent = decompressAtOffset(packData, pos);

    const packOffsets = await getPackOffsetsCached(
      fs,
      dirname(packPath).replace('/objects/pack', ''),
    );
    const baseInfo = packOffsets.get(baseOid);

    let baseObject: { type: GitObjectType; content: Uint8Array };

    if (baseInfo) {
      baseObject = await readObjectAtOffset(
        fs,
        baseInfo.packPath,
        baseInfo.offset,
      );
    } else {
      const loosePath = joinPaths(
        dirname(dirname(packPath)),
        baseOid.slice(0, 2),
        baseOid.slice(2),
      );
      const looseData = await fs.readFile(loosePath);
      const decompressed = unzlibSync(looseData);
      const nullIndex = decompressed.indexOf(0);
      const header = new TextDecoder().decode(decompressed.slice(0, nullIndex));
      const [typeStr] = header.split(' ');
      const content = decompressed.slice(nullIndex + 1);
      baseObject = { type: typeStr as GitObjectType, content };
    }

    const content = applyDelta(deltaContent, baseObject.content);
    return { type: baseObject.type, content };
  } else {
    const objectType = OBJECT_TYPES[typeNum - 1];
    const content = decompressAtOffset(packData, pos);
    return { type: objectType, content };
  }
}

function readOfsDeltaOffset(
  data: Uint8Array,
  offset: number,
): { baseOffset: number; consumedBytes: number } {
  let baseOffset = data[offset] & 0x7f;
  let pos = offset + 1;

  while (data[pos - 1] & 0x80) {
    baseOffset = ((baseOffset + 1) << 7) | (data[pos] & 0x7f);
    pos++;
  }

  return { baseOffset, consumedBytes: pos - offset };
}

function applyDelta(delta: Uint8Array, base: Uint8Array): Uint8Array {
  let pos = 0;

  const readVarInt = (): number => {
    let value = 0;
    let shift = 0;
    let hasMore = true;
    while (hasMore) {
      const byte = delta[pos++];
      value |= (byte & 0x7f) << shift;
      shift += 7;
      hasMore = (byte & 0x80) !== 0;
    }
    return value;
  };

  const baseSize = readVarInt();
  const resultSize = readVarInt();

  if (baseSize !== base.length) {
    throw new Error('Base size mismatch in delta');
  }

  const result = new Uint8Array(resultSize);
  let resultPos = 0;

  while (pos < delta.length) {
    const cmd = delta[pos++];

    if (cmd & 0x80) {
      // Copy from base
      let copyOffset = 0;
      let copySize = 0;

      if (cmd & 0x01) copyOffset |= delta[pos++] << 0;
      if (cmd & 0x02) copyOffset |= delta[pos++] << 8;
      if (cmd & 0x04) copyOffset |= delta[pos++] << 16;
      if (cmd & 0x08) copyOffset |= delta[pos++] << 24;

      if (cmd & 0x10) copySize |= delta[pos++] << 0;
      if (cmd & 0x20) copySize |= delta[pos++] << 8;
      if (cmd & 0x40) copySize |= delta[pos++] << 16;
      if (copySize === 0) copySize = 0x10000;

      result.set(base.slice(copyOffset, copyOffset + copySize), resultPos);
      resultPos += copySize;
    } else if (cmd) {
      // Insert literal data
      result.set(delta.slice(pos, pos + cmd), resultPos);
      resultPos += cmd;
      pos += cmd;
    } else {
      throw new Error('Invalid delta command: 0');
    }
  }

  if (resultPos !== resultSize) {
    throw new Error('Result size mismatch in delta');
  }

  return result;
}

function dirname(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return '.';
  return path.slice(0, lastSlash) || '/';
}

export async function readObjectFromPackfile(
  fs: FSAdapter,
  gitdir: string,
  oid: string,
): Promise<{ type: GitObjectType; content: Uint8Array } | null> {
  const offsets = await getPackOffsetsCached(fs, gitdir);
  const info = offsets.get(oid);

  if (!info) {
    return null;
  }

  return readObjectAtOffset(fs, info.packPath, info.offset);
}

export async function hasObjectInPackfile(
  fs: FSAdapter,
  gitdir: string,
  oid: string,
): Promise<boolean> {
  const offsets = await getPackOffsetsCached(fs, gitdir);
  return offsets.has(oid);
}
