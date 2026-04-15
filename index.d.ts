export declare class NoiseModel {
  constructor(params?: {
    /** Probability of a Pauli-X bit-flip after any gate (0–1). */
    gateError?: number;
    /** Probability of flipping a measurement result (0–1). */
    readoutError?: number;
    /** Amplitude Damping probability |1⟩ → |0⟩ (0–1). */
    t1?: number;
    /** Phase Damping probability Pauli-Z flip (0–1). */
    t2?: number;
  });
  gateError:    number;
  readoutError: number;
  t1:           number;
  t2:           number;
}

export interface Operations {
  // ── Single-qubit gates ──────────────────────────────────────────────────
  h(q: symbol): void;
  x(q: symbol): void;
  y(q: symbol): void;
  z(q: symbol): void;
  s(q: symbol): void;
  t(q: symbol): void;
  rx(q: symbol, theta: number): void;
  ry(q: symbol, theta: number): void;
  rz(q: symbol, theta: number): void;
  u3(q: symbol, theta: number, phi: number, lambda: number): void;

  // ── Multi-qubit gates ───────────────────────────────────────────────────
  cnot(ctrl: symbol, trgt: symbol): void;
  cz(ctrl: symbol, trgt: symbol): void;
  rzz(q1: symbol, q2: symbol, theta: number): void;
  swap(q1: symbol, q2: symbol): void;
  ccx(c1: symbol, c2: symbol, t: symbol): void;

  // ── Lifecycle ───────────────────────────────────────────────────────────
  /** Actively resets a qubit to |0⟩. Must be called before scope exit. */
  reset(q: symbol): void;
  /** Measures a qubit (returns 0 or 1) and flushes pending operations. */
  m(q: symbol): number;

  // ── Classical control ───────────────────────────────────────────────────
  if(qubit: symbol, value: number, callback: (ops: Operations) => void): void;
  while(qubit: symbol, value: number, callback: (ops: Operations) => void): void;
}

/** Amplitude entry returned by Simulator.getAmplitudes(). */
export interface AmplitudeEntry {
  /** Basis-state index as an arbitrary-precision BigInt. */
  index:       bigint;
  re:          number;
  im:          number;
  probability: number;
}

export declare class Simulator {
  constructor(
    qubits: symbol[],
    noiseModel?: NoiseModel | null,
    options?: { epsilon?: number }
  );

  run(instructions: readonly object[]): void;
  applyGate(gateName: string, qubitId: symbol, params?: number[]): void;
  apply2QubitGate(gateName: string, q1: symbol, q2: symbol, params?: number[]): void;
  apply3QubitGate(gateName: string, q1: symbol, q2: symbol, q3: symbol, params?: number[]): void;
  measure(qubitId: symbol): 0 | 1;
  getResult(qubitId: symbol): 0 | 1 | undefined;

  /** True if the qubit's |1⟩ probability is below the epsilon threshold. */
  isZero(qubitId: symbol): boolean;

  /**
   * Returns the full sparse state vector sorted by basis-state index.
   * Useful for debugging, visualisation, and expectation-value calculations.
   */
  getAmplitudes(): AmplitudeEntry[];

  /** Number of non-zero basis states currently tracked. */
  readonly stateSize: number;
}

// ── CapturedCircuit ──────────────────────────────────────────────────────────

export interface GateStats {
  single:  number;
  two:     number;
  three:   number;
  measure: number;
  reset:   number;
}

export interface IonQCostEstimate extends GateStats {
  provider:               "ionq.aria" | "ionq.forte";
  shots:                  number;
  effectiveTwoQubitGates: number;
  errorMitigation:        boolean;
  estimatedUSD:           number;
}

export interface QuantinuumCostEstimate extends GateStats {
  provider:       "quantinuum.h2";
  shots:          number;
  spamOperations: number;
  estimatedHQC:   number;
}

export interface TimeBoundCostEstimate extends GateStats {
  provider: "rigetti" | "pasqal";
  shots:    number;
  note:     string;
}

