// Core exports (platform-agnostic)
export * from './core/index.js';
export * from './core/objects.js';
export * from './core/refs.js';
export * from './core/config.js';
export * from './commands/index.js';
export * from './types.js';
export * from './errors.js';

// Utility exports
export * from './utils/walk.js';
export * from './utils/gitignore.js';
export {
  normalizeRepoRelativePath,
  relative,
} from './utils/path.js';

// FS types only (implementations are platform-specific)
export {
  type FSAdapter,
  type FSAdapterOptions,
  type DirEntry,
  type FileStats,
} from './fs/types.js';

export * from './client/index.js';
