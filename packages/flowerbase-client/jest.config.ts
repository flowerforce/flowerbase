module.exports = {
  preset: '../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ]
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts']
}
