export declare class NoiseModel {
  /**
   * @param params Configuration for the noise profile.
   */
  constructor(params?: {
    /** Probability of an X-flip after any gate (0.0 to 1.0). */
    gateError?: number;
    /** Probability of flipping a measurement result (0.0 to 1.0). */
    readoutError?: number;
    /** Amplitude Damping probability (|1> -> |0>) (0.0 to 1.0). */
    t1?: number;
    /** Phase Damping probability (Pauli-Z flip) (0.0 to 1.0). */
    t2?: number;
  });
  gateError: number;
  readoutError: number;
  t1: number;
  t2: number;
}

export interface Operations {
  /** Applies a Hadamard gate. */
  h(q: symbol): void;
  /** Applies a Pauli-X (NOT) gate. */
  x(q: symbol): void;
  /** Applies a Pauli-Y gate. */
  y(q: symbol): void;
  /** Applies a Pauli-Z gate. */
  z(q: symbol): void;
  /** Applies a Phase gate (S). */
  s(q: symbol): void;
  /** Applies a T gate (45-degree rotation). */
  t(q: symbol): void;

  /** Applies a rotation around the X-axis by theta (radians). */
  rx(q: symbol, theta: number): void;
  /** Applies a rotation around the Y-axis by theta (radians). */
  ry(q: symbol, theta: number): void;
  /** Applies a rotation around the Z-axis by theta (radians). */
  rz(q: symbol, theta: number): void;
  /** Applies a universal U3 gate. */
  u3(q: symbol, theta: number, phi: number, lambda: number): void;

  /** Applies a Controlled-NOT gate. */
  cnot(ctrl: symbol, trgt: symbol): void;
  /** Applies a Controlled-Z gate. */
  cz(ctrl: symbol, trgt: symbol): void;
  /** Applies a parameterized ZZ rotation. */
  rzz(q1: symbol, q2: symbol, theta: number): void;
  /** Swaps the states of two qubits. */
  swap(q1: symbol, q2: symbol): void;
  /** Applies a Toffoli (CCX) gate. */
  ccx(c1: symbol, c2: symbol, t: symbol): void;

  /** Actively resets a qubit to the |0> state. Required before scope end. */
  reset(q: symbol): void;
  /** Measures a qubit, returns 0 or 1, and flushes pending operations. */
  m(q: symbol): number;

  /** Executes a callback if the last measurement of 'qubit' equals 'value'. */
  if(qubit: symbol, value: number, callback: (ops: Operations) => void): void;
  /** Repeatedly executes a callback while the measurement of 'qubit' equals 'value'. */
  while(
    qubit: symbol,
    value: number,
    callback: (ops: Operations) => void
  ): void;
}

export declare const Q: {
  /**
   * Entry point for quantum programs. Handles allocation and safety checks.
   */
  use(
    count: number,
    callback: (...args: [...symbol[], Operations]) => void,
    noiseModel?: NoiseModel | null
  ): void;
};

/** Algorithm Library **/
export declare function runGrover(
  qops: Operations,
  qubits: symbol[],
  oracle: (ops: Operations, qs: symbol[]) => void
): number[];
export declare function iterativePhaseEstimation(
  qops: Operations,
  aux: symbol,
  target: symbol,
  precision: number,
  controlledU: Function
): number[];
export declare function quantumPhaseEstimation(
  qops: Operations,
  countingQubits: symbol[],
  targetQubits: symbol[],
  controlledU: Function
): number[];
export declare function qft(qops: Operations, qubits: symbol[]): void;
export declare function inverseQft(qops: Operations, qubits: symbol[]): void;
export declare function runBernsteinVazirani(
  qops: Operations,
  qubits: symbol[],
  ancilla: symbol,
  oracle: Function
): number[];
export declare function runDeutschJozsa(
  qops: Operations,
  qubits: symbol[],
  ancilla: symbol,
  oracle: Function
): "constant" | "balanced";
