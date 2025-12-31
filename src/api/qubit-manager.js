export class QubitManager {
  #registry = new Set();

  allocate() {
    const id = Symbol("qubit");
    this.#registry.add(id);
    return id;
  }

  release(id, simulator) {
    if (!simulator.isZero(id)) {
      throw new Error(
        `Fatal Error: Qubit ${String(id)} must be reset to |0> before release.`
      );
    }
    this.#registry.delete(id);
  }

  isAllocated(id) {
    return this.#registry.has(id);
  }
}
