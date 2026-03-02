/**
 * One line-level edit in a Myers-style diff, before hunk grouping.
 */
export interface LineDiffEdit {
  type: '+' | '-' | ' ';
  oldIndex: number;
  newIndex: number;
  content: string;
}

/**
 * Pluggable line diff: two parallel line arrays → ordered edit script.
 */
export type LineDiffAlgorithm = (
  oldLines: string[],
  newLines: string[],
) => LineDiffEdit[];
