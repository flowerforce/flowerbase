---
sidebar_position: 2
---

# AWS

This document explains, at a high level, **what the AWS service is for** and **what it enables you to do** as a developer.

---

## ❓ What it is

The AWS service is a small factory that **creates pre-configured AWS clients** for two services:

- **AWS Lambda** — to invoke serverless functions.
- **Amazon S3** — to interact with object storage (upload, download, list, delete, sign URLs, etc.).

Both clients are created with a **shared set of credentials** and an explicit **AWS region**, so your feature code can request a client for a region and start calling AWS immediately with minimal setup.

---

## 🔑 Configuration & credentials

- The service reads an **access key** and **secret key** from environment variables and uses them for both Lambda and S3.
- The **region** is passed in at call-time, allowing you to target different regions per client.
- This separation makes it easy to:
  - route traffic to the nearest region,
  - test in **staging** vs **production** regions,
  - or point the client at **local emulators** with compatible settings.

> Tip: Ensure your environment variables or configuration files provide valid keys for the intended environment.