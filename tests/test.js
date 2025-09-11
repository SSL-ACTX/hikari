function outer() {
  let x = 0;
  return function inner() { return ++x; }
}

let f1 = outer();
let f2 = outer();

console.log(f1()); // expect 1
console.log(f1()); // expect 2
console.log(f2()); // expect 1  (different cell!)
console.log(f1()); // expect 3
console.log(f2()); // expect 2
