import fs from 'fs'
import { readFileContent, readJsonContent } from '..'

jest.mock('fs')

describe('File Reading Functions', () => {
  const mockFilePath = '/mock/path/file.txt'
  const mockJsonPath = '/mock/path/data.json'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should read file content correctly', () => {
    const mockContent = 'Hello, world!'
    ;(fs.readFileSync as jest.Mock).mockReturnValue(mockContent)
    const result = readFileContent(mockFilePath)
    expect(fs.readFileSync).toHaveBeenCalledWith(mockFilePath, 'utf-8')
    expect(result).toBe(mockContent)
  })

  it('should read JSON content correctly', () => {
    const mockJsonContent = '{"name": "Alice", "age": 30}'
    ;(fs.readFileSync as jest.Mock).mockReturnValue(mockJsonContent)
    const result = readJsonContent(mockJsonPath)
    expect(fs.readFileSync).toHaveBeenCalledWith(mockJsonPath, 'utf-8')
    expect(result).toEqual(JSON.parse(mockJsonContent))
  })

  it('should throw an error when JSON is invalid', () => {
    const invalidJson = '{name: Alice, age: 30}'
    ;(fs.readFileSync as jest.Mock).mockReturnValue(invalidJson)
    expect(() => readJsonContent(mockJsonPath)).toThrow(SyntaxError)
  })
})
