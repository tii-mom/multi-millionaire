export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts'],
  modulePathIgnorePatterns: ['<rootDir>/server'],
};
