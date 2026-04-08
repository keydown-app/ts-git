import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('ls-tree interop with canonical git', () => {
  const testDir = '/tmp/ts-git-interop-lstree';

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('should list tree entries matching canonical git', async () => {
    // Create files and commit
    writeFileSync(join(testDir, 'file1.txt'), 'content1\n');
    writeFileSync(join(testDir, 'file2.txt'), 'content2\n');
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "test"', { cwd: testDir });

    // Get tree OID
    const treeOid = execSync('git rev-parse HEAD^{tree}', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();

    // List with canonical git
    const gitOutput = execSync(`git ls-tree ${treeOid}`, {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();

    // Parse output
    const lines = gitOutput.split('\n').filter(l => l.length > 0);
    
    // Verify format: mode type oid\tpath
    expect(lines.length).toBe(2);
    
    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(\w+)\s+([a-f0-9]+)\t(.+)$/);
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/^\d+$/);  // mode
      expect(['blob', 'tree', 'commit']).toContain(match![2]);  // type
      expect(match![3]).toMatch(/^[a-f0-9]{40}$/);  // oid
      expect(match![4]).toMatch(/^file\d\.txt$/);  // path
    }
  });

  it('should list nested directory matching canonical git', async () => {
    // Create nested structure
    mkdirSync(join(testDir, 'subdir'), { recursive: true });
    writeFileSync(join(testDir, 'top.txt'), 'top\n');
    writeFileSync(join(testDir, 'subdir', 'nested.txt'), 'nested\n');
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "nested"', { cwd: testDir });

    const treeOid = execSync('git rev-parse HEAD^{tree}', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();

    const gitOutput = execSync(`git ls-tree ${treeOid}`, {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();

    // Should have blob for top.txt and tree for subdir
    const lines = gitOutput.split('\n').filter(l => l.length > 0);
    expect(lines.length).toBe(2);
    
    const blobLine = lines.find(l => l.includes('top.txt'));
    const treeLine = lines.find(l => l.includes('subdir'));
    
    expect(blobLine).toContain('blob');
    expect(treeLine).toContain('tree');
  });

  it('should handle empty tree', async () => {
    // Empty commit
    execSync('git commit --allow-empty -m "empty"', { cwd: testDir });
    
    const treeOid = execSync('git rev-parse HEAD^{tree}', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();

    const gitOutput = execSync(`git ls-tree ${treeOid}`, {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();

    // Empty tree should have no entries
    expect(gitOutput).toBe('');
  });
});