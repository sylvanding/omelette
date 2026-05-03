import { defineConfig } from 'vitepress'

const guideSidebar = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Quick Start', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/guide/architecture' },
      { text: 'Configuration', link: '/guide/configuration' },
      { text: 'Deployment', link: '/guide/deployment' },
    ],
  },
  {
    text: 'Features',
    items: [
      { text: 'Feature Guide', link: '/guide/features' },
      { text: 'Chat Playground', link: '/guide/chat' },
      { text: 'LangGraph Pipeline', link: '/guide/pipeline' },
      { text: 'MCP Integration', link: '/guide/mcp' },
      { text: 'Testing', link: '/guide/testing' },
    ],
  },
]

const moduleSidebar = [
  {
    text: 'Pipeline Modules',
    items: [
      { text: 'Overview', link: '/modules/' },
      { text: 'Keywords', link: '/modules/keywords' },
      { text: 'Search', link: '/modules/search' },
      { text: 'Deduplication', link: '/modules/dedup' },
      { text: 'Subscription', link: '/modules/subscription' },
      { text: 'Crawler', link: '/modules/crawler' },
      { text: 'OCR', link: '/modules/ocr' },
      { text: 'RAG', link: '/modules/rag' },
      { text: 'Writing', link: '/modules/writing' },
    ],
  },
]

const apiSidebar = [
  {
    text: 'API Reference',
    items: [
      { text: 'Overview', link: '/api/' },
      { text: 'Projects', link: '/api/projects' },
      { text: 'Papers', link: '/api/papers' },
      { text: 'Keywords', link: '/api/keywords' },
      { text: 'Search', link: '/api/search' },
      { text: 'Dedup', link: '/api/dedup' },
      { text: 'Crawler', link: '/api/crawler' },
      { text: 'OCR', link: '/api/ocr' },
      { text: 'RAG', link: '/api/rag' },
      { text: 'Writing', link: '/api/writing' },
      { text: 'Chat', link: '/api/chat' },
      { text: 'Conversations', link: '/api/conversations' },
      { text: 'Settings', link: '/api/settings' },
      { text: 'Tasks', link: '/api/tasks' },
      { text: 'Pipelines', link: '/api/pipelines' },
      { text: 'Subscriptions', link: '/api/subscription' },
    ],
  },
  {
    text: 'Extended APIs',
    collapsed: true,
    items: [
      { text: 'Activities', link: '/api/activities' },
      { text: 'Analytics', link: '/api/analytics' },
      { text: 'Analysis', link: '/api/analysis' },
      { text: 'API Keys', link: '/api/api_keys' },
      { text: 'Audio Overviews', link: '/api/audio_overviews' },
      { text: 'Collections', link: '/api/collections' },
      { text: 'Concepts', link: '/api/concepts' },
      { text: 'Export', link: '/api/export' },
      { text: 'Feed', link: '/api/feed' },
      { text: 'Library', link: '/api/library' },
      { text: 'Notifications', link: '/api/notifications' },
      { text: 'Reviews', link: '/api/reviews' },
      { text: 'Team Members', link: '/api/team_members' },
      { text: 'Upload', link: '/api/upload' },
    ],
  },
]

const zhGuideSidebar = [
  {
    text: '入门',
    items: [
      { text: '快速开始', link: '/zh/guide/getting-started' },
      { text: '系统架构', link: '/zh/guide/architecture' },
      { text: '配置说明', link: '/zh/guide/configuration' },
      { text: '部署指南', link: '/zh/guide/deployment' },
    ],
  },
  {
    text: '功能',
    items: [
      { text: '功能指南', link: '/zh/guide/features' },
      { text: '对话工作台', link: '/zh/guide/chat' },
      { text: 'LangGraph 流水线', link: '/zh/guide/pipeline' },
      { text: 'MCP 集成', link: '/zh/guide/mcp' },
      { text: '测试', link: '/zh/guide/testing' },
    ],
  },
]

const zhModuleSidebar = [
  {
    text: '管道模块',
    items: [
      { text: '概览', link: '/zh/modules/' },
      { text: '关键词', link: '/zh/modules/keywords' },
      { text: '检索', link: '/zh/modules/search' },
      { text: '去重', link: '/zh/modules/dedup' },
      { text: '订阅', link: '/zh/modules/subscription' },
      { text: '爬虫', link: '/zh/modules/crawler' },
      { text: 'OCR', link: '/zh/modules/ocr' },
      { text: 'RAG', link: '/zh/modules/rag' },
      { text: '写作', link: '/zh/modules/writing' },
    ],
  },
]

const zhApiSidebar = [
  {
    text: 'API 参考',
    items: [
      { text: '概览', link: '/zh/api/' },
      { text: 'Projects', link: '/zh/api/projects' },
      { text: 'Papers', link: '/zh/api/papers' },
      { text: 'Keywords', link: '/zh/api/keywords' },
      { text: 'Search', link: '/zh/api/search' },
      { text: 'Dedup', link: '/zh/api/dedup' },
      { text: 'Crawler', link: '/zh/api/crawler' },
      { text: 'OCR', link: '/zh/api/ocr' },
      { text: 'RAG', link: '/zh/api/rag' },
      { text: 'Writing', link: '/zh/api/writing' },
      { text: 'Chat', link: '/zh/api/chat' },
      { text: 'Conversations', link: '/zh/api/conversations' },
      { text: 'Settings', link: '/zh/api/settings' },
      { text: 'Tasks', link: '/zh/api/tasks' },
      { text: 'Pipelines', link: '/zh/api/pipelines' },
      { text: 'Subscriptions', link: '/zh/api/subscription' },
    ],
  },
]

export default defineConfig({
  title: 'Omelette',
  description: 'AI-Powered Scientific Literature Lifecycle Management',
  base: '/omelette/',

  ignoreDeadLinks: [
    /^http:\/\/localhost/,
    /^http:\/\/127\.0\.0\.1/,
  ],

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/omelette/logo.svg' }],
    ['meta', { property: 'og:image', content: 'https://sylvanding.github.io/omelette/banner.png' }],
    ['meta', { property: 'og:type', content: 'website' }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'API', link: '/api/' },
          { text: 'Modules', link: '/modules/' },
        ],
        sidebar: {
          '/guide/': guideSidebar,
          '/modules/': moduleSidebar,
          '/api/': apiSidebar,
        },
      },
    },
    zh: {
      label: '中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/getting-started' },
          { text: 'API', link: '/zh/api/' },
          { text: '模块', link: '/zh/modules/' },
        ],
        sidebar: {
          '/zh/guide/': zhGuideSidebar,
          '/zh/modules/': zhModuleSidebar,
          '/zh/api/': zhApiSidebar,
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo-mascot.png',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/sylvanding/omelette' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Sylvan Ding',
    },
    search: {
      provider: 'local',
    },
  },
})
