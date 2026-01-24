<div align="center">
    <img src="https://i.ibb.co/9HvgFXdR/hikari.png" alt="Hikari Logo" style="width: 150px;">
    <h1 style="margin-top: 10px;">Hikari (ヒカリ)</h1>
    <p>
        <a href="https://ssl-actx.github.io/hikari/playground/" target="_blank">
            <img src="https://img.shields.io/badge/Interactive%20Playground-✨%20Try%20Now-blue" alt="Interactive Playground">
        </a>
    </p>
</div>
<p align="center">
    <img src="https://img.shields.io/badge/language-Hikari-blue.svg" alt="Language">
    <img src="https://img.shields.io/badge/type-dynamically%20typed-orange.svg" alt="Type">
    <img src="https://img.shields.io/badge/vm-stack--based-green.svg" alt="VM">
    <img src="https://img.shields.io/badge/status-active-brightgreen.svg" alt="Status">
    <img src="https://img.shields.io/badge/license-Apache--2.0-red.svg" alt="License">
    <img src="https://img.shields.io/github/stars/SSL-ACTX/hikari?style=social" alt="GitHub stars">
    <img src="https://img.shields.io/github/forks/SSL-ACTX/hikari?style=social" alt="GitHub forks">
</p>

> [!IMPORTANT]
> **Project Status: Dropped / Archived**
>
> This project is no longer under active development. Hikari was created primarily as a **research vehicle** to explore the intricate mechanics of virtual machines, bytecode compilers, and asynchronous execution models. By implementing these low-level concepts within a high-level language like JavaScript, the project served as a deep dive into language design and runtime architecture without the overhead of manual memory management or platform-specific assembly.


**Hikari is a modern, dynamically-typed programming language built from the ground up.** It features a custom bytecode compiler and a virtual machine, designed to be instantly familiar to millions of developers by adopting the popular and expressive syntax of JavaScript.

The project is a deep dive into the mechanics of language implementation. It features a complete execution pipeline from source code to final value, including closures, classes, a prototype-based object model, and a full non-blocking, resumable execution model with generators and `async/await`.


## ✨ Core Features

*   **Custom Language & Runtime**: Hikari is not a JavaScript engine. It is a unique language with its own compiler and execution semantics, implemented from scratch.
*   **AST-to-Bytecode Compiler**: A tree-walking compiler that translates the language's AST into a custom, efficient instruction set.
*   **Stack-Based Virtual Machine**: A stable and performant C-style dispatch loop for executing Hikari bytecode.
*   **Advanced Programming Constructs**:
    *   **Closures**: First-class functions with full lexical scoping, enabling modern functional patterns.
    *   **Classes & Prototypes**: An object-oriented model with syntactic sugar for `class`, `constructor`, and `this`.
    *   **Error Handling**: A robust `try/catch/throw` mechanism with proper stack unwinding.
* **Modern Resumable Execution Model** – Hikari fully supports asynchronous and pausable computation:
  * **Generators & Iterators** – Use `function*` and `yield` for lazy evaluation, custom iteration, and resumable computation.
  * **Event Loop** – A non-blocking event loop that integrates with the host environment.
  * **Native Promises & Async/Await** – Full VM-native `Promise` implementation with `async`/`await` support, built on top of generators for seamless asynchronicity.
*   **Powerful Native Interoperability (WIP)**: Call any host JavaScript function (e.g., `console.log`, `fetch`) from within Hikari. This powerful feature provides the **entire standard library** (`JSON`, `Math`, `Map`, `Set`, etc.) by directly leveraging the rich capabilities of the host JS environment.

## 🚀 Project Philosophy

The goal of Hikari is to demystify the inner workings of a modern, high-level language runtime. By building each component from the ground up—from the compiler's code generation to the VM's memory management and execution loop—the project serves as a comprehensive case study in language design.

