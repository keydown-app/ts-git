export type IgnorePattern = {
  pattern: string;
  regex: RegExp;
  negative: boolean;
  directoryOnly: boolean;
  anchoredToRoot: boolean;
  relativeTo: string;
};

export function parseIgnoreFile(
  content: string,
  basePath: string,
): IgnorePattern[] {
  const patterns: IgnorePattern[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue;
    }

    // Handle line continuations (backslash at end of line)
    let pattern = line;
    let j = i;
    while (j < lines.length - 1 && lines[j].endsWith('\\')) {
      j++;
      pattern = pattern.slice(0, -1) + '\n' + lines[j];
    }
    i = j;

    // Remove trailing whitespace (unless escaped)
    let processedPattern = '';
    let escaped = false;
    for (let k = 0; k < pattern.length; k++) {
      const char = pattern[k];
      if (char === '\\') {
        escaped = !escaped;
        processedPattern += char;
      } else if (char === ' ' && !escaped && k < pattern.length - 1) {
        // Skip trailing whitespace
        const remaining = pattern.slice(k);
        if (remaining.match(/^\s*$/)) {
          break;
        }
        processedPattern += char;
        escaped = false;
      } else {
        processedPattern += char;
        escaped = false;
      }
    }

    pattern = processedPattern.trim();

    // Check for negation
    const negative = pattern.startsWith('!');
    if (negative) {
      pattern = pattern.slice(1);
    }

    // Check for directory-only pattern (trailing /)
    const directoryOnly = pattern.endsWith('/');
    if (directoryOnly) {
      pattern = pattern.slice(0, -1);
    }

    // Check for root anchoring
    // If pattern has / anywhere (not just at the end), it anchors to root
    // BUT if it has / in the middle, it doesn't need a leading /
    // EXCEPTION: patterns starting with **/ are NOT anchored - they match at any depth
    let anchoredToRoot = pattern.startsWith('/');
    const hasMiddleSlash = pattern.slice(1).includes('/');

    if (anchoredToRoot) {
      pattern = pattern.slice(1);
    } else if (hasMiddleSlash && !pattern.startsWith('**/')) {
      // Pattern like dir/subdir is treated as anchored to root
      // But **/pattern should NOT be anchored (it matches at any depth)
      anchoredToRoot = true;
    }

    // Convert pattern to regex
    const regex = patternToRegex(pattern);

    patterns.push({
      pattern: pattern || '',
      regex,
      negative,
      directoryOnly,
      anchoredToRoot,
      relativeTo: basePath,
    });
  }

  return patterns;
}

function patternToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches zero or more directories
        if (pattern[i + 2] === '/') {
          // **/ - matches anything including path separators
          regex += '(?:.*\\/)?';
          i += 3;
        } else if (i === 0 && pattern.length === 2) {
          // Just ** at start
          regex += '.*';
          i += 2;
        } else {
          // ** in middle
          regex += '.*';
          i += 2;
        }
      } else {
        // * matches anything except /
        regex += '[^\\/]*';
        i++;
      }
    } else if (char === '?') {
      regex += '[^\\/]';
      i++;
    } else if (char === '[') {
      // Character class
      const endIndex = pattern.indexOf(']', i);
      if (endIndex === -1) {
        // No closing bracket, treat as literal [
        regex += '\\[';
        i++;
      } else {
        const charClass = pattern.slice(i + 1, endIndex);
        regex += `[${charClass}]`;
        i = endIndex + 1;
      }
    } else if (char === '\\') {
      // Escape sequence
      if (i + 1 < pattern.length) {
        regex += escapeRegex(pattern[i + 1]);
        i += 2;
      } else {
        // Backslash at end is invalid, never matches
        regex += '.*NEVER_MATCH.*';
        i++;
      }
    } else if ('.+^${}()|[]'.includes(char)) {
      regex += '\\' + char;
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  return new RegExp(regex, 'i');
}

function escapeRegex(char: string): string {
  if ('.+^${}()|[]*?\\'.includes(char)) {
    return '\\' + char;
  }
  return char;
}

