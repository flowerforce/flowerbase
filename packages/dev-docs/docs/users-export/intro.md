---
title: How to export Users
sidebar_position: 1
---

# User Export Tool from MongoDB Realm

This guide explains how to retrieve the required parameters (`groupId`, `appId`, `cookie`, `traceId`) from the MongoDB Realm interface in order to use the **user export tool**.  
It also covers how to set a default password and specify the output file name for the exported users.

---

## ✅ Prerequisites

- Access to a MongoDB Atlas/Realm account with appropriate permissions.  
- Desktop browser (Chrome or equivalent) with Developer Tools (DevTools).

> 💡 **Tip:**  
> Open DevTools with <kbd>F12</kbd>, or  
> <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> (Windows/Linux), or  
> <kbd>⌥</kbd> + <kbd>⌘</kbd> + <kbd>I</kbd> (macOS).

---

## 🧭 Step-by-Step Procedure

1. Log in to [account.mongodb.com](https://account.mongodb.com/account/login).
2. From the top-left menu, select the **desired project**.
3. In the left sidebar, click **Triggers**.
4. In the top-right corner, click **View All Apps**.
5. Select the **app** for which you want to export users.
6. Open the **Inspector (DevTools)** and, in the app’s left menu, go to **App Users**.
7. In the **Network** tab of DevTools, filter and select the request named **`users`**.
8. In the `users` request URL, you’ll find two IDs:  
   - The **first** is the `groupId`.  
   - The **second** is the `appId`.

   > **Example:**  
   > `/api/admin/v3.0/groups/1234567890abcdef/apps/myapp-abcde/users`

9. Retrieve the **`cookie`** value from the **`Cookie`** header of the same request.
10. The **`traceId`** value can be found in the **`sentry-trace`** header.
11. In the export tool, you can choose a **default password** for the exported users and specify the **output file name** (e.g. `users_realm.json`).

---

## 🧩 Parameters Required by the Tool

| Field | Description | Where to Find |
|-------|--------------|---------------|
| `groupId` | ID of the project (Group) in Atlas/Realm. | In the `users` request URL – first ID. |
| `appId` | ID of the Realm app. | In the `users` request URL – second ID. |
| `cookie` | Full value of the `Cookie` header for authentication. | Headers of the request. |
| `traceId` | Value of the `sentry-trace` header (used for tracing). | Headers of the request. |
| `defaultPassword` | Default password assigned to exported users. | Chosen by the user. |
| `outputFile` | Output file name (e.g. `export-users.json`). | Chosen by the user. |

---

## 🧠 Example Configuration

```json
{
  "groupId": "1234567890abcdef",
  "appId": "myapp-abcde",
  "cookie": "mdb_at=...; mdbUser=...; __Host-some=...",
  "traceId": "d3b07384d113edec49eaa6238ad5ff00-5f2c-9",
  "defaultPassword": "SafePassword!2025",
  "outputFile": "users_realm.json"
}
```
---

## 🏁 Summary

Once you have collected all the parameters (`groupId`, `appId`, `cookie`, `traceId`) from MongoDB Realm, you can input them into the export tool along with your chosen default password and output file name.
The tool will then download a JSON file containing the exported users from your Realm app.
