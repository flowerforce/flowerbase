import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)

/**
 * > Creates the hash for a string
 * @param plaintext -> the string that should be encrypted
 * @tested
 */
export const hashPassword = async (plaintext: string) => {
  const salt = crypto.randomBytes(128).toString('hex')
  const buffer = (await scrypt(plaintext, salt, 64)) as Buffer
  return `${buffer.toString('hex')}.${salt}`
}

/**
 * > Compares two strings
 * @param plaintext -> the first string
 * @param storedPassword -> the second string
 * @tested
 */
export const comparePassword = async (plaintext: string, storedPassword: string) => {
  const [storedHash, storedSalt] = storedPassword.split('.')

  if (!storedHash || !storedSalt) {
    throw new Error('Invalid credentials');
  }

  const storedBuffer = Buffer.from(storedHash, 'hex')
  const buffer = (await scrypt(plaintext, storedSalt, 64)) as Buffer
  return crypto.timingSafeEqual(buffer, storedBuffer)
}

/**
 * > Generate a random token
 * @param length -> the token length
 */
export const generateToken = (length = 64) => {
  return crypto.randomBytes(length).toString('hex')
}

export const hashToken = (token: string) => {
  return crypto.createHash('sha256').update(token).digest('hex')
}
