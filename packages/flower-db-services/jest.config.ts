module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.json'
      }
    ]
  },
  collectCoverage: false,
  collectCoverageFrom: ['./**/*.ts'],
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
  testMatch: ['./**/*.test.ts']
}
