function* test() {
  const name = yield "Hello";
  console.log("Welcome,", name);
}

const g = test();
console.log(g.next().value);   // "Hello"
g.next("Seuriin");             // logs: "Welcome, Seuriin"
