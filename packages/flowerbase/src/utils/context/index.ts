import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'vm'
import { EJSON } from 'bson'
import { StateManager } from '../../state'
import { generateContextData } from './helpers'
import { GenerateContextParams } from './interface'

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<Record<string, unknown>>

const transformImportsToRequire = (code: string): string => {
  let importIndex = 0
  const lines = code.split(/\r?\n/)

  return lines
    .map((line) => {
      const trimmed = line.trim()

      if (/^import\s+type\s+/.test(trimmed)) {
        return ''
      }

      const sideEffectMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]\s*;?$/)
      if (sideEffectMatch) {
        return `require('${sideEffectMatch[1]}')`
      }

      const match = trimmed.match(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?$/)
      if (!match) return line

      const [, importClause, source] = match
      const clause = importClause.trim()

      if (clause.startsWith('{') && clause.endsWith('}')) {
        const named = clause.slice(1, -1).trim()
        return `const { ${named} } = require('${source}')`
      }

      const namespaceMatch = clause.match(/^\*\s+as\s+(\w+)$/)
      if (namespaceMatch) {
        return `const ${namespaceMatch[1]} = require('${source}')`
      }

      if (clause.includes(',')) {
        const [defaultPart, restRaw] = clause.split(',', 2)
        const defaultName = defaultPart.trim()
        const rest = restRaw.trim()
        const tmpName = `__fb_import_${importIndex++}`
        const linesOut = [`const ${tmpName} = require('${source}')`]

        if (defaultName) {
          linesOut.push(`const ${defaultName} = ${tmpName}`)
        }

        if (rest.startsWith('{') && rest.endsWith('}')) {
          const named = rest.slice(1, -1).trim()
          linesOut.push(`const { ${named} } = ${tmpName}`)
        } else {
          const nsMatch = rest.match(/^\*\s+as\s+(\w+)$/)
          if (nsMatch) {
            linesOut.push(`const ${nsMatch[1]} = ${tmpName}`)
          }
        }

        return linesOut.join('\n')
      }

      return `const ${clause} = require('${source}')`
    })
    .join('\n')
}

const wrapEsmModule = (code: string): string => {
  const prelude = [
    'const __fb_module = { exports: {} };',
    'let exports = __fb_module.exports;',
    'let module = __fb_module;',
    'const __fb_require = globalThis.__fb_require;',
    'const require = __fb_require;',
    'const __filename = globalThis.__fb_filename;',
    'const __dirname = globalThis.__fb_dirname;'
  ].join('\n')

  const trailer = [
    'globalThis.__fb_module = __fb_module;',
    'globalThis.__fb_exports = exports;'
  ].join('\n')

  return `${prelude}\n${code}\n${trailer}`
}

const resolveImportTarget = (specifier: string, customRequire: NodeRequire): string => {
  try {
    const resolved = customRequire.resolve(specifier)
    if (resolved.startsWith('node:')) return resolved
    if (path.isAbsolute(resolved)) {
      return pathToFileURL(resolved).href
    }
    return resolved
  } catch {
    return specifier
  }
}

const shouldFallbackFromVmModules = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  return code === 'ERR_VM_MODULES_DISABLED' || code === 'ERR_VM_MODULES_NOT_SUPPORTED'
}

type ExportedFunction = (...args: unknown[]) => unknown
type SandboxModule = { exports: unknown }
type SandboxContext = vm.Context & {
  exports?: unknown
  module?: SandboxModule
  __fb_module?: SandboxModule
  __fb_exports?: unknown
  __fb_require?: NodeRequire
  __fb_filename?: string
  __fb_dirname?: string
}

const isExportedFunction = (value: unknown): value is ExportedFunction =>
  typeof value === 'function'

const getDefaultExport = (value: unknown): ExportedFunction | undefined => {
  if (!value || typeof value !== 'object') return undefined
  if (!('default' in value)) return undefined
  const maybeDefault = (value as { default?: unknown }).default
  return isExportedFunction(maybeDefault) ? maybeDefault : undefined
}

const resolveExport = (ctx: SandboxContext): ExportedFunction | undefined => {
  const moduleExports = ctx.module?.exports ?? ctx.__fb_module?.exports
  if (isExportedFunction(moduleExports)) return moduleExports
  const contextExports = ctx.exports ?? ctx.__fb_exports
  if (isExportedFunction(contextExports)) return contextExports
  return getDefaultExport(moduleExports) ?? getDefaultExport(contextExports)
}

const buildVmContext = (contextData: ReturnType<typeof generateContextData>) => {
  const sandboxModule: SandboxModule = { exports: {} }
  const entryFile = require.main?.filename ?? process.cwd()
  const customRequire = createRequire(entryFile)

  const vmContext: SandboxContext = vm.createContext({
    ...contextData,
    require: customRequire,
    exports: sandboxModule.exports,
    module: sandboxModule,
    __filename,
    __dirname,
    __fb_require: customRequire,
    __fb_filename: __filename,
    __fb_dirname: __dirname
  }) as SandboxContext

  return { sandboxModule, entryFile, customRequire, vmContext }
}

