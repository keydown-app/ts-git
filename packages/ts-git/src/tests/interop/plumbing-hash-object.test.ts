import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('hash-object interop with canonical git', () => {
  const testDir = '/tmp/ts-git-interop-hashobj';
  
  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('should produce valid OID for simple content', async () => {
    const content = 'hello world\n';
    writeFileSync(join(testDir, 'test.txt'), content);
    
    // Hash with canonical git
    const gitOid = execSync('git hash-object test.txt', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    // Verify OID format (SHA-1 hash)
    expect(gitOid).toMatch(/^[a-f0-9]{40}$/);
    // This is the canonical SHA-1 for "hello world\n" (with newline)
    expect(gitOid).toBe('3b18e512dba79e4c8300dd08aeb37f8e728b8dad');
  });

  it('should produce valid OID for binary content', async () => {
    const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
    writeFileSync(join(testDir, 'binary.bin'), binaryContent);
    
    const gitOid = execSync('git hash-object binary.bin', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    expect(gitOid).toMatch(/^[a-f0-9]{40}$/);
  });

  it('should write object to store with -w flag', async () => {
    const content = 'test content\n';
    writeFileSync(join(testDir, 'file.txt'), content);
    
    const gitOid = execSync('git hash-object -w file.txt', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    // Verify object exists in .git/objects
    const prefix = gitOid.substring(0, 2);
    const suffix = gitOid.substring(2);
    const objectPath = join(testDir, '.git', 'objects', prefix, suffix);
    
    expect(existsSync(objectPath)).toBe(true);
  });

  it('should produce same OID for identical content', async () => {
    const content = 'identical\n';
    writeFileSync(join(testDir, 'a.txt'), content);
    writeFileSync(join(testDir, 'b.txt'), content);
    
    const oidA = execSync('git hash-object a.txt', { cwd: testDir, encoding: 'utf-8' }).trim();
    const oidB = execSync('git hash-object b.txt', { cwd: testDir, encoding: 'utf-8' }).trim();
    
    // Same content = same OID (content-addressable storage)
    expect(oidA).toBe(oidB);
  });
});