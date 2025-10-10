---
title: Rules Matcher
sidebar_position: 10
---

#  Rules Matcher

This section documents the **Rules Matcher Utilities**, located in `src/utils/rules-matcher`, the module that provides all logic for evaluating and validating rules written in a **MongoDB-like syntax**.

---

## 🌎 Overview

The **`rulesMatcherUtils`** object contains a collection of helper functions designed to process and validate rules against input data.  
These rules are used to define access conditions, filtering logic, or validation constraints using an operator-based syntax similar to MongoDB query operators.

The utilities support complex logical combinations (`$and`, `$or`) and various data types, allowing consistent evaluation across different use cases.

---


## 🎯 Purpose

- Evaluate rule conditions dynamically at runtime.  
- Support **MongoDB-like operators** such as `$eq`, `$gt`, `$in`, `$regex`, etc.  
- Handle **nested paths** and **referenced values** using `$ref:` syntax.  
- Work with different data types: numbers, strings, arrays, booleans, and objects.  
- Generate key dependencies and paths from rule definitions.  
- Offer helper methods for type checking, coercion, and safe evaluation.

---



## ✏️ Main Components

### `rulesMatcherUtils`

A utility object providing a wide range of helper functions used during rule evaluation.

It includes logic for:
- **Type checking** (`isNumber`, `isString`, `isObject`, etc.)
- **Value normalization** (`forceArray`, `forceNumber`, `getDefaultRule`)
- **Path resolution** with optional prefixes
- **Rule validation** using recursive logic for `$and` / `$or`
- **Key extraction** from rule definitions for dependency analysis
- **Empty value handling** and safe object access via Lodash helpers

These utilities collectively provide the foundation for evaluating rule expressions in a flexible and consistent way.

---

### `operators`

A predefined set of comparison operators compatible with MongoDB-style rule syntax.

Supported operators include:
- **Equality / Inequality**: `$eq`, `$ne`
- **Comparison**: `$gt`, `$gte`, `$lt`, `$lte`
- **String length checks**: `$strGt`, `$strLt`, etc.
- **Array matching**: `$in`, `$nin`, `$all`
- **Existence and regex**: `$exists`, `$regex`

Each operator defines a small comparison function used by the rule matcher during validation.

