export class NoiseModel {
  /**
   * @param {Object} params
   * @param {number} [params.gateError=0]    - Pauli-X (bit-flip) probability after each gate.
   * @param {number} [params.readoutError=0] - Probability of flipping a measurement result.
   * @param {number} [params.t1=0]           - Amplitude damping probability (|1⟩ → |0⟩).
   * @param {number} [params.t2=0]           - Phase damping probability (Pauli-Z flip).
   */
  constructor({
    gateError    = 0.0,
    readoutError = 0.0,
    t1           = 0.0,
    t2           = 0.0,
  } = {}) {
    this.gateError    = gateError;
    this.readoutError = readoutError;
    this.t1           = t1;
    this.t2           = t2;
  }
}