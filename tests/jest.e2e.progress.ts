const now = () => new Date().toISOString()

beforeEach(() => {
  const currentTestName = expect.getState().currentTestName ?? 'unknown test'
  console.log(`[e2e][START][${now()}] ${currentTestName}`)
})

afterEach(() => {
  const state = expect.getState()
  const currentTestName = state.currentTestName ?? 'unknown test'
  const status =
    state.assertionCalls > 0 && !state.suppressedErrors?.length ? 'PASS?' : 'DONE'
  console.log(`[e2e][END][${status}][${now()}] ${currentTestName}`)
})
