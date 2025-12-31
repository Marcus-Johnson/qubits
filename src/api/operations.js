import { Circuit } from "../compiler/ir-generator.js";

export const createOperations = (circuit, manager, onFlush) => {
  const validate = (q) => {
    if (!manager.isAllocated(q)) {
      throw new Error(
        `Usage Error: Qubit ${String(q)} is not allocated in this scope.`
      );
    }
  };

  const ops = {
    h: (q) => {
      validate(q);
      circuit.addOp("H", q);
    },
    x: (q) => {
      validate(q);
      circuit.addOp("X", q);
    },
    y: (q) => {
      validate(q);
      circuit.addOp("Y", q);
    },
    z: (q) => {
      validate(q);
      circuit.addOp("Z", q);
    },

    s: (q) => {
      validate(q);
      circuit.addOp("S", q);
    },

    t: (q) => {
      validate(q);
      circuit.addOp("T", q);
    },

    rx: (q, theta) => {
      validate(q);
      circuit.addOp("RX", q, { params: [theta] });
    },

    ry: (q, theta) => {
      validate(q);
      circuit.addOp("RY", q, { params: [theta] });
    },

    rz: (q, theta) => {
      validate(q);
      circuit.addOp("RZ", q, { params: [theta] });
    },

    u3: (q, theta, phi, lambda) => {
      validate(q);
      circuit.addOp("U3", q, { params: [theta, phi, lambda] });
    },

    cnot: (ctrl, trgt) => {
      validate(ctrl);
      validate(trgt);
      if (ctrl === trgt)
        throw new Error(
          `Quantum Physics Error: Qubit ${String(ctrl)} cannot control itself.`
        );
      circuit.addOp("CNOT", [ctrl, trgt]);
    },
    cz: (ctrl, trgt) => {
      validate(ctrl);
      validate(trgt);
      if (ctrl === trgt)
        throw new Error(
          `Quantum Physics Error: Qubit ${String(ctrl)} cannot control itself.`
        );
      circuit.addOp("CZ", [ctrl, trgt]);
    },

    rzz: (q1, q2, theta) => {
      validate(q1);
      validate(q2);
      circuit.addOp("RZZ", [q1, q2], { params: [theta] });
    },

    swap: (q1, q2) => {
      validate(q1);
      validate(q2);
      if (q1 === q2)
        throw new Error(`Usage Error: Cannot swap a qubit with itself.`);
      circuit.addOp("SWAP", [q1, q2]);
    },

    ccx: (c1, c2, t) => {
      validate(c1);
      validate(c2);
      validate(t);
      circuit.addOp("CCX", [c1, c2, t]);
    },

    reset: (q) => {
      validate(q);
      circuit.addOp("RESET", q);
    },

    if: (qubit, value, callback) => {
      validate(qubit);
      const subCircuit = new Circuit();
      const subOps = createOperations(subCircuit, manager, onFlush);
      callback(subOps);

      circuit.addOp("IF", null, {
        condition: { qubit, value },
        body: subCircuit.getInstructions(),
      });
    },

    while: (qubit, value, callback) => {
      validate(qubit);
      const subCircuit = new Circuit();
      const subOps = createOperations(subCircuit, manager, onFlush);
      callback(subOps);

      circuit.addOp("WHILE", null, {
        condition: { qubit, value },
        body: subCircuit.getInstructions(),
      });
    },

    m: (q) => {
      validate(q);
      circuit.addOp("MEASURE", q);
      return onFlush(q);
    },
  };

  return ops;
};
