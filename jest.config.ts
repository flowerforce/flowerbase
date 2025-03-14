module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/packages/flower-db-services/tsconfig.json'
      }
    ]
  },
  collectCoverage: false,
  collectCoverageFrom: ['<rootDir>/packages/flower-db-services/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/packages/flower-db-services/**/*.test.ts']
}
