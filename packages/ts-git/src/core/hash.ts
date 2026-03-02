async function digestSHA1(data: Uint8Array): Promise<ArrayBuffer> {
  // TypeScript 5.x generic type mismatch: Uint8Array<ArrayBufferLike> is not assignable to
  // BufferSource due to strict variance checking, but Uint8Array is a valid BufferSource at runtime.
  // See: https://github.com/microsoft/TypeScript/issues/58547
  return await crypto.subtle.digest('SHA-1', data as BufferSource);
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface HashResult {
  oid: string;
  algorithm: 'sha1';
}

export async function sha1(data: Uint8Array | string): Promise<HashResult> {
  let inputBuffer: Uint8Array;

  if (typeof data === 'string') {
    inputBuffer = new TextEncoder().encode(data);
  } else {
    inputBuffer = data;
  }

  const digest = await digestSHA1(inputBuffer);
  return {
    oid: arrayBufferToHex(digest),
    algorithm: 'sha1',
  };
}

export async function sha1String(data: string): Promise<string> {
  return (await sha1(data)).oid;
}

export async function sha1Buffer(data: Uint8Array): Promise<string> {
  return (await sha1(data)).oid;
}

export function normalizeHashInput(data: Uint8Array | string): Uint8Array {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  return data;
}

export function isValidOid(oid: string): boolean {
  return /^[0-9a-f]{40}$/i.test(oid);
}

export function prefixOid(oid: string): string {
  return oid;
}

export function shortenOid(oid: string, length: number = 7): string {
  if (!isValidOid(oid)) {
    return oid;
  }
  return oid.substring(0, length);
}

export function oidsEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
