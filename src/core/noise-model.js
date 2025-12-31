export class NoiseModel {
  /**
   * @param {Object} params
   * @param {number} params.gateError - Standard bit-flip (Pauli-X) probability.
   * @param {number} params.readoutError - Measurement flip probability.
   * @param {number} params.t1 - Amplitude Damping probability (|1> -> |0>).
   * @param {number} params.t2 - Phase Damping probability (Pauli-Z flip).
   */
  constructor({
    gateError = 0.0,
    readoutError = 0.0,
    t1 = 0.0,
    t2 = 0.0,
  } = {}) {
    this.gateError = gateError;
    this.readoutError = readoutError;
    this.t1 = t1;
    this.t2 = t2;
  }
}