

# effective-state


A minimalist reactive programming library that provides fine-grained reactivity primitives for TypeScript applications. It offers a signals-based approach where you create reactive atoms (state containers), derive computed values, and react to changes through effects—all with automatic dependency tracking and optimal re-computation.

Unlike heavier frameworks, effective-state focuses solely on the reactive core: atoms hold state, computed values derive from other reactive sources, and effects run side effects when dependencies change. This makes it perfect for building reactive UIs, state management systems, or any application requiring efficient change propagation.


## Features

- ⚡ Minimal, fast, type-safe reactivity
- 🔧 Strict TypeScript support
- 📦 ESM & CJS output
- 🛠️ Zero dependencies

## Installation

```bash
npm install effective-state
```


## Running Tests (Direct TypeScript)

You can run tests written in TypeScript directly with Node.js 22+:

```bash
node --experimental-transform-types --test src/index.test.ts
```

## Quick Start

```typescript
import { atom, computed, effect } from 'effective-state';

// Create an atom
const count = atom(0);

// Create a computed value
const double = computed(() => count() * 2);

// React to changes
effect(() => {
  console.log(`Count is ${count()}, double is ${double()}`);
});

count(5); // Logs: Count is 5, double is 10
```

## Common Patterns


### 1. Basic Atom Usage

```typescript
const value = atom(10);
value(20); // set new value
console.log(value()); // get current value
```

**Tip:** In TypeScript, always use the function-call style to get the value of an atom or computed. For example:

```typescript
const a = atom(2);
const b = atom(3);
console.log(a() + b()); // 5
console.log(`Value is: ${a()}`); // "Value is: 2"
```

### 2. Derived/Computed Values

```typescript
const a = atom(2);
const b = atom(3);
const sum = computed(() => a() + b());
a(5);
console.log(sum()); // 8
```

### 3. Effects (Reactions)

```typescript
const name = atom('Alice');
effect(() => {
  console.log('Hello,', name());
});
name('Bob'); // Logs: Hello, Bob
```

### 4. Subscribing to Atom Changes

```typescript
const n = atom(1);
const unsubscribe = n.subscribe((val) => {
  console.log('n changed to', val);
});
n(2); // Logs: n changed to 2
unsubscribe();
n(3); // No log
```

### 5. Nested/Structured State

```typescript
const user = atom({ name: 'Alice', age: 30 });
effect(() => {
  console.log(user().name);
});
user({ ...user(), name: 'Bob' }); // Logs: Bob
```

## API

### `atom<T>(initialValue: T): Atom<T>`

Creates a reactive atom holding a value. Minimal API:
- Call as function: `atom()` to read, `atom(newValue)` to write
- `.subscribe(callback)` to listen for changes (optional)

### `computed<T>(fn: () => T): Computed<T>`

Creates a computed value that updates when dependencies change.

### `effect(fn: () => void): () => void`

Runs a function whenever its dependencies change. Returns an unsubscribe function.

## License

MIT
