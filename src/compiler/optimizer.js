/**
 * Peephole optimizer for the quantum IR.
 *
 * Strategies applied in a single forward pass (Optimizer.prune):
 *   1. Identity elimination  remove zero-rotation and zero-parameter gates.
 *   2. Rotation merging      combine adjacent RX/RY/RZ on the same qubit.
 *   3. Self-inverse pairing  cancel H·H, X·X, CNOT·CNOT, etc.
 *   4. Phase upgrades        S·S → Z, T·T → S.
 *   5. Commutation           allow gates to commute past two-qubit gates so
 *                              that a partner earlier on the same wire can still
 *                              be found for rules 2–4.
 */
export class Optimizer {
  /**
   * Rules describing which single-qubit gate types commute through which
   * two-qubit gates and at what role (control or target qubit).
   */
  static COMMUTATION_RULES = [
    { gate: "Z",  commutesWith: ["CNOT", "CZ"],         role: "control" },
    { gate: "S",  commutesWith: ["CNOT", "CZ", "T", "RZ"], role: "control" },
    { gate: "T",  commutesWith: ["CNOT", "CZ", "S", "RZ"], role: "control" },
    { gate: "RZ", commutesWith: ["CNOT", "CZ", "S", "T"],  role: "control" },
    { gate: "X",  commutesWith: ["CNOT"],                role: "target"  },
    { gate: "RX", commutesWith: ["CNOT"],                role: "target"  },
  ];

  static EPSILON = 1e-10;

  /**
   * Peephole-optimise an instruction array.
   * @param {ReadonlyArray} instructions
   * @returns {ReadonlyArray} Optimised instruction array (frozen).
   */
  static prune(instructions) {
    /** Per-qubit stacks of indices into `optimized`. */
    const wireMap  = new Map();
    const optimized = [];

    for (const op of instructions) {
      if (this.#isIdentity(op)) continue;

      const partnerIdx = this.#findCommutingPartner(op, wireMap, optimized);

      if (partnerIdx !== null) {
        const partner = optimized[partnerIdx];

        // Rotation merging.
        if (["RX", "RY", "RZ"].includes(op.gate)) {
          this.#mergeRotation(partnerIdx, op, optimized, wireMap);
          continue;
        }

        // Phase upgrades.
        if (op.gate === "S" && partner.gate === "S") {
          partner.gate = "Z";
          continue;
        }
        if (op.gate === "T" && partner.gate === "T") {
          partner.gate = "S";
          continue;
        }

        // Self-inverse cancellation.
        const selfInverses = ["H", "X", "Y", "Z", "CNOT", "CZ", "SWAP"];
        if (op.gate === partner.gate && selfInverses.includes(op.gate)) {
          this.#removeFromWires(partnerIdx, partner, wireMap);
          optimized[partnerIdx] = null;
          continue;
        }
      }

      const newIdx = optimized.length;
      optimized.push(op);
      const qubits = Array.isArray(op.qubit) ? op.qubit : [op.qubit];
      for (const q of qubits) {
        if (!wireMap.has(q)) wireMap.set(q, []);
        wireMap.get(q).push(newIdx);
      }
    }

    return Object.freeze(
      optimized.filter((op) => op !== null && !this.#isIdentity(op))
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  static #isIdentity(op) {
    if (!op.params || op.params.length === 0) return false;

    if (["RX", "RY", "RZ"].includes(op.gate)) {
      const angle = Math.abs(op.params[0] % (2 * Math.PI));
      return angle < this.EPSILON || Math.abs(angle - 2 * Math.PI) < this.EPSILON;
    }

    if (op.gate === "U3") {
      return op.params.every((p) => Math.abs(p % (2 * Math.PI)) < this.EPSILON);
    }

    return false;
  }

  static #mergeRotation(partnerIdx, op, optimized, wireMap) {
    const partner = optimized[partnerIdx];
    partner.params[0] = (partner.params[0] + op.params[0]) % (2 * Math.PI);

    if (this.#isIdentity(partner)) {
      this.#removeFromWires(partnerIdx, partner, wireMap);
      optimized[partnerIdx] = null;
    }
  }

  /**
   * Walks backwards along the wire for `op`'s qubit, skipping gates that
   * commute with `op`, until it either finds a matching gate or hits a blocker.
   */
  static #findCommutingPartner(op, wireMap, optimized) {
    const qubits = Array.isArray(op.qubit) ? op.qubit : [op.qubit];
    if (qubits.length !== 1) return null;

    const wire = wireMap.get(qubits[0]) || [];
    for (let i = wire.length - 1; i >= 0; i--) {
      const checkIdx  = wire[i];
      const candidate = optimized[checkIdx];
      if (!candidate) continue;

      if (candidate.gate === op.gate && this.#areQubitsEqual(candidate.qubit, op.qubit)) {
        return checkIdx;
      }

      if (!this.#canCommute(op, candidate)) break;
    }
    return null;
  }

  static #areQubitsEqual(q1, q2) {
    if (q1 === q2) return true;
    if (Array.isArray(q1) && Array.isArray(q2)) {
      return q1.length === q2.length && q1.every((q, i) => q === q2[i]);
    }
    return false;
  }

  static #canCommute(gateA, gateB) {
    const qA     = Array.isArray(gateA.qubit) ? gateA.qubit : [gateA.qubit];
    const qB     = Array.isArray(gateB.qubit) ? gateB.qubit : [gateB.qubit];
    const shared = qA.filter((q) => qB.includes(q));

    if (shared.length === 0) return true;

    const rule = this.COMMUTATION_RULES.find(
      (r) =>
        (r.gate === gateA.gate && r.commutesWith.includes(gateB.gate)) ||
        (r.gate === gateB.gate && r.commutesWith.includes(gateA.gate))
    );

    if (rule) {
      const multiQubitGate = Array.isArray(gateA.qubit) ? gateA : gateB;
      const isControl      = multiQubitGate.qubit[0] === shared[0];
      if (rule.role === "control" &&  isControl) return true;
      if (rule.role === "target"  && !isControl) return true;
    }

    return false;
  }

  static #removeFromWires(idx, op, wireMap) {
    const qubits = Array.isArray(op.qubit) ? op.qubit : [op.qubit];
    for (const q of qubits) {
      const wire     = wireMap.get(q);
      const entryIdx = wire.indexOf(idx);
      if (entryIdx !== -1) wire.splice(entryIdx, 1);
    }
  }
}