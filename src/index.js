import { QubitManager }     from "./api/qubit-manager.js";
import { Simulator }         from "./core/simulator.js";
import { Circuit }           from "./compiler/ir-generator.js";
import { Compiler }          from "./compiler/compiler.js";
import { createOperations }  from "./api/operations.js";
import { CapturedCircuit }   from "./compiler/captured-circuit.js";

export { NoiseModel }        from "./core/noise-model.js";
export { CapturedCircuit }   from "./compiler/captured-circuit.js";
export * from "./api/algorithms.js";

// Module-level QubitManager shared across all Q.use() calls so that nested
// scopes can reference parent qubits through classical control ops.
const manager = new QubitManager();

export const Q = {
  /**
   * Simulate a quantum program.
   *
   * Allocates `count` fresh qubits, constructs a Simulator, and invokes
   * `callback(...qubits, ops)`.  After the callback returns, any remaining
   * buffered instructions are flushed, and all qubits are verified to be in
   * |0⟩ before being released.
   *
   * @param {number}          count
   * @param {Function}        callback   - (...qubits, ops) => void
   * @param {NoiseModel|null} noiseModel
   */
  use(count, callback, noiseModel = null) {
    const qubits  = Array.from({ length: count }, () => manager.allocate());
    const sim     = new Simulator(qubits, noiseModel);
    const circuit = new Circuit();

    const flush = (measureQubit = null) => {
      const compiled = Compiler.compile(circuit.getInstructions());
      sim.run(compiled);
      circuit.clear();
      if (measureQubit !== null) return sim.getResult(measureQubit);
    };

    const ops = createOperations(circuit, manager, flush);

    try {
      callback(...qubits, ops);
    } finally {
      flush();
      qubits.forEach((q) => manager.release(q, sim));
    }
  },

  /**
   * Capture a circuit for export to real quantum hardware without running it.
   *
   * Works identically to Q.use() from the user's perspective, but instead of
   * simulating the circuit it records all gate operations into a CapturedCircuit
   * object that can be exported to OpenQASM 2.0, OpenQASM 3.0, or Quil.
   *
   * Measurements return 0 (a mock result used only to satisfy control-flow
   * builders).  IF/WHILE bodies are always fully captured regardless, because
   * their instruction lists are built at circuit-construction time, not at
   * execution time.
   *
   * @param {number}   count
   * @param {Function} callback  - (...qubits, ops) => void  Same API as Q.use().
   * @returns {CapturedCircuit}
   *
   * @example
   * const circuit = Q.circuit(2, (q0, q1, ops) => {
   *   ops.h(q0);
   *   ops.cnot(q0, q1);
   *   ops.m(q0);
   *   ops.m(q1);
   *   ops.reset(q0);
   *   ops.reset(q1);
   * });
   *
   * console.log(circuit.toQASM2());
   * console.log(circuit.toQASM3());
   * console.log(circuit.toQuil());
   */
  circuit(count, callback) {
    const qubits    = Array.from({ length: count }, () => manager.allocate());
    const circuit   = new Circuit();
    const allOps    = [];

    // Flush collects raw instructions without running them.
    // Returns 0 for every measurement so IF/WHILE builders see a consistent value.
    const flush = (measureQubit = null) => {
      allOps.push(...circuit.getInstructions());
      circuit.clear();
      return 0;
    };

    // Bypass the normal isZero check so qubits can be released without a simulator.
    const mockSim = { isZero: () => true };

    const ops = createOperations(circuit, manager, flush);

    try {
      callback(...qubits, ops);
    } finally {
      flush();
      qubits.forEach((q) => manager.release(q, mockSim));
    }

    return new CapturedCircuit(qubits, allOps);
  },

  /**
   * Run a quantum program `numShots` times and accumulate a bitstring histogram.
   *
   * The callback is identical to Q.use() but must return an array of measurement
   * results (0 | 1) that will be joined into a bitstring key.  All qubits must
   * still be reset before the callback returns.
   *
   * @param {number}          count
   * @param {number}          numShots   - How many executions to run.
   * @param {Function}        callback   - (...qubits, ops) => number[]
   * @param {NoiseModel|null} noiseModel
   * @returns {Map<string, number>}  Bitstring → count.
   *
   * @example
   * const hist = Q.shots(2, 1000, (q0, q1, ops) => {
   *   ops.h(q0);
   *   ops.cnot(q0, q1);
   *   const m0 = ops.m(q0);
   *   const m1 = ops.m(q1);
   *   ops.reset(q0);
   *   ops.reset(q1);
   *   return [m0, m1];
   * });
   * // → Map { '00' => ~500, '11' => ~500 }
   */
  shots(count, numShots, callback, noiseModel = null) {
    const histogram = new Map();

    for (let i = 0; i < numShots; i++) {
      const qubits  = Array.from({ length: count }, () => manager.allocate());
      const sim     = new Simulator(qubits, noiseModel);
      const circuit = new Circuit();

      const flush = (measureQubit = null) => {
        const compiled = Compiler.compile(circuit.getInstructions());
        sim.run(compiled);
        circuit.clear();
        if (measureQubit !== null) return sim.getResult(measureQubit);
      };

      const ops = createOperations(circuit, manager, flush);

      let bits;
      try {
        bits = callback(...qubits, ops);
      } finally {
        flush();
        qubits.forEach((q) => manager.release(q, sim));
      }

      if (!Array.isArray(bits)) {
        throw new Error("Q.shots() callback must return an array of measurement results.");
      }

      const key = bits.join("");
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }

    return histogram;
  },
};