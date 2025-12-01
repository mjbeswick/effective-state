// reactive.ts
// Minimal, fast, type-safe reactive primitives

/** Function that takes no arguments and returns nothing */
type Listener = () => void;

/** Function to unsubscribe from a subscription */
type Unsubscribe = () => void;

/** Hint for Symbol.toPrimitive conversion */
type PrimitiveHint = "default" | "string" | "number";

// Global context for dependency tracking
let currentEffect: Effect | null = null;

// Scheduler: collect effects to run and flush either at the end of the
// current synchronous write (transaction) or in a microtask if nothing
// else is happening synchronously. This batches multiple upstream updates
// into a single effect re-run while preserving synchronous behavior for
// single writes.
const pendingEffects = new Set<Effect>();
let flushing = false;
let writeDepth = 0;

// Global count of how many atom listeners reference each Effect.
// This is used during flushing to avoid running effects that were
// cleaned up during the same notification cycle.
const effectRefCounts = new Map<Effect, number>();

function flushPending() {
  // Run until queue empty — runs newly scheduled effects too.
  while (pendingEffects.size > 0) {
    const runNow = Array.from(pendingEffects);
    pendingEffects.clear();
    for (const eff of runNow) {
      // Skip effects that no longer have any live atom listeners
      // (they were cleaned up during this same cycle).
      if ((effectRefCounts.get(eff) || 0) === 0) continue;
      eff.run();
    }
  }
  flushing = false;
}

function scheduleEffect(e: Effect) {
  if (pendingEffects.has(e)) return;
  pendingEffects.add(e);

  // If we're inside a synchronous write, flush at the end of writes
  // so effects run synchronously before the write returns.
  if (writeDepth > 0) return;

  // Otherwise schedule a microtask flush to coalesce multiple updates.
  if (!flushing) {
    flushing = true;
    Promise.resolve().then(flushPending);
  }
}

class Effect {
  cleanup: (() => void) | null = null;
  constructor(public run: () => void) {}
}

/** Helper to attach primitive conversion methods */
function attachPrimitiveConversion<T>(
  target: any,
  getValue: () => T,
  tag: string
): void {
  Object.defineProperties(target, {
    toString: {
      value: function toString() {
        return String(getValue());
      },
      configurable: true,
    },
    valueOf: {
      value: function valueOf() {
        return getValue();
      },
      configurable: true,
    },
    [Symbol.toPrimitive]: {
      value: function (hint: PrimitiveHint) {
        const v = getValue();
        if (hint === "number") return typeof v === "number" ? v : NaN;
        if (hint === "string") return String(v);
        return v;
      },
      configurable: true,
    },
    [Symbol.toStringTag]: {
      value: tag,
      configurable: true,
    },
  });
}

/**
 * Core reactive atom - a container for reactive state.
 *
 * Atoms are callable functions that can read, write, or subscribe to state changes.
 * They automatically track dependencies when read inside an `effect()` or `computed()`.
 *
 * @typeParam T - The type of value stored in the atom
 *
 * @example
 * ```typescript
 * const count = atom(0);
 *
 * // Read
 * count();        // 0
 * count.current;  // 0 (no tracking)
 *
 * // Write
 * count(5);       // sets to 5
 * count.value = 10;
 * count.set(15);
 *
 * // Subscribe
 * const unsubscribe = count((value) => console.log(value));
 * ```
 */
export interface Atom<T> {
  /** Read the current value and track as a dependency */
  (): T;
  /** Write a new value and notify subscribers */
  (value: T): T;
  /** Subscribe to value changes */
  (listener: (value: T) => void): Unsubscribe;

  /** Direct access to read/write the value (tracks dependencies on read) */
  value: T;
  /** Direct readonly access without dependency tracking */
  readonly current: T;

  /** Explicit setter method */
  set(value: T): void;

  /** String representation of the current value */
  toString(): string;
  /** Primitive value for type coercion */
  valueOf(): T;
  /** Symbol for primitive type conversion */
  [Symbol.toPrimitive](hint: PrimitiveHint): T | string;
  /** Tag for Object.prototype.toString */
  [Symbol.toStringTag]: string;
}

/**
 * Readonly reactive atom - a derived value that cannot be directly written.
 *
 * ReadonlyAtoms are returned by `computed()` and behave like atoms but
 * without write capabilities. They automatically update when their
 * dependencies change.
 *
 * @typeParam T - The type of value stored in the atom
 *
 * @example
 * ```typescript
 * const count = atom(5);
 * const doubled = computed(() => count() * 2);
 *
 * doubled();       // 10
 * doubled.current; // 10
 *
 * // Subscribe to changes
 * doubled((value) => console.log(value));
 * ```
 */
