/** Jest config for the USPapo frontend (lib/theme unit tests).
 *  The jest-expo preset brings the React Native transform + mocks; our tests
 *  live in tests/ and import the libs through relative paths. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
};
