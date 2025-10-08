---
sidebar_position: 1
---

# API

This module provides a **centralized service** for performing all API calls in the application.  
It is built on top of the **Node.js [`undici`]** library for HTTP requests, offering high performance, `fetch` compatibility, and modern streaming APIs.

---

### 📁 General Structure

```
api-service/
│
├── index.ts     # Configuration and registration of methods
├── model.ts     # Shared Types/Interfaces
└── utils.ts     # Common utilities for API calls
```

---

### ⚙️ `index.ts` — Configuration & Methods

This file defines **all service methods** (`GET`, `POST`, `PUT`, `DELETE`).

---

### 🧾 `model.ts` — Types & Models

Contains **types** and **interfaces** shared across requests and responses, as well as definitions for errors and domain constants.

---

### 🧰 `utils.ts` — Request Utilities

Contains reusable functions for building and sending requests through `undici`/`fetch`, as well as handling responses and errors.

