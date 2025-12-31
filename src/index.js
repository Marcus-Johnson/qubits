import { QubitManager } from "./api/qubit-manager.js";
import { Simulator } from "./core/simulator.js";
import { Circuit } from "./compiler/ir-generator.js";
import { Compiler } from "./compiler/compiler.js";
import { createOperations } from "./api/operations.js";
export * from "./api/algorithms.js";

const manager = new QubitManager();

export const Q = {
  use: (count, callback, noiseModel = null) => {
    const qubits = Array.from({ length: count }, () => manager.allocate());
    const sim = new Simulator(qubits, noiseModel);
    const circuit = new Circuit();

    const flush = (measureQubit = null) => {
      const compiled = Compiler.compile(circuit.getInstructions());
      sim.run(compiled);

      circuit.clear();
      if (measureQubit) return sim.getResult(measureQubit);
    };

    const ops = createOperations(circuit, manager, flush);

    try {
      callback(...qubits, ops);
    } finally {
      flush();
      qubits.forEach((q) => manager.release(q, sim));
    }
  },
};