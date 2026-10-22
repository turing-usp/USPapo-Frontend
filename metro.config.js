const { getDefaultConfig } = require('expo/metro-config');
const { withApiProxy } = require('./scripts/dev-proxy.cjs');

const config = getDefaultConfig(__dirname);
const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => withApiProxy(
  enhance ? enhance(middleware, server) : middleware,
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000',
);

module.exports = config;
