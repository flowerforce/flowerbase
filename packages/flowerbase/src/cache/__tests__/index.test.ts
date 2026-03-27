import {
  buildCacheKey,
  buildCollectionCacheTag,
  createCacheProvider
} from '..'

describe('cache provider', () => {
  it('stores and invalidates memory entries by tag', async () => {
    const cache = await createCacheProvider({ provider: 'memory' })
    const tag = buildCollectionCacheTag('main', 'todos')
    const key = buildCacheKey({ operation: 'findOne', id: 'todo-1' })

    await cache.set(key, { _id: 'todo-1', done: false }, { tags: [tag] })

    expect(await cache.get(key)).toEqual({ _id: 'todo-1', done: false })

    await cache.invalidateTags([tag])

    expect(await cache.get(key)).toBeUndefined()
  })

  it('evicts the least recently used entry when maxEntries is reached', async () => {
    const cache = await createCacheProvider({ provider: 'memory', maxEntries: 2 })
    const firstKey = buildCacheKey({ id: 'first' })
    const secondKey = buildCacheKey({ id: 'second' })
    const thirdKey = buildCacheKey({ id: 'third' })

    await cache.set(firstKey, { id: 'first' })
    await cache.set(secondKey, { id: 'second' })

    expect(await cache.get(firstKey)).toEqual({ id: 'first' })

    await cache.set(thirdKey, { id: 'third' })

    expect(await cache.get(firstKey)).toEqual({ id: 'first' })
    expect(await cache.get(secondKey)).toBeUndefined()
    expect(await cache.get(thirdKey)).toEqual({ id: 'third' })
  })
})
