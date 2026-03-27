# flowerbase

> **A serverless-native MongoDB package designed for modern cloud applications**

Flowerbase is a Fastify‑based application that closely mirrors the Realm platform, while keeping consumer project structure and configuration identical to Realm for near‑zero‑impact migrations.

We rewrote the core in Node.js and TypeScript, but preserved the same folder structure and configuration format as Realm services.

In addition to rewriting the core, we designed and built a dedicated Monitoring interface to give operators a real-time view of what’s happening inside Flowerbase, while keeping security and parity with Realm-like workflows.


Monitor Key capabilities:
- Live event stream, auth, functions, triggers, endpoints, service calls, console logs, and errors, with quick filtering/search.
- System stats snapshot (CPU, RAM, uptime, peaks) for quick health checks.
- Functions panel: list functions, view code (if allowed), invoke functions with custom args, and review recent invocation history.
- Endpoints panel: list HTTP endpoints and invoke them with custom method, headers, query, and payload.
- Users panel: search auth/custom users, create users, reset passwords, and enable/disable accounts.
- Collections panel: list collections, inspect rules snapshot for a given user/system context, and run queries/aggregations with pagination + history.

#### 🧠 Features Summary
| Feature                  | Status                                  |
|--------------------------|-----------------------------------------|
| Realm-compatible schema  | ✅ Supported (unchanged)                 |
| Authentication strategy  | ✅ Local Email/Password only             |
| OAuth / API Keys / etc.  | 🚫 Not supported (for now)               |
| User data accessibility  | ✅ Stored in your main DB                |
| Device Sync  | 🚫 Not supported (for now)                           |
| Functions  | ✅ Supported (unchanged)                               |
| Triggers  | ✅ Supported (unchanged)                                |
| HTTP Endpoints  | ✅ Supported (unchanged)                          |
| Monitoring UI  | ✅      New                                        |


