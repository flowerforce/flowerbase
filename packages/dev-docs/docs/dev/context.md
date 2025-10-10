---
title: Context
sidebar_position: 9
---

# Context

This section documents the **execution context** used to run functions similarly to Realm.  
It provides a controlled runtime with bound utilities, services, and metadata, and supports calling other functions from within a function.

---

## 🌎 Overview

- **`GenerateContext`**: builds and executes a function in a VM context.
- **`generateContextData`**: composes the object injected into the VM (the “context”).
- Functions may **deserialize EJSON** args, and can **call other functions** using the same mechanism.

---

## 📍 Location

```
src/
└─ utils/
└── context/
└──── index.ts # exports GenerateContext
└──── helpers.ts # exports generateContextData
```

---

## ⚙️ API

### `GenerateContext(params: GenerateContextParams): Promise<any>`

Builds the context and executes the target function’s **code** inside a Node `vm` context.

**Key params**
- `args`: arguments for the function (EJSON-serializable).
- `app`: Fastify instance.
- `rules`: rules object provided by the host app.
- `user`: current user (may be `undefined`).
- `currentFunction`: `{ name, code, run_as_system? }`.
- `functionsList`: array of available functions.
- `services`: list of services (MongoDB Atlas, aws, api etc ).
- `runAsSystem`: boolean to force system execution for this call.
- `deserializeArgs` (default `true`): if `true`, uses `EJSON.deserialize(args)`.
- `enqueue`: queue options passed to the functions queue (implemented but not used).
- `request`: the current Fastify request (used in context).

**Behavior**
1. Reads a **functions queue** from `StateManager.select("functionsQueue")`.
2. Prepares `functionToRun` with `run_as_system` override.
3. Builds the **context object** via `generateContextData(...)`.
4. Creates a **custom `require`** rooted at the app entry file.
5. Executes `currentFunction.code` with `vm.runInContext(...)`, exposing:
   - `...contextData`, `require`, `exports`, `module`, `__filename`, `__dirname`.
6. Invokes the exported function: `await module.exports(...args)`  
   (args are EJSON-deserialized unless `deserializeArgs = false`).
7. Returns the result of the queue-wrapped execution: `functionsQueue.add(run, enqueue)`.

> Errors inside the VM are caught and logged.

---

### `generateContextData(params: GenerateContextDataParams)`

Returns the object injected into the VM. Shape:

```ts
{
  BSON: mongodb.BSON,
  console: { log: (...args) => console.log(...args) },
  context: {
    request: { ...request, remoteIPAddress: request?.ip },
    user,                              // current user
    environment: { tag: process.env.NODE_ENV },
    values: { get: (key) => process.env[key] },      // env access
    services: {
      get: (serviceName) => services[serviceName](app, {
        rules, user, run_as_system: currentFunction.run_as_system
      })
    },
    functions: {
      execute: (name, ...args) =>
        GenerateContext({ args, app, rules, user,
                          currentFunction: functionsList[name],
                          functionsList, services })
    }
  }
}
```

---

## ℹ️ Execution Model

 - *Isolation*: Uses `vm.createContext` to sandbox the function code.

 - *Module contract*: The function code must assign a callable to `module.exports`.

 - *Arguments*: By default, args are `EJSON` deserialized.