export function createMatcher(
  patterns: IgnorePattern[],
): (path: string, isDirectory: boolean) => boolean {
  return (path: string, isDirectory: boolean): boolean => {
    // Normalize path to use forward slashes
    const normalizedPath = path.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/');
    const basename = pathParts[pathParts.length - 1];

    // Track if path is currently ignored
    let isIgnored = false;

    // We need to process patterns in order, applying parent-to-child scoping
    // Patterns are applied in the order they were parsed (file order, then directory depth)

    for (const pattern of patterns) {
      const matches = matchesPattern(
        pattern,
        normalizedPath,
        pathParts,
        basename,
        isDirectory,
      );

      if (matches) {
        if (pattern.negative) {
          isIgnored = false;
        } else {
          isIgnored = true;
        }
      }
    }

    return isIgnored;
  };
}

function matchesPattern(
  pattern: IgnorePattern,
  _fullPath: string,
  pathParts: string[],
  basename: string,
  isDirectory: boolean,
): boolean {
  // Check directory-only constraint
  if (pattern.directoryOnly && !isDirectory) {
    return false;
  }

  const patternRegex = pattern.regex;
  const relativeToParts = pattern.relativeTo.split('/').filter(Boolean);
  const fullPathParts = pathParts;

  // Calculate the relative path from where the pattern is defined
  let relativePath: string;

  if (fullPathParts.length >= relativeToParts.length) {
    // Check if the path starts with the pattern's directory
    const pathPrefix = fullPathParts.slice(0, relativeToParts.length).join('/');
    const patternPrefix = relativeToParts.join('/');

    if (
      pathPrefix === patternPrefix ||
      (relativeToParts.length === 0 && pathPrefix === '')
    ) {
      // Path is under the pattern's directory
      relativePath = fullPathParts.slice(relativeToParts.length).join('/');
    } else {
      // Path is not under this pattern's scope
      return false;
    }
  } else {
    return false;
  }

  if (relativePath === '') {
    relativePath = '.';
  }

  const relativeParts = relativePath === '.' ? [] : relativePath.split('/');

  if (pattern.anchoredToRoot) {
    // Pattern anchored to root - match from the start of relativePath only
    // For anchored patterns like /build/, we should only match at the root level
    const pathPartsForMatch = relativePath.split('/').filter(Boolean);
    const patternParts = pattern.pattern.split('/').filter(Boolean);

    // For anchored patterns, we need to match from the start
    if (pathPartsForMatch.length < patternParts.length) {
      return false;
    }

    // Check if the beginning of the path matches the pattern
    for (let i = 0; i < patternParts.length; i++) {
      // Use the already-compiled regex for each part, or create a safe regex
      const part = patternParts[i];
      let partRegex: RegExp;

      // Handle ** specially - it should match any sequence of path components
      if (part === '**') {
        // ** at this position means we've matched
        continue;
      }

      try {
        // Escape special regex chars except * and ? which are glob patterns
        const escaped = part
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '[^/]');
        partRegex = new RegExp('^' + escaped + '$', 'i');
      } catch {
        // If regex creation fails, do literal comparison
        if (pathPartsForMatch[i] !== part) {
          return false;
        }
        continue;
      }

      if (!partRegex.test(pathPartsForMatch[i])) {
        return false;
      }
    }

    // If it's a directory-only pattern, ensure we're matching a directory
    if (pattern.directoryOnly) {
      // For directory patterns, the match is valid if:
      // - We're matching a directory (isDirectory=true)
      // - The path length equals pattern length, OR
      // - We're checking a path that starts with the pattern
      if (isDirectory && pathPartsForMatch.length === patternParts.length) {
        return true;
      }
      // For files within the directory, they should be ignored
      return true;
    }

    // For non-directory anchored patterns, only match exact path
    if (pathPartsForMatch.length === patternParts.length) {
      return true;
    }

    return false;
  } else {
    // Pattern not anchored - can match at any level
    // Try matching against the full relative path and each component

    // Match against full path
    if (patternRegex.test(relativePath)) {
      return true;
    }

    // Match against basename only
    if (patternRegex.test(basename)) {
      return true;
    }

    // Match against each path component
    for (const part of relativeParts) {
      if (patternRegex.test(part)) {
        return true;
      }
    }

    return false;
  }
}
