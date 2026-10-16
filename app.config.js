const { existsSync } = require('node:fs');
const { withEntitlementsPlist } = require('expo/config-plugins');

// FCM config for push (docs/fluxos.md): an EAS file variable in the cloud, or the file at the root
// locally. Without it the app builds and runs, but Android cannot get a push token.
const googleServices = process.env.GOOGLE_SERVICES_JSON || (existsSync('./google-services.json') ? './google-services.json' : undefined);

// An iPhone build signed by a free Apple ID (Xcode's "Personal Team") cannot carry the push
// entitlement: IOS_SEM_PUSH=1 drops it, and the app runs without "answer ready" pushes.
const semPush = (config) => withEntitlementsPlist(config, (c) => {
  delete c.modResults['aps-environment'];
  return c;
});

// The EAS Update channel a locally built binary listens to (EAS builds set it from eas.json).
module.exports = ({ config }) => {
  const final = {
    ...config,
    android: { ...config.android, ...(googleServices ? { googleServicesFile: googleServices } : {}) },
    updates: { ...config.updates, requestHeaders: { 'expo-channel-name': process.env.EXPO_UPDATES_CHANNEL || 'production' } },
  };
  return process.env.IOS_SEM_PUSH ? semPush(final) : final;
};
