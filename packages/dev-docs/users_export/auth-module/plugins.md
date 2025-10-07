---
sidebar_position: 2
---

# Plugins


This module defines a **Fastify plugin** that configures and manages **JWT-based authentication** within Flowerbase. It provides token verification and generation utilities that are accessible throughout the Fastify application.

The plugin is located at:

`packages/flowerbase/src/auth/plugins/jwt.ts`

## 🧩 Purpose

This plugin is responsible for setting up JWT authentication for all routes that require user validation. It leverages the `@fastify/jwt` library to handle token creation, signing, and verification.

The plugin does three main things:

 - Registers the JWT system using a secret key.
 - Decorates the Fastify instance with helper methods for authentication and token creation.
 - Provides access and refresh token mechanisms for secure session handling.