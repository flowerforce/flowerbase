---
title: Public Routes
sidebar_position: 8
---

# Public Routes


This section describes the **public routes** exposed by the application, located in  
`src/utils/initializer/exposeRoutes.ts`.

---

## 🌎 Overview

The public routes are endpoints that can be accessed **without authentication**.  
They are primarily used for initial setup, health checks, and retrieving general server information.

All routes are registered and exposed in the `exposeRoutes.ts` file.


---

## ⼬ Exposed Routes

### `GET /location`
Returns information about the server or application **location**.  
Useful for identifying deployment environment details or verifying regional setup.

### `GET /health`
A simple **health check endpoint**.  
Used to verify that the server is running and responsive.

### `POST /setup/first-user`
Allows the registration of the **first user** in the system.  
Typically used during the initial setup process before authentication and user management are fully enabled.
