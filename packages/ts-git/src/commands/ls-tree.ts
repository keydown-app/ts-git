import { FSAdapter } from '../fs/types.js';
import { readObject } from '../core/objects.js';
import { joinPaths } from '../utils/path.js';

export interface LsTreeArgs {
  fs: FSAdapter;
  dir: string;
  gitdir?: string;
  tree: string;
  recursive?: boolean;
  nameOnly?: boolean;
}

export interface TreeEntry {
  mode: string;
  type: string;
  oid: string;
  path: string;
}

export interface LsTreeResult {
  entries: TreeEntry[];
}

function parseTreeContent(content: Uint8Array): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let offset = 0;
  while (offset < content.length) {
    const spaceIndex = content.indexOf(0x20, offset);
    if (spaceIndex === -1) break;
    const mode = new TextDecoder().decode(content.slice(offset, spaceIndex));
    const nullIndex = content.indexOf(0, spaceIndex);
    if (nullIndex === -1) break;
    const path = new TextDecoder().decode(content.slice(spaceIndex + 1, nullIndex));
    const oidBytes = content.slice(nullIndex + 1, nullIndex + 21);
    if (oidBytes.length < 20) break;
    let oidHex = '';
    for (let i = 0; i < 20; i++) oidHex += oidBytes[i].toString(16).padStart(2,'0');
    const type = mode.startsWith('04') ? 'tree' : mode.startsWith('10') ? 'blob' : mode === '120000' ? 'symlink' : 'blob';
    entries.push({ mode, type, oid: oidHex, path });
    offset = nullIndex + 21;
  }
  return entries;
}

export async function lsTree(args: LsTreeArgs): Promise<LsTreeResult> {
  const { fs, dir, gitdir = joinPaths(dir, '.git'), tree, nameOnly = false } = args;
  const treeOid = tree;
  if (!tree.match(/^[a-f0-9]{40}$/i)) {
    // For now, require OID - can enhance with ref resolution later
    throw new Error('ls-tree currently requires tree OID. Provide a 40-char hex OID.');
  }
  const { type, content } = await readObject(fs, gitdir, treeOid);
  if (type !== 'tree') throw new Error(`Not a tree: ${treeOid}`);
  const entries = parseTreeContent(content);
  if (nameOnly) return { entries: entries.map(e => ({ ...e, mode: '', type: 'blob', oid: '' })) };
  return { entries };
}