/**
 * > Used to generate the current context
 * @testable
 * @param args -> generic arguments
 * @param app -> the fastify instance
 * @param rules -> the rules object
 * @param user -> the current user
 * @param currentFunction -> the function's name that should be called
 * @param functionsList -> the list of all functions
 * @param services -> the list of all services
 */
export async function GenerateContext({
  args,
  app,
  rules,
  user,
  currentFunction,
  functionsList,
  services,
  functionName,
  runAsSystem,
  deserializeArgs = true,
  enqueue,
  request
}: GenerateContextParams): Promise<unknown> {
  if (!currentFunction) return

  const functionsQueue = StateManager.select("functionsQueue")

  const functionToRun = { run_as_system: runAsSystem, ...currentFunction }

  const run = async () => {

    const contextData = generateContextData({
      user,
      services,
      app,
      rules,
      currentFunction: functionToRun,
      functionName,
      functionsList,
      GenerateContext,
      GenerateContextSync,
      request
    })
    const { sandboxModule, entryFile, customRequire, vmContext } = buildVmContext(contextData)

    const vmModules = vm as typeof vm & {
      SourceTextModule?: typeof vm.SourceTextModule
      SyntheticModule?: typeof vm.SyntheticModule
    }
    const hasStaticImport = /\bimport\s+/.test(functionToRun.code)
    let usedVmModules = false

    if (hasStaticImport && vmModules.SourceTextModule && vmModules.SyntheticModule) {
      try {
        const moduleCache = new Map<string, vm.Module>()

        const loadModule = async (specifier: string): Promise<vm.Module> => {
          const importTarget = resolveImportTarget(specifier, customRequire)
          const cached = moduleCache.get(importTarget)
          if (cached) return cached

          const namespace = await dynamicImport(importTarget)
          const exportNames = Object.keys(namespace)
          if ('default' in namespace && !exportNames.includes('default')) {
            exportNames.push('default')
          }

          const syntheticModule = new vmModules.SyntheticModule(
            exportNames,
            function () {
              for (const name of exportNames) {
                this.setExport(name, namespace[name])
              }
            },
            { context: vmContext, identifier: importTarget }
          )

          moduleCache.set(importTarget, syntheticModule)
          return syntheticModule
        }

        const importModuleDynamically =
          ((specifier: string) => loadModule(specifier) as unknown as vm.Module) as unknown as
          vm.SourceTextModuleOptions['importModuleDynamically']

        const sourceModule = new vmModules.SourceTextModule(
          wrapEsmModule(functionToRun.code),
          {
            context: vmContext,
            identifier: entryFile,
            initializeImportMeta: (meta) => {
              meta.url = pathToFileURL(entryFile).href
            },
            importModuleDynamically
          }
        )

        await sourceModule.link(loadModule)
        await sourceModule.evaluate()
        usedVmModules = true
      } catch (error) {
        if (!shouldFallbackFromVmModules(error)) {
          throw error
        }
      }
    }

    if (!usedVmModules) {
      const codeToRun = functionToRun.code.includes('import ')
        ? transformImportsToRequire(functionToRun.code)
        : functionToRun.code
      vm.runInContext(codeToRun, vmContext)
    }

    sandboxModule.exports = resolveExport(vmContext) ?? sandboxModule.exports


    if (deserializeArgs) {
      return await (sandboxModule.exports as ExportedFunction)(
        ...EJSON.deserialize(args)
      )
    }

    return await (sandboxModule.exports as ExportedFunction)(...args)
  }

  const res = await functionsQueue.add(run, enqueue)
  return res

}

export function GenerateContextSync({
  args,
  app,
  rules,
  user,
  currentFunction,
  functionsList,
  services,
  functionName,
  runAsSystem,
  deserializeArgs = true,
  request
}: GenerateContextParams): unknown {
  if (!currentFunction) return

  const functionToRun = { run_as_system: runAsSystem, ...currentFunction }
  const contextData = generateContextData({
    user,
    services,
    app,
    rules,
    currentFunction: functionToRun,
    functionName,
    functionsList,
    GenerateContext,
    GenerateContextSync,
    request
  })
  const { sandboxModule, vmContext } = buildVmContext(contextData)
  const codeToRun = functionToRun.code.includes('import ')
    ? transformImportsToRequire(functionToRun.code)
    : functionToRun.code

  vm.runInContext(codeToRun, vmContext)
  sandboxModule.exports = resolveExport(vmContext) ?? sandboxModule.exports
  const fn = sandboxModule.exports as ExportedFunction
  if (deserializeArgs) {
    return fn(...EJSON.deserialize(args))
  }
  return fn(...args)
}
