import { FSAdapter } from '../fs/types.js';
import { joinPaths } from '../utils/path.js';
import { ConfigParseError } from '../errors.js';

export interface ConfigSection {
  name: string;
  subsection?: string;
  options: Map<string, string>;
}

export interface GitConfig {
  sections: ConfigSection[];
}

export function parseConfig(content: string): GitConfig {
  const lines = content.split('\n');
  const sections: ConfigSection[] = [];
  let currentSection: ConfigSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    if (trimmed.startsWith('[')) {
      const endIndex = trimmed.lastIndexOf(']');
      if (endIndex === -1) {
        throw new ConfigParseError(`Invalid section header: ${trimmed}`);
      }

      const header = trimmed.slice(1, endIndex);
      const subsectionMatch = header.match(/^([^ ]+)( "([^"]+)")?$/);

      if (!subsectionMatch) {
        throw new ConfigParseError(`Invalid section header: ${header}`);
      }

      const [, name, , subsection] = subsectionMatch;

      currentSection = {
        name,
        subsection,
        options: new Map(),
      };
      sections.push(currentSection);

      continue;
    }

    if (!currentSection) {
      throw new ConfigParseError(`Option outside of section: ${trimmed}`);
    }

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      currentSection.options.set(trimmed, '');
    } else {
      const key = trimmed.slice(0, equalIndex).trim();
      let value = trimmed.slice(equalIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      currentSection.options.set(key, value);
    }
  }

  return { sections };
}

export function serializeConfig(config: GitConfig): string {
  const lines: string[] = [];

  for (const section of config.sections) {
    if (section.subsection) {
      lines.push(`[${section.name} "${section.subsection}"]`);
    } else {
      lines.push(`[${section.name}]`);
    }

    for (const [key, value] of section.options) {
      if (value.includes(' ') || value.includes('"') || value.includes("'")) {
        lines.push(`\t${key} = "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`\t${key} = ${value}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function getConfigSection(
  config: GitConfig,
  name: string,
  subsection?: string,
): ConfigSection | undefined {
  return config.sections.find(
    (s) => s.name === name && s.subsection === subsection,
  );
}

export function getConfigValue(
  config: GitConfig,
  name: string,
  key: string,
  subsection?: string,
): string | undefined {
  const section = getConfigSection(config, name, subsection);
  return section?.options.get(key);
}

export function setConfigSection(
  config: GitConfig,
  section: ConfigSection,
): void {
  const existingIndex = config.sections.findIndex(
    (s) => s.name === section.name && s.subsection === section.subsection,
  );

  if (existingIndex >= 0) {
    config.sections[existingIndex] = section;
  } else {
    config.sections.push(section);
  }
}

export function createDefaultConfig(): GitConfig {
  return {
    sections: [
      {
        name: 'core',
        options: new Map([
          ['repositoryformatversion', '0'],
          ['filemode', 'false'],
          ['bare', 'false'],
          ['logallrefupdates', 'true'],
        ]),
      },
    ],
  };
}

export async function readConfig(
  fs: FSAdapter,
  gitdir: string,
): Promise<GitConfig> {
  const configPath = joinPaths(gitdir, 'config');

  if (!(await fs.exists(configPath))) {
    return createDefaultConfig();
  }

  const content = await fs.readFileString(configPath);
  return parseConfig(content);
}

export async function writeConfig(
  fs: FSAdapter,
  gitdir: string,
  config: GitConfig,
): Promise<void> {
  const configPath = joinPaths(gitdir, 'config');
  const content = serializeConfig(config);
  await fs.writeFile(configPath, content);
}

export function getDefaultBranch(config: GitConfig): string {
  const initDefaultBranch = getConfigValue(config, 'init', 'defaultBranch');
  return initDefaultBranch ?? 'master';
}

export function setDefaultBranch(config: GitConfig, branch: string): void {
  let section = getConfigSection(config, 'init');

  if (!section) {
    section = {
      name: 'init',
      options: new Map(),
    };
    config.sections.push(section);
  }

  section.options.set('defaultBranch', branch);
}