export type CostEstimate = IonQCostEstimate | QuantinuumCostEstimate | TimeBoundCostEstimate;

export declare class CapturedCircuit {
  readonly qubitCount: number;
  getInstructions(): readonly object[];
  summary(): string;

  /** Structured gate counts by tier. */
  gateStats(): GateStats;

  /**
   * Estimates the execution cost on an Azure Quantum provider using the
   * published pricing formulas.
   *
   * IonQ AQT  = m + 0.000220·(N₁q·C) + 0.000975·(N₂q·C)
   * Quantinuum HQC = 5 + C·(N₁q + 10·N₂q + 5·Nₘ) / 5000
   */
  estimateCost(
    provider: "ionq.aria" | "ionq.forte" | "quantinuum.h2" | "rigetti" | "pasqal",
    shots?:   number,
    options?: { errorMitigation?: boolean },
  ): CostEstimate;

  toQASM2(): string;
  toQASM3(): string;
  toQuil():  string;

  /**
   * IonQ JSON (ionq.circuit.v1 / qis gateset) ready for Azure Quantum submission.
   * U3 → RZ·RY·RZ, RZZ → CNOT·RZ·CNOT, IF/WHILE/RESET silently dropped.
   */
  toIonQJSON(): string;
}

export declare const Q: {
  use(
    count:      number,
    callback:   (...args: [...symbol[], Operations]) => void,
    noiseModel?: NoiseModel | null
  ): void;

  circuit(
    count:    number,
    callback: (...args: [...symbol[], Operations]) => void
  ): CapturedCircuit;

  /**
   * Runs the circuit `numShots` times and returns a bitstring histogram.
   * The callback must return an array of 0|1 measurement results.
   *
   * @example
   * const hist = Q.shots(2, 1000, (q0, q1, ops) => {
   *   ops.h(q0); ops.cnot(q0, q1);
   *   const m0 = ops.m(q0); const m1 = ops.m(q1);
   *   ops.reset(q0); ops.reset(q1);
   *   return [m0, m1];
   * });
   * // → Map { '00' => ~500, '11' => ~500 }
   */
  shots(
    count:      number,
    numShots:   number,
    callback:   (...args: [...symbol[], Operations]) => (0 | 1)[],
    noiseModel?: NoiseModel | null
  ): Map<string, number>;
};

// ── Algorithm Library ────────────────────────────────────────────────────────

export declare function runGrover(
  qops:   Operations,
  qubits: symbol[],
  oracle: (ops: Operations, qs: symbol[]) => void
): number[];

export declare function iterativePhaseEstimation(
  qops:       Operations,
  aux:        symbol,
  target:     symbol,
  precision:  number,
  controlledU: (ops: Operations, ctrl: symbol, target: symbol, power: number) => void
): number[];

export declare function quantumPhaseEstimation(
  qops:           Operations,
  countingQubits: symbol[],
  targetQubits:   symbol[],
  controlledU:    (ops: Operations, ctrl: symbol, targets: symbol[], power: number) => void
): number[];

export declare function qft(qops: Operations, qubits: symbol[]): void;
export declare function inverseQft(qops: Operations, qubits: symbol[]): void;

export declare function runBernsteinVazirani(
  qops:    Operations,
  qubits:  symbol[],
  ancilla: symbol,
  oracle:  (ops: Operations, qs: symbol[], a: symbol) => void
): number[];

export declare function runDeutschJozsa(
  qops:    Operations,
  qubits:  symbol[],
  ancilla: symbol,
  oracle:  (ops: Operations, qs: symbol[], a: symbol) => void
): "constant" | "balanced";

export declare function vqeAnsatz(
  qops:   Operations,
  qubits: symbol[],
  params: number[]
): void;

export declare function qaoaLayer(
  qops:   Operations,
  qubits: symbol[],
  edges:  [symbol, symbol][],
  gamma:  number,
  beta:   number
): void;