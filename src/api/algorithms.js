/**
 * Algorithm Library
 *
 * Pre-built quantum algorithms built on top of the operations API.
 * All algorithms expect qubits to be in a clean |0⟩ state on entry and leave
 * them in a measured/reset state, callers are responsible for final resets.
 */

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Grover's Search Algorithm.
 * Amplifies the amplitude of marked states via iterated oracle + diffusion.
 *
 * @param {Operations} qops
 * @param {symbol[]}   qubits - Search register.
 * @param {Function}   oracle - (ops, qubits) => void  Marks the target state.
 * @returns {number[]} Measurement outcomes.
 */
export const runGrover = (qops, qubits, oracle) => {
  qubits.forEach((q) => qops.h(q));

  const iterations = Math.floor((Math.PI / 4) * Math.sqrt(2 ** qubits.length));

  for (let i = 0; i < iterations; i++) {
    oracle(qops, qubits);

    // Grover diffusion operator.
    qubits.forEach((q) => qops.h(q));
    qubits.forEach((q) => qops.x(q));
    qops.cz(qubits[qubits.length - 2], qubits[qubits.length - 1]);
    qubits.forEach((q) => qops.x(q));
    qubits.forEach((q) => qops.h(q));
  }

  return qubits.map((q) => qops.m(q));
};

// ─── Phase Estimation ─────────────────────────────────────────────────────────

/**
 * Iterative Phase Estimation using mid-circuit measurements.
 *
 * @param {Operations} qops
 * @param {symbol}     aux          - Single auxiliary qubit (reset after each bit).
 * @param {symbol}     target       - Eigenstate register.
 * @param {number}     precision    - Number of phase bits to extract.
 * @param {Function}   controlledU  - (ops, ctrl, target, power) => void
 * @returns {number[]} Phase bits (MSB first).
 */
export const iterativePhaseEstimation = (qops, aux, target, precision, controlledU) => {
  const phaseBits = [];

  for (let k = precision - 1; k >= 0; k--) {
    qops.reset(aux);
    qops.h(aux);

    phaseBits.forEach((bit, i) => {
      if (bit === 1) {
        qops.rz(aux, -Math.PI / 2 ** (i + 1));
      }
    });

    controlledU(qops, aux, target, 2 ** k);

    qops.h(aux);
    phaseBits.push(qops.m(aux));
  }

  return phaseBits;
};

/**
 * Standard (non-iterative) Quantum Phase Estimation.
 *
 * @param {Operations} qops
 * @param {symbol[]}   countingQubits - Precision register.
 * @param {symbol[]}   targetQubits   - Eigenstate register.
 * @param {Function}   controlledU    - (ops, ctrl, targets, power) => void
 * @returns {number[]} Measurement outcomes of the counting register.
 */
export const quantumPhaseEstimation = (qops, countingQubits, targetQubits, controlledU) => {
  countingQubits.forEach((q) => qops.h(q));

  countingQubits.forEach((q, i) => {
    const power = 2 ** (countingQubits.length - 1 - i);
    controlledU(qops, q, targetQubits, power);
  });

  inverseQft(qops, countingQubits);
  return countingQubits.map((q) => qops.m(q));
};

// ─── Quantum Fourier Transform ────────────────────────────────────────────────

/**
 * Quantum Fourier Transform (iterative decomposition via controlled-phase gates).
 *
 * @param {Operations} qops
 * @param {symbol[]}   qubits
 */
export const qft = (qops, qubits) => {
  const n = qubits.length;
  for (let i = 0; i < n; i++) {
    qops.h(qubits[i]);
    for (let j = i + 1; j < n; j++) {
      const theta = Math.PI / 2 ** (j - i);
      // Controlled-phase via RZ decomposition (avoids global-phase issues).
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
 *
 * @param {Operations} qops
 * @param {symbol[]}   qubits
 */
export const inverseQft = (qops, qubits) => {
  const n = qubits.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    qops.swap(qubits[i], qubits[n - 1 - i]);
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = n - 1; j > i; j--) {
      const theta = -Math.PI / 2 ** (j - i);
      qops.u3(qubits[i], 0, 0, theta / 2);
      qops.cnot(qubits[i], qubits[j]);
      qops.u3(qubits[j], 0, 0, -theta / 2);
      qops.cnot(qubits[i], qubits[j]);
      qops.u3(qubits[j], 0, 0, theta / 2);
    }
    qops.h(qubits[i]);
  }
};

// ─── Oracle Algorithms ───────────────────────────────────────────────────────

/**
 * Bernstein-Vazirani Algorithm.
 * Recovers a hidden bitstring `s` with a single oracle query.
 *
 * @param {Operations} qops
 * @param {symbol[]}   qubits   - Query register.
 * @param {symbol}     ancilla  - Ancilla qubit (initialised to |0⟩).
 * @param {Function}   oracle   - (ops, qubits, ancilla) => void
 * @returns {number[]} The hidden bitstring.
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
 * Distinguishes a constant from a balanced oracle in one query.
 *
 * @param {Operations} qops
 * @param {symbol[]}   qubits
 * @param {symbol}     ancilla
 * @param {Function}   oracle
 * @returns {"constant"|"balanced"}
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

// ─── Variational Algorithms ───────────────────────────────────────────────────

/**
 * Hardware-Efficient VQE Ansatz (2 layers of RY+RZ with CNOT entangling).
 *
 * @param {Operations} qops
 * @param {symbol[]}   qubits
 * @param {number[]}   params - Flat array of 4*n angles (2 per qubit per layer).
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
 * QAOA Cost + Mixer layer for Max-Cut.
 *
 * @param {Operations}  qops
 * @param {symbol[]}    qubits
 * @param {symbol[][]}  edges  - Graph edges as [u, v] pairs.
 * @param {number}      gamma  - Cost unitary angle.
 * @param {number}      beta   - Mixer unitary angle.
 */
export const qaoaLayer = (qops, qubits, edges, gamma, beta) => {
  for (const [u, v] of edges) {
    qops.cnot(u, v);
    qops.rz(v, 2 * gamma);
    qops.cnot(u, v);
  }
  qubits.forEach((q) => qops.rx(q, 2 * beta));
};