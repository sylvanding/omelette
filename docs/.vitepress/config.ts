import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Omelette',
  description: 'Scientific Literature Lifecycle Management System',
  base: '/omelette/',

  ignoreDeadLinks: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:11434',
    'http://localhost:8000',
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
          { text: 'API Reference', link: '/api/' },
          { text: 'Modules', link: '/modules/' },
        ],
        sidebar: {
          '/guide/': [
            {
              text: 'Introduction',
              items: [
                { text: 'Getting Started', link: '/guide/getting-started' },
                { text: 'Architecture', link: '/guide/architecture' },
                { text: 'Configuration', link: '/guide/configuration' },
                { text: 'Deployment', link: '/guide/deployment' },
              ],
            },
            {
              text: 'V2 Features',
              items: [
                { text: 'Chat Playground', link: '/guide/chat' },
                { text: 'LangGraph Pipeline', link: '/guide/pipeline' },
                { text: 'MCP Integration', link: '/guide/mcp' },
              ],
            },
            {
              text: 'Phase 4 Features',
              items: [
                { text: 'Feature Guide', link: '/guide/features' },
              ],
            },
            {
              text: 'Quality',
              items: [
                { text: 'Testing Guide', link: '/guide/testing' },
              ],
            },
          ],
          '/modules/': [
            {
              text: 'Modules',
              items: [
                { text: 'Overview', link: '/modules/' },
                { text: '1. Keywords', link: '/modules/keywords' },
                { text: '2. Literature Search', link: '/modules/search' },
                { text: '3. Deduplication', link: '/modules/dedup' },
                { text: '4. Subscription', link: '/modules/subscription' },
                { text: '5. PDF Crawler', link: '/modules/crawler' },
                { text: '6. OCR', link: '/modules/ocr' },
                { text: '7. RAG Knowledge Base', link: '/modules/rag' },
                { text: '8. Writing Assistant', link: '/modules/writing' },
              ],
            },
          ],
          '/api/': [
            {
              text: 'API Reference',
              items: [
                { text: 'Overview', link: '/api/' },
                { text: 'Projects', link: '/api/projects' },
                { text: 'Papers', link: '/api/papers' },
                { text: 'Keywords', link: '/api/keywords' },
                { text: 'Search', link: '/api/search' },
                { text: 'Dedup', link: '/api/dedup' },
                { text: 'OCR', link: '/api/ocr' },
                { text: 'Crawler', link: '/api/crawler' },
                { text: 'Subscription', link: '/api/subscription' },
                { text: 'RAG', link: '/api/rag' },
                { text: 'Writing', link: '/api/writing' },
                { text: 'Chat', link: '/api/chat' },
                { text: 'Conversations', link: '/api/conversations' },
                { text: 'Settings', link: '/api/settings' },
                { text: 'Tasks', link: '/api/tasks' },
                { text: 'Pipelines', link: '/api/pipelines' },
              ],
            },
          ],
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
          { text: 'API 参考', link: '/zh/api/' },
          { text: '模块', link: '/zh/modules/' },
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '介绍',
              items: [
                { text: '快速开始', link: '/zh/guide/getting-started' },
                { text: '系统架构', link: '/zh/guide/architecture' },
                { text: '配置说明', link: '/zh/guide/configuration' },
                { text: '部署指南', link: '/zh/guide/deployment' },
              ],
            },
            {
              text: 'V2 新功能',
              items: [
                { text: '对话工作台', link: '/zh/guide/chat' },
                { text: 'LangGraph 流水线', link: '/zh/guide/pipeline' },
                { text: 'MCP 集成', link: '/zh/guide/mcp' },
              ],
            },
            {
              text: 'Phase 4 新功能',
              items: [
                { text: '功能指南', link: '/zh/guide/features' },
              ],
            },
            {
              text: '质量保障',
              items: [
                { text: '测试指南', link: '/zh/guide/testing' },
              ],
            },
          ],
          '/zh/modules/': [
            {
              text: '功能模块',
              items: [
                { text: '概览', link: '/zh/modules/' },
                { text: '1. 关键词管理', link: '/zh/modules/keywords' },
                { text: '2. 文献检索', link: '/zh/modules/search' },
                { text: '3. 去重过滤', link: '/zh/modules/dedup' },
                { text: '4. 增量订阅', link: '/zh/modules/subscription' },
                { text: '5. PDF 爬取', link: '/zh/modules/crawler' },
                { text: '6. OCR 解析', link: '/zh/modules/ocr' },
                { text: '7. RAG 知识库', link: '/zh/modules/rag' },
                { text: '8. 写作辅助', link: '/zh/modules/writing' },
              ],
            },
          ],
          '/zh/api/': [
            {
              text: 'API 参考',
              items: [
                { text: '概览', link: '/zh/api/' },
                { text: 'Projects', link: '/zh/api/projects' },
                { text: 'Papers', link: '/zh/api/papers' },
                { text: 'Keywords', link: '/zh/api/keywords' },
                { text: 'Search', link: '/zh/api/search' },
                { text: 'Dedup', link: '/zh/api/dedup' },
                { text: 'OCR', link: '/zh/api/ocr' },
                { text: 'Crawler', link: '/zh/api/crawler' },
                { text: 'Subscription', link: '/zh/api/subscription' },
                { text: 'RAG', link: '/zh/api/rag' },
                { text: 'Writing', link: '/zh/api/writing' },
                { text: 'Chat', link: '/zh/api/chat' },
                { text: 'Conversations', link: '/zh/api/conversations' },
                { text: 'Settings', link: '/zh/api/settings' },
                { text: 'Tasks', link: '/zh/api/tasks' },
                { text: 'Pipelines', link: '/zh/api/pipelines' },
              ],
            },
          ],
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
