---
title: Project Structure
sidebar_position: 1
---

# GitHub Repository Structure

This section describes the **branching strategy** and **release workflow** used in the GitHub repository.

---

## Overview

The repository follows a **three-branch structure** that separates development, pre-release testing, and official releases.  
Each branch is connected to its own **automated release pipeline**, ensuring consistent version management and deployment.

---

## Branches

### `main`
- The **primary development branch**.  
- Contains the latest stable and reviewed code.  
- All feature branches and hotfixes are merged into `main` after code review and testing.  
- Serves as the base for creating the `prerelease` branch.

---

### `prerelease`
- Used for **beta or pre-release versions** of the package.  
- Connected to an automated **CI/CD pipeline** that builds and publishes a **beta version** to the package registry.  
- Useful for internal testing, staging environments, or early access previews.  

> ✅ Any commit or merge to `prerelease` automatically triggers the **beta release pipeline**.

---

### `release`
- Used for **official stable releases**.  
- Connected to a dedicated **release pipeline** that builds and publishes the **production version** of the package.  
- Only code that has passed all tests and verifications from `prerelease` should be merged here.

> 🚀 Merging into `release` automatically triggers the **official release process**, updating the version number and publishing to the main package registry.

---

## Workflow Summary

1. **Develop** features and fixes on branches from `main`.  
2. **Merge** completed work into `main`.  
3. **Promote** changes to `prerelease` for beta testing.  
4. Once validated, **merge into `release`** for the final production release.
