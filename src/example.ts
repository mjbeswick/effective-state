import { atom, effect, computed, action } from "./index";

const count = atom(0);
const name = atom("Alice");

const double = computed(() => count() * 2);
const greeting = computed(() => `Hi ${name()}, count × 2 = ${double()}`);

effect(() => {
  console.log(greeting());
});

// Minimal API usage:
count(10);
name("Bob");

// Use action to batch multiple updates - effect runs once at the end
action(() => {
  count(count() + 1);
  count(count() + 5);
  name("Charlie");
});

console.log(`Current: ${count()}`); // → "Current: 16"
console.log(count() + double()); // → 48

// Reusable actions
const increment = () => action(() => count(count() + 1));
const reset = () => action(() => {
  count(0);
  name("Alice");
});

increment();
console.log(`After increment: ${count()}`); // → "After increment: 17"

reset();
console.log(`After reset: ${count()}, ${name()}`); // → "After reset: 0, Alice"
