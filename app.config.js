const { existsSync } = require('node:fs');

// FCM config for push (docs/fluxos.md): an EAS file variable in the cloud, or the file at the root
// locally. Without it the app builds and runs, but Android cannot get a push token.
const googleServices = process.env.GOOGLE_SERVICES_JSON || (existsSync('./google-services.json') ? './google-services.json' : undefined);

// The EAS Update channel a locally built binary listens to (EAS builds set it from eas.json).
module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, ...(googleServices ? { googleServicesFile: googleServices } : {}) },
  updates: { ...config.updates, requestHeaders: { 'expo-channel-name': process.env.EXPO_UPDATES_CHANNEL || 'production' } },
});
