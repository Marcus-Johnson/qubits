import { Circuit } from "../compiler/ir-generator.js";

/**
 * Builds the `ops` proxy object handed to every Q.use() callback.
 *
 * Each method validates its qubit arguments, records an instruction in the
 * circuit IR, and for measurement, triggers a pipeline flush so the
 * compiled instructions are executed and a classical result is returned.
 *
 * @param {Circuit}  circuit  - The IR accumulator for this scope.
 * @param {QubitManager} manager
 * @param {Function} onFlush - Called with (qubit?) to compile+run pending ops.
 */
export const createOperations = (circuit, manager, onFlush) => {
  const validate = (q) => {
    if (!manager.isAllocated(q)) {
      throw new Error(`Usage Error: Qubit ${String(q)} is not allocated in this scope.`);
    }
  };

  const ops = {
    // ── Single-qubit gates ────────────────────────────────────────────────
    h:  (q)              => { validate(q); circuit.addOp("H",  q); },
    x:  (q)              => { validate(q); circuit.addOp("X",  q); },
    y:  (q)              => { validate(q); circuit.addOp("Y",  q); },
    z:  (q)              => { validate(q); circuit.addOp("Z",  q); },
    s:  (q)              => { validate(q); circuit.addOp("S",  q); },
    t:  (q)              => { validate(q); circuit.addOp("T",  q); },
    rx: (q, theta)       => { validate(q); circuit.addOp("RX", q, { params: [theta] }); },
    ry: (q, theta)       => { validate(q); circuit.addOp("RY", q, { params: [theta] }); },
    rz: (q, theta)       => { validate(q); circuit.addOp("RZ", q, { params: [theta] }); },
    u3: (q, theta, phi, lambda) => {
      validate(q);
      circuit.addOp("U3", q, { params: [theta, phi, lambda] });
    },

    // ── Two-qubit gates ───────────────────────────────────────────────────
    cnot: (ctrl, trgt) => {
      validate(ctrl); validate(trgt);
      if (ctrl === trgt)
        throw new Error(`Quantum Physics Error: Qubit ${String(ctrl)} cannot control itself.`);
      circuit.addOp("CNOT", [ctrl, trgt]);
    },
    cz: (ctrl, trgt) => {
      validate(ctrl); validate(trgt);
      if (ctrl === trgt)
        throw new Error(`Quantum Physics Error: Qubit ${String(ctrl)} cannot control itself.`);
      circuit.addOp("CZ", [ctrl, trgt]);
    },
    rzz:  (q1, q2, theta) => { validate(q1); validate(q2); circuit.addOp("RZZ",  [q1, q2], { params: [theta] }); },
    swap: (q1, q2)         => {
      validate(q1); validate(q2);
      if (q1 === q2) throw new Error("Usage Error: Cannot swap a qubit with itself.");
      circuit.addOp("SWAP", [q1, q2]);
    },

    // ── Three-qubit gates ─────────────────────────────────────────────────
    ccx: (c1, c2, t) => {
      validate(c1); validate(c2); validate(t);
      circuit.addOp("CCX", [c1, c2, t]);
    },

    // ── Classical control ─────────────────────────────────────────────────
    if: (qubit, value, callback) => {
      validate(qubit);
      const subCircuit = new Circuit();
      const subOps     = createOperations(subCircuit, manager, onFlush);
      callback(subOps);
      circuit.addOp("IF", null, {
        condition: { qubit, value },
        body:      subCircuit.getInstructions(),
      });
    },

    while: (qubit, value, callback) => {
      validate(qubit);
      const subCircuit = new Circuit();
      const subOps     = createOperations(subCircuit, manager, onFlush);
      callback(subOps);
      circuit.addOp("WHILE", null, {
        condition: { qubit, value },
        body:      subCircuit.getInstructions(),
      });
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    reset: (q) => { validate(q); circuit.addOp("RESET", q); },

    /**
     * Measures a qubit synchronously.  Triggers a pipeline flush: all pending
     * circuit instructions are compiled and executed before the result is read.
     */
    m: (q) => {
      validate(q);
      circuit.addOp("MEASURE", q);
      return onFlush(q);
    },
  };

  return ops;
};