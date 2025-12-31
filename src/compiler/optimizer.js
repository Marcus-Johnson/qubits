export class Optimizer {
  static COMMUTATION_RULES = [
    { gate: "Z", commutesWith: ["CNOT", "CZ"], role: "control" },
    { gate: "S", commutesWith: ["CNOT", "CZ", "T", "RZ"], role: "control" },
    { gate: "T", commutesWith: ["CNOT", "CZ", "S", "RZ"], role: "control" },
    { gate: "RZ", commutesWith: ["CNOT", "CZ", "S", "T"], role: "control" },
    { gate: "X", commutesWith: ["CNOT"], role: "target" },
    { gate: "RX", commutesWith: ["CNOT"], role: "target" },
  ];

  static EPSILON = 1e-10;

  static prune(instructions) {
    const wireMap = new Map();
    let optimized = [];

    for (const op of instructions) {
      if (this.#isIdentity(op)) continue;

      const partnerIdx = this.#findCommutingPartner(op, wireMap, optimized);

      if (partnerIdx !== null) {
        const partner = optimized[partnerIdx];

        if (["RX", "RY", "RZ"].includes(op.gate)) {
          this.#mergeGates(partnerIdx, op, optimized, wireMap);
          continue;
        }

        if (op.gate === "S" && partner.gate === "S") {
          partner.gate = "Z";
          continue;
        }

        if (op.gate === "T" && partner.gate === "T") {
          partner.gate = "S";
          continue;
        }

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
      qubits.forEach((q) => {
        if (!wireMap.has(q)) wireMap.set(q, []);
        wireMap.get(q).push(newIdx);
      });
    }

    return Object.freeze(
      optimized.filter((op) => op !== null && !this.#isIdentity(op))
    );
  }

  static #isIdentity(op) {
    if (!op.params || op.params.length === 0) return false;

    if (["RX", "RY", "RZ"].includes(op.gate)) {
      const angle = Math.abs(op.params[0] % (2 * Math.PI));
      return (
        angle < this.EPSILON || Math.abs(angle - 2 * Math.PI) < this.EPSILON
      );
    }

    if (op.gate === "U3") {
      return op.params.every((p) => Math.abs(p % (2 * Math.PI)) < this.EPSILON);
    }

    return false;
  }

  static #mergeGates(partnerIdx, op, optimized, wireMap) {
    const partner = optimized[partnerIdx];

    // Removed invalid U3 linear parameter addition
    if (["RX", "RY", "RZ"].includes(op.gate)) {
      partner.params[0] = (partner.params[0] + op.params[0]) % (2 * Math.PI);
    }

    if (this.#isIdentity(partner)) {
      this.#removeFromWires(partnerIdx, partner, wireMap);
      optimized[partnerIdx] = null;
    }
  }

  static #findCommutingPartner(op, wireMap, optimized) {
    const qubits = Array.isArray(op.qubit) ? op.qubit : [op.qubit];

    if (qubits.length !== 1) return null;
    const q = qubits[0];

    const wire = wireMap.get(q) || [];
    for (let i = wire.length - 1; i >= 0; i--) {
      const checkIdx = wire[i];
      const candidate = optimized[checkIdx];
      if (!candidate) continue;

      if (
        candidate.gate === op.gate &&
        this.#areQubitsEqual(candidate.qubit, op.qubit)
      ) {
        return checkIdx;
      }

      if (!this.#canCommute(op, candidate)) break;
    }
    return null;
  }

  static #areQubitsEqual(q1, q2) {
    if (q1 === q2) return true;
    if (Array.isArray(q1) && Array.isArray(q2)) {
      if (q1.length !== q2.length) return false;
      for (let i = 0; i < q1.length; i++) {
        if (q1[i] !== q2[i]) return false;
      }
      return true;
    }
    return false;
  }

  static #canCommute(gateA, gateB) {
    const qA = Array.isArray(gateA.qubit) ? gateA.qubit : [gateA.qubit];
    const qB = Array.isArray(gateB.qubit) ? gateB.qubit : [gateB.qubit];
    const shared = qA.filter((q) => qB.includes(q));

    if (shared.length === 0) return true;

    const rule = this.COMMUTATION_RULES.find(
      (r) =>
        (r.gate === gateA.gate && r.commutesWith.includes(gateB.gate)) ||
        (r.gate === gateB.gate && r.commutesWith.includes(gateA.gate))
    );

    if (rule) {
      const multiQubitGate = Array.isArray(gateA.qubit) ? gateA : gateB;
      const sharedQubit = shared[0];
      const isControl = multiQubitGate.qubit[0] === sharedQubit;
      if (rule.role === "control" && isControl) return true;
      if (rule.role === "target" && !isControl) return true;
    }
    return false;
  }

  static #removeFromWires(idx, op, wireMap) {
    const qubits = Array.isArray(op.qubit) ? op.qubit : [op.qubit];
    qubits.forEach((q) => {
      const wire = wireMap.get(q);
      const entryIdx = wire.indexOf(idx);
      if (entryIdx !== -1) wire.splice(entryIdx, 1);
    });
  }
}
