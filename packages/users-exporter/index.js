/* eslint-disable no-undef */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import bodyParser from 'body-parser'
import express from 'express'
import { loadUsers } from './utils.js'

const app = express()
const PORT = 4000
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const scrypt = promisify(crypto.scrypt)

export const hashPassword = async (plaintext) => {
  const salt = crypto.randomBytes(128).toString('hex')
  const buffer = await scrypt(plaintext, salt, 64)
  return `${buffer.toString('hex')}.${salt}`
}

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: true }))

app.post('/submit', async (req, res) => {
  const { appId, groupId, cookie, traceId, password, projectName } = req.body
  const users = await loadUsers({ appId, groupId, cookie, traceId, password })
  console.log('🚀 ~ app.post ~ users:', users.length)
  if (users) {
    const hashedPassword = await hashPassword(password)
    const mappedUsers = users.map(({ identities, data, _id }, i) => {
      console.log(i)
      return {
        _id: {
          $oid: _id
        },
        email: data.email,
        password: hashedPassword,
        status: 'confirmed',
        identities
      }
    })

    const safeProjectName = (projectName || 'project').replace(/[^a-zA-Z0-9-_]/g, '-')
    const outputDir = path.join(__dirname, 'exports')
    const outputFile = path.join(outputDir, `${safeProjectName}-users.json`)

    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(outputFile, JSON.stringify(mappedUsers, null, 2), 'utf8')

    return res.send(JSON.stringify(mappedUsers))
  }

  res.status(404)
  res.send()
})

app.get('/', (req, res) => {
  res.render('index')
})

app.get('/guide', (req, res) => {
  res.render('guide')
})

app.listen(PORT, () => {})
