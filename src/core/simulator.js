import { GATES } from "./gate-defs.js";

/**
 * Sparse quantum state simulator with arbitrary qubit count.
 *
 * State representation: Map<bigint, Float64Array(2)>
 *   - Key:   basis state index as a JavaScript BigInt (arbitrary precision).
 *            Each bit position corresponds to one qubit's |0⟩/|1⟩ value.
 *   - Value: [real, imag] complex amplitude stored in a two-element Float64Array.
 *
 * This replaces the previous BigUint64Array-based design, removing the hard
 * 64-qubit ceiling. Qubit count is now limited only by available memory and
 * the sparsity of the circuit being simulated.
 *
 * Scatter-logic execution is preserved: each gate iterates over active
 * (non-zero) state entries once, scattering contributions into a fresh Map
 * for the next state. Complexity is O(S) where S is the number of active
 * amplitudes.
 */
export class Simulator {
  /** @type {Map<bigint, Float64Array>} Sparse state vector */
  #state = new Map();

  /** @type {Map<symbol, number>} Qubit symbol → bit-position index */
  #qubitMap;

  #noiseModel;
  #results = new Map();

  /**
   * Number of active amplitudes above which adaptive pruning tightens.
   * Mirrors the original memory-budget heuristic.
   */
  #memoryBudget = 5000;

  /** Manual epsilon override for isZero() checks. */
  #epsilon = null;

  /**
   * @param {symbol[]} qubits     - Ordered array of qubit symbols.
   * @param {NoiseModel|null} noiseModel
   * @param {{epsilon?: number}} options
   */
  constructor(qubits, noiseModel = null, options = {}) {
    this.#qubitMap = new Map(qubits.map((q, i) => [q, i]));
    this.#noiseModel = noiseModel;
    this.#epsilon = options.epsilon ?? null;

    // Start in the |0...0⟩ ground state.
    this.#state.set(0n, new Float64Array([1.0, 0.0]));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Returns the BigInt bitmask for a qubit (1n << position). */
  #bit(qubitId) {
    return 1n << BigInt(this.#qubitMap.get(qubitId));
  }

  /**
   * Accumulates a complex contribution (re, im) into a new sparse state map
   * at key `idx`, creating the entry if it does not yet exist.
   */
  #acc(nextState, idx, re, im) {
    let amp = nextState.get(idx);
    if (amp === undefined) {
      nextState.set(idx, (amp = new Float64Array(2)));
    }
    amp[0] += re;
    amp[1] += im;
  }

  /** Adaptive pruning threshold tightens as state grows past the budget. */
  #pruneThreshold() {
    const over = Math.max(1, this.#state.size / this.#memoryBudget);
    return 1e-15 * over;
  }

