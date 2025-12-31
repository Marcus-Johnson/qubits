const INV_SQRT2 = 1 / Math.sqrt(2);

export const GATES = {
  // Hadamard Gate (Symmetric)
  H: new Float64Array([
    INV_SQRT2, 0, INV_SQRT2, 0,
    INV_SQRT2, 0, -INV_SQRT2, 0,
  ]),

  // Pauli-X (NOT) Gate (Symmetric)
  X: new Float64Array([0, 0, 1, 0, 1, 0, 0, 0]),

  // Pauli-Y Gate: [[0, -i], [i, 0]]
  Y: new Float64Array([0, 0, 0, -1, 0, 1, 0, 0]),

  // Pauli-Z Gate (Symmetric)
  Z: new Float64Array([1, 0, 0, 0, 0, 0, -1, 0]),

  // Rotation around X-axis: [[cos(t/2), -i*sin(t/2)], [-i*sin(t/2), cos(t/2)]]
  RX: (theta) => {
    const c = Math.cos(theta / 2);
    const s = -Math.sin(theta / 2);
    return new Float64Array([c, 0, 0, s, 0, s, c, 0]);
  },

  // Rotation around Y-axis: [[cos(t/2), -sin(t/2)], [sin(t/2), cos(t/2)]]
  RY: (theta) => {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    return new Float64Array([c, 0, -s, 0, s, 0, c, 0]);
  },

  // Rotation around Z-axis: [[exp(-it/2), 0], [0, exp(it/2)]]
  RZ: (theta) => {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    return new Float64Array([c, -s, 0, 0, 0, 0, c, s]);
  },

  /**
   * Universal Unitary Gate (U3) - Corrected to Row-Major Order.
   * Matrix: [[cos(t/2), -exp(i*lambda)*sin(t/2)], [exp(i*phi)*sin(t/2), exp(i*(phi+lambda))*cos(t/2)]]
   */
  U3: (theta, phi, lambda) => {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    return new Float64Array([
      c, 0,                                     // g00
      -s * Math.cos(lambda), -s * Math.sin(lambda), // g01 (Row-Major Fix)
      s * Math.cos(phi), s * Math.sin(phi),         // g10 (Row-Major Fix)
      c * Math.cos(phi + lambda), c * Math.sin(phi + lambda) // g11
    ]);
  },

  // Controlled-NOT Gate (q1 control, q2 target)
  CNOT: new Float64Array([
    1, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 1, 0,
    0, 0, 0, 0, 1, 0, 0, 0,
  ]),

  // Controlled-Z Gate
  CZ: new Float64Array([
    1, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, -1, 0,
  ]),

  // SWAP Gate
  SWAP: new Float64Array([
    1, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 1, 0,
  ]),

  // Phase Gate (S)
  S: new Float64Array([1, 0, 0, 0, 0, 0, 0, 1]),

  // T Gate
  T: new Float64Array([
    1, 0, 0, 0,
    0, 0, Math.cos(Math.PI / 4), Math.sin(Math.PI / 4),
  ]),

  // RZZ Gate: Parameterized ZZ rotation
  RZZ: (theta) => {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    return new Float64Array([
      c, -s, 0, 0, 0, 0, 0, 0,
      0, 0, c, s, 0, 0, 0, 0,
      0, 0, 0, 0, c, s, 0, 0,
      0, 0, 0, 0, 0, 0, c, -s,
    ]);
  },

  // Toffoli (CCX) Gate
  CCX: new Float64Array([
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,
    0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,
  ]),
};