> ⚠️ **Already have an existing Realm project?**  
> You can skip ahead to the [Migration Guide](#migration) to quickly adapt your project to Flowerbase.


## 🚀 Creating a New Project from Scratch

If you're starting fresh, you’ll learn how to:

 - Scaffold a minimal Node.js + TypeScript backend
 - Install and configure `@flowerforce/flowerbase`
 - Set up authentication, data models, rules, and custom logic
 - Deploy your app and connect it to any frontend (React, Vue, mobile, etc.)

## 📁 1. Project Setup

### ✅ Step 1.1 – Initialize a Node.js Application

Create a new project directory and initialize it with npm:

```bash
mkdir my-app
cd my-app
npm init -y
```

### ✅ Step 1.2 – Install Dependencies
Install the `@flowerforce/flowerbase` library, which provides the tools required for managing your data with MongoDB Atlas:

```bash
npm install @flowerforce/flowerbase
```

If you want to use Redis as cache provider, install `redis` in your application too:

```bash
npm install redis
```

Add Typescript

```bash
npm install --save-dev typescript @types/node ts-node
```

Add `tsconfig.json` file

```bash
npx tsc --init
```

In your `package.json`, inside the script section add this: 

```json
{
  "start": "ts-node index.ts"
}
```

## 🏗️ 2. Create the Project Structure
Inside your project root, create the main source directory:

```bash
mkdir src
```
Within the src folder, add a new file named index.ts:

```bash
touch src/index.ts
```

## 🌿 3. Environment Variables
Ensure the same environment variables described in the "Environment Variables" section above are set in your .env file or deployment environment.


## 🧩 4. Initialize Flowerbase
In your index.ts file, import the initialize function from the `@flowerforce/flowerbase` package and invoke it:

```ts
// src/index.ts
import { initialize } from '@flowerforce/flowerbase';

const projectId = process.env.PROJECT_ID ?? "my-project-id"
const port = process.env.PORT ? Number(process.env.PORT) : undefined
const mongodbUrl = process.env.MONGODB_URL
const jwtSecret = process.env.JWT_SECRET
const host = process.env.HOST

initialize({
    projectId,
    port,
    mongodbUrl,
    jwtSecret,
    host
})
```

This initializes the Flowerbase integration, connecting your application to MongoDB Atlas.

### 🧠 Optional Cache Configuration

Flowerbase can cache server-side Mongo reads and invalidate them automatically after writes.

Supported providers:

- `memory`: in-process cache, useful for local development or single-instance deployments
- `redis`: shared cache for multi-instance deployments

The cache is configured during `initialize()` and is applied to idempotent read operations exposed by the `mongodb-atlas` service. Invalidation is scoped to the current authorization context, so a successful write clears cached reads only for the same `database + collection + runAsSystem + filters` context.

#### Memory cache

```ts
import { initialize } from '@flowerforce/flowerbase';

initialize({
  projectId: 'my-project-id',
  mongodbUrl: process.env.MONGODB_URL,
  jwtSecret: process.env.JWT_SECRET,
  cache: {
    provider: 'memory',
    defaultTtlSeconds: 60,
    maxEntries: 1000
  }
})
```

#### Redis cache

```ts
import { initialize } from '@flowerforce/flowerbase';

initialize({
  projectId: 'my-project-id',
  mongodbUrl: process.env.MONGODB_URL,
  jwtSecret: process.env.JWT_SECRET,
  cache: {
    provider: 'redis',
    url: process.env.REDIS_URL!,
    defaultTtlSeconds: 300
  }
})
```

Cache notes:

- no cache provider is enabled by default
- Redis does not fall back to memory automatically
- reads executed with a Mongo session are not cached
- the memory provider supports `maxEntries` and evicts the least recently used entry when the limit is reached

## 🛠️ 5. Server Configuration – Authentication, Rules, and Functions
After setting up the base Flowerbase integration, you can now configure advanced features to control how your backend behaves.

### 📁 Suggested Folder Structure

```code
📁 my-app/
|
├── 📁 src/
|   |
│   ├── 📄 index.ts
|   |
│   ├── 📁 auth/
|   |   |
│   │   └── 📄 custom_user_data.json
|   |   |
│   │   └── 📄 providers.json
|   |   
│   ├── 📁 data_sources/
|   |   |
│   │   └── 📁 mongodb-atlas/
|   |       |
│   │       └── 📁 your_db_name/
|   |           |
│   │           └── 📁 collection1/
|   |           |    |
│   │           |    └── 📄 rules.json
│   │           | 
│   │           └── 📁 collection2/
|   |               |
│   │               └── 📄 rules.json
│   │  
│   ├── 📁 functions/
│   │   |
│   │   └── 📄 exampleFunction.ts
│   │   |
│   │   └── 📄 config.json
│   │  
│   ├── 📁 triggers/
│   │   |
│   │   └── 📄 trigger1.json
│   │   |
│   │   └── 📄 trigger2.json
│   │   
│   ├── 📁 http_endpoints/
│   │   |
│   │   └── 📄 config.json
│   │   
└── 📄 .env
```

#### 📖 Structure summary
| Area                   | Description                                            | Link                                                                                      |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 🧠 Functions           | Overview of server-side functions in Realm             | [Functions Documentation](https://www.mongodb.com/docs/atlas/app-services/functions/)     |
| ⏰ Triggers             | Triggers that run on database events or schedules      | [Triggers Documentation](https://www.mongodb.com/docs/atlas/app-services/triggers/)       |
| 👤 User Management     | Managing users, authentication, and providers          | [Users Documentation](https://www.mongodb.com/docs/atlas/app-services/users/)             |
| 🌐 Custom Endpoints    | HTTP endpoints to expose backend functionality via API | [Custom Endpoints](http://mongodb.com/docs/atlas/app-services/data-api/custom-endpoints/) |
| 🔐 Rules & Permissions | Define fine-grained access control for collections     | [Rules Documentation](https://www.mongodb.com/docs/atlas/app-services/rules/)             |


## 🔐 6. Authentication – Local Email/Password (User-Pass)

The authentication system in `@flowerforce/flowerbase` reimplements the classic **email/password** login method (called local-userpass), similar to the one used by MongoDB Realm.

### 🧱 Compatibility with Realm

In MongoDB Atlas (Realm), users were stored in a separate internal authentication database, not directly accessible via the standard MongoDB collections.

However, with Flowerbase:

- Users are stored directly in a MongoDB collection (by default named auth_users), but this can be customized in the server project via a JSON configuration file, as shown later in this guide.

- The document structure remains identical to the previous Realm implementation

- No changes are required to migrate the user data — existing user documents will continue to work as-is.
However, all users will be required to reset their passwords since it is not possible to extract passwords from the old MongoDB authentication system.

### ✅ Supported Auth Method

The authentication modes currently re-implemented in `@flowerforce/flowerbase` are:

- Local Email/Password (local-userpass)
- Anonymous (anon-user)

> Other methods (OAuth, API key, etc.) are not supported yet.

####  Example user:
```js
{
  "_id": ObjectId("2scgsb3gev99gsty2ev3g2g323d2hs"),
  "email": "myuser@flowerbase.example",
  "password": "your-encrypted-password",
  "status": "confirmed",
  "identities": [
    {
      "id": "example-id",
      "provider_type": "local-userpass",
      "provider_id": "example-provider-id",
      "provider_data": {
        "email":  "myuser@flowerbase.example",
      }
    }
  ]
}
```

You can specify the MongoDB collection used to store authentication users by setting `auth_collection` at the root of `auth/providers.json`.

#### 📁 auth/providers.json
Example
```json
{
    "auth_collection": "my-users-collection",
    "api-key": {
        "name": "api-key",
        "type": "api-key",
        "disabled": true
    },
    "local-userpass": {
        "name": "local-userpass",
        "type": "local-userpass",
        "disabled": false,
        "config": {
            "autoConfirm": true,
            "confirmationFunctionName": "",
            "resetFunctionName": "",
            "resetPasswordUrl": "https://my.app.url/password-reset",
            "runConfirmationFunction": false,
            "runResetFunction": false
        }
    },
    "anon-user": {
        "name": "anon-user",
        "type": "anon-user",
        "disabled": false
    }
}

```
If you're configuring the project from scratch, you can skip ahead to the [Build](#build) step.

## 🔐 7 Client-Side Field Level Encryption (CSFLE)

Flowerbase supports MongoDB Client-Side Field Level Encryption. When enabled, sensitive fields are encrypted by the MongoDB driver before writing to MongoDB and decrypted automatically when reading.

What Flowerbase does for you:

- Loads all `encryption.json` files under `data_sources/mongodb-atlas/**`.
- Builds the MongoDB `schemaMap` automatically from those files.
- Resolves each `keyAlias` in your schemas to a real Data Encryption Key (DEK) `keyId`.
- Ensures DEKs exist in the key vault (creates them if missing).
- Configures Fastify MongoDB plugin `autoEncryption` with the generated `schemaMap`.

### 1. Install encryption drivers

Refer to the official MongoDB documentation for CSFLE installation requirements: https://www.mongodb.com/docs/manual/core/csfle/install.

It is recommended to use the [**Automatic Encryption Shared Library**](https://www.mongodb.com/docs/manual/core/csfle/reference/install-library/?encryption-component=crypt_shared#std-label-csfle-reference-shared-library-download) instead of mongocryptd.

Note that the project should also install [mongodb-client-encryption](https://www.npmjs.com/package/mongodb-client-encryption), matching the mongodb driver version.

### 2. Add encryption schema files

Create one `encryption.json` per collection you want to encrypt:

Path example:

```text
src/data_sources/mongodb-atlas/<database>/<collection>/encryption.json
```

Example:

```json
{
  "database": "appDb",
  "collection": "records",
  "schema": {
    "bsonType": "object",
    "encryptMetadata": {
      "keyAlias": "root-key"
    },
    "properties": {
      "protectedField1": {
        "encrypt": {
          "bsonType": "string",
          "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Random"
        }
      },
      "protectedField2": {
        "encrypt": {
          "bsonType": "string",
          "algorithm": "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
          "keyAlias": "deep-key"
        }
      }
    }
  }
}
```

Notes:

- `encryptMetadata.keyAlias` applies as default key for that object level.
- `encrypt.keyAlias` overrides key selection for a specific field.
- If a field has `encrypt` but no `keyAlias`, MongoDB uses nearest `encryptMetadata`.

### 3. Pass `mongodbEncryptionConfig` to `initialize()`

`initialize()` accepts `mongodbEncryptionConfig` to configure KMS providers and key vault settings.

#### Local KMS provider example (development)

```ts
import { initialize } from "@flowerforce/flowerbase";

await initialize({
  projectId: "my-project-id",
  mongodbUrl: process.env.MONGODB_URL,
  jwtSecret: process.env.JWT_SECRET,
  mongodbEncryptionConfig: {
    kmsProviders: [
      {
        provider: "local",
        keyAlias: "root-key",
        config: {
          // 96-byte local master key encoded as base64
          key: process.env.LOCAL_MASTER_KEY_BASE64,
        },
      },
      {
        provider: "local",
        keyAlias: "deep-key",
        config: { key: process.env.LOCAL_MASTER_KEY_BASE64 },
      },
    ],
    keyVaultDb: "encryption",
    keyVaultCollection: "__keyVault",
    extraOptions: {
      // Optional: path to crypt shared library
      // cryptSharedLibPath: '/opt/mongo_crypt_v1/lib/mongo_crypt_v1.so'
    },
  },
});
```

#### AWS KMS provider example

```ts
mongodbEncryptionConfig: {
  kmsProviders: [
    {
      provider: "aws",
      keyAlias: "root-key",
      config: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      masterKey: {
        key: process.env.AWS_KMS_KEY_ARN,
        region: process.env.AWS_REGION,
      },
    },
  ];
}
```
---

<a id="migration"></a>
## 🔄 [Migration Guide](#migration) - Migrating Your Realm Project

Follow these steps to rebuild your backend in a clean and modern Node.js environment:

## 🪜 Step-by-Step Migration

### 📥 Download Your Realm App from MongoDB Atlas

Follow these steps to export and download your Realm app from MongoDB Cloud.

---

#### 1. Log In to MongoDB Cloud

Go to [https://cloud.mongodb.com/](https://cloud.mongodb.com/) and sign in with your credentials.

---

#### 2. Select Your Project

From the dashboard, choose the **project** that contains the Realm app you want to download.

---

#### 3. Open the Realm App List

- In the left-hand sidebar, under the **Services** section, click on **"Triggers"**.
- Then click the **"View All Apps"** button in the top-right corner.

---

#### 4. Select the Desired App

From the list of applications, click on the **app name** you wish to export.

---

#### 5. Go to Deployment

In the left sidebar, under the **Manage** section, click on **"Deployment"**.

---

#### 6. Export the App

Click on the **"Export App"** tab at the top of the page.

---

#### 7. Download the App

Scroll to the bottom and click the **"Download App"** button.

This will download a `.zip` file containing your Realm app's full structure and configuration.

---

✅ You are now ready to migrate or inspect your Realm app locally!

1) Reuse the same project setup steps from "Creating a New Project from Scratch" (init, install, tsconfig, scripts).

Initialize the Flowerbase App in `index.ts`:

```ts
import { initialize } from '@flowerforce/flowerbase';

const projectId = process.env.PROJECT_ID ?? "my-project-id"
const port = process.env.PORT ? Number(process.env.PORT) : undefined
const mongodbUrl = process.env.MONGODB_URL
const jwtSecret = process.env.JWT_SECRET
const host = process.env.HOST

initialize({
    projectId,
    port,
    mongodbUrl,
    jwtSecret,
    host
})

```

Ensure the following environment variables are set in your .env file or deployment environment:


| Variable               | Description                                                                 | Example                                            |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `PROJECT_ID`           | A unique ID to identify your project. This value can be freely invented — it's preserved mainly for compatibility with the old Realm-style project structure.                     | `my-flowerbase-app`                                |
| `PORT`                 | The port on which the server will run.                                      | `3000`                                             |
| `MONGODB_URL`          | MongoDB connection URI, including username, password, and database name.    | `mongodb+srv://user:pass@cluster.mongodb.net/mydb` |
| `JWT_SECRET`           | Secret used to sign and verify JWT tokens (choose a strong secret).         | `supersecretkey123!`                               |
| `HOST`                 | The host address the server binds to (usually `0.0.0.0` for public access). | `0.0.0.0`                                          |
| `API_VERSION`          | API version used in client base path.                                       | `v2.0`                                             |
| `HTTPS_SCHEMA`         | The schema for your server requests (usually `https` or `http`).            | `http`                                             |
| `ENABLE_LOGGER`        | Enable Fastify logger (any truthy value).                                   | `true`                                             |
| `RESET_PASSWORD_TTL_SECONDS` | Time-to-live for password reset tokens (in seconds).                  | `3600`                                             |
| `AUTH_RATE_LIMIT_WINDOW_MS`  | Rate limit window for auth endpoints (in ms).                          | `900000`                                           |
| `AUTH_LOGIN_MAX_ATTEMPTS`    | Max login attempts per window.                                         | `10`                                               |
| `AUTH_REGISTER_MAX_ATTEMPTS` | Max register attempts per window.                                      | `5`                                                |
| `AUTH_RESET_MAX_ATTEMPTS`    | Max reset requests per window.                                         | `5`                                                |
| `REFRESH_TOKEN_TTL_DAYS`     | Refresh token time-to-live (in days).                                  | `60`                                               |
| `ANON_USER_TTL_SECONDS` | Anonymous user time-to-live (in seconds).                                  | `10800`                                            |
| `SWAGGER_ENABLED`      | Enable Swagger UI and spec routes (disabled by default).                    | `true`                                             |
| `SWAGGER_UI_USER`      | Basic Auth username for Swagger UI (optional).                            | `admin`                                            |
| `SWAGGER_UI_PASSWORD`  | Basic Auth password for Swagger UI (optional).                            | `change-me`                                        |
| `MONIT_ENABLED`        | Enable monitoring UI at `/monit`. Must be `true` for monit to run (credentials alone are not enough). | `true` |
| `MONIT_USER`           | Basic Auth username for `/monit`.                                         | `monit`                                            |
| `MONIT_PASSWORD`       | Basic Auth password for `/monit`.                                         | `change-me`                                        |
| `MONIT_CACHE_HOURS`    | Cache duration for monitoring events (hours).                             | `24`                                               |
| `MONIT_MAX_EVENTS`     | Maximum number of cached monitoring events.                               | `5000`                                             |
| `MONIT_CAPTURE_CONSOLE`| Capture console log/warn/error into monitoring events.                     | `true`                                             |
| `MONIT_REDACT_ERROR_DETAILS` | Redact error message/stack in monitoring output.                      | `true`                                             |
| `MONIT_ALLOWED_IPS`    | Comma-separated allowlist for `/monit` (uses `req.ip`). Use `0.0.0.0` or `*` to allow all. | `127.0.0.1,10.0.0.10`                              |
| `MONIT_RATE_LIMIT_WINDOW_MS` | Rate limit window for `/monit` (ms).                                 | `60000`                                            |
| `MONIT_RATE_LIMIT_MAX` | Max requests per window for `/monit`.                                     | `120`                                              |
| `MONIT_ALLOW_INVOKE`   | Allow function invoke from monit UI.                                      | `true`                                             |
| `MONIT_ALLOW_EDIT`     | Allow function code access/override from monit UI.                         | `true`                                             |


Example:
```env
PROJECT_ID=your-project-id
PORT=3000
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/dbname
JWT_SECRET=your-jwt-secret
HOST=0.0.0.0
API_VERSION=v2.0
HTTPS_SCHEMA=http
ENABLE_LOGGER=true
RESET_PASSWORD_TTL_SECONDS=3600
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_LOGIN_MAX_ATTEMPTS=10
AUTH_REGISTER_MAX_ATTEMPTS=5
AUTH_RESET_MAX_ATTEMPTS=5
REFRESH_TOKEN_TTL_DAYS=60
ANON_USER_TTL_SECONDS=10800
SWAGGER_ENABLED=true
SWAGGER_UI_USER=admin
SWAGGER_UI_PASSWORD=change-me
MONIT_ENABLED=true
MONIT_USER=monit
MONIT_PASSWORD=change-me
MONIT_CACHE_HOURS=24
MONIT_MAX_EVENTS=5000
MONIT_CAPTURE_CONSOLE=true
MONIT_REDACT_ERROR_DETAILS=true
MONIT_ALLOWED_IPS=127.0.0.1,10.0.0.10
MONIT_RATE_LIMIT_WINDOW_MS=60000
MONIT_RATE_LIMIT_MAX=120
MONIT_ALLOW_INVOKE=true
MONIT_ALLOW_EDIT=true
```

🛡️ Note: Never commit .env files to source control. Use a .gitignore file to exclude it.

### 🔎 Monitoring (Monit UI)

- The monitoring UI lives at `/monit` and is protected by Basic Auth.
- Monit routes are registered **only** when `MONIT_ENABLED=true` (credentials alone are not enough).
- If `MONIT_ALLOWED_IPS` is set, only those IPs can reach `/monit` (ensure `req.ip` reflects your proxy setup / `trustProxy`).
- You can disable **invoke** or **edit** with `MONIT_ALLOW_INVOKE=false` and/or `MONIT_ALLOW_EDIT=false`.


<a id="build"></a>
## 🚀 Build & Deploy the Server

Once your migration or first configuration is complete, it’s time to build and deploy the backend so it can be accessed by your frontend or external clients.

### 🔧 Build the App

If you're using for example TypeScript:

```bash
npx tsc
```


You can deploy the application using any Node.js-compatible platform.
Once deployed, you'll receive a public URL (e.g. https://your-app-name.up.example.app).

>This URL should be used as the base URL in your frontend application, as explained in the next section.

## 🌐 Frontend Setup – Realm SDK in React (Example)

You can use the official `realm-web` SDK to integrate MongoDB Realm into a React application.
This serves as a sample setup — similar logic can be applied using other official Realm SDKs **(e.g. React Native, Node, or Flutter)**.

### 📦 Install Realm SDK

```bash
npm install realm-web
```

### ⚙️ Configure Realm in React

Create a file to initialize and export the Realm App instance:

```ts
// src/realm/realmApp.ts

import * as Realm from "realm-web";

// Replace with your actual Realm App ID and your deployed backend URL
const app = new Realm.App({
  id: "your-realm-app-id", // e.g., my-app-abcde
  baseUrl: "https://your-deployed-backend-url.com" // e.g., https://your-app-name.up.example.app
});

export default app;

```

>🔗 The baseUrl should point to the backend URL you deployed earlier using Flowerbase.
This tells the frontend SDK where to send authentication and data requests.
