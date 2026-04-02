export {
  FileTree,
  type FileTreeOptions,
} from './components/sidebar/FileTree.js';
export {
  Terminal,
  type TerminalOptions,
  type CommandResult,
} from './components/Terminal.js';
export { VimEditor, type VimEditorOptions } from './components/VimEditor.js';
export {
  Sidebar,
  type SidebarOptions,
  type SidebarTabId,
  GitChangesPanel,
  type GitChangesPanelOptions,
  GitHistoryPanel,
  type GitHistoryPanelOptions,
  type GitOperations,
  GIT_SIDEBAR_NOT_A_REPO,
  GIT_SIDEBAR_REPO_STATE,
  GIT_SIDEBAR_STATUS_ERROR,
  GIT_SIDEBAR_WORKSPACE_UNREADY,
  dispatchGitSidebarEvent,
  type GitRepoStateDetail,
} from './components/sidebar/index.js';
export { App, type AppConfig } from './components/App.js';
export { NullAdapter } from './lib/NullAdapter.js';
export {
  ContentPreview,
  type ContentPreviewOptions,
} from './components/ContentPreview.js';
