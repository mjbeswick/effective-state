

# effective-state

A minimalist reactive programming library that provides fine-grained reactivity primitives for TypeScript applications. It offers a signals-based approach where you create reactive atoms (state containers), derive computed values, and react to changes through effects—all with automatic dependency tracking and optimal re-computation.

Unlike heavier frameworks, effective-state focuses solely on the reactive core: atoms hold state, computed values derive from other reactive sources, and effects run side effects when dependencies change. This makes it perfect for building reactive UIs, state management systems, or any application requiring efficient change propagation.

## Features

- ⚡ Minimal, fast, type-safe reactivity
- 🔧 Strict TypeScript support
- 📦 ESM & CJS output
- 🛠️ Zero dependencies
- 🎯 Automatic dependency tracking
- 🔄 Batched updates with `action()`

## Installation

```bash
npm install effective-state
```

## Quick Start

```typescript
import { atom, computed, effect } from 'effective-state';

// Create reactive state
const count = atom(0);

// Derive computed values
const double = computed(() => count() * 2);

// React to changes automatically
effect(() => {
  console.log(`Count is ${count()}, double is ${double()}`);
});

count(5); // Logs: Count is 5, double is 10
```

## API

### `atom<T>(initialValue: T): Atom<T>`

Creates a reactive atom holding a value.

```typescript
const name = atom("Alice");

// Read
name();          // "Alice"
name.current;    // "Alice" (no dependency tracking)

// Write
name("Bob");     // returns "Bob"
name.value = "Charlie";
name.set("Diana");

// Subscribe to changes
const unsubscribe = name((value) => console.log(value));
name("Eve"); // Logs: Eve
unsubscribe();
```

### `computed<T>(fn: () => T): ReadonlyAtom<T>`

Creates a derived value that automatically updates when dependencies change.

```typescript
const price = atom(100);
const quantity = atom(2);

const total = computed(() => price() * quantity());
const formatted = computed(() => `$${total().toFixed(2)}`);

console.log(formatted()); // "$200.00"
price(150);
console.log(formatted()); // "$300.00"
```

### `effect(fn: () => void): () => void`

Runs a function whenever its dependencies change. Returns a cleanup function.

```typescript
const count = atom(0);

const dispose = effect(() => {
  console.log(`Count: ${count()}`);
});

count(1); // Logs: Count: 1
count(2); // Logs: Count: 2

dispose(); // Stop the effect
count(3); // No log
```

### `action<T>(fn: () => T): T`

Batches multiple state updates into a single atomic operation. Effects only run once after the action completes.

```typescript
const firstName = atom("John");
const lastName = atom("Doe");

effect(() => {
  console.log(`${firstName()} ${lastName()}`);
});
// Logs: John Doe

// Without action: effect would run twice
// With action: effect runs once after both updates
action(() => {
  firstName("Jane");
  lastName("Smith");
});
// Logs: Jane Smith (only once)
```

### `untracked<T>(fn: () => T): T`

Reads atoms without tracking them as dependencies.

```typescript
const count = atom(0);
const enabled = atom(true);

effect(() => {
  // Only track 'count', not 'enabled'
  if (untracked(() => enabled())) {
    console.log(count());
  }
});

enabled(false); // Effect does NOT re-run
count(1);       // Effect re-runs
```

## Common Patterns

### Reusable Actions

```typescript
const count = atom(0);

const increment = () => action(() => count(count() + 1));
const decrement = () => action(() => count(count() - 1));
const reset = () => action(() => count(0));

increment(); // count is now 1
```

### Nested/Structured State

```typescript
const user = atom({ name: 'Alice', age: 30 });

effect(() => {
  console.log(user().name);
});

user({ ...user(), name: 'Bob' }); // Logs: Bob
```

### Primitive Conversion

Atoms support primitive conversion for use in expressions:

```typescript
const count = atom(5);
const name = atom("Alice");

console.log(`Count: ${count}`);     // "Count: 5"
console.log(count + 10);            // 15
console.log(`Hello, ${name}!`);     // "Hello, Alice!"
```

## Running Tests

```bash
npm test
# or directly with Node.js 22+
node --experimental-transform-types --test src/index.test.ts
```

## License

MIT
