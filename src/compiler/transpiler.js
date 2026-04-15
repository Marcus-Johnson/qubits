/**
 * Transpiler: decomposes high-level gates to the native basis {U3, CNOT}.
 *
 * Every gate the simulator's applyGate / apply2QubitGate handles natively
 * (U3, CNOT, CZ fast-path, SWAP fast-path, RZZ, CCX) passes through
 * unchanged.  All others are decomposed here so the downstream Optimizer
 * and Simulator only need to handle the native set.
 */
export class Transpiler {
  /**
   * @param {ReadonlyArray} instructions
   * @returns {ReadonlyArray} Decomposed native instructions (frozen).
   */
  static transpile(instructions) {
    const native = [];
    for (const op of instructions) {
      native.push(...this.#decompose(op));
    }
    return Object.freeze(native);
  }

  static #decompose(op) {
    const { gate, qubit, params = [] } = op;

    switch (gate) {
      // ── Standard basis gates → U3 ────────────────────────────────────────
      case "H":
        return [{ gate: "U3", qubit, params: [Math.PI / 2, 0, Math.PI] }];

      case "X":
        return [{ gate: "U3", qubit, params: [Math.PI, 0, Math.PI] }];

      case "Y":
        return [{ gate: "U3", qubit, params: [Math.PI, Math.PI / 2, Math.PI / 2] }];

      case "Z":
        return [{ gate: "U3", qubit, params: [0, 0, Math.PI] }];

      // ── Parameterised rotations → U3 ─────────────────────────────────────
      case "RX":
        return [{ gate: "U3", qubit, params: [params[0], -Math.PI / 2, Math.PI / 2] }];

      case "RY":
        return [{ gate: "U3", qubit, params: [params[0], 0, 0] }];

      case "RZ":
        return [{ gate: "U3", qubit, params: [0, 0, params[0]] }];

      // ── SWAP → 3 CNOTs ────────────────────────────────────────────────────
      case "SWAP": {
        const [q1, q2] = qubit;
        return [
          { gate: "CNOT", qubit: [q1, q2] },
          { gate: "CNOT", qubit: [q2, q1] },
          { gate: "CNOT", qubit: [q1, q2] },
        ];
      }

      // ── CZ → H · CNOT · H ────────────────────────────────────────────────
      case "CZ": {
        const [ctrl, trgt] = qubit;
        return [
          { gate: "U3",  qubit: trgt,        params: [Math.PI / 2, 0, Math.PI] },
          { gate: "CNOT", qubit: [ctrl, trgt] },
          { gate: "U3",  qubit: trgt,        params: [Math.PI / 2, 0, Math.PI] },
        ];
      }

      // ── Pass-through (U3, CNOT, RZZ, CCX, IF, WHILE, MEASURE, RESET…) ───
      default:
        return [op];
    }
  }
}