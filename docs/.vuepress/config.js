module.exports = {
  base: '/imt/',
  host: '127.0.0.1',
  locales: {
    '/': {
      lang: 'zh-CN',
      title: 'IMT',
      description: '集成 webpack + react 的最佳实践配置的构建工具',
    },
  },
  themeConfig: {
    locales: {
      '/': {
        lastUpdated: '上次更新',
        nav: require('./nav/zh'),
      },
    },
  },
  plugins: [['@vuepress/back-to-top', true], ['@vuepress/pwa', { serviceWorker: true, updatePopup: true }]],
};
