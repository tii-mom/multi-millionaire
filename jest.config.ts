export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts', '**/src/**/__tests__/**/*.spec.ts'],
  modulePathIgnorePatterns: ['<rootDir>/server'],
};
