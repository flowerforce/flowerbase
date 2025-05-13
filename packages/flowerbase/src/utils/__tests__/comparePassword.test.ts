import crypto from 'crypto'
import { promisify } from 'node:util'
import { comparePassword } from '../crypto'

const scrypt = promisify(crypto.scrypt)

describe('comparePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('should return true for matching passwords', async () => {
    const plaintext = 'mySecretPassword'
    const salt = crypto.randomBytes(16).toString('hex')
    const hashBuffer = (await scrypt(plaintext, salt, 64)) as Buffer
    const storedPassword = `${hashBuffer.toString('hex')}.${salt}`
    const result = await comparePassword(plaintext, storedPassword)
    expect(result).toBe(true)
  })

  it('should return false for non-matching passwords', async () => {
    const plaintext = 'mySecretPassword'
    const wrongPassword = 'wrongPassword'

    const salt = crypto.randomBytes(16).toString('hex')
    const hashBuffer = (await scrypt(plaintext, salt, 64)) as Buffer
    const storedPassword = `${hashBuffer.toString('hex')}.${salt}`

    const result = await comparePassword(wrongPassword, storedPassword)
    expect(result).toBe(false)
  })

  it('should throw an error if storedPassword format is incorrect', async () => {
    await expect(comparePassword('anyPassword', 'invalidFormat')).rejects.toThrow()
  })
})
