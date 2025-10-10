---
title: Endpoints
sidebar_position: 5
---

# Endpoints

The **`index.ts`** file inside the `src/features/endpoints` folder exposes the `generateEndpoints` function.

This function receives the list of **endpoints** and **functions** from the project configuration where **Flowerbase** is used, and automatically registers the corresponding endpoints within the **Fastify** app.  
Each endpoint is then linked to its related function, which will be invoked whenever that endpoint is called.

---

## 🌎 Overview

- **`generateEndpoints`** dynamically creates routes in Fastify based on project configuration.  
- Each route is bound to the corresponding handler function defined in the configuration.  
- The process ensures endpoint-to-function mapping is automatic and consistent.

---

## 🛠️ Utils

The `utils` folder contains helper functions that handle:

- building and normalizing endpoint definitions,  
- resolving the correct function for each endpoint,  
- and general utilities for route registration and validation.

These utilities are used internally by `generateEndpoints` to create and bind routes correctly.