// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://tsgit.keydown.app',
  output: 'static',
  integrations: [
    starlight({
      title: 'TS-Git',
      description:
        'Local-only TypeScript Git implementation with pluggable filesystem support',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/keydown-app/ts-git',
        },
      ],
      logo: {
        src: './public/icon.svg',
      },
      components: {
        Sidebar: './src/components/Sidebar.astro',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quickstart' },
            { label: 'Roadmap & Limitations', slug: 'roadmap' },
          ],
        },
        {
          label: 'Commands',
          items: [
            { label: 'init', slug: 'commands/init' },
            { label: 'add', slug: 'commands/add' },
            { label: 'remove', slug: 'commands/remove' },
            { label: 'commit', slug: 'commands/commit' },
            { label: 'status', slug: 'commands/status' },
            { label: 'log', slug: 'commands/log' },
            { label: 'branch', slug: 'commands/branch' },
            { label: 'checkout', slug: 'commands/checkout' },
            { label: 'reset', slug: 'commands/reset' },
            { label: 'diff', slug: 'commands/diff' },
          ],
        },
        {
          label: 'Filesystem Adapters',
          items: [
            { label: 'Overview', slug: 'filesystem/overview' },
            { label: 'MemoryFSAdapter', slug: 'filesystem/memory' },
            { label: 'NodeFSAdapter', slug: 'filesystem/node' },
            { label: 'Creating Custom Adapters', slug: 'filesystem/custom' },
          ],
        },
        {
          label: 'CLI',
          items: [{ label: 'CommandParser', slug: 'cli/command-parser' }],
        },
      ],
    }),
  ],
});
