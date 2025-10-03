async function delayedHello() {
  await new Promise(resolve => setTimeout(resolve, 10));
  console.log("Hello after delay");
}

delayedHello();
console.log("Hello immediately");
