export class Transpiler {
  /**
   * Main entry point to transpile a circuit.
   * @param {Array} instructions - The optimized instruction list.
   * @returns {Array} - Decomposed native instructions.
   */
  static transpile(instructions) {
    let nativeOps = [];

    for (const op of instructions) {
      const decomposed = this.#decompose(op);
      nativeOps.push(...decomposed);
    }

    return Object.freeze(nativeOps);
  }

  static #decompose(op) {
    const { gate, qubit, params = [] } = op;

    switch (gate) {
      case "H":
        return [{ gate: "U3", qubit, params: [Math.PI / 2, 0, Math.PI] }];
      case "X":
        return [{ gate: "U3", qubit, params: [Math.PI, 0, Math.PI] }];
      case "Y":
        return [
          { gate: "U3", qubit, params: [Math.PI, Math.PI / 2, Math.PI / 2] },
        ];
      case "Z":
        return [{ gate: "U3", qubit, params: [0, 0, Math.PI] }];
      case "RX":
        return [
          { gate: "U3", qubit, params: [params[0], -Math.PI / 2, Math.PI / 2] },
        ];
      case "RY":
        return [{ gate: "U3", qubit, params: [params[0], 0, 0] }];
      case "RZ":
        return [{ gate: "U3", qubit, params: [0, 0, params[0]] }];
      case "SWAP":
        const [q1, q2] = qubit;
        return [
          { gate: "CNOT", qubit: [q1, q2] },
          { gate: "CNOT", qubit: [q2, q1] },
          { gate: "CNOT", qubit: [q1, q2] },
        ];
      case "CZ":
        const [ctrl, trgt] = qubit;
        return [
          { gate: "U3", qubit: trgt, params: [Math.PI / 2, 0, Math.PI] },
          { gate: "CNOT", qubit: [ctrl, trgt] },
          { gate: "U3", qubit: trgt, params: [Math.PI / 2, 0, Math.PI] },
        ];
      default:
        return [op];
    }
  }
}
