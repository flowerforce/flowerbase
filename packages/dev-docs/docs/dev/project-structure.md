---
title: Project structure
sidebar_position: 2
---

# Project structure

The **Flowerbase** codebase is organized in a modular way to ensure clarity, scalability, and ease of contribution.  
The core source code is located inside the directory:

`packages/flowerbase/src`

Within this directory, you’ll find the main entry point (`index.ts`) and the five primary subdirectories that make up the system architecture.

## 🚪 `index.ts` – Application Entry Point

The file `index.ts` represents the **entry point of the entire Flowerbase application**.  
It’s responsible for the initial setup, configuration, and registration of all the core components that make the framework operational.

Inside this file, the main exported function is:

### `initialize()`

The `initialize` function handles all **startup and configuration logic**, ensuring the environment is correctly prepared before the application starts.  

Specifically, it performs the following steps:

1. **Initializes the Fastify app** – sets up the Fastify instance, plugins, and base configuration.  
2. **Loads configuration files** – reads project-specific configurations from the directory where Flowerbase is used.  
3. **Stores data in global state** – saves environment and configuration details in a global runtime context.  
4. **Registers all core functionalities** – automatically sets up endpoints, activates trigger watchers, and loads feature modules.

This function must be **imported and executed** in the project where Flowerbase is integrated.

You can pass configuration parameters **directly as arguments** to the `initialize()` function or provide them via **environment variables**, allowing flexibility across development, staging, and production environments.


Within this directory, you’ll find the **five main folders** that define the structure and behavior of the entire project.

---

## 📁 1. `auth/`

This folder contains all logic and services related to **authentication and authorization**.

It manages:
- User registration and login processes  
- Token generation and validation  
- Secure session handling  
- Encryption and decryption mechanisms for user credentials  

The `auth` module ensures a consistent and secure authentication flow across the platform.

---

## ⚙️ 2. `features/`

The `features` directory implements the **core functionality** inherited and expanded from **MongoDB Realm**.  
It includes all the main components that define the serverless behavior of Flowerbase.

Submodules include:
- **`functions/`** – implementation and execution of serverless functions.  
- **`triggers/`** – event-based functions triggered by database or system events.  
- **`endpoints/`** – HTTP/HTTPS endpoints for exposing APIs to external clients.

Each feature is developed as an isolated module, making it easy to extend or integrate new capabilities.

---

## 🧰 3. `services/`

The `services` folder contains **core backend services** used by Flowerbase to interact with external systems and perform internal operations.

It currently includes:
- **`mongodb-atlas/`** – manages communication with MongoDB Atlas and database operations.  
- **`api/`** – handles RESTful API calls and integrates external APIs.  
- **`aws/`** – provides support for AWS-based services and resources.

Each service is designed as an independent layer, so that external integrations can be swapped or extended without affecting the rest of the system.

---

## 🔄 4. `shared/`

The `shared` directory contains **modules and utilities shared across different parts of the project**.  
It includes common interfaces, constants, and helper functions that are used by multiple features or services.

This promotes **code reuse and consistency** across the entire codebase.

---

## 🧮 5. `utils/`

The `utils` folder contains a collection of **utility functions and tools** used throughout the project.  
These include:

- **Encryption and decryption utilities** used during registration and authentication.  
- **Initializers** for setting up the application environment and loading configurations.  
- **Processing and validation tools** for managing and validating access rules.  

This directory provides the low-level support that powers the higher-level features and services.

---

## 🧭 Summary

The directory structure inside `packages/flowerbase/src` is designed to promote **modularity, maintainability, and collaboration**.  
Each folder has a clearly defined responsibility:

| Folder | Purpose |
|---------|----------|
| `auth/` | Authentication and authorization services |
| `features/` | Core Realm-like features (functions, triggers, endpoints) |
| `services/` | External and internal service integrations (MongoDB, API, AWS) |
| `shared/` | Shared logic and reusable modules |
| `utils/` | Utility functions for encryption, initialization, and rule validation |

---

> 💡 **Tip:**  
> When contributing to Flowerbase, always check if the functionality you’re implementing belongs to an existing module — or if it should be abstracted as a shared or utility function. Keeping the structure consistent is key to maintainability.
