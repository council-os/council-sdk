import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Council OS',
  tagline: 'Safely scaling intelligence',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true,
  },

  url: 'https://docs.meetcouncil.com',
  baseUrl: '/',

  organizationName: 'council-os',
  projectName: 'docs',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/council-os/council-sdk/tree/main/docs-site/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl:
            'https://github.com/council-os/council-sdk/tree/main/docs-site/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Council OS',
      logo: {
        alt: 'Council OS Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Getting Started',
        },
        {
          to: '/docs/sdk/typescript/installation',
          label: 'SDK Reference',
          position: 'left',
        },
        {
          to: '/docs/connectors/overview',
          label: 'Connectors',
          position: 'left',
        },
        {
          to: '/docs/platform/architecture',
          label: 'Platform',
          position: 'left',
        },
        {
          to: '/docs/enterprise/overview',
          label: 'Enterprise',
          position: 'left',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'https://github.com/council-os/council-sdk',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/intro',
            },
            {
              label: 'SDK Reference',
              to: '/docs/sdk/typescript/installation',
            },
            {
              label: 'Connector Guide',
              to: '/docs/connectors/overview',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/council-os/council-sdk',
            },
            {
              label: 'Twitter',
              href: 'https://x.com/meetcouncil',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'meetcouncil.com',
              href: 'https://meetcouncil.com',
            },
          ],
        },
      ],
      copyright: `Copyright \u00A9 ${new Date().getFullYear()} Council OS`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
