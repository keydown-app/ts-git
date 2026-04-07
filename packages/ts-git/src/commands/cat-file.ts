import { FSAdapter } from '../fs/types.js';
import { readObject } from '../core/objects.js';
import { joinPaths } from '../utils/path.js';

export interface ReadBlobResult {
  oid: string;
  type: 'blob';
  blob: Uint8Array;
}

export interface ReadTreeResult {
  oid: string;
  type: 'tree';
  entries: { mode: string; path: string; oid: string; type: string }[];
}

export interface ReadCommitResult {
  oid: string;
  type: 'commit';
  tree: string;
  parent: string[];
  author: { name: string; email: string; timestamp: number; timezoneOffset: number };
  committer: { name: string; email: string; timestamp: number; timezoneOffset: number };
  message: string;
}

export type ReadObjectResult = ReadBlobResult | ReadTreeResult | ReadCommitResult;

export interface CatFileArgs {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  oid: string;
  typeOnly?: boolean;
  pretty?: boolean;
}

function formatCommit(content: string, oid: string): string {
  const lines = content.split('\n');
  let message = '';
  let inMessage = false;
  for (const line of lines) {
    if (line === '') { inMessage = true; continue; }
    if (inMessage) message += line + '\n';
  }
  return `commit ${oid.slice(0,7)}\n${message}`;
}

export async function catFile(args: CatFileArgs): Promise<string | ReadObjectResult | null> {
  const { fs, dir, gitdir = joinPaths(dir, '.git'), oid, typeOnly = false, pretty = false } = args;
  try {
    const result = await readObject(fs, gitdir, oid);
    const type = result.type;
    
    if (typeOnly) return type;
    if (pretty) {
      if (type === 'blob') return new TextDecoder().decode(result.content);
      if (type === 'commit') return formatCommit(new TextDecoder().decode(result.content), oid);
      return type;
    }

    if (type === 'blob') return { oid, type: 'blob', blob: result.content };
    if (type === 'tree') return { oid, type: 'tree', entries: [] };
    if (type === 'commit') {
      const str = new TextDecoder().decode(result.content);
      return { oid, type: 'commit', tree: '', parent: [], 
        author: { name: '', email: '', timestamp: 0, timezoneOffset: 0 },
        committer: { name: '', email: '', timestamp: 0, timezoneOffset: 0 },
        message: str };
    }
    return null;
  } catch (e) { throw new Error(`Failed to read object ${oid}: ${e}`); }
}