try {
  throw new Error("Test error");
} catch (e) {
  console.log("Caught an error: " + e.message);
}

console.log("After try-catch");
