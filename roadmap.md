### **Hikari: Language & VM Development Roadmap**
> **Developer:** Jameel U. Tutungan (Seuriin)

> **Current Day:** 10 (Workdays) - Literally 3-8hrs coding per day

**Project Goal:** To create a modern, high-level, dynamically-typed language with a custom bytecode Virtual Machine, featuring closures, classes, and asynchronicity.

---

### **Phase 1: Core Language Runtime (100% Complete)** ✅

*The foundational bedrock of the entire system. This phase established a stable, feature-rich execution environment.*

*   ✅ **Parsing & AST Generation:** Leveraged Babel for robust, industry-standard parsing of source code into an Abstract Syntax Tree.
*   ✅ **Compiler v1:** Implemented a single-pass, tree-walking compiler that translates AST nodes directly into custom bytecode.
*   ✅ **Bytecode & Opcodes v1:** Designed a clear and extensible instruction set, covering arithmetic, logic, variables, and control flow.
*   ✅ **Virtual Machine v1:** Created a stable, stack-based VM with a  main dispatch loop.
*   ✅ **Data Types & Literals:** Full support for Numbers, Strings, Booleans, and `null`.
*   ✅ **Arithmetic & Logic:** Comprehensive implementation of binary (`+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, etc.) and unary (`-`, `!`) operators. **Includes correct JavaScript-style string concatenation for the `+` operator.**
*   ✅ **Variable Scoping:** Robust support for global and nested function-local variable scopes (`let`).
*   ✅ **Control Flow:**
    *   ✅ **Conditionals:** `if/else` statements.
    *   ✅ **Loops:** `for` and `while` loops.
    *   ✅ **Loop Control:** Full `break` and `continue` support for all loop types, including nested contexts.
*   ✅ **Data Structures:** First-class support for Arrays and Objects (`OP_NEW_ARRAY`, `OP_GET/SET_INDEX`, `OP_NEW_OBJECT`).
*   ✅ **Native Interop:** Seamless ability to call host JavaScript functions and methods (e.g., `console.log`).

---

### **Phase 2: Advanced Functions & Object Model (100% Complete)** ✅

*The phase that transformed a simple scripting engine into a powerful, expressive language with a modern object model.*

*   ✅ **Closures (100%):** Full lexical scoping implemented via upvalues. Enables first-class functions, higher-order functions, and modern functional patterns. The core of the language's power.
*   ✅ **Prototypes (100%):** A secure, lightweight, JavaScript-style prototype chain for object-oriented programming. Opcodes for getting/setting properties and prototypes are fully functional.
*   ✅ **Classes & Constructors (100%):** Implemented powerful syntactic sugar for `class`, `constructor`, `this`, and methods. The compiler cleanly desugars class syntax into functions and prototypes with no runtime overhead.
*   ✅ **Error Handling (100%):** A complete `try/catch/throw` implementation with a dedicated exception handler stack in the VM. Supports nested `try/catch` blocks, error propagation, and proper stack unwinding.

---

### **Phase 3: Modern Asynchronous Execution (100% Complete)** ✅

*This phase makes the language truly non-blocking and capable of handling modern concurrent tasks. The language now has a complete, event-driven concurrency model integrated with the host environment.*

*   ✅ **Generators & Iterators (100%):** Full support for generator functions (`function*`) and the `yield` keyword. The compiler generates appropriate state-machine bytecode, and the VM handles pausable/resumable function execution frames. This forms the foundation for `async/await`.
*   ✅ **Event Loop & Host Integration (100%):** The core `vm.interpret()` function has been transformed into a true event loop. It correctly manages a microtask queue and can idle while waiting for asynchronous operations from the host environment (e.g., `fetch`, `setInterval`), preventing premature termination.
*   ✅ **Promise Implementation (100%):** A VM-native `PromiseV1` class provides the foundation for asynchronous operations, complete with state management and `.then()` functionality.
*   ✅ **`async/await` Syntax (100%):** The language now fully supports the intuitive `async` and `await` keywords.
    *   ✅ **Compiler:** Correctly identifies `async function` and compiles `await` expressions into a new `OP_AWAIT` opcode.
    *   ✅ **VM:** The `OP_AWAIT` handler seamlessly pauses function execution, schedules resumption via the microtask queue, and delivers the resolved value back to the stack.
    *   ✅ **Function Calls:** Calling an `async` function correctly returns a `PromiseV1` immediately and schedules the function's body for asynchronous execution.
    *   ✅ **Return Values:** `return` inside an `async` function correctly resolves the function's promise; unhandled errors correctly reject it.
*   ✅ **Advanced Native Interop (100%):** The VM can now robustly interact with native asynchronous functions. It correctly handles and wraps native `Promise`s returned from host functions (e.g., `response.json()`), making I/O operations like `fetch` fully usable.

---

### **Phase 4: Memory Management (Garbage Collection) - In Progress** 🟡

*This phase introduces automatic memory management to ensure Hikari runs reliably under heavy workloads. The strategy is to first implement a simple, correct collector and then evolve it into a high-performance, async-friendly generational GC.*

---

#### **Milestone 1: Baseline Mark–Sweep Collector**

*The foundational goal: achieve correctness with a simple, stop-the-world garbage collector.*

*   ✅ **Object Graph Traversal:**
    *   Implement a central registry to track all heap-allocated objects.
    *   Develop a `mark()` function to recursively traverse and mark all reachable objects starting from VM roots (stack, globals, closures, etc.).
    *   Ensure all Hikari object types are correctly handled (Functions, Arrays, Objects, Promises).

*   ◻️ **Collection Cycle & VM Integration:**
    *   Implement the **sweep phase** to iterate through the object registry, freeing any object not marked as reachable.
    *   Integrate the GC trigger into the VM, running a full collection cycle when memory allocation exceeds a defined threshold.
    *   Add optional debugging hooks (e.g., `gc.log()`, `gc.collect()`) to manually trigger and visualize collections.

---

#### **Milestone 2: High-Performance Generational GC**

*The optimization goal: significantly reduce GC pause times for a smooth asynchronous experience by separating objects by age.*

*   ◻️ **Heap Organization & Minor Collections:**
    *   Divide the heap into a **Nursery (young generation)** and a **Tenured (old generation)** space. New objects are always allocated in the Nursery.
    *   Implement a fast **Minor GC (Scavenge)** that runs frequently only on the Nursery.
    *   Surviving objects are promoted to the Tenured space after one or more Minor GC cycles.

*   ◻️ **Correctness with Write Barriers:**
    *   Implement a **write barrier** on operations that create pointers from old objects to young objects (e.g., `old_obj.prop = new_young_obj`).
    *   Use a **Remembered Set** to track these cross-generational pointers. The Minor GC will use this set as an additional root source, ensuring no live young objects are accidentally collected.

*   ◻️ **Major Collections & Event Loop Integration:**
    *   Implement a **Major GC** (a full mark–sweep on both generations) that runs much less frequently, only when the Tenured space is nearing capacity.
    *   Make the GC cooperative by running Minor GCs opportunistically during idle moments in the event loop, keeping application pauses minimal.
    *   *(Optional)* Investigate incremental or concurrent marking for the Major GC to further reduce stop-the-world pause times if needed.

---

### **Phase 5: High-Performance Rust Toolchain (Provisional)** ✨

*This phase represents a major strategic pivot to achieve near-native performance and create a self-contained ecosystem. The entire core of Hikari—both the compiler and the VM—will be re-implemented in Rust and compiled to WebAssembly (WASM) for a portable, secure, and extremely fast execution environment.*
> Might do just the VM and wasm stuff, as I'm only a solo dev :(

*   **Step 1: VM Core in Rust**
    *   **Goal:** Re-implement the core Hikari VM logic (stack, dispatch loop, opcodes) in Rust.
    *   **Tasks:**
        1.  Define shared data structures for values, objects, and bytecode that are compatible with both the JS and Rust VMs.
        2.  Implement the stack-based execution engine and main dispatch loop in Rust.
        3.  Port the handlers for the core instruction set to Rust.

*   **Step 2: WASM Compilation & Hybrid Model**
    *   **Goal:** Compile the Rust VM to a WASM module and enable a hybrid execution model where the JS compiler's output can run on the WASM VM.
    *   **Tasks:**
        1.  Set up the Rust toolchain for WASM compilation (e.g., using `wasm-pack`).
        2.  Create a clear API boundary to load Hikari bytecode into the WASM module's memory from JavaScript.
        3.  Implement "trampolines" to call into the WASM VM and to allow the WASM VM to call back into the JS host for native interop. This step validates the Rust VM with the existing JS compiler.

*   **Step 3: New Compiler Core in Rust**
    *   **Goal:** Build a new, high-performance compiler in Rust that is fully compatible with the VM. This is the critical step to replace the original JS compiler.
    *   **Tasks:**
        1.  Choose a parsing strategy in Rust (e.g., using a parser-combinator library like `nom` or a handwritten recursive descent parser for maximum performance).
        2.  Re-implement the AST-to-bytecode compilation logic. The goal is to produce the *exact same bytecode* as the JavaScript compiler to ensure compatibility.
        3.  Expose the Rust compiler to the JS environment via WASM bindings, creating a `hikari.compile()` function that is now powered by Rust.

*   **Step 4: Full Rust Toolchain Integration**
    *   **Goal:** Create a unified, standalone Hikari toolchain in Rust.
    *   **Tasks:**
        1.  Integrate the Rust compiler and Rust VM so they can communicate directly without going through a JS/WASM bridge.
        2.  Develop a native command-line interface (CLI) in Rust that can compile and run Hikari scripts (`hikari run script.hk`).
        3.  Ensure the Rust-based GC (from Phase 4, potentially also ported or re-thought in Rust) integrates seamlessly with the Rust VM.

---

### **Phase 6: Future Expansions (Provisional)** ✨
*Once the core vision, including robust memory management and the high-performance WASM backend, is complete, the language can continue to evolve with new features and tooling.*

*   ◻️ **Standard Library:** Build out Hikari-native classes and functions (`Map`, `Set`, `JSON`, `Math`, file I/O). This can now be implemented directly in Rust for maximum performance.
*   ◻️ **Inheritance (Optional):** Add full support for the `extends` and `super` keywords.
*   ◻️ **Tooling:** The Rust toolchain makes this far more powerful. Create a native debugger, a REPL, and a Language Server Protocol (LSP) implementation for first-class editor support without a Node.js dependency.
*   ◻️ **Compiler/VM Optimizations:** With the full toolchain in Rust, implement advanced optimizations:
    *   **Compiler:** AST-level optimizations like constant folding, dead code elimination.
    *   **VM:** Inline caching, type specialization, or more sophisticated memory management.
*   ◻️ **Type System Enhancements (Optional):** Consider optional static typing or type hints. A Rust-based compiler is the ideal foundation for building a robust type checker.
