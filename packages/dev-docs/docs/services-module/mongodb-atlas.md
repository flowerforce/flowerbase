---
sidebar_position: 3
---

# MongoDB Atlas


This section documents the **MongoDB Atlas** module that provides a consistent layer for selecting collections and executing database operations with **rule-aware filtering**.

---

## ❓ What it is

A small access layer that exposes:
- A collection **selector** utility (from `index.ts`) to bind to a database/collection and perform common operations.
- A set of **filter utilities** (from `utils.ts`) that normalize and apply query filters, projections, and rule-based constraints.

The goal is to keep feature code concise, **enforce access rules** at the data layer, and make queries predictable and testable.

---

## 🗂️ Files & Responsibilities

```
mongodb-atlas/
│
├── index.ts   # Public API: get a collection handle and run operations (find, findOne, insert, watch, etc.)
└── utils.ts   # Internal helpers for composing filters, projections, sorting, pagination, and rule validation
```

### `index.ts` — Collection selector & operations

Provides a utility to **select a collection** from a chosen database and execute operations while **validating rules** and **filtering data** accordingly.

Supported operations:
- `find` — Query multiple documents with optional filters, projection, sort, limit/skip (pagination).
- `findOne` — Query a single document with optional filters and projection.
- `insert` / `insertMany` — Insert one or more documents after validation / rule checks.
- `updateOne` / `updateMany` — Update with rule-aware filters (if implemented).
- `deleteOne` / `deleteMany` — Delete constrained by rules (if implemented).
- `watch` — Open a **change stream** to react to insert/update/delete events on the collection.
- `aggregate` — Works only from the server, without filtering and validations.

### `utils.ts` — Filter/validation utilities

Contains composable helpers used by `index.ts` to:
- **Normalize incoming filters** (e.g., convert user-friendly operators to MongoDB operators).
- **Compose rule filters**
- Apply **projection** (fields include/exclude).
- Optionally build **aggregation pipelines** from high-level inputs.

These utilities ensure consistent behavior across operations and reduce duplication.

---

## ⏳ Extensibility

- Add more operations (bulk writes, transactions) behind the same rule-aware layer.
- Extend `utils.ts` with higher-level builders (search, range, text indexes).
- Introduce **schema validation** (e.g., Zod/TypeBox/JSON Schema) before writes.

