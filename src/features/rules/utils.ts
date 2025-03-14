import fs from 'fs'
import path from 'node:path'
import { readJsonContent } from '../../utils'
import { Rules, RulesConfig } from './interface'

export const loadRules = async (rootDir = process.cwd()): Promise<Rules> => {
  const rulesRoot = path.join(rootDir, 'data_sources', 'mongodb-atlas')
  const files = fs.readdirSync(rulesRoot, { recursive: true }) as string[]
  const rulesFiles = files.filter((x) => (x as string).endsWith('rules.json'))

  const rulesByCollection = rulesFiles.reduce((acc, rulesFile) => {
    const filePath = path.join(rulesRoot, rulesFile)
    const collectionRules = readJsonContent(filePath) as RulesConfig
    acc[collectionRules.collection] = collectionRules

    return acc
  }, {} as Rules)

  return rulesByCollection
}
