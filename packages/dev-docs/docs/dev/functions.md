---
title: Functions
sidebar_position: 6
---

# Functions
This section describes the **functions** system located in `src/auth/functions`.

---

## Overview

The `functions` module manages how custom functions and database operations are exposed and executed through Fastify routes.

It includes logic for:
- registering function controllers,  
- handling both **standard database operations** and **custom functions**,  
- managing function execution queues (planned),  
- and providing general utilities for query execution and function loading.

---

## 🗂️ Structure

```
src/auth/functions
├─ index.ts # exposes registerFunction
├─ controller.ts # Fastify controller for /call GET and POST routes
├─ queue.ts # utility for function execution queue (currently unused)
└─ utils.ts # general helpers for function loading and query execution
```


---

## 📂 `index.ts`

Contains the main entry point **`registerFunction`**, which registers the **functions controller** inside the Fastify app.

This ensures that all routes defined in `controller.ts` are properly attached to the main application instance.

## ⚙️ controller.ts

Defines the controller that registers endpoints related to functions.

### /call endpoint

Handles:

 - Base operations such as insert, insertOne, find, etc.

 - Direct function calls triggered from the frontend.

### /call (GET) endpoint

A GET version of the /call endpoint is also registered.
It is used by the watch mechanism on the frontend, allowing real-time updates or event streaming.

> ⚠️ **Future consideration**:
The watch logic may be moved to a dedicated section in the future for better separation of concerns.


## 📚 queue.ts

Provides a utility for managing function execution queues.

Although currently not used, it is designed to support per-session queues, allowing isolated and sequential execution of user-specific tasks.

> 🧩 **Planned improvement**:
Implement queue initialization per user session once required by the application.

## 🔧 utils.ts

Contains helper utilities for:

 - Loading functions from the project configuration,

 - Executing MongoDB queries through executeQuery.

> ⚙️ Future improvement:
Consider moving executeQuery into a dedicated database or query-related section for better modularity.