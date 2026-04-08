import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('update-index interop with canonical git', () => {
  const testDir = '/tmp/ts-git-interop-updateidx';

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

  it('should add file to index matching canonical git', async () => {
    writeFileSync(join(testDir, 'new.txt'), 'content\n');
    
    execSync('git update-index --add new.txt', { cwd: testDir });
    
    const status = execSync('git status --porcelain', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    expect(status).toContain('A  new.txt');
  });

  it('should stage modifications matching canonical git', async () => {
    writeFileSync(join(testDir, 'modify.txt'), 'original\n');
    execSync('git add modify.txt', { cwd: testDir });
    execSync('git commit -m "original"', { cwd: testDir });
    
    writeFileSync(join(testDir, 'modify.txt'), 'modified\n');
    
    execSync('git update-index modify.txt', { cwd: testDir });
    
    const status = execSync('git status --porcelain', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    expect(status).toContain('M  modify.txt');
  });

  it('should handle file in subdirectory', async () => {
    mkdirSync(join(testDir, 'deep', 'nested'), { recursive: true });
    writeFileSync(join(testDir, 'deep', 'nested', 'file.txt'), 'nested\n');
    
    execSync('git update-index --add deep/nested/file.txt', { cwd: testDir });
    
    const status = execSync('git status --porcelain', {
      cwd: testDir,
      encoding: 'utf-8'
    }).trim();
    
    expect(status).toContain('A  deep/nested/file.txt');
  });
});