  #getEffectiveEpsilon() {
    return this.#epsilon !== null ? this.#epsilon : this.#pruneThreshold() * 100;
  }

  /** Removes near-zero amplitudes from the current state. */
  #prune() {
    const threshold = this.#pruneThreshold();
    for (const [idx, amp] of this.#state) {
      if (amp[0] * amp[0] + amp[1] * amp[1] < threshold) {
        this.#state.delete(idx);
      }
    }
  }

  /** Re-normalises the state vector in-place. */
  #normalize() {
    let normSq = 0;
    for (const amp of this.#state.values()) {
      normSq += amp[0] * amp[0] + amp[1] * amp[1];
    }
    if (normSq === 0) return;
    const norm = Math.sqrt(normSq);
    for (const amp of this.#state.values()) {
      amp[0] /= norm;
      amp[1] /= norm;
    }
  }

  /** Probability that qubit `qubitId` is measured as |1⟩. */
  #getProb1(qubitId) {
    const target = this.#bit(qubitId);
    let prob = 0;
    for (const [idx, amp] of this.#state) {
      if (idx & target) {
        prob += amp[0] * amp[0] + amp[1] * amp[1];
      }
    }
    return prob;
  }

  /**
   * Collapses the state onto the sub-space consistent with measuring `result`
   * for `qubitId`, then re-normalises.
   *
   * @param {symbol} qubitId
   * @param {0|1}    result   - The measurement outcome.
   * @param {number} prob1    - The probability of measuring |1⟩ (possibly
   *                           after readout-error flip).
   */
  #collapse(qubitId, result, prob1) {
    const target = this.#bit(qubitId);
    const norm = Math.sqrt(Math.max(result === 1 ? prob1 : 1 - prob1, 1e-15));

    for (const [idx, amp] of this.#state) {
      const bitSet = !!(idx & target);
      if (bitSet !== (result === 1)) {
        this.#state.delete(idx);
      } else {
        amp[0] /= norm;
        amp[1] /= norm;
      }
    }
  }

  // ─── Noise ────────────────────────────────────────────────────────────────

  #applyStochasticNoise(qubit) {
    const targets = Array.isArray(qubit) ? qubit : [qubit];
    const { gateError, t1, t2 } = this.#noiseModel;

    for (const q of targets) {
      const bit = this.#bit(q);

      // Bit-flip (Pauli-X) channel.
      if (gateError > 0 && Math.random() < gateError) {
        const flipped = new Map();
        for (const [idx, amp] of this.#state) {
          flipped.set(idx ^ bit, amp);
        }
        this.#state = flipped;
      }

      // Phase-flip (Pauli-Z) channel.
      if (t2 > 0 && Math.random() < t2) {
        for (const [idx, amp] of this.#state) {
          if (idx & bit) {
            amp[0] = -amp[0];
            amp[1] = -amp[1];
          }
        }
      }

      // Amplitude-damping (T1: |1⟩ → |0⟩) channel.
      if (t1 > 0) {
        const p1 = this.#getProb1(q);
        if (p1 > 0 && Math.random() < t1 * p1) {
          // Quantum jump: collapse to |1⟩ then flip to |0⟩.
          this.#collapse(q, 1, p1);
          const damped = new Map();
          for (const [idx, amp] of this.#state) {
            damped.set(idx ^ bit, amp);
          }
          this.#state = damped;
        } else {
          // No jump: scale |1⟩ components and re-normalise.
          const scale = Math.sqrt(1 - t1);
          for (const [idx, amp] of this.#state) {
            if (idx & bit) {
              amp[0] *= scale;
              amp[1] *= scale;
            }
          }
          this.#normalize();
        }
      }
    }
  }

  // ─── Gate Application ─────────────────────────────────────────────────────

  /**
   * Applies a single-qubit gate using scatter-logic.
   * Special-cased for Z (diagonal) to avoid building output index pairs.
   */
  applyGate(gateName, qubitId, params = []) {
    const targetBit = this.#bit(qubitId);
    let matrix = GATES[gateName];
    if (typeof matrix === "function") matrix = matrix(...params);

    const next = new Map();

    for (const [idx, amp] of this.#state) {
      const re = amp[0];
      const im = amp[1];

      // Diagonal fast-path: Z only flips the sign for |1⟩ states.
      if (gateName === "Z") {
        const sign = (idx & targetBit) ? -1 : 1;
        this.#acc(next, idx, re * sign, im * sign);
        continue;
      }

      // General 2×2 unitary.
      const col  = (idx & targetBit) ? 1 : 0;
      const base = idx & ~targetBit;

      for (let row = 0; row < 2; row++) {
        const tIdx = row === 0 ? base : (base | targetBit);
        const g    = (row * 2 + col) * 2;
        this.#acc(next, tIdx,
          re * matrix[g] - im * matrix[g + 1],
          re * matrix[g + 1] + im * matrix[g],
        );
      }
    }

    this.#state = next;
    this.#prune();
  }

  /**
   * Applies a two-qubit gate.
   * Fast-paths for CNOT, SWAP (permutation-only) and CZ (diagonal).
   * Falls through to the general 4×4 unitary scatter for everything else.
   */
  apply2QubitGate(gateName, q1, q2, params = []) {
    const bit1 = this.#bit(q1);
    const bit2 = this.#bit(q2);
    const mask = bit1 | bit2;

    let matrix = GATES[gateName];
    if (typeof matrix === "function") matrix = matrix(...params);

    const next = new Map();

    for (const [idx, amp] of this.#state) {
      const re = amp[0];
      const im = amp[1];

      if (gateName === "CZ") {
        const sign = (idx & mask) === mask ? -1 : 1;
        this.#acc(next, idx, re * sign, im * sign);
        continue;
      }

      if (gateName === "CNOT") {
        this.#acc(next, (idx & bit1) ? (idx ^ bit2) : idx, re, im);
        continue;
      }

      if (gateName === "SWAP") {
        const b1 = !!(idx & bit1);
        const b2 = !!(idx & bit2);
        this.#acc(next, b1 !== b2 ? (idx ^ mask) : idx, re, im);
        continue;
      }

      // General 4×4 unitary.
      const col     = Number((idx & bit1 ? 2n : 0n) | (idx & bit2 ? 1n : 0n));
      const base    = idx & ~mask;
      const offsets = [0n, bit2, bit1, mask];

      for (let row = 0; row < 4; row++) {
        const g = (row * 4 + col) * 2;
        this.#acc(next, base | offsets[row],
          re * matrix[g] - im * matrix[g + 1],
          re * matrix[g + 1] + im * matrix[g],
        );
      }
    }

    this.#state = next;
    this.#prune();
  }

  /**
   * Applies a three-qubit gate via the general 8×8 unitary scatter path.
   */
  apply3QubitGate(gateName, q1, q2, q3, params = []) {
    const bit1 = this.#bit(q1);
    const bit2 = this.#bit(q2);
    const bit3 = this.#bit(q3);
    const mask = bit1 | bit2 | bit3;

    let matrix = GATES[gateName];
    if (typeof matrix === "function") matrix = matrix(...params);

    const next    = new Map();
    const offsets = [0n, bit3, bit2, bit2 | bit3, bit1, bit1 | bit3, bit1 | bit2, mask];

    for (const [idx, amp] of this.#state) {
      const re   = amp[0];
      const im   = amp[1];
      const col  = Number((idx & bit1 ? 4n : 0n) | (idx & bit2 ? 2n : 0n) | (idx & bit3 ? 1n : 0n));
      const base = idx & ~mask;

      for (let row = 0; row < 8; row++) {
        const g = (row * 8 + col) * 2;
        this.#acc(next, base | offsets[row],
          re * matrix[g] - im * matrix[g + 1],
          re * matrix[g + 1] + im * matrix[g],
        );
      }
    }

    this.#state = next;
    this.#prune();
  }

  // ─── Measurement ──────────────────────────────────────────────────────────

  /**
   * Measures a qubit, collapses the state, and returns 0 or 1.
   * Optionally applies readout-error noise before sampling.
   */
  measure(qubitId) {
    let prob1 = this.#getProb1(qubitId);

    if (this.#noiseModel?.readoutError > 0 && Math.random() < this.#noiseModel.readoutError) {
      prob1 = 1 - prob1;
    }

    const result = Math.random() < prob1 ? 1 : 0;
    this.#collapse(qubitId, result, prob1);
    return result;
  }

  // ─── Execution ────────────────────────────────────────────────────────────

  /** Executes a compiled instruction list against the current state. */
  run(instructions) {
    for (const op of instructions) {
      let applyNoise = !!this.#noiseModel;
      const params = op.params || [];

      if (op.gate === "IF") {
        if (this.#results.get(op.condition.qubit) === op.condition.value) {
          this.run(op.body);
        }
        continue;
      }

      if (op.gate === "WHILE") {
        while (this.#results.get(op.condition.qubit) === op.condition.value) {
          this.run(op.body);
        }
        continue;
      }

      if (Array.isArray(op.qubit)) {
        if (op.qubit.length === 3) {
          this.apply3QubitGate(op.gate, op.qubit[0], op.qubit[1], op.qubit[2], params);
        } else {
          this.apply2QubitGate(op.gate, op.qubit[0], op.qubit[1], params);
        }
      } else if (op.gate === "RESET") {
        if (this.measure(op.qubit) === 1) this.applyGate("X", op.qubit);
        this.#prune();
        applyNoise = false;
      } else if (op.gate === "MEASURE") {
        this.#results.set(op.qubit, this.measure(op.qubit));
        this.#prune();
        applyNoise = false;
      } else {
        this.applyGate(op.gate, op.qubit, params);
      }

      if (applyNoise) {
        this.#applyStochasticNoise(op.qubit);
        this.#prune();
      }
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  getResult(qubitId) {
    return this.#results.get(qubitId);
  }

  /**
   * Returns true if the qubit's |1⟩ probability is below the effective
   * epsilon threshold used by QubitManager to enforce safe reset before
   * scope exit.
   */
  isZero(qubitId) {
    return this.#getProb1(qubitId) < this.#getEffectiveEpsilon();
  }

  /**
   * Returns the current sparse state vector sorted by basis-state index.
   * Useful for debugging, visualisation, and expectation-value calculations.
   *
   * @returns {Array<{index: bigint, re: number, im: number, probability: number}>}
   */
  getAmplitudes() {
    return [...this.#state.entries()]
      .map(([index, amp]) => ({
        index,
        re:          amp[0],
        im:          amp[1],
        probability: amp[0] ** 2 + amp[1] ** 2,
      }))
      .sort((a, b) => (a.index < b.index ? -1 : 1));
  }

  /**
   * The number of non-zero basis states currently tracked.
   * Reflects state-vector sparsity and memory pressure.
   */
  get stateSize() {
    return this.#state.size;
  }
}