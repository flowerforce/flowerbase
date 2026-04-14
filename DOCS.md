# Flowerbase

**Flowerbase** is a server-side package designed to replicate the serverless features provided by MongoDB Atlas via Realm. Its primary goal is to allow seamless backend development through app-facing SDKs, enabling developers to build powerful, serverless applications with ease.

## Core Features

This package aims to reproduce the core server-side functionalities available in MongoDB Realm, including:

* **Rules**
* **Functions**
* **Triggers**
* **HTTP Endpoints**

> Below is an overview of each feature and its purpose.

---

### 🔐 Rules

Rules are defined via JSON files and are used to enforce fine-grained access control over your database operations. These rules determine what CRUD (Create, Read, Update, Delete) operations can be performed on specific documents—or even parts of documents—based on various conditions.


This allows you to:

* Restrict or allow actions based on user roles or attributes
* Define permissions at the field or sub-document level
* Enforce read/write access policies for maximum security

>Example – rules.json
```json
{
    "database": "my-db",
    "collection": "example",
    "roles": [
        {
            "name": "readAll",
            "apply_when": {},
            "document_filters": {
                "read": true,
                "write": true
            },
            "insert": true,
            "delete": true,
            "search": true,
            "read": true,
            "write": true
        }
    ]
}

```

---

### ⚙️ Functions

Functions are JavaScript files executed in an isolated runtime environment. They are defined and configured in a central JSON file, where each function is listed and linked to its corresponding JS implementation.

These functions can be:

* Invoked directly from the frontend
* Used internally by triggers and HTTP endpoints
* Composed to create modular and reusable server-side logic


>Example – config.json
```json
[
  {
    "name": "sendWelcomeEmail",
    "private": false,
    "run_as_system": false
  }
]

```

>Example – functions/sendWelcomeEmail.js
```js
exports = function(user) {
  const email = user.email;
  const subject = "Welcome to Flowerbase!";
  const body = `Hello ${user.name}, thanks for signing up!`;
  
  // Hypothetical email service
  context.services.get("mailService").send(email, subject, body);
};

```

---

### 🧰 CLI: Invoke Functions Locally

Flowerbase ships a CLI to execute functions locally without HTTP calls. It uses the same `initialize(...)` pipeline as the server, so it loads rules/functions/services from your app folder.

>Example – run a function (system mode by default)
```sh
flowerbase-function \
  --name sendWelcomeEmail \
  --mongodb-url "mongodb://localhost:27017" \
  --jwt-secret "dev-secret" \
  --args '{"email":"demo@example.com","name":"Demo"}'
```

>Example – run a function as a user (no login)
```sh
flowerbase-function \
  --name getUserProfile \
  --mongodb-url "mongodb://localhost:27017" \
  --jwt-secret "dev-secret" \
  --user '{"id":"000000000000000000000001","email":"demo@example.com","role":"admin"}'
```

Notes:
* You can pass arguments via `--args`, `--args-file`, or stdin.
* `MONGODB_URL` and `JWT_SECRET` are read from env if set; flags override them.
* `--app-id` is optional; when omitted, the folder name of `--base-path` is used.
---

### 🔔 Triggers

Triggers are event listeners that execute functions in response to specific events. They are grouped into three main categories:

1. **Database Triggers**: Respond to changes in your database such as inserts, updates, or deletions.
2. **Authentication Triggers**: Fired during user authentication events, such as account creation or login.
3. **Scheduled Triggers**: Time-based triggers defined using cron expressions to run tasks periodically.

All triggers are configured via JSON files where you can:

* Set event criteria and parameters
* Define the function to be executed when the trigger fires

>Example – triggers/userSignupTrigger.json

```json
{
  "name": "userSignupTrigger",
  "type": "AUTHENTICATION",
  "event": "CREATE",
  "function": "sendWelcomeEmail",
  "disabled": false
}
```

>Example – triggers/itemUpdatedTrigger.json

```json
{
  "name": "itemUpdatedTrigger",
  "type": "DATABASE",
  "config": {
    "operation_types": ["UPDATE"],
    "database": "appDB",
    "collection": "items"
  },
  "function": "logItemUpdate",
  "disabled": false
}
```


---

### 🌐 HTTP Endpoints

HTTP Endpoints provide a way to expose custom backend logic as public or protected API routes that your frontend can call directly.

