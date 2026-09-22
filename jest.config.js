/** Jest config for the USPapo frontend (lib/theme unit tests).
 *  The jest-expo preset brings the React Native transform + mocks; our tests
 *  live in tests/ and import the libs through relative paths. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  // The screen suites render a full tree (glass panes, the backdrop, the
  // composer) and wait on `findBy*` queries. At the 5s default a single
  // loaded machine turns one of them into an intermittent failure — which is
  // worse than a slow suite, because it trains everyone to re-run the gate
  // instead of reading it.
  testTimeout: 30000,
};
