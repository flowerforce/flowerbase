# flowerbase

> **A serverless-native MongoDB package designed for modern cloud applications**

Unlike MongoDB Realm or other cloud platforms, we do not offer a graphical interface where you can configure services through a dashboard.
Instead, everything is code-based and developer-driven, offering full flexibility through configuration files and source code.

This documentation is structured to guide both experienced Realm users and newcomers alike — whether you’re migrating or starting clean.

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

Add Typescript

```bash
npm install --save-dev typescript @types/node ts-node
```

Add `tsconfig.json` file

```bash
npx tsc --init
```

In your `packages.json`, inside the script section add this: 

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
Ensure the following environment variables are set in your .env file or deployment environment:


| Variable               | Description                                                                 | Example                                            |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `PROJECT_ID`           | A unique ID to identify your project. This value can be freely invented — it's preserved mainly for compatibility with the old Realm-style project structure.                     | `my-flowerbase-app`                                |
| `PORT`                 | The port on which the server will run.                                      | `3000`                                             |
| `DB_CONNECTION_STRING` | MongoDB connection URI, including username, password, and database name.    | `mongodb+srv://user:pass@cluster.mongodb.net/mydb` |
| `APP_SECRET`           | Secret used to sign and verify JWT tokens (choose a strong secret).         | `supersecretkey123!`                               |
| `HOST`                 | The host address the server binds to (usually `0.0.0.0` for public access). | `0.0.0.0`                                          |
| `HTTPS_SCHEMA`         | The schema for your server requests (usually `https` or `http`).            | `http`                                             |


Example:
```env
PROJECT_ID=your-project-id
PORT=3000
DB_CONNECTION_STRING=mongodb+srv://username:password@cluster.mongodb.net/dbname
APP_SECRET=your-jwt-secret
HOST=0.0.0.0
HTTPS_SCHEMA=http
```

🛡️ Note: Never commit .env files to source control. Use a .gitignore file to exclude it.


## 🧩 4. Initialize Flowerbase
In your index.ts file, import the initialize function from the `@flowerforce/flowerbase` package and invoke it:

```ts
// src/index.ts
import { initialize } from '@flowerforce/flowerbase';

const projectId = process.env.PROJECT_ID ?? "my-project-id"
const port = process.env.PORT ? Number(process.env.PORT) : undefined
const mongodbUrl = process.env.DB_CONNECTION_STRING
const jwtSecret = process.env.APP_SECRET
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

The only authentication mode currently re-implemented in `@flowerforce/flowerbase` is:

- Local Email/Password (local-userpass)

> Other methods (OAuth, API key, anonymous, etc.) are not supported yet.

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

You can specify the MongoDB collection used to store authentication users by configuring the `auth_collection` field inside the `auth/providers.json` file.

#### 📁 auth/providers.json
Example
```json
{
    "api-key": {
        "name": "api-key",
        "type": "api-key",
        "disabled": true
    },
    "local-userpass": {
        "name": "local-userpass",
        "type": "local-userpass",
        "disabled": false,
        "auth_collection": "my-users-collection" //custom collection name
        "config": {
            "autoConfirm": true,
            "resetPasswordSubject": "reset",
            "resetPasswordUrl": "https://my.app.url/password-reset",
            "runConfirmationFunction": false
        }
    }
}

```
If you're configuring the project from scratch, you can skip ahead to the [Build](#build) step.

--------


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

1) In your existing project folder, initialize a new Node.js project, Run:

```bash
npm init -y
```
2) Install Flowerbase

```bash
npm install @flowerforce/flowerbase
```

3) Add Typescript

```bash
npm install --save-dev typescript @types/node ts-node
```


4) Add `tsconfig.json` file

```bash
npx tsc --init
```

5) Create an index.ts file

Inside your project, create index.ts:

```bash
touch index.ts
```

6) In your `packages.json`, inside the script section add this: 

```json
{
  "start": "ts-node index.ts"
}
```

Initialize the Flowerbase App

In index.ts, add:

```ts
import { initialize } from '@flowerforce/flowerbase';

const projectId = process.env.PROJECT_ID ?? "my-project-id"
const port = process.env.PORT ? Number(process.env.PORT) : undefined
const mongodbUrl = process.env.DB_CONNECTION_STRING
const jwtSecret = process.env.APP_SECRET
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
| `DB_CONNECTION_STRING` | MongoDB connection URI, including username, password, and database name.    | `mongodb+srv://user:pass@cluster.mongodb.net/mydb` |
| `APP_SECRET`           | Secret used to sign and verify JWT tokens (choose a strong secret).         | `supersecretkey123!`                               |
| `HOST`                 | The host address the server binds to (usually `0.0.0.0` for public access). | `0.0.0.0`                                          |
| `HTTPS_SCHEMA`         | The schema for your server requests (usually `https` or `http`).            | `http`                                             |


Example:
```env
PROJECT_ID=your-project-id
PORT=3000
DB_CONNECTION_STRING=mongodb+srv://username:password@cluster.mongodb.net/dbname
APP_SECRET=your-jwt-secret
HOST=0.0.0.0
HTTPS_SCHEMA=http
```

🛡️ Note: Never commit .env files to source control. Use a .gitignore file to exclude it.


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



