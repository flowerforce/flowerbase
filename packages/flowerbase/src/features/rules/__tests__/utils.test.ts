import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadRules } from '../utils'

describe('collection rule loading', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'flowerbase-rules-security-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  const addRule = async (database: string, collection: string) => {
    const folder = path.join(
      directory,
      'data_sources/mongodb-atlas',
      database,
      collection
    )
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(folder, 'rules.json'),
      JSON.stringify({ database, collection, filters: [], roles: [] })
    )
  }
  it('rejects duplicate collection names across databases instead of overwriting permissions', async () => {
    await addRule('public-db', 'memberships')
    await addRule('private-db', 'memberships')
    await expect(loadRules(directory)).rejects.toThrow(
      'Duplicate rules for collection "memberships"'
    )
  })
  it('loads distinct collection rules with their database names', async () => {
    await addRule('public-db', 'publicDocs')
    await addRule('private-db', 'privateDocs')
    const rules = await loadRules(directory)
    expect(rules.publicDocs.database).toBe('public-db')
    expect(rules.privateDocs.database).toBe('private-db')
  })
  it('does not interpret collection names as object prototype properties', async () => {
    await addRule('db', '__proto__')
    const rules = await loadRules(directory)
    expect(Object.getPrototypeOf(rules)).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(rules, '__proto__')).toBe(true)
    expect(rules.__proto__.database).toBe('db')
  })
})
