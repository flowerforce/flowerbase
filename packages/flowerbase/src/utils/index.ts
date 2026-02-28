import fs from 'node:fs'
import path from 'node:path'

export const readFileContent = (filePath: string) => fs.readFileSync(filePath, 'utf-8')
export const readJsonContent = (filePath: string) =>
  JSON.parse(readFileContent(filePath)) as unknown

export const recursivelyCollectFiles = (dir: string): string[] => {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return recursivelyCollectFiles(fullPath)
    }
    return entry.isFile() ? [fullPath] : []
  })
}
