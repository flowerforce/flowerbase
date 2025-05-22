# flowerbase

> **A serverless-native MongoDB package designed for modern cloud applications. Lightweight. Fast. Pay-as-you-go.**



## 🗂️ MongoDB Atlas Migration Guide

This guide walks you through the process of setting up a Node.js backend application and integrating the `@flowerforce/flowerbase` library to connect with MongoDB Atlas.

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

```env
PROJECT_ID=your-project-id
PORT=3000
DB_CONNECTION_STRING=mongodb+srv://username:password@cluster.mongodb.net/dbname
APP_SECRET=your-jwt-secret
HOST=0.0.0.0
```

#### 🔹 projectId
- `Purpose`: Serves as a unique identifier for your project within the Flowerbase ecosystem.

- `Requirement`: This value is user-defined; you must create a unique string to identify your project.

> Example:
```env
PROJECT_ID=my-cool-app-5678
```

#### 🔹 jwtSecret
- `Purpose`: Used as the secret key for signing and verifying JSON Web Tokens (JWTs) in your application, ensuring secure authentication.

- `Requirement`: This is a user-defined secret; you must generate a secure, random string.

> Example:
```env
APP_SECRET=supersecurejwtsecret987
```

🛡️ Note: Never commit .env files to source control. Use a .gitignore file to exclude it.


## 🧩 4. Initialize Flowerbase
In your index.ts file, import the initialize function from the `@flowerforce/flowerbase` package and invoke it:

```ts
// src/index.ts

import { initialize } from '@flowerforc/flowerbase';

initialize({
  projectId: process.env.PROJECT_ID,
  port: Number(process.env.PORT),
  mongodbUrl: process.env.DB_CONNECTION_STRING,
  jwtSecret: process.env.APP_SECRET,
  host: process.env.HOST
});
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

If your previous project followed the MongoDB Realm scaffold, you're in luck:
Flowerbase was designed to mirror Realm’s structure, making migration simple and straightforward.

## 🚀 6. Build & Deploy the Server

Once your migration is complete, it’s time to build and deploy the backend so it can be accessed by your frontend or external clients.

### 🔧 Build the App

If you're using TypeScript:

```bash
npx tsc
```

Or if you're using a bundler like esbuild:

```bash
npx esbuild src/index.ts --bundle --outfile=dist/index.js
```

You can deploy the application using any Node.js-compatible platform.
Once deployed, you'll receive a public URL (e.g. https://your-app-name.up.example.app).

>This URL should be used as the base URL in your frontend application, as explained in the next section.

## 🌐 7. Frontend Setup – Realm SDK in React (Example)

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



## 🔐 8. Authentication – Local Email/Password (User-Pass)

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
```json
{
  "_id": {
    "$oid": "example-user-id"
  },
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
#### 🧠 Summary
| Feature                  | Status                                  |
|--------------------------|-----------------------------------------|
| Realm-compatible schema  | ✅ Supported (unchanged)                 |
| Authentication strategy  | ✅ Local Email/Password only             |
| OAuth / API Keys / etc.  | 🚫 Not supported (for now)               |
| User data accessibility  | ✅ Stored in your main DB                |

