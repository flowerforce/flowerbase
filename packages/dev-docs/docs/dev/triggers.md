---
title: Triggers
sidebar_position: 7
---

# Triggers

This section describes the **triggers** system, which is responsible for activating and managing triggers associated with different types of events.

---

## 🌎 Overview

The triggers system allows the registration of **functions** that are automatically executed when specific events occur within the application.

Each trigger is linked to a function that will be called whenever its corresponding event happens.

---

## ✔ Supported Event Types

- **DATABASE** – triggered on database events such as *create*, *update*, and *delete*.  
- **SCHEDULED** – triggered on scheduled events (cron-based).  
- **AUTHENTICATION** – triggered on authentication-related events like *user creation*.

---

## 📂 Structure

```
src/features/triggers
├─ index.ts # activates and registers triggers
└─ utils.ts # contains handlers for the three trigger types
```

---

### `index.ts`

The `index.ts` file is the main entry point that **activates the trigger system**.  
It loads and registers all defined triggers, linking each to the corresponding function defined in the project configuration.

### `utils.ts`

This file defines the three handlers responsible for managing the behavior of each trigger type:

 - `handleDatabaseTrigger` – handles database-related events.

 - `handleCronTrigger` – manages scheduled (cron) triggers.

 - `handleAuthenticationTrigger` – responds to authentication events.

Each handler ensures that the correct function is executed when its associated event occurs.