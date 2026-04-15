/**
 * IonQ JSON Circuit Exporter
 *
 * Targets: IonQ Aria 1 (25q), IonQ Forte 1 / Forte Enterprise 1 (36q) via Azure Quantum.
 * Format: ionq.circuit.v1  |  gateset: qis
 * Spec: https://docs.ionq.com/#tag/circuit-model
 *
 * Gate mapping:
 *   Single-qubit  → { gate, targets: [i] }
 *   Parameterised → { gate, rotation, targets: [i] }
 *   Two-qubit     → { gate, control: i, target: j }  (cnot, cz)
 *                   { gate, targets: [i, j] }         (swap)
 *   U3(θ,φ,λ)    → decomposed to RZ(λ)·RY(θ)·RZ(φ)  (no U3 in qis)
 *   RZZ(θ)        → CNOT · RZ(θ) · CNOT  (no RZZ in qis)
 *   CCX           → CCNOT (ionq.circuit.v1 supports ccnot as a named gate)
 *
 * Classical control (IF/WHILE) and RESET are not representable in ionq.circuit.v1
 * and are silently skipped.  Downstream callers should validate with warnings.
 */

function emitOp(op, qubitIndex, circuit) {
  const qi = (q) => qubitIndex.get(q);
  const p  = op.params || [];

  switch (op.gate) {
    case "H":  circuit.push({ gate: "h",  targets: [qi(op.qubit)] }); break;
    case "X":  circuit.push({ gate: "x",  targets: [qi(op.qubit)] }); break;
    case "Y":  circuit.push({ gate: "y",  targets: [qi(op.qubit)] }); break;
    case "Z":  circuit.push({ gate: "z",  targets: [qi(op.qubit)] }); break;
    case "S":  circuit.push({ gate: "s",  targets: [qi(op.qubit)] }); break;
    case "T":  circuit.push({ gate: "t",  targets: [qi(op.qubit)] }); break;

    case "RX": circuit.push({ gate: "rx", rotation: p[0], targets: [qi(op.qubit)] }); break;
    case "RY": circuit.push({ gate: "ry", rotation: p[0], targets: [qi(op.qubit)] }); break;
    case "RZ": circuit.push({ gate: "rz", rotation: p[0], targets: [qi(op.qubit)] }); break;

    case "U3": {
      const [theta, phi, lambda] = p;
      circuit.push({ gate: "rz", rotation: lambda, targets: [qi(op.qubit)] });
      circuit.push({ gate: "ry", rotation: theta,  targets: [qi(op.qubit)] });
      circuit.push({ gate: "rz", rotation: phi,    targets: [qi(op.qubit)] });
      break;
    }

    case "CNOT":
      circuit.push({ gate: "cnot", control: qi(op.qubit[0]), target: qi(op.qubit[1]) });
      break;

    case "CZ":
      circuit.push({ gate: "cz", control: qi(op.qubit[0]), target: qi(op.qubit[1]) });
      break;

    case "SWAP":
      circuit.push({ gate: "swap", targets: [qi(op.qubit[0]), qi(op.qubit[1])] });
      break;

    case "RZZ": {
      const theta = p[0];
      circuit.push({ gate: "cnot", control: qi(op.qubit[0]), target: qi(op.qubit[1]) });
      circuit.push({ gate: "rz",   rotation: theta, targets: [qi(op.qubit[1])] });
      circuit.push({ gate: "cnot", control: qi(op.qubit[0]), target: qi(op.qubit[1]) });
      break;
    }

    case "CCX":
      circuit.push({
        gate:     "ccnot",
        controls: [qi(op.qubit[0]), qi(op.qubit[1])],
        target:   qi(op.qubit[2]),
      });
      break;

    case "IF":
    case "WHILE":
    case "RESET":
      break;

    case "MEASURE":
      circuit.push({ gate: "measure", qubit: qi(op.qubit) });
      break;

    default:
      break;
  }
}

function walk(instructions, qubitIndex, circuit) {
  for (const op of instructions) {
    emitOp(op, qubitIndex, circuit);
    if (op.body) walk(op.body, qubitIndex, circuit);
  }
}

/**
 * Convert a captured circuit to the IonQ JSON circuit format (ionq.circuit.v1).
 *
 * @param {number}             qubitCount
 * @param {Map<symbol,number>} qubitIndex
 * @param {readonly object[]}  instructions  Raw (pre-compilation) IR.
 * @returns {string}  Serialised JSON string.
 */
export function toIonQJSON(qubitCount, qubitIndex, instructions) {
  const circuit = [];
  walk(instructions, qubitIndex, circuit);

  return JSON.stringify(
    {
      format:  "ionq.circuit.v1",
      gateset: "qis",
      qubits:  qubitCount,
      circuit,
    },
    null,
    2,
  );
}