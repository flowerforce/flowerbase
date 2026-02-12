import path from 'path'
import { config as loadEnv } from 'dotenv'
import type { Config } from '@jest/types'

// Carica le variabili di ambiente da .env.e2e se esiste
loadEnv({
  path: path.resolve(__dirname, '../.env.e2e'),
  override: false
})

if (!process.env.FLOWERBASE_APP_PATH) {
  process.env.FLOWERBASE_APP_PATH = path.resolve(__dirname, 'e2e/app')
}

const config: Config.InitialOptions = {
  rootDir: path.resolve(__dirname, '../'),
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tests/tsconfig.json'
    }
  },
  setupFiles: ['<rootDir>/tests/jest.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.e2e.progress.ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  maxWorkers: 1,
  verbose: true
}

export default config
