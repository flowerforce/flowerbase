---
sidebar_position: 4
---

# Auth

The **auth** module exposes a single **server-side authentication** entrypoint (ideal for a serverless function environment) plus its typed **models**.

## What it does
- Provides a backend entrypoint for **email/password** authentication.
- Orchestrates the **user registration** flow and returns a minimal, integration-friendly interface.

## What it exposes
- `emailPasswordAuth.registerUser` — a server-executable **registration handler** you can attach to a route or serverless function. It delegates the actual registration logic to a shared handler, keeping the surface clean and consistent.