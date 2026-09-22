// The runtime version is a hash of the native project. npm scripts and .gitignore do not change the
// binary, so editing them must not strand installed apps without OTA updates.
/** @type {import('expo/fingerprint').Config} */
module.exports = { sourceSkips: ['PackageJsonScriptsAll', 'GitIgnore'] };
