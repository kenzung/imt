const webpackMerge = require('webpack-merge');
const webpack = require('webpack');
const path = require('path');
// plugins
const CleanWebpackPlugin = require('clean-webpack-plugin');

const LodashPlugin = require('lodash-webpack-plugin');
// const WebappWebpackPlugin = require('webapp-webpack-plugin');
const RetryPlugin = require('webpack-retry-load-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const ReportStatusPlugin = require('./plugins/report-status-plugin');
const CrossOriginLoadingPlugin = require('./plugins/cross-origin-loading');
const MarkTimePlugin = require('./plugins/mark-time-plugin');

// config
const getBaseConfig = require('./common.config');
const { PROD, DEV } = require('../../const');

const configureCleanWebpack = ({ dist: root }) => {
  return {
    root,
    verbose: false,
    dry: false,
  };
};
// const configureWebapp = ({ cache, webappConfig }) => {
//   return { cache: path.resolve(cache, 'webapp-webpack-plugin'),
//   ...webappConfig };
// };

const configureTerser = ({ sourceMap, cache }) => {
  return {
    cache: path.resolve(cache, 'terser-webpack-plugin'),
    parallel: true,
    sourceMap,
    terserOptions: {
      compress: {
        // 删除所有的 `console` 语句
        drop_console: true,
      },
    },
  };
};

const configureOptimizeCSS = ({ sourceMap }) => {
  return {
    cssProcessorOptions: {
      map: sourceMap
        ? {
          inline: false,
          annotation: true,
        }
        : false,
      safe: true,
      discardComments: true,
    },
  };
};

module.exports = options => {
  const { sourceMap, publicPath, dist, dev } = options;
  const config = webpackMerge(getBaseConfig(options), {
    mode: dev ? DEV : PROD,
    devtool: sourceMap ? 'source-map' : 'none',
    output: {
      publicPath,
      path: dist,
      filename: '[name]_[chunkhash].js',
    },
    optimization: {
      minimizer: options.mini
        ? [new TerserPlugin(configureTerser(options)), new OptimizeCSSAssetsPlugin(configureOptimizeCSS(options))]
        : [],
    },
    plugins: [
      new ReportStatusPlugin({
        silent: options.silent,
      }),
      options.crossOrigin && new CrossOriginLoadingPlugin(),
      // html 最后插入js解析完成时间节点
      new MarkTimePlugin(),
      options.retry && new RetryPlugin(Object.assign(options.retry, { minimize: options.mini })),
      // 支持lodash包 按需引用
      new LodashPlugin(),
      new CleanWebpackPlugin('*', configureCleanWebpack(options)),
      new webpack.HashedModuleIdsPlugin({
        hashDigestLength: 6,
      }),
    ].filter(Boolean),
  });
  // if (options.webappConfig) {
  // config.plugins.push(
  //   new WebappWebpackPlugin(configureWebapp(options)),
  //   // 微信QQ分享图标支持
  //   new class {
  //     apply(compiler) {
  //       compiler.hooks.make.tapAsync('A', (compilation, callback) => {
  //         // 修复分析模式没有该hooks
  //         compilation.hooks.webappWebpackPluginBeforeEmit
  //           && compilation.hooks.webappWebpackPluginBeforeEmit.tapAsync('B',
  //           (result, _callback) => {
  //             const { html } = result;
  //             const reg = /<link rel="apple-touch-icon" sizes="152x152"
  //             href="([^"]*)">/; const url = html.match(reg)[1]; result.html =
  //             `<meta itemprop="image" content="${url}" />${result.html}`;
  //             return _callback(null, result);
  //           });
  //         return callback();
  //       });
  //     }
  //   }()
  // );
  // }
  return config;
};
