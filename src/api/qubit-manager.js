/**
 * Tracks which qubit symbols are currently live within a Q.use() scope.
 *
 * Each call to allocate() returns a unique Symbol so qubit identities can
 * never collide, even across nested scopes.  release() enforces the safety
 * invariant that every qubit must be reset to |0⟩ before scope exit.
 */
export class QubitManager {
  #registry = new Set();

  /** Allocate a new qubit and return its unique symbol. */
  allocate() {
    const id = Symbol("qubit");
    this.#registry.add(id);
    return id;
  }

  /**
   * Release a qubit back to the pool.
   * @param {symbol} id         - The qubit symbol to release.
   * @param {Simulator} simulator - Used to verify the qubit is in |0⟩.
   * @throws {Error} If the qubit has not been reset.
   */
  release(id, simulator) {
    if (!simulator.isZero(id)) {
      throw new Error(
        `Fatal Error: Qubit ${String(id)} must be reset to |0\u27E9 before scope exit.`
      );
    }
    this.#registry.delete(id);
  }

  /** Returns true if the given symbol is currently allocated in this scope. */
  isAllocated(id) {
    return this.#registry.has(id);
  }
}