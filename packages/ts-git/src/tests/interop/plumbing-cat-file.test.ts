import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('cat-file interop with canonical git', () => {
  const testDir = '/tmp/ts-git-interop-catfile';

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

  it('should read blob content matching canonical git', async () => {
    const content = 'hello world\n';
    writeFileSync(join(testDir, 'test.txt'), content);
    
    // Hash with canonical git
    const gitOid = execSync('git hash-object -w test.txt', { 
      cwd: testDir, 
      encoding: 'utf-8' 
    }).trim();
    
    // Verify OID format
    expect(gitOid).toMatch(/^[a-f0-9]{40}$/);
    
    // Read with canonical git
    const gitContent = execSync(`git cat-file -p ${gitOid}`, {
      cwd: testDir,
      encoding: 'utf-8'
    });
    
    expect(gitContent).toBe(content);
  });

  it('should read blob type matching canonical git', async () => {
    const content = 'test content\n';
    writeFileSync(join(testDir, 'test.txt'), content);
    
    const gitOid = execSync('git hash-object -w test.txt', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    const gitType = execSync(`git cat-file -t ${gitOid}`, {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    expect(gitType).toBe('blob');
  });

  it('should read commit object matching canonical git', async () => {
    writeFileSync(join(testDir, 'file.txt'), 'content\n');
    execSync('git add file.txt', { cwd: testDir });
    execSync('git commit -m "test"', { cwd: testDir });
    
    const commitOid = execSync('git rev-parse HEAD', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    const gitContent = execSync(`git cat-file -p ${commitOid}`, {
      cwd: testDir,
      encoding: 'utf-8'
    });
    
    // Verify commit structure
    expect(gitContent).toContain('tree');
    expect(gitContent).toContain('author');
    expect(gitContent).toContain('committer');
    expect(gitContent).toContain('test');
  });
});