export interface ReadonlyAtom<T> {
  /** Read the current value and track as a dependency */
  (): T;
  /** Subscribe to value changes */
  (listener: (value: T) => void): Unsubscribe;
  /** Direct readonly access without dependency tracking */
  readonly current: T;
  /** String representation of the current value */
  toString(): string;
  /** Primitive value for type coercion */
  valueOf(): T;
  /** Symbol for primitive type conversion */
  [Symbol.toPrimitive](hint: PrimitiveHint): T | string;
  /** Tag for Object.prototype.toString */
  [Symbol.toStringTag]: string;
}

/**
 * Creates a reactive atom with the given initial value.
 *
 * Atoms are the core primitive for reactive state. They can be read, written,
 * and subscribed to. When read inside an `effect()` or `computed()`, they
 * automatically track dependencies and trigger re-runs when updated.
 *
 * @typeParam T - The type of value stored in the atom
 * @param initialValue - The initial value for the atom
 * @returns A reactive atom containing the value
 *
 * @example
 * ```typescript
 * const name = atom("Alice");
 * const age = atom(25);
 *
 * // Use in effects for automatic tracking
 * effect(() => {
 *   console.log(`${name()} is ${age()} years old`);
 * });
 *
 * name("Bob"); // Logs: "Bob is 25 years old"
 * ```
 */
