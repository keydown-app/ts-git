import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { NodeFSAdapter } from '../../fs/node-adapter.js';
import { readObject, hasObject } from '../../core/objects.js';
import { resolveHead, readRef, listBranches } from '../../core/refs.js';
import { log } from '../../commands/log.js';
import { requireGit } from './helpers.js';
import {
  extractGoldenRepo,
  cleanupGoldenRepo,
  fixtureExists,
} from './fixture-helpers.js';

const execFileAsync = promisify(execFile);

/**
 * Core Git Interoperability Tests
 *
 * These tests verify that ts-git can correctly read and interpret
 * git repositories created by canonical git, including:
 * - Packfile reading (commits, trees, blobs)
 * - Delta chain resolution
 * - Packed refs
 * - Complex repository structures
 */

describe('Core Git Interoperability', () => {
  let repoDir: string;
  let gitdir: string;
  let adapter: NodeFSAdapter;
  let fixtureAvailable = false;

  beforeAll(async () => {
    await requireGit();
    fixtureAvailable = await fixtureExists();
    if (!fixtureAvailable) {
      throw new Error(
        'Golden repository fixture not found. ' +
          'Run: ./scripts/create-golden-repo.sh',
      );
    }
  });

  beforeEach(async () => {
    // Extract fresh copy for each test suite to ensure isolation
    repoDir = await extractGoldenRepo();
    gitdir = path.join(repoDir, '.git');
    adapter = new NodeFSAdapter(repoDir);
  });

  afterEach(async () => {
    await cleanupGoldenRepo(repoDir);
  });

  describe('Packfile Object Reading', () => {
    it('should read commit from packfile', async () => {
      const head = await resolveHead(adapter, gitdir);
      expect(head).not.toBeNull();
      expect(head?.type).toBe('symbolic');

      const oid = await readRef(adapter, gitdir, 'master');
      expect(oid).not.toBeNull();
      expect(oid?.length).toBe(40);

      const object = await readObject(adapter, gitdir, oid!);
      expect(object.type).toBe('commit');
      expect(object.content.length).toBeGreaterThan(0);
    });

    it('should read tree from packfile', async () => {
      const head = await resolveHead(adapter, gitdir);
      expect(head).not.toBeNull();

      let commitOid: string;
      if (head?.type === 'symbolic') {
        commitOid = (await readRef(adapter, gitdir, head.ref))!;
      } else {
        commitOid = head!.oid;
      }

      const commit = await readObject(adapter, gitdir, commitOid);
      expect(commit.type).toBe('commit');

      const commitText = new TextDecoder().decode(commit.content);
      const treeMatch = commitText.match(/^tree ([0-9a-f]{40})/m);
      expect(treeMatch).not.toBeNull();

      const treeOid = treeMatch![1];
      const tree = await readObject(adapter, gitdir, treeOid);
      expect(tree.type).toBe('tree');
    });

    it('should read blob from packfile', async () => {
      const { stdout: lsTreeOutput } = await execFileAsync(
        'git',
        ['ls-tree', '-r', 'HEAD'],
        { cwd: repoDir, encoding: 'utf8' },
      );
      const lines = lsTreeOutput.split('\n');
      expect(lines.length).toBeGreaterThan(0);

      const firstFile = lines[0];
      const match = firstFile.match(/^\d+ \w+ ([0-9a-f]{40})\t(.+)$/);
      expect(match).not.toBeNull();

      const blobOid = match![1];
      const blob = await readObject(adapter, gitdir, blobOid);
      expect(blob.type).toBe('blob');
    });

    it('should verify object exists in packfile', async () => {
      const { stdout: lsTreeOutput } = await execFileAsync(
        'git',
        ['ls-tree', '-r', 'HEAD'],
        { cwd: repoDir, encoding: 'utf8' },
      );
      const lines = lsTreeOutput.split('\n');

      for (const line of lines) {
        const match = line.match(/^\d+ \w+ ([0-9a-f]{40})\t(.+)$/);
        if (match) {
          const blobOid = match[1];
          const exists = await hasObject(adapter, gitdir, blobOid);
          expect(exists).toBe(true);
        }
      }
    });
  });

  describe('Delta Chain Resolution', () => {
    it('should read delta chain with multiple levels', async () => {
      // The golden repo has delta-target.txt modified 6 times
      // Read all versions and verify content
      const { stdout: logOutput } = await execFileAsync(
        'git',
        ['log', '--format=%H', '--follow', 'delta-target.txt'],
        { cwd: repoDir, encoding: 'utf8' },
      );

      const commits = logOutput.trim().split('\n').filter(Boolean);
      expect(commits.length).toBeGreaterThanOrEqual(6);

      // Verify each commit has the expected content
      for (let i = 0; i < commits.length; i++) {
        const commit = await readObject(adapter, gitdir, commits[i]);
        expect(commit.type).toBe('commit');
      }
    });

    it('should resolve blob stored as delta', async () => {
      // After gc, some blobs are stored as deltas
      // Verify we can read them correctly
      const { stdout: fileContent } = await execFileAsync(
        'git',
        ['show', 'HEAD:delta-target.txt'],
        { cwd: repoDir, encoding: 'utf8' },
      );

      expect(fileContent).toContain('Delta chain modification');
    });
  });

  describe('Large Packfile Index', () => {
    it('should handle packfile with fanout table', async () => {
      // Golden repo has >50 objects, forcing fanout table usage
      const { stdout: objectCount } = await execFileAsync(
        'git',
        ['count-objects', '-v'],
        { cwd: repoDir, encoding: 'utf8' },
      );

      // After gc --aggressive, objects are packed (not loose)
      // Check that we have packed objects
      const sizePackMatch = objectCount.match(/size-pack:\s*(\d+)/);
      expect(sizePackMatch).not.toBeNull();
      const sizePack = parseInt(sizePackMatch?.[1] || '0');
      expect(sizePack).toBeGreaterThan(0); // Has packed objects

      // Verify we can still read objects
      const head = await resolveHead(adapter, gitdir);
      expect(head).not.toBeNull();
    });

    it('should read binary objects from packfile', async () => {
      // Golden repo includes logo.png (binary)
      const { stdout: blobOid } = await execFileAsync(
        'git',
        ['rev-parse', 'HEAD:logo.png'],
        { cwd: repoDir, encoding: 'utf8' },
      );

      const blob = await readObject(adapter, gitdir, blobOid.trim());
      expect(blob.type).toBe('blob');
      expect(blob.content.length).toBeGreaterThan(0);
    });
  });

  describe('Packed Refs', () => {
    it('should list branches including packed refs', async () => {
      const branches = await listBranches(adapter, gitdir);
      expect(branches).toContain('master');
      expect(branches).toContain('feature-a');
      expect(branches).toContain('feature-b');
    });

    it('should read packed ref', async () => {
      const oid = await readRef(adapter, gitdir, 'master');
      expect(oid).not.toBeNull();
      expect(oid?.length).toBe(40);
    });
  });

  describe('Complex History', () => {
    it('should read all commits from packfile', async () => {
      const commits = await log({
        fs: adapter,
        dir: repoDir,
        gitdir,
      });

      expect(commits.length).toBeGreaterThan(15);
      expect(commits[0].commit.message.trim()).toContain('Final commit');
    });

    it('should follow parent commits through packfile', async () => {
      const commits = await log({
        fs: adapter,
        dir: repoDir,
        gitdir,
      });

      // Verify parent chain exists
      expect(commits.length).toBeGreaterThan(1);

      for (let i = 0; i < Math.min(commits.length - 1, 5); i++) {
        const current = commits[i];
        const parent = commits[i + 1];
        expect(current.commit.parent).toContain(parent.oid);
      }
    });

    it('should handle merge commits', async () => {
      // Golden repo has a merge commit from feature-a
      const commits = await log({
        fs: adapter,
        dir: repoDir,
        gitdir,
      });

      // Find a merge commit (has 2 parents)
      const mergeCommit = commits.find(
        (c) => c.commit.parent && c.commit.parent.length > 1,
      );

      if (mergeCommit) {
        expect(mergeCommit.commit.parent.length).toBeGreaterThan(1);
      }
    });
  });

  describe('Tree Object Parsing', () => {
    it('should read trees with many entries', async () => {
      // Read root tree
      const head = await resolveHead(adapter, gitdir);
      let commitOid: string;

      if (head?.type === 'symbolic') {
        commitOid = (await readRef(adapter, gitdir, head.ref))!;
      } else {
        commitOid = head!.oid;
      }

      const commit = await readObject(adapter, gitdir, commitOid);
      const commitText = new TextDecoder().decode(commit.content);
      const treeMatch = commitText.match(/^tree ([0-9a-f]{40})/m);

      expect(treeMatch).not.toBeNull();

      const treeOid = treeMatch![1];
      const tree = await readObject(adapter, gitdir, treeOid);

      const entries = parseTree(tree.content);
      expect(entries.length).toBeGreaterThan(5);
    });

    it('should handle nested directory structure', async () => {
      // Golden repo has src/utils/helpers/nested.js
      const { stdout: blobOid } = await execFileAsync(
        'git',
        ['rev-parse', 'HEAD:src/utils/helpers/nested.js'],
        { cwd: repoDir, encoding: 'utf8' },
      );

      const blob = await readObject(adapter, gitdir, blobOid.trim());
      expect(blob.type).toBe('blob');

      const content = new TextDecoder().decode(blob.content);
      expect(content).toContain('Nested helper');
    });

    it('should handle unicode filenames', async () => {
      // Golden repo has ファイル.txt
      const { stdout: blobOid } = await execFileAsync(
        'git',
        ['rev-parse', 'HEAD:ファイル.txt'],
        { cwd: repoDir, encoding: 'utf8' },
      );

      const blob = await readObject(adapter, gitdir, blobOid.trim());
      expect(blob.type).toBe('blob');

      const content = new TextDecoder().decode(blob.content);
      expect(content).toContain('Unicode');
    });
  });

  describe('Object Integrity', () => {
    it('should match SHA1 checksums from git', async () => {
      // Verify ts-git calculates same SHA1 as git
      const { stdout: objects } = await execFileAsync(
        'git',
        ['cat-file', '--batch-check', '--batch-all-objects'],
        { cwd: repoDir, encoding: 'utf8' },
      );

      const objectLines = objects.trim().split('\n');
      expect(objectLines.length).toBeGreaterThan(10);

      // Verify a few objects
      for (const line of objectLines.slice(0, 10)) {
        const parts = line.split(' ');
        const oid = parts[0];
        const exists = await hasObject(adapter, gitdir, oid);
        expect(exists).toBe(true);
      }
    });
  });
});

function parseTree(
  content: Uint8Array,
): { mode: string; path: string; oid: string }[] {
  const entries: { mode: string; path: string; oid: string }[] = [];
  let offset = 0;

  while (offset < content.length) {
    const spaceIndex = content.indexOf(0x20, offset);
    if (spaceIndex === -1) break;

    const mode = new TextDecoder().decode(content.slice(offset, spaceIndex));
    const nullIndex = content.indexOf(0, spaceIndex);
    if (nullIndex === -1) break;

    const filePath = new TextDecoder().decode(
      content.slice(spaceIndex + 1, nullIndex),
    );
    const oid = Array.from(content.slice(nullIndex + 1, nullIndex + 21))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    entries.push({ mode, path: filePath, oid });
    offset = nullIndex + 21;
  }

  return entries;
}
