---
sidebar_position: 3
---

# Providers

This section contains the **authentication providers** reimplemented in the project.  
Each provider handles a different authentication method and includes its own logic, controllers, and dedicated DTOs.

---

## 📁 General Structure

```
providers/
│
├── local-userpass/
│   ├── controller.ts
│   ├── dto/
│   └── ...
│
└── custom-function/
    ├── controller.ts
    ├── dto/
    ├── schemas/
    └── ...
```

---

## 🔐 Provider: `local-userpass`

The **local-userpass** provider manages authentication **via email and password**.  
It allows user registration, login, and password reset management.

### 📄 Main Files

#### `controller.ts`

Contains the **HTTP endpoints** for managing the authentication flow.  
Below is a list of the main endpoints:

| Method | Endpoint         | Description |
|:--------|:-----------------|:-------------|
| `POST`  | `/registration`  | Registers a new user with email and password |
| `POST`  | `/login`         | Authenticates the user |
| `POST`  | `/reset`         | Requests a password reset (generating a token and a tokenId) |
| `POST`  | `/confirm_reset` | Confirms the password reset and updates the credentials |

---

#### `dtos.ts`

Contains the **DTOs** used by the controller endpoints, for example:

- `LoginDto` – data structure for authentication (`email`, `password`)
- `RegistrationDto` – data structure for user registration

---

## ⚙️ Provider: `custom-function`

The **custom-function** provider handles authentication through a **custom function** defined at the application level.  
This approach allows greater flexibility, for example to integrate with external services or implement custom validation logic.

### 📄 Main Files

#### `controller.ts`

Contains the **endpoints** for authentication using a custom function:

| Method | Endpoint | Description |
|:--------|:----------|:-------------|
| `POST`  | `/login`  | Performs login using the system-defined custom function |

---

#### `dtos.ts`

Contains **DTOs** specific to managing custom login data.
---

#### `schema.ts`

Contains **validation schemas** used to ensure the correctness of incoming login data.  

---

## 📘 General Notes

- Each provider is **self-contained** and manages its own authentication logic.
- New providers can be added following the same structure:
  - A `controller` file for endpoints
  - A set of `dto` files for validation and data transfer
  - (Optional) Schemas or custom functions for advanced validation
