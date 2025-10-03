function* count() {
  yield 1;
  yield 2;
  yield 3;
}

let g = count();
console.log(g.next().value); // 1
console.log(g.next().value); // 2
console.log(g.next().value); // 3