Each endpoint is defined using a JSON file, where you specify:

* The HTTP method and path
* Authentication requirements
* The handler function to be executed upon request

These endpoints allow you to build flexible APIs tailored to your application’s needs, without spinning up an entire backend infrastructure.

>Example – httpEndpoints/getUserProfile.json
```json
{
  "name": "getUserProfile",
  "route": "/user/profile",
  "methods": ["GET"],
  "function": "getUserProfile",
  "authentication": true
}
```

>Example – functions/getUserProfile.js
```js
exports = function(payload, response) {
  const userId = context.user.id;
  const users = context.services.get("mongodb-atlas").db("appDB").collection("users");

  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  return users.findOne({ ownerId: userId });
};

```

The `response` object available in HTTP endpoint handlers supports:

- `response.setStatusCode(code)`
- `response.setHeader(name, value)`
- `response.setBody(body)`
---

**Flowerbase** brings the power of MongoDB Realm’s serverless architecture into your own development environment, providing a familiar, declarative, and modular way to define backend logic and access control.

---

- [📁 Project Structure](#project-structure)
- [🌐 HTTP Endpoints](#http-endpoints)
- [⚙️ Functions](#functions)
- [🔐 Rules](#rules)
- [🔔 Triggers](#triggers)
- [🌐 HTTP Endpoints](#http-endpoints)
- [🔒 Auth System](#auth-system)
- [🧪 Testing](#testing)
- [🚢 Deployment](#deployment)
- [📡 Flowerbase Client](#flowerbase-client)
- [💡 Use Cases](#use-cases)
- [💡 Examples](#examples)
- [❓ FAQ](#faq)



<a id="project-structure"></a>
## 1. 📁 Project Structure


The core implementation of the Flowerbase package is located inside:

`packages/flowerbase/src`


Within this directory, you’ll find six main components:

---

#### 1. `auth/` – 🔐 Authentication Module

This folder contains the complete implementation of the authentication system.  
It includes the logic for managing user sign-up, login, password hashing, and session handling.

---

#### 2. `features/` – ✨ Core Features

This folder houses all the primary features and domain-specific logic supported by Flowerbase, like functions, services, http-endpoints and triggers.

---

#### 3. `services/` – 🔧 External Services

Here you’ll find service implementations that are injected into the context and used across the app.  
Examples include:

- `api`: HTTP services or internal endpoints
- `aws`: AWS service integration utilities

---

#### 4. `utils/` – 🛠 Utility Functions

This folder provides a set of utilities, mainly used for:

- Validating filters and rules
- Creating the context used within Functions
- Encrypting passwords
- Reusable helpers shared across the app

---

#### 5. `index.ts` – 🚀 Entry Point

This file exports the `initialize()` function, which is called when Flowerbase is integrated into your project.  
It wires together the services, features, and authentication into a working app instance.

---

#### 6. `state.ts` – 🗂 Shared State Manager

A lightweight state management module for holding shared runtime utilities and global instances.  
Used internally across modules to avoid duplication and support application-wide behaviors.



<a id="http-endpoints"></a>
## 2. 🌐 HTTP Endpoints

Inside the `src/features/endpoints` directory, you'll find the file:

`index.ts`



This file defines the `generateEndpoints` function, which plays a crucial role in setting up dynamic HTTP endpoints in your Flowerbase-powered app.

#### 🔧 What It Does

- Reads endpoint configurations from the `json` files provided at the application level (where Flowerbase is used).
- Automatically creates corresponding HTTP endpoints inside the fastify app.
- Associates each endpoint with the appropriate handler function as defined in the configuration.

This approach allows flexible and centralized endpoint definition, making it easy to scale or modify API routes without hardcoding logic.


<a id="functions"></a>
## 3. ⚙️ Functions

Inside the `src/features/functions` directory, you'll find the file:

`index.ts`

The Realm SDK (e.g., Realm Web) communicates with server-side functions by making requests to the following endpoint:

```code
/functions/call
```


This endpoint is registered in the `index.ts` file and is handled by the `functionsController` defined in `controller.ts`.

---

#### 🛡 Authentication Hook

Before any function is executed, a `preHandler` hook is triggered.  
This hook ensures that the request is authenticated before continuing to process the function call.

---

#### 🛠 Endpoints

Two main endpoints are registered for function invocation:

- `POST /functions/call`:  
  Called by the frontend to execute a server-side function with a given payload.

- `GET /functions/call`:  
  Used for watch operations on MongoDB collections, enabling reactive features in the frontend.

---

#### 🔄 Context Creation

Every time a function is executed, Flowerbase generates a fresh execution context via the `generateContext` utility.  
This ensures isolation and allows access to useful resources during execution.

#### Each function receives a `context` object, which includes:

- `context.services`: Access to MongoDB and other configured services  
- `context.user`: Information about the authenticated user  
- `context.http`: Ability to make outgoing HTTP requests  
- `context.values`: Read application-wide configuration variables
- `context.utils.jwt`: JWT encode/decode helpers

---

## 🧪 End-to-end rule validation

Le end-to-end risiedono in `tests/e2e` e vengono ora eseguite insieme agli unit test con `npm test`. Il root `jest.config.ts` contiene due progetti (`packages/flowerbase` + `tests`), perciò il comando fa partire:

- le suite `packages/flowerbase/src/**` (unit)
- i test `tests/e2e/**/*.test.ts` (E2E)

Per gli E2E viene caricato automaticamente `.env.e2e` (se presente) tramite `dotenv`, quindi il file può contenere `MONGODB_URL` e altre variabili custom. Se preferisci non salvare le credenziali nel repo, basta esportare `MONGODB_URL` prima di `npm test`:

```bash
export MONGODB_URL="mongodb+srv://user:pass@cluster.mongodb.net/dbname"
npm test
```

In mancanza di un valore esplicito, il test fallirà perché il server remoto non sarà raggiungibile: assicurati che la stringa punti a un cluster che esegue le regole attese (per esempio `flowerbase-e2e`). Non serve più avviare Docker o Replica Set locali.

<a id="flowerbase-client"></a>
## 4. 📡 Flowerbase Client

Per usare Flowerbase da frontend o mobile, è disponibile il pacchetto dedicato:

```bash
npm install @flowerforce/flowerbase-client
```

Esempio rapido:

```ts
import { App, Credentials } from '@flowerforce/flowerbase-client'

const app = new App({
  id: 'my-app-id',
  baseUrl: 'http://localhost:8000',
  timeout: 10000
})

await app.logIn(Credentials.emailPassword('user@example.com', 'secret'))

const user = app.currentUser
if (!user) throw new Error('User not logged in')

const todos = user.mongoClient('mongodb-atlas')
  .db('my-db')
  .collection('todos')

await todos.insertOne({ title: 'Nuovo task', done: false })
const list = await todos.find({ done: false })
```

Funzionalità principali del client:
- autenticazione (`local-userpass`, `anon-user`, `custom-function`)
- chiamata funzioni (`user.functions.<name>(...)`)
- operazioni MongoDB (`find`, `insertOne`, `updateOne`, `deleteOne`, ecc.)
- change stream con `watch()` come async iterator
- supporto BSON/EJSON (`ObjectId`, `Date`, ecc.)

<a id="use-cases"></a>
## 5. 💡 Casi d’uso per funzionalità

### 🔐 Auth
- Login email/password per dashboard B2B con utenti confermati.
- Sessioni anonime per onboarding rapido e conversione successiva ad account registrato.
- Integrazione con credenziali custom via `custom-function`.

### 🔒 Rules
- Isolamento multi-tenant (utente vede solo i documenti del proprio workspace).
- Protezione a livello campo (es. campi interni visibili solo ad admin).

### ⚙️ Functions
- Calcoli server-side condivisi tra web e mobile (pricing, report, validazioni).
- Orchestrazione di processi applicativi senza esporre logica critica sul client.

### 🔔 Triggers
- Audit automatico su insert/update/delete.
- Processi schedulati (pulizia dati, reminder, aggregazioni periodiche).
- Hook sul ciclo di vita utente (on create/on delete).

### 🌐 HTTP Endpoints
- Webhook pubblici per integrazioni esterne.
- Endpoint protetti per operazioni amministrative custom.

### 📡 Flowerbase Client
- Accesso dati Realm-like da React/React Native con una API coerente.
- Aggiornamenti real-time UI con `watch()` su collection.
- Invocazione funzioni backend e gestione sessione in modo centralizzato.
