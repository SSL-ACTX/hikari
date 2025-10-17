async function delayedHello() {
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log("Hello after delay");
}

delayedHello();
console.log("Hello immediately");
