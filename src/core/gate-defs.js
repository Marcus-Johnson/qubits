/**
 * Gate matrix definitions.
 *
 * Storage format (row-major, complex interleaved):
 *   For an N×N unitary, entries are stored as [re0, im0, re1, im1, ...]
 *   where index (row * N + col) maps to Float64Array offset (row * N + col) * 2.
 *
 * Parameterised gates are factory functions returning a Float64Array.
 */

const INV_SQRT2 = 1 / Math.sqrt(2);

export const GATES = {
  // ─── Single-qubit basis gates ────────────────────────────────────────────

  H: new Float64Array([
    INV_SQRT2,  0,  INV_SQRT2,  0,
    INV_SQRT2,  0, -INV_SQRT2,  0,
  ]),

  X: new Float64Array([0, 0, 1, 0, 1, 0, 0, 0]),

  // Y = [[0, -i], [i, 0]]
  Y: new Float64Array([0, 0, 0, -1, 0, 1, 0, 0]),

  Z: new Float64Array([1, 0, 0, 0, 0, 0, -1, 0]),

  // Phase gate S = diag(1, i)
  S: new Float64Array([1, 0, 0, 0, 0, 0, 0, 1]),

  // T gate = diag(1, e^{iπ/4})
  T: new Float64Array([
    1, 0, 0, 0,
    0, 0, Math.cos(Math.PI / 4), Math.sin(Math.PI / 4),
  ]),

  // ─── Parameterised single-qubit rotations ────────────────────────────────

  /** RX(θ) = [[cos θ/2, -i sin θ/2], [-i sin θ/2, cos θ/2]] */
  RX: (theta) => {
    const c = Math.cos(theta / 2);
    const s = -Math.sin(theta / 2);
    return new Float64Array([c, 0, 0, s, 0, s, c, 0]);
  },

  /** RY(θ) = [[cos θ/2, -sin θ/2], [sin θ/2, cos θ/2]] */
  RY: (theta) => {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    return new Float64Array([c, 0, -s, 0, s, 0, c, 0]);
  },

  /** RZ(θ) = [[e^{-iθ/2}, 0], [0, e^{iθ/2}]] */
  RZ: (theta) => {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    return new Float64Array([c, -s, 0, 0, 0, 0, c, s]);
  },

  /**
   * Universal single-qubit gate U3(θ, φ, λ).
   * U3 = [[cos θ/2,  -e^{iλ} sin θ/2],
   *        [e^{iφ} sin θ/2,  e^{i(φ+λ)} cos θ/2]]
   */
  U3: (theta, phi, lambda) => {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    return new Float64Array([
      c,                     0,
      -s * Math.cos(lambda), -s * Math.sin(lambda),
       s * Math.cos(phi),     s * Math.sin(phi),
       c * Math.cos(phi + lambda), c * Math.sin(phi + lambda),
    ]);
  },

  // ─── Two-qubit gates ─────────────────────────────────────────────────────

  // CNOT handled via fast permutation path in the simulator.
  CNOT: new Float64Array([
    1, 0,  0, 0,  0, 0,  0, 0,
    0, 0,  1, 0,  0, 0,  0, 0,
    0, 0,  0, 0,  0, 0,  1, 0,
    0, 0,  0, 0,  1, 0,  0, 0,
  ]),

  // CZ handled via diagonal fast path in the simulator.
  CZ: new Float64Array([
    1, 0,  0, 0,  0, 0,  0, 0,
    0, 0,  1, 0,  0, 0,  0, 0,
    0, 0,  0, 0,  1, 0,  0, 0,
    0, 0,  0, 0,  0, 0, -1, 0,
  ]),

  // SWAP handled via fast permutation path in the simulator.
  SWAP: new Float64Array([
    1, 0,  0, 0,  0, 0,  0, 0,
    0, 0,  0, 0,  1, 0,  0, 0,
    0, 0,  1, 0,  0, 0,  0, 0,
    0, 0,  0, 0,  0, 0,  1, 0,
  ]),

  /** RZZ(θ) = exp(-i θ/2 Z⊗Z) */
  RZZ: (theta) => {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    return new Float64Array([
      c, -s,  0,  0,  0,  0,  0,  0,
      0,  0,  c,  s,  0,  0,  0,  0,
      0,  0,  0,  0,  c,  s,  0,  0,
      0,  0,  0,  0,  0,  0,  c, -s,
    ]);
  },

  // ─── Three-qubit gates ───────────────────────────────────────────────────

  /**
   * Toffoli / CCX gate.
   * Bit ordering: q1 = MSB (control 1), q2 = middle (control 2), q3 = LSB (target).
   * Swaps rows 6 (|110⟩) and 7 (|111⟩) to flip the target when both controls are |1⟩.
   */
  CCX: new Float64Array([
    1,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0,
    0,0, 1,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0,
    0,0, 0,0, 1,0, 0,0, 0,0, 0,0, 0,0, 0,0,
    0,0, 0,0, 0,0, 1,0, 0,0, 0,0, 0,0, 0,0,
    0,0, 0,0, 0,0, 0,0, 1,0, 0,0, 0,0, 0,0,
    0,0, 0,0, 0,0, 0,0, 0,0, 1,0, 0,0, 0,0,
    0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 1,0,
    0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 1,0, 0,0,
  ]),
};