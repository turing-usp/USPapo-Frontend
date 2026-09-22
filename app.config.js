// The EAS Update channel a locally built binary listens to (EAS builds set it from eas.json).
module.exports = ({ config }) => ({
  ...config,
  updates: { ...config.updates, requestHeaders: { 'expo-channel-name': process.env.EXPO_UPDATES_CHANNEL || 'production' } },
});
