/**
 * @fileoverview Custom Promise implementation integrated with the VM's async scheduler.
 * Supports both VM closures and native JS functions.
 */

import { Closure, NativeObject } from './vm-datatypes.js';

const STATE = { PENDING: 'pending', FULFILLED: 'fulfilled', REJECTED: 'rejected' };

/**
 * Wrapper for scheduling asynchronous calls to a VM closure.
 */
export class AsyncCallTask {
  constructor(callee, asyncPromise, args) {
    this.callee = callee;
    this.asyncPromise = asyncPromise;
    this.args = args;
  }
}

/**
 * VM-compatible promise with microtask scheduling.
 */
export class PromiseV1 {
  constructor(executor, vm) {
    this.vm = vm;
    this.state = STATE.PENDING;
    this.value = undefined;
    this.reason = undefined;
    this.onFulfilledCallbacks = [];
    this.onRejectedCallbacks = [];

    if (executor === null) return;

    if (!(executor instanceof Closure) && typeof executor !== 'function') {
      throw new Error('Promise executor must be a VM function (Closure) or native JS function.');
    }

    const resolve = (value) => this.vm.scheduleMicrotask(() => this._resolveInternal(value));
    const reject = (reason) => this.vm.scheduleMicrotask(() => this._rejectInternal(reason));

    try {
        if (executor instanceof Closure) {
            const taskArgs = [new NativeObject('resolve', resolve), new NativeObject('reject', reject)];
            // Schedule the VM function to run with the native resolve/reject callbacks
            this.vm.scheduleMicrotask(new AsyncCallTask(executor, null, taskArgs));
        } else {
            // Immediately execute the native JS function executor
            executor(resolve, reject);
        }
    } catch (e) {
        // If executor throws an error synchronously, reject the promise
        this._rejectInternal(e.message);
    }
  }

  _resolveInternal(value) {
    if (this.state !== STATE.PENDING) return;

    if (value instanceof PromiseV1) {
      value.then(v => this._resolveInternal(v), r => this._rejectInternal(r));
      return;
    }

    this.state = STATE.FULFILLED;
    this.value = value;
    this.onFulfilledCallbacks.forEach(cb => cb(this.value));
    this.onFulfilledCallbacks = [];
  }

  _rejectInternal(reason) {
    if (this.state !== STATE.PENDING) return;
    this.state = STATE.REJECTED;
    this.reason = reason;
    this.onRejectedCallbacks.forEach(cb => cb(this.reason));
    this.onRejectedCallbacks = [];
  }

  resolve(value) { this.vm.scheduleMicrotask(() => this._resolveInternal(value)); }
  reject(reason) { this.vm.scheduleMicrotask(() => this._rejectInternal(reason)); }

  then(onFulfilled, onRejected) {
    const newPromise = new PromiseV1(null, this.vm);

    const scheduleFulfillment = (value) => {
      try {
        if (!onFulfilled) { newPromise.resolve(value); return; }
        if (onFulfilled instanceof Closure) this.vm.scheduleMicrotask(new AsyncCallTask(onFulfilled, newPromise, [value]));
        else newPromise.resolve(onFulfilled(value));
      } catch (e) { newPromise.reject(e.message); }
    };

    const scheduleRejection = (reason) => {
      try {
        if (!onRejected) { newPromise.reject(reason); return; }
        if (onRejected instanceof Closure) this.vm.scheduleMicrotask(new AsyncCallTask(onRejected, newPromise, [reason]));
        else newPromise.resolve(onRejected(reason));
      } catch (e) { newPromise.reject(e.message); }
    };

    switch (this.state) {
      case STATE.FULFILLED: this.vm.scheduleMicrotask(() => scheduleFulfillment(this.value)); break;
      case STATE.REJECTED: this.vm.scheduleMicrotask(() => scheduleRejection(this.reason)); break;
      case STATE.PENDING:
        if (onFulfilled) this.onFulfilledCallbacks.push(scheduleFulfillment);
        if (onRejected) this.onRejectedCallbacks.push(scheduleRejection);
        break;
    }

    return newPromise;
  }

  static resolve(value, vm) {
    if (value instanceof PromiseV1) return value;
    const promise = new PromiseV1(null, vm);
    promise.resolve(value);
    return promise;
  }

  static all(iterable, vm) {
    return new PromiseV1((resolve, reject) => {
      if (!Array.isArray(iterable)) return reject(new TypeError('Promise.all expects an array'));

      const total = iterable.length;
      if (total === 0) return resolve([]);

      const results = new Array(total);
      let completed = 0;

      iterable.forEach((item, index) => {
        PromiseV1.resolve(item, vm).then(
          value => { results[index] = value; completed++; if (completed === total) resolve(results); },
          reason => reject(reason)
        );
      });
    }, vm);
  }
}
