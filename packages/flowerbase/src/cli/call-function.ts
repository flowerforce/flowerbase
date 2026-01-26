#!/usr/bin/env node
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { ObjectId } from 'bson'
import { Function } from '../features/functions/interface'
import { StateManager } from '../state'
import { GenerateContext } from '../utils/context'

type CliOptions = {
  appId?: string
  name: string
  basePath?: string
  mongodbUrl?: string
  jwtSecret?: string
  port?: number
  host?: string
}

const HELP_TEXT = `
Usage:
  flowerbase-function --app-id <id> --name <function> [options]

Options:
  --base-path <path>      Project base path (default: cwd)
  --mongodb-url <url>     MongoDB connection string
  --jwt-secret <secret>   JWT secret
  --app-id <id>           App ID (optional)
  --name <name>           Function name (required)
  --args <json>           JSON arguments (array or single value)
  --args-file <path>      JSON arguments file
  --stdin                 Read JSON arguments from stdin
  --user <json>           User payload JSON
  --user-file <path>      User payload JSON file
  --user-id <id>          User id shortcut
  --user-email <email>    User email shortcut
  --user-role <role>      User role shortcut
  --port <number>         Server port
  --host <string>         Server host
  --help                  Show help

Env:
  MONGODB_URL, JWT_SECRET
`

const readStdin = async () =>
  await new Promise<string>((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })

const getArgValue = (argv: string[], name: string) => {
  const index = argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`))
  if (index === -1) return undefined
  const direct = argv[index]
  if (direct.includes('=')) {
    return direct.split('=').slice(1).join('=')
  }
  return argv[index + 1]
}

const hasFlag = (argv: string[], name: string) => argv.includes(name)

const parseArgs = (argv: string[]): CliOptions | null => {
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    console.log(HELP_TEXT.trim())
    return null
  }

  const appId = getArgValue(argv, '--app-id')
  const name = getArgValue(argv, '--name') || ''
  const basePath = getArgValue(argv, '--base-path')
  const mongodbUrl =
    getArgValue(argv, '--mongodb-url') || process.env.MONGODB_URL
  const jwtSecret = getArgValue(argv, '--jwt-secret') || process.env.JWT_SECRET
  const portValue = getArgValue(argv, '--port')
  const host = getArgValue(argv, '--host')
  const port = portValue ? Number(portValue) : undefined

  return {
    appId,
    name,
    basePath,
    mongodbUrl,
    jwtSecret,
    port,
    host,
  }
}

const parseJsonValue = (value: string, sourceLabel: string) => {
  try {
    return JSON.parse(value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON from ${sourceLabel}: ${message}`)
  }
}

const loadArgs = async (argv: string[]) => {
  const argsValue = getArgValue(argv, '--args')
  const argsFile = getArgValue(argv, '--args-file')
  const useStdin = hasFlag(argv, '--stdin')
  const shouldReadStdin = useStdin || (!process.stdin.isTTY && !argsValue && !argsFile)

  if (argsValue) {
    return parseJsonValue(argsValue, '--args')
  }

  if (argsFile) {
    const resolved = path.resolve(process.cwd(), argsFile)
    const contents = fs.readFileSync(resolved, 'utf8')
    return parseJsonValue(contents, '--args-file')
  }

  if (shouldReadStdin) {
    const stdinValue = await readStdin()
    if (!stdinValue.trim()) return undefined
    return parseJsonValue(stdinValue, 'stdin')
  }

  return undefined
}

const normalizeArguments = (value: unknown) => {
  if (value === undefined) return []
  if (Array.isArray(value)) return value
  return [value]
}

const loadUser = async (argv: string[]) => {
  const userValue = getArgValue(argv, '--user')
  const userFile = getArgValue(argv, '--user-file')
  const userId = getArgValue(argv, '--user-id')
  const userEmail = getArgValue(argv, '--user-email')
  const userRole = getArgValue(argv, '--user-role')

  let user: Record<string, unknown> | undefined

  if (userValue) {
    user = parseJsonValue(userValue, '--user') as Record<string, unknown>
  } else if (userFile) {
    const resolved = path.resolve(process.cwd(), userFile)
    const contents = fs.readFileSync(resolved, 'utf8')
    user = parseJsonValue(contents, '--user-file') as Record<string, unknown>
  } else if (userId || userEmail || userRole) {
    user = {
      ...(userId ? { id: userId } : {}),
      ...(userEmail ? { email: userEmail } : {}),
      ...(userRole ? { role: userRole } : {})
    }
  }

  if (!user) return undefined

  if (!('typ' in user)) {
    user.typ = 'access'
  }

  if (!('_id' in user) && typeof user.id === 'string') {
    try {
      user._id = new ObjectId(user.id)
    } catch {
      // Keep the user id as-is when it is not a valid ObjectId.
    }
  }

  return user
}

const executeLocal = async ({
  basePath,
  projectId,
  port,
  host,
  mongodbUrl,
  jwtSecret,
  name,
  args,
  user
}: {
  basePath: string
  projectId: string
  port?: number
  host?: string
  mongodbUrl: string
  jwtSecret: string
  name: string
  args: unknown[]
  user?: Record<string, unknown>
}) => {
  process.env.FLOWERBASE_APP_PATH = basePath
  const { initialize } = await import('../index')
  await initialize({
    projectId,
    port,
    mongodbUrl,
    jwtSecret,
    host,
    basePath
  })

  const app = StateManager.select('app')
  const functionsList = StateManager.select('functions')
  const rulesList = StateManager.select('rules')
  const services = StateManager.select('services')

  try {
    const currentFunction = functionsList[name]
    if (!currentFunction) {
      throw new Error(`Function "${name}" does not exist`)
    }

    return await GenerateContext({
      args,
      app,
      rules: rulesList,
      user,
      currentFunction: currentFunction as Function,
      functionsList,
      services,
      runAsSystem: true,
      request: {
        ip: 'cli',
        method: 'CLI',
        url: 'cli://local',
        host: 'cli',
        id: 'cli',
        hostname: 'cli'
      }
    })
  } finally {
    await app.close()
  }
}

const main = async () => {
  const argv = process.argv.slice(2)
  const options = parseArgs(argv)
  if (!options) return

  if (!options.name) {
    console.error('Missing required --name')
    console.log(HELP_TEXT.trim())
    process.exit(1)
  }

  const basePath = options.basePath ? path.resolve(options.basePath) : process.cwd()
  if (!options.mongodbUrl) {
    throw new Error('Missing --mongodb-url (or MONGODB_URL)')
  }
  if (!options.jwtSecret) {
    throw new Error('Missing --jwt-secret (or JWT_SECRET)')
  }
  const argsInput = await loadArgs(argv)
  const args = normalizeArguments(argsInput)
  const user = await loadUser(argv)
  const projectId = options.appId || path.basename(basePath)
  const result = await executeLocal({
    basePath,
    projectId,
    port: options.port,
    host: options.host,
    mongodbUrl: options.mongodbUrl,
    jwtSecret: options.jwtSecret,
    name: options.name,
    args,
    user
  })
  if (typeof result === 'string') {
    console.log(result)
  } else {
    console.log(JSON.stringify(result))
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