**Why adopt JavaScript's syntax?** *I* chose JavaScript's syntax as the foundation for Hikari due to its universal familiarity and unparalleled accessibility on the web. This strategic choice lowers the barrier to entry, allowing developers to immediately be productive in a new language environment without learning a new syntax. It's the best of both worlds: a well-understood, expressive syntax on top of a completely custom, modern runtime.

## 🔧 Architecture

Hikari has a clean, multi-stage architecture that separates concerns for clarity and maintainability.

1.  **Parsing (Leveraging Babel)**: Source code written in Hikari is first fed into the industry-standard **Babel Parser** (`@babel/parser`). Since Hikari is syntactically compatible with JavaScript, Babel can produce a compliant Abstract Syntax Tree (AST).

2.  **Compilation**: A custom **Hikari Compiler** traverses the AST. For each node type, it emits a series of custom **Opcodes** (like `OP_YIELD` and `OP_AWAIT`), specifically designed for the Hikari VM.

3.  **Execution**: The generated bytecode is loaded into the **Hikari Virtual Machine (VM)**. The VM's core is a stack-based execution engine that executes the bytecode, managing memory, call frames, and the event loop's microtask queue according to Hikari's own semantics.

<p align="center">
    <img src="https://i.ibb.co/JWBrt8KP/hk-flw.png" alt="Hikari Architecture Flowchart" style="max-width: 65%; max-height: 60%;">
</p>

## 📋 Project Roadmap & Status

This project is developed in distinct, feature-focused phases.

*   ✅ **Phase 1: Core Language Runtime (Complete)**
    *   Parsing, AST Generation, Compiler v1, Bytecode v1, VM v1, all basic data types, operators, variable scoping, and control flow.

*   ✅ **Phase 2: Advanced Functions & Object Model (Complete)**
    *   First-class Closures, a prototype chain, `class` syntactic sugar, and a full `try/catch` implementation.

*   ✅ **Phase 3: Modern Asynchronous Execution (Complete)**
    *   **This now includes Generators (`yield`)**, a host-integrated event loop, a VM-native `Promise` class, and full compiler/VM support for `async/await`.

*   🟡 **Phase 4: Memory Management (In Progress)**
    *   Implementation of a **Mark and Sweep Garbage Collector** to provide automatic memory management.

*   🟡 **Phase 5: High-Performance WASM Backend (In Progress [Phase 1])**
    *   **New Direction**: To achieve near-native performance, this phase will explore compiling Hikari's bytecode into **WebAssembly (WASM)**. The plan is to develop a secondary, high-performance VM in **Rust**, which will then be compiled to a WASM module. This provides a portable, secure, and incredibly fast execution path for performance-critical functions.

*   ⚪ **Phase 6: Future Expansions (Planned)**
    *   **Tooling**: Create a debugger, a REPL (Read-Eval-Print Loop), or a Language Server Protocol (LSP) implementation.
    *   **Inheritance**: Add full support for `extends` and `super` keywords for more complex class hierarchies.

For a detailed breakdown of tasks, see the [roadmap.md](roadmap.md) file.

## ⚙️ Getting Started

### Prerequisites

*   Node.js (v16.0.0 or higher recommended)
*   npm

### Installation

1.  Clone the repository:
    ```sh
    git clone https://github.com/SSL-ACTX/hikari.git
    cd hikari
    ```
2.  Install the dependencies:
    ```sh
    npm install
    ```

### **Running the VM**

Hikari can execute any JavaScript file directly, thanks to its syntactic compatibility. To try it out:

```bash
# Run a sample file
node index.js ./test.js
```

**Notes:**

* `test.js` can be any JS file using standard JS syntax (Hikari will parse it).
* You can create your own file, e.g.:

```js
// test.js
console.log("Hello from Hikari!");
```

Then run:

```bash
node index.js ./test.js
```

You should see the output in your terminal.

## 📜 License

This project is licensed under the **Apache License 2.0**. Please see the [LICENSE](LICENSE) file for full details.

---
*Developed by [Seuriin](https://github.com/SSL-ACTX)*
