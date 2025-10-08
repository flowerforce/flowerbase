---
sidebar_position: 1
---

# Controller

This page describes how the **authentication controller** works and how to consume its routes.  
The controller is defined in:

`packages/flowerbase/src/auth/controller.ts`


It exposes **authentication-related routes for already authenticated users**, all wrapped by a `preHandler` named **`jwtAuthentication`** that validates the incoming JWT before the handler runs.

---

### 🧩 JWT Guard: `jwtAuthentication` (preHandler)

All routes use the `jwtAuthentication` preHandler to **validate the JWT** provided by the client.

- **On success**: the request continues and the user context is attached (e.g., `request.user`).
- **On failure**: the route short-circuits with:
  - `401 Unauthorized` for missing/invalid/expired tokens

> The guard ensures only authenticated users can access these endpoints.

---

### 🔎 GET `/profile` — Fetch connected user profile

**Purpose:** Return information about the **currently authenticated user**.

---

### 🔎 GET `/session` — Generate a (new) session token

**Purpose:** Issue a session token **the authenticated user**.

---

### 🚪 DELETE `/session` — Invalidate current session (logout)

**Purpose:** Destroy the current session / revoke the active token.