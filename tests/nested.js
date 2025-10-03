// Nested if-statements
let x = 10;
let y = 5;

if (x > 5) {
  if (y > 2) {
    console.log("x and y are greater than 5 and 2");
  }
}

// Nested while loops
let i = 0;
while (i < 2) {
  let j = 0;
  while (j < 2) {
    console.log(i, j);
    j = j + 1;
  }
  i = i + 1;
}