export function atom<T>(initialValue: T): Atom<T> {
  let value: T = initialValue;
  const listeners = new Set<Listener>();

  const notify = () => {
    // Iterate over a fixed snapshot of listeners so that listeners
    // added during this notification won't be invoked until the
    // next change. Also check the live Set before invoking so that
    // listeners removed earlier in this cycle (via cleanup) won't
    // be invoked from the snapshot.
    const snapshot = Array.from(listeners);
    for (const listener of snapshot) {
      if (!listeners.has(listener)) continue; // was removed during this cycle
      listener();
    }
  };

  const atomFn = ((...args: any[]): any => {
    const input = args[0];

    // No arguments: Read + track dependency
    if (args.length === 0) {
      if (currentEffect) {
        const effectToRun = currentEffect;
        const listener = () => scheduleEffect(effectToRun);
        listeners.add(listener);
        // increment ref count for this effect
        effectRefCounts.set(effectToRun, (effectRefCounts.get(effectToRun) || 0) + 1);

        const prevCleanup = currentEffect.cleanup;
        currentEffect.cleanup = () => {
          listeners.delete(listener);
          // decrement ref count for this effect
          const prev = effectRefCounts.get(effectToRun) || 0;
          if (prev <= 1) effectRefCounts.delete(effectToRun);
          else effectRefCounts.set(effectToRun, prev - 1);

          prevCleanup?.();
        };
      }
      return value;
    }

    // With argument: Check if it's a subscription (function) or write
    if (typeof input === "function") {
      const listener = () => (input as (v: T) => void)(value);
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    // Write
    const newValue = input as T;
    if (!Object.is(value, newValue)) {
      // Begin write transaction so scheduled effects are flushed at
      // the end of the outer-most write synchronously.
      writeDepth++;
      try {
        value = newValue;
        notify();
      } finally {
        writeDepth--;
        if (writeDepth === 0) flushPending();
      }
    }
    return value;
  }) as Atom<T>;

  // Attach readable/writable properties
  Object.defineProperties(atomFn, {
    value: {
      get: () => value,
      set: (v: T) => atomFn(v),
      configurable: true,
    },
    current: {
      get: () => value,
      configurable: true,
    },
    set: {
      value: (v: T) => atomFn(v),
      configurable: true,
    },
  });

  attachPrimitiveConversion(atomFn, () => atomFn(), "Atom");

  return atomFn;
}

/**
 * Executes a function as an atomic action, batching all state updates.
 *
 * All atom writes within the action are batched together, and effects
 * only run once after the action completes. This prevents intermediate
 * states from triggering effects and improves performance.
 *
 * @typeParam T - The return type of the action function
 * @param fn - The function to execute as an atomic action
 * @returns The return value of the function
 *
 * @example
 * ```typescript
 * const firstName = atom("John");
 * const lastName = atom("Doe");
 *
 * effect(() => {
 *   console.log(`${firstName()} ${lastName()}`);
 * });
 *
 * // Without action: effect runs twice
 * // With action: effect runs once after both updates
 * action(() => {
 *   firstName("Jane");
 *   lastName("Smith");
 * });
 * // Logs: "Jane Smith" (only once)
 * ```
 */
export function action<T>(fn: () => T): T {
  writeDepth++;
  try {
    return fn();
  } finally {
    writeDepth--;
    if (writeDepth === 0) flushPending();
  }
}

/**
 * Creates a reactive effect that automatically tracks dependencies.
 *
 * The effect function runs immediately and re-runs whenever any atom
 * read inside it changes. Dependencies are tracked automatically -
 * no manual subscription management needed.
 *
 * @param fn - The effect function to run reactively
 * @returns A cleanup function to dispose the effect and stop tracking
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * const name = atom("Alice");
 *
 * // Effect automatically tracks count and name
 * const dispose = effect(() => {
 *   console.log(`${name()} clicked ${count()} times`);
 * });
 *
 * count(1); // Logs: "Alice clicked 1 times"
 * name("Bob"); // Logs: "Bob clicked 1 times"
 *
 * dispose(); // Stop the effect
 * count(2); // No log - effect is disposed
 * ```
 */
export function effect(fn: () => void): Unsubscribe {
  const parentEffect = currentEffect;

  const effectObj = new Effect(() => {
    // Cleanup previous dependencies
    effectObj.cleanup?.();
    effectObj.cleanup = null;

    const prev = currentEffect;
    currentEffect = effectObj;
    fn();
    currentEffect = prev;
  });

  // If this effect was created inside another effect (nested), attach
  // this child's cleanup to the parent's cleanup chain so the parent
  // can remove child listeners when it re-runs.
  if (parentEffect) {
    const prevParentCleanup = parentEffect.cleanup;
    parentEffect.cleanup = () => {
      // Ensure this child's cleanup runs first
      effectObj.cleanup?.();
      prevParentCleanup?.();
    };
  }

  effectObj.run();

  // Return cleanup function for manual disposal
  return () => {
    effectObj.cleanup?.();
    effectObj.cleanup = null;
  };
}

/**
 * Creates a computed (derived) reactive value.
 *
 * Computed values are derived from other atoms and automatically update
 * when their dependencies change. They are lazy and cached - the compute
 * function only runs when dependencies change.
 *
 * @typeParam T - The type of the computed value
 * @param computeFn - A function that computes the derived value
 * @returns A readonly atom containing the computed value
 *
 * @example
 * ```typescript
 * const price = atom(100);
 * const quantity = atom(2);
 *
 * const total = computed(() => price() * quantity());
 * const formatted = computed(() => `$${total().toFixed(2)}`);
 *
 * console.log(formatted()); // "$200.00"
 *
 * price(150);
 * console.log(formatted()); // "$300.00"
 * ```
 */
export function computed<T>(computeFn: () => T): ReadonlyAtom<T> {
  const internal = atom<T>(undefined as T);

  effect(() => {
    internal(computeFn());
  });

  // Create readonly wrapper
  const readonlyAtom = ((arg?: any): any => {
    if (typeof arg === "function") {
      return internal(arg);
    }
    return internal();
  }) as ReadonlyAtom<T>;

  Object.defineProperty(readonlyAtom, "current", {
    get: () => internal(),
    configurable: true,
  });

  attachPrimitiveConversion(readonlyAtom, () => internal(), "Computed");

  return readonlyAtom;
}

/**
 * Reads atoms without tracking them as dependencies.
 *
 * Use this when you need to read an atom's value inside an effect
 * or computed without creating a dependency. This is useful for
 * conditional reads or debugging.
 *
 * @typeParam T - The return type of the function
 * @param fn - A function that reads atoms without tracking
 * @returns The return value of the function
 *
 * @example
 * ```typescript
 * const count = atom(0);
 * const enabled = atom(true);
 *
 * effect(() => {
 *   // Only track 'count', not 'enabled'
 *   if (untracked(() => enabled())) {
 *     console.log(count());
 *   }
 * });
 *
 * enabled(false); // Effect does NOT re-run
 * count(1);       // Effect re-runs (if enabled was true)
 * ```
 */
export function untracked<T>(fn: () => T): T {
  const prev = currentEffect;
  currentEffect = null;
  try {
    return fn();
  } finally {
    currentEffect = prev;
  }
}
