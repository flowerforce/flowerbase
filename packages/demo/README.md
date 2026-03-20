# 🌸 Flowerbase Demo

This is a demo project showcasing the usage of Flowerbase.  
To run it properly, you need to set up the environment variables and ensure the database is correctly configured.

---

## 📁 Project Structure

The backend is located at:

`packages/demo/packages/backend`

The web demo is located at:

`packages/demo/packages/frontend`

The Expo React Native demo is located at:

`packages/demo/packages/mobile`


---

## ⚙️ Environment Configuration

To start the project, create a `.env` file in the backend directory:

`packages/demo/packages/backend/.env`


## 🗃️ Database Setup

Make sure you have a running MongoDB instance.

The database must be named:

`flowerbase-demo`


Inside this database, the following collections should exist:

- `auth-users`
- `todos`

You can create them manually or let the application initialize them on first run, depending on your setup.

---

## 📱 Expo Demo

The mobile demo uses Expo and `@flowerforce/flowerbase-client` to test:

- email/password registration
- email/password login
- password reset demo flow
- basic CRUD on `todos`

Environment variables live in:

`packages/demo/packages/mobile/.env`

Expected variables:

- `EXPO_PUBLIC_APP_ID`
- `EXPO_PUBLIC_SERVER_URL`
- `EXPO_PUBLIC_DB_NAME`

For simulators running on the same machine, `http://localhost:3000` is fine.

For Expo Go on a physical device, set `EXPO_PUBLIC_SERVER_URL` to your computer LAN IP, for example `http://192.168.1.10:3000`.

Password reset in the mobile demo works in two steps:

1. it calls the normal Flowerbase reset endpoint
2. it loads `token` and `tokenId` from the demo-only endpoint `/app/<appId>/endpoint/demo-reset-preview`

That preview endpoint exists only to make the Expo demo testable without integrating a real mail provider.

---

## ✅ Demo E2E Tests

The mobile package includes a Jest E2E test that verifies:

- register
- login
- create/read/update/delete on `todos`
- password reset
- login with the new password

Run it from:

```bash
cd packages/demo
npm run test:e2e
```

Start the demo backend before running the Jest test.

If you want a single command that starts the backend and then runs the mobile Jest suite:

```bash
cd packages/demo
npm run test:e2e:with-backend
```

Use Node 20+ when running it.

---
