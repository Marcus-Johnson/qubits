export class Circuit {
  #ops = [];

  addOp(gate, qubit, options = {}) {
    this.#ops.push({
      gate,
      qubit,
      params: options.params || [],
      condition: options.condition || null,
      body: options.body || null,
      timestamp: Date.now(),
    });
  }

  clear() {
    this.#ops = [];
  }

  getInstructions() {
    return Object.freeze([...this.#ops]);
  }
}
