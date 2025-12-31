/**
 * Grover's Search Algorithm for N qubits.
 * @param {Object} qops - The operations object from your library.
 * @param {Array} qubits - Array of qubits to include in the search.
 * @param {Function} oracle - A function that applies the problem-specific oracle.
 */
export const runGrover = (qops, qubits, oracle) => {
  qubits.forEach((q) => qops.h(q));

  const iterations = Math.floor(
    (Math.PI / 4) * Math.sqrt(Math.pow(2, qubits.length))
  );

  for (let i = 0; i < iterations; i++) {
    oracle(qops, qubits);

    qubits.forEach((q) => qops.h(q));
    qubits.forEach((q) => qops.x(q));

    qops.cz(qubits[qubits.length - 2], qubits[qubits.length - 1]);

    qubits.forEach((q) => qops.x(q));
    qubits.forEach((q) => qops.h(q));
  }

  return qubits.map((q) => qops.m(q));
};

/**
 * Iterative Phase Estimation using mid-circuit measurements.
 * @param {Object} qops - The operations object.
 * @param {Symbol} aux - The auxiliary qubit.
 * @param {Symbol} target - The target qubit.
 * @param {number} precision - Number of bits of precision.
 * @param {Function} controlledU - Function applying Controlled-U^(2^k).
 */
export const iterativePhaseEstimation = (
  qops,
  aux,
  target,
  precision,
  controlledU
) => {
  let phaseBits = [];

  for (let k = precision - 1; k >= 0; k--) {
    qops.reset(aux);
    qops.h(aux);

    phaseBits.forEach((bit, i) => {
      if (bit === 1) {
        const angle = -Math.PI / Math.pow(2, i + 1);
        qops.rz(aux, angle);
      }
    });

    controlledU(qops, aux, target, Math.pow(2, k));

    qops.h(aux);
    const bit = qops.m(aux);
    phaseBits.push(bit);
  }

  return phaseBits;
};

/**
 * Variational Form (Hardware-Efficient Ansatz) for VQE.
 * @param {Object} qops - The operations object.
 * @param {Array} qubits - Array of qubits.
 * @param {Array} params - Flat array of rotation angles.
 */
export const vqeAnsatz = (qops, qubits, params) => {
  let pIdx = 0;
  for (let layer = 0; layer < 2; layer++) {
    qubits.forEach((q) => {
      qops.ry(q, params[pIdx++]);
      qops.rz(q, params[pIdx++]);
    });

    for (let i = 0; i < qubits.length - 1; i++) {
      qops.cnot(qubits[i], qubits[i + 1]);
    }
  }
};

/**
 * QAOA Circuit for Max-Cut problems.
 * @param {Object} qops - The operations object.
 * @param {Array} qubits - Array of qubits.
 * @param {Array} edges - Array of [q1, q2] tuples representing the graph.
 * @param {number} gamma - Problem unitary parameter.
 * @param {number} beta - Mixing unitary parameter.
 */
export const qaoaLayer = (qops, qubits, edges, gamma, beta) => {
  edges.forEach(([u, v]) => {
    qops.cnot(u, v);
    qops.rz(v, 2 * gamma);
    qops.cnot(u, v);
  });

  qubits.forEach((q) => {
    qops.rx(q, 2 * beta);
  });
};

/**
 * Quantum Fourier Transform (Iterative Implementation).
 */
export const qft = (qops, qubits) => {
  const n = qubits.length;
  for (let i = 0; i < n; i++) {
    qops.h(qubits[i]);
    for (let j = i + 1; j < n; j++) {
      const theta = Math.PI / Math.pow(2, j - i);
      // Controlled-Phase decomposition using U3 (Phase) to avoid relative phase errors
      qops.u3(qubits[i], 0, 0, theta / 2);
      qops.cnot(qubits[i], qubits[j]);
      qops.u3(qubits[j], 0, 0, -theta / 2);
      qops.cnot(qubits[i], qubits[j]);
      qops.u3(qubits[j], 0, 0, theta / 2);
    }
  }
  for (let i = 0; i < Math.floor(n / 2); i++) {
    qops.swap(qubits[i], qubits[n - 1 - i]);
  }
};

/**
 * Inverse Quantum Fourier Transform.
 */
export const inverseQft = (qops, qubits) => {
  const n = qubits.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    qops.swap(qubits[i], qubits[n - 1 - i]);
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = n - 1; j > i; j--) {
      const theta = -Math.PI / Math.pow(2, j - i);
      qops.u3(qubits[i], 0, 0, theta / 2);
      qops.cnot(qubits[i], qubits[j]);
      qops.u3(qubits[j], 0, 0, -theta / 2);
      qops.cnot(qubits[i], qubits[j]);
      qops.u3(qubits[j], 0, 0, theta / 2);
    }
    qops.h(qubits[i]);
  }
};

/**
 * Bernstein-Vazirani Algorithm.
 * Finds a hidden bitstring 's' in one query.
 */
export const runBernsteinVazirani = (qops, qubits, ancilla, oracle) => {
  qubits.forEach((q) => qops.h(q));
  qops.x(ancilla);
  qops.h(ancilla);

  oracle(qops, qubits, ancilla);

  qubits.forEach((q) => qops.h(q));
  return qubits.map((q) => qops.m(q));
};

/**
 * Deutsch-Jozsa Algorithm.
 * Determines if a function is constant or balanced.
 */
export const runDeutschJozsa = (qops, qubits, ancilla, oracle) => {
  qubits.forEach((q) => qops.h(q));
  qops.x(ancilla);
  qops.h(ancilla);

  oracle(qops, qubits, ancilla);

  qubits.forEach((q) => qops.h(q));
  const results = qubits.map((q) => qops.m(q));
  return results.every((r) => r === 0) ? "constant" : "balanced";
};

/**
 * Standard Quantum Phase Estimation.
 * @param {Object} qops - The operations object.
 * @param {Array} countingQubits - Qubits used for precision.
 * @param {Array} targetQubits - Qubits containing the eigenstate.
 * @param {Function} controlledU - Function: (ops, control, targets, power) => { ... }
 */
export const quantumPhaseEstimation = (
  qops,
  countingQubits,
  targetQubits,
  controlledU
) => {
  countingQubits.forEach((q) => qops.h(q));

  countingQubits.forEach((q, i) => {
    const power = Math.pow(2, countingQubits.length - 1 - i);
    controlledU(qops, q, targetQubits, power);
  });

  inverseQft(qops, countingQubits);
  return countingQubits.map((q) => qops.m(q));
};
