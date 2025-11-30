import { atom, effect, computed } from "./index";

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
count(count() + 1);
count(count() + 5);

console.log(`Current: ${count()}`); // → "Current: 16"
console.log(count() + double()); // → 48
