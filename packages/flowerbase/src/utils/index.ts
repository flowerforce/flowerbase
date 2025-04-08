import fs from 'fs'

export const readFileContent = (filePath: string) => fs.readFileSync(filePath, 'utf-8')
export const readJsonContent = (filePath: string) =>
  JSON.parse(readFileContent(filePath)) as unknown
