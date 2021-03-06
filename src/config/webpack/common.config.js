const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const SriPlugin = require('webpack-subresource-integrity');
// const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const webpack = require('webpack');
const fs = require('fs-extra');
const BuildTime = require('./plugins/build-time');
const { DEV, PROD, SSR } = require('../../const');

const { resolve } = require;
const { env } = process;

const PAGES_DIR = './src/pages';

function configureCssLoader({ projectDir, cache, sourceMap, publicPath, type, cssSourceMap = false, ssr }) {
  const loaders = [
    {
      loader: resolve('cache-loader'),
      options: { cacheDirectory: path.join(cache, 'cache-loader-css') },
    },
    {
      loader: resolve('css-loader'),
      options: {
        importLoaders: 2,
        sourceMap,
      },
    },
    {
      loader: resolve('postcss-loader'),
      options: {
        sourceMap,
        plugins: [
          require('postcss-preset-env')({
            autoprefixer: {
              flexbox: 'no-2009',
            },
            stage: 3,
            features: {
              // --primary: var(--customPrimary, var(--green)); 语法处理存在bug
              'custom-properties': false,
            },
            browsers: ['last 5 versions', '> 5%', 'ie >= 9'],
          }),
          require('postcss-custom-properties'),
          // stone-ui 中有用到
          require('postcss-color-function'),
        ].filter(Boolean),
      },
    },
    {
      loader: resolve('sass-loader'),
      options: {
        implementation: require('sass'),
        includePaths: [
          // 支持绝对路径查找
          path.resolve(projectDir, 'src'),
        ],
        sourceMap,
      },
    },
  ];
  const needExtraCss = ssr || type === PROD;

  if (!needExtraCss && type === DEV) {
    loaders.unshift({
      loader: resolve('style-loader'),
      options: {
        // https://github.com/webpack-contrib/style-loader/issues/107
        singleton: !cssSourceMap,
        sourceMap,
      },
    });
  } else {
    loaders.unshift({
      loader: MiniCssExtractPlugin.loader,
      options: {
        publicPath,
        sourceMap,
      },
    });
  }
  return {
    test: /\.(scss|css)$/,
    use: loaders,
  };
}
// Configure Manifest
const configureManifest = (fileName, { dist }) => {
  return {
    fileName,
    basePath: dist,
    map: file => {
      file.name = file.name.replace(/(\.[a-f0-9]{32})(\..*)$/, '$2');
      return file;
    },
  };
};
const getPages = options => {
  const { projectDir, ignorePages = [] } = options;
  const pagesDir = path.join(projectDir, PAGES_DIR);
  return fs.readdirSync(pagesDir).filter(item => {
    if (ignorePages.includes(item)) {
      return false;
    }
    let filepath = path.join(pagesDir, item, 'index.js');

    if (!fs.existsSync(filepath)) {
      filepath = `${filepath}x`; // jsx
    }
    if (!fs.existsSync(filepath)) {
      return false;
    }
    return true;
  });
};
const configureEntries = options => {
  const { mode = [], type } = options;

  const entry = {};
  if (type === SSR) {
    // 服务器渲染没有其它入口文件
    return {};
  }
  // 处理公共entry
  const initEntry = Object.keys(options.entry || {}).reduce((result, key) => {
    const temp = options.entry[key];
    if (Array.isArray(temp)) {
      result = result.concat(temp);
    } else {
      result.push(temp);
    }
    return result;
  }, []);

  if (mode === 'single') {
    entry.index = [...initEntry, './src/index'];
  } else {
    getPages(options).forEach(file => {
      const name = path.basename(file);
      entry[name] = [...initEntry, `${PAGES_DIR}/${file}/index`];
    });
  }
  return entry;
};
const configureBabelLoader = options => {
  const { projectDir, type, babel = {} } = options;
  const isSSR = type === SSR;
  const isDev = type === DEV;
  return {
    test: /\.jsx?$/,
    use: [
      {
        loader: resolve('babel-loader'),
        options: {
          babelrc: false,
          // cacheCompression:false,
          // cacheDirectory 缓存babel编译结果加快重新编译速度
          cacheDirectory: path.resolve(options.cache, 'babel-loader'),
          presets: [[require('babel-preset-imt'), { isSSR }]],
          plugins: [isDev && require('react-hot-loader/babel')].filter(Boolean),
        },
      },
    ],
    include: [
      // 自定义babel处理内容
      ...(babel.include || []),
      // 热重载插件需要被编译
      /webpackHotDevClient|strip-ansi|formatWebpackMessages|chalk|ansi-styles/,
      path.resolve(projectDir, 'src'),
      path.resolve(projectDir, 'node_modules/@tencent'),
    ].filter(Boolean),
    // 忽略哪些压缩的文件
    exclude: [/(.|_)min\.js$/],
  };
};
const configureHtmlLoader = ({ mini, projectDir, type }) => {
  return {
    test: /\.(html|njk|nunjucks)$/,
    use: [
      // {
      //   loader: resolve('cache-loader'),
      //   options: { cacheDirectory: path.join(cache, 'cache-loader-html') },
      // },
      {
        loader: resolve('html-loader'),
        options: {
          removeComments: false,
          minimize: mini && type === PROD,
        },
      },
      // 自动处理html中的相对路径引用 css/js文件
      {
        loader: resolve('html-inline-assets-loader'),
        options: {
          minimize: mini && type === PROD,
        },
      },
      {
        loader: resolve('imt-nunjucks-loader'),
        options: {
          // Other super important. This will be the base
          // directory in which webpack is going to find
          // the layout and any other file index.njk is calling.
          searchPaths: ['./src', './src/pages', './src/assets'].map(i => path.join(projectDir, i)),
        },
      },
    ],
  };
};
const configOptimization = () => {
  const config = {
    // Automatically split vendor and commons
    // https://medium.com/webpack/webpack-4-code-splitting-chunk-graph-and-the-splitchunks-optimization-be739a861366
    splitChunks: {
      chunks: 'all',
      minSize: 30000, // 提高缓存利用率，这需要在http2/spdy
      maxSize: 0,
      minChunks: 3,
      maxAsyncRequests: 5,
      maxInitialRequests: 5,
      automaticNameDelimiter: '~',
      name: true,
      cacheGroups: {
        vendor: {
          test: module => {
            if (module.resource) {
              const include = [/[\\/]node_modules[\\/]/].every(reg => {
                return reg.test(module.resource);
              });
              const exclude = [/[\\/]node_modules[\\/](react|redux|antd)/].some(reg => {
                return reg.test(module.resource);
              });
              return include && !exclude;
            }
            return false;
          },
          name: 'vendor',
          priority: 50,
          minChunks: 2,
          reuseExistingChunk: true,
        },
        react: {
          test({ resource }) {
            return /[\\/]node_modules[\\/](react|redux)/.test(resource);
          },
          name: 'react',
          priority: 20,
          minChunks: 1,
          reuseExistingChunk: true,
        },
        antd: {
          test: /[\\/]node_modules[\\/]antd/,
          name: 'antd',
          priority: 15,
          minChunks: 1,
          reuseExistingChunk: true,
        },
      },
    },
    // Keep the runtime chunk seperated to enable long term caching
    runtimeChunk: 'single',
  };
  return config;
};
module.exports = options => {
  const { projectDir, mode, type, ssr, imtPath } = options;
  const isSSR = type === SSR;
  const needExtraCss = ssr || type === PROD;
  const config = {
    entry: configureEntries(options),
    output: {
      crossOriginLoading: 'anonymous',
    },
    resolve: {
      // 加快搜索速度
      modules: [
        path.resolve(projectDir, 'src'),
        path.resolve(projectDir, 'node_modules'),
        path.resolve(imtPath, 'node_modules'),
      ],
      // es tree-shaking
      mainFields: ['jsnext:main', 'browser', 'main'],
      // 加快编译速度
      alias: {},
      extensions: ['.jsx', '.js'],
    },
    module: {
      // 这些库都是不依赖其它库的库 不需要解析他们可以加快编译速度
      noParse: /node_modules\/(moment|chart\.js)/,
      rules: [
        configureBabelLoader(options),
        !isSSR && configureCssLoader(options),
        !isSSR && configureHtmlLoader(options),
        {
          // svg 直接inline
          test: /\.svg$/,
          use: {
            loader: resolve('svg-inline-loader'),
            options: {
              classPrefix: true,
            },
          },
          include: [path.resolve(projectDir, 'src')],
        },
        {
          // 项目外svg 直接拷贝过来
          test: /.svg$/,
          use: {
            loader: resolve('file-loader'),
            options: {
              name: '[name]_[hash].[ext]',
            },
          },
          exclude: [path.resolve(projectDir, 'src')],
        },
        // 部分文件只需要使用路径
        {
          test: /\.(path\.json)$/,
          use: {
            loader: resolve('file-loader'),
            options: { name: '[name]_[hash].[ext]' },
          },
          type: 'javascript/auto',
        },
        {
          // 其它文件直接拷贝
          test: /\.(gif|png|jpe?g|eot|woff|ttf|ogg|mp3|pdf)$/,
          use: {
            loader: resolve('file-loader'),
            options: { name: '[name]_[hash].[ext]' },
          },
        },
      ].filter(Boolean),
    },
    optimization: configOptimization(options),
    plugins: [
      // 只有命令行中才显示进度，CI系统日志不需要
      process.stderr.isTTY && new webpack.ProgressPlugin(),
      // new ProgressBarPlugin(),
      new BuildTime(),
      new ManifestPlugin(configureManifest('manifest-legacy.json', options)),
      needExtraCss
        && new MiniCssExtractPlugin({
          filename: '[name]_[contenthash].css',
        }),
    ].filter(Boolean),
  };

  // 服务器渲染 js 不需要构建 html
  if (!isSSR) {
    if (mode === 'single') {
      config.plugins.push(
        new HtmlWebpackPlugin({
          // https://github.com/jantimon/html-webpack-plugin/issues/870
          // html-webpack-plugin@next or chunksSortMode: 'none',
          minify: false,
          filename: 'index.html',
          template: './src/index.html',
        })
      );
    }
    if (mode === 'multi') {
      const files = getPages(options);
      // const names = files.map(i => path.basename(i));
      files.forEach(file => {
        const name = path.basename(file);
        file = `${PAGES_DIR}/${file}/index.html`;
        const chunks = [`runtime~${name}`, name];
        config.plugins.push(
          new HtmlWebpackPlugin({
            minify: false,
            filename: `${name}.html`,
            template: file,
            chunks,
          })
        );
      });
    }
    if (options.sri) {
      config.plugins.push(
        // 支持js资源完整性校验
        // https://www.w3.org/TR/SRI/
        new SriPlugin({
          hashFuncNames: ['sha256'],
          enabled: env.NODE_ENV === PROD,
        })
      );
    }
  }

  return config;
};
