// reactive.ts
// Minimal, fast, type-safe reactive primitives

type Listener = () => void;
type Unsubscribe = () => void;

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

/**
 * Core reactive atom
 */
export interface Atom<T> {
  (): T; // read: atom()
  (value: T): T; // write: atom(newValue)
  (listener: (value: T) => void): Unsubscribe; // subscribe: atom(fn)

  /** Direct access (mutable) */
  value: T;
  /** Direct access (readonly) */
  readonly current: T;

  /** Explicit setter */
  set(value: T): void;

  /** For debugging / string interpolation */
  toString(): string;
  valueOf(): T;
  [Symbol.toPrimitive](hint: "default" | "string" | "number"): T | string;
  [Symbol.toStringTag]: string;
}

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

  // Attach readable/writable properties and primitive conversion
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
    toString: {
      value: function toString() {
        return String(atomFn());
      },
      configurable: true,
    },
    valueOf: {
      value: function valueOf() {
        return atomFn();
      },
      configurable: true,
    },
    [Symbol.toPrimitive]: {
      value: function (hint: string) {
        const v = atomFn();
        if (hint === "number") return typeof v === "number" ? v : NaN;
        if (hint === "string") return String(v);
        return v;
      },
      configurable: true,
    },
    [Symbol.toStringTag]: {
      value: "Atom",
      configurable: true,
    },
  });

  return atomFn;
}

/**
 * Auto-track any atom read inside the callback
 */
export function effect(fn: () => void): void {
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
}

/**
 * Derived/computed atom (lazy, cached)
 */
export function computed<T>(computeFn: () => T): Atom<Readonly<T>> {
  const derived = atom(null as any);

  effect(() => {
    derived(computeFn());
  });

  // Make it readonly and add primitive conversion
  const readonlyDerived = derived as any;
  delete readonlyDerived.value;
  delete readonlyDerived.set;
  Object.defineProperty(readonlyDerived, "current", {
    get: () => derived(),
  });
  Object.defineProperties(readonlyDerived, {
    toString: {
      value: function toString() {
        return String(derived());
      },
      configurable: true,
    },
    valueOf: {
      value: function valueOf() {
        return derived();
      },
      configurable: true,
    },
    [Symbol.toPrimitive]: {
      value: function (hint: string) {
        const v = derived();
        if (hint === "number") return typeof v === "number" ? v : NaN;
        if (hint === "string") return String(v);
        return v;
      },
      configurable: true,
    },
    [Symbol.toStringTag]: {
      value: "Computed",
      configurable: true,
    },
  });
  return readonlyDerived;
}

/**
 * Optional: one-time read without tracking (for debugging or conditions)
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
