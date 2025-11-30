
# Development Guide

This document covers development, tooling, and contribution instructions for Atomus.

## Setup

```bash
npm install
```

## Build

```bash
npm run build
```

## Watch Mode

```bash
npm run dev
```

## Type Checking

```bash
npm run type-check
```

## Linting

```bash
npm run lint          # oxlint (fast Rust-based linter)
```

## Formatting

```bash
npm run format        # oxfmt (fast Rust-based formatter)
```

## Tests

```bash
npm test              # Run all tests
npm run test:ui       # Run with UI
```

## Tools

- **oxlint**: Fast Rust-based linter ([Oxc](https://oxc.rs/))
- **oxfmt**: Fast Rust-based formatter
- **TypeScript**: Strict type checking
- **tsup**: Build tool for TypeScript libraries
- **Vitest**: Unit testing framework
- **Husky**: Git hooks for pre-commit
- **lint-staged**: Lint/format staged files

## Pre-commit Hooks

Husky runs `lint-staged` on commit to automatically lint and format staged files using oxlint and oxfmt.

## Advanced: Using Oxc

Oxc modules are available in `node_modules` for advanced use cases like custom parsing, transforming, and minifying:

```typescript
import { Parser } from 'oxc-parser';
import { Minifier } from 'oxc-minify';
// ...
```

See [oxc.rs/docs](https://oxc.rs/) for more.
