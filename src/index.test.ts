import test from "node:test";
import assert from "node:assert/strict";
import { atom, effect, computed } from "./index.ts";

test("reactive atom: holds initial value", () => {
  const count = atom(42);
  assert.equal(count(), 42);
  assert.equal(count.current, 42);
  assert.equal(count.value, 42);
});

test("reactive atom: updates via function call", () => {
  const count = atom(0);
  count(10);
  assert.equal(count(), 10);
});

test("reactive atom: updates via .value =", () => {
  const count = atom(0);
  count.value = 99;
  assert.equal(count(), 99);
});

test("reactive atom: updates via .set()", () => {
  const count = atom(0);
  count.set(123);
  assert.equal(count(), 123);
});

test("reactive atom: returns same value on no-op set", () => {
  const count = atom("hello");
  const result = count("hello");
  assert.equal(result, "hello");
});

test("reactive atom: works in expressions via valueOf/toString", () => {
  const num = atom(10);
  const str = atom("hi");
  assert.equal(num() + 5, 15);
  assert.equal(`${str()} there`, "hi there");
  assert.equal(Boolean(str()), true);
  assert.equal(!atom(0)(), true);
});

test("reactive atom: subscribes and notifies on change", () => {
  const count = atom(0);
  let callCount = 0;
  let lastValue: number | undefined;
  const spy = (v: number) => {
    callCount++;
    lastValue = v;
  };
  count(spy);
  count(1);
  assert.equal(callCount, 1);
  assert.equal(lastValue, 1);
});

test("reactive atom: unsubscribes correctly", () => {
  const count = atom(0);
  let called = false;
  const spy = () => {
    called = true;
  };
  const unsubscribe = count(spy);
  unsubscribe();
  count(999);
  assert.equal(called, false);
});

test("reactive atom: auto-subscribes in effect()", () => {
  const a = atom(1);
  const b = atom(2);
  let lastValue: number | undefined;
  const spy = (v: number) => {
    lastValue = v;
  };
  effect(() => {
    spy(a() + b());
  });
  assert.equal(lastValue, 3);
  a(10);
  assert.equal(lastValue, 12);
  b(20);
  assert.equal(lastValue, 30);
});

test("reactive atom: cleans up old dependencies on effect re-run", () => {
  const a = atom(1);
  const b = atom(2);
  const condition = atom(true);
  let lastValue: number | undefined;
  let callCount = 0;
  const spy = (v: number) => {
    lastValue = v;
    callCount++;
  };
  effect(() => {
    if (condition()) {
      spy(a());
    } else {
      spy(b());
    }
  });
  assert.equal(lastValue, 1);
  condition(false);
  assert.equal(lastValue, 2);
  a(999); // should NOT trigger spy
  assert.equal(callCount, 2); // only initial + condition change
});

test("reactive atom: computed() derives value and updates", () => {
  const a = atom(2);
  const b = atom(3);
  const sum = computed(() => a() + b());
  assert.equal(sum(), 5);
  a(10);
  assert.equal(sum(), 13);
  b(20);
  assert.equal(sum(), 30);
});

test("reactive atom: computed() is lazy and memoized", () => {
  const a = atom(1);
  let callCount = 0;
  const expensive = () => {
    callCount++;
    return a() * 100;
  };
  const result = computed(expensive);
  result(); // triggers
  result(); // cached
  assert.equal(callCount, 1);
  a(2);
  result();
  assert.equal(callCount, 2);
});

test("reactive atom: supports nested effects", () => {
  const trigger = atom(0);
  const logs: string[] = [];
  effect(() => {
    trigger();
    logs.push("outer");
    effect(() => {
      trigger();
      logs.push("inner");
    });
  });
  trigger(1);
  assert.deepEqual(logs, ["outer", "inner", "outer", "inner"]);
});

test("reactive atom: handles diamond dependency correctly", () => {
  const a = atom(1);
  const b = computed(() => a() * 2);
  const c = computed(() => a() * 3);
  const d = computed(() => b() + c());
  let lastValue: number | undefined;
  const spy = (v: number) => {
    lastValue = v;
  };
  effect(() => spy(d()));
  assert.equal(lastValue, 5);
  a(2);
  assert.equal(lastValue, 10);
});
