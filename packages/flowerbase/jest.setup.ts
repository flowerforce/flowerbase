import { Blob as NodeBlob } from 'buffer'
import path from 'node:path'

if (!process.env.FLOWERBASE_APP_PATH) {
  process.env.FLOWERBASE_APP_PATH = path.resolve(__dirname, '../../tests/e2e/app')
}

const BaseBlob = typeof globalThis.Blob !== 'undefined' ? globalThis.Blob : NodeBlob

type PolyfillFilePropertyBag = FilePropertyBag & {
  name?: string
}

class FilePolyfill extends BaseBlob {
  lastModified: number
  name: string

  constructor(bits?: Iterable<BlobPart>, options?: FilePropertyBag) {
    super(bits, options as FilePropertyBag)
    const fileOptions = options as PolyfillFilePropertyBag
    this.name = fileOptions?.name ?? ''
    this.lastModified = fileOptions?.lastModified ?? Date.now()
  }
}

if (typeof globalThis.File === 'undefined') {
  globalThis.File = FilePolyfill as unknown as typeof File
}
