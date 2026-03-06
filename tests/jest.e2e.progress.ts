const now = () => new Date().toISOString()

const RESET_COLOR = "\u001b[1;0m"

beforeEach(() => {
  const currentTestName = expect.getState().currentTestName ?? 'unknown test'
  console.log(`[e2e][START][${now()}] ${currentTestName}`)
})

afterEach(() => {
  const state = expect.getState()
  const currentTestName = state.currentTestName ?? 'unknown test'
  const status =
    state.assertionCalls > 0 && !state.suppressedErrors?.length ? 'PASS?' : 'DONE'
  const color = status === "PASS?" ? "\u001b[1;32m" : "\u001b[1;31m"
  console.log(`${color}[e2e][END][${status}][${now()}]${RESET_COLOR} ${currentTestName}`)
})
