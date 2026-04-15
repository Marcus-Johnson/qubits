import { toQASM2   } from "./exporters/qasm2.js";
import { toQASM3   } from "./exporters/qasm3.js";
import { toQuil    } from "./exporters/quil.js";
import { toIonQJSON } from "./exporters/ionq.js";

/**
 * A circuit that has been captured via Q.circuit() without being executed.
 *
 * Holds the raw (pre-compilation) instruction list gate names like H, CNOT,
 * RX are preserved rather than decomposed to U3 and exposes export methods
 * that convert it to formats accepted by real quantum hardware.
 *
 * Format → Platform support:
 *   toQASM2()  →  IBM Quantum (legacy), Amazon Braket, IonQ (via Braket/Azure)
 *   toQASM3()  →  IBM Quantum (new), Amazon Braket, Azure Quantum, IonQ
 *   toQuil()   →  Rigetti QCS
 */
export class CapturedCircuit {
  /** @type {symbol[]} */
  #qubits;

  /** @type {Map<symbol,number>} */
  #qubitIndex;

  /** @type {readonly object[]} */
  #instructions;

  /**
   * @param {symbol[]}        qubits       - Ordered qubit symbols from the scope.
   * @param {readonly object[]} instructions - Accumulated raw IR.
   */
  constructor(qubits, instructions) {
    this.#qubits      = qubits;
    this.#qubitIndex  = new Map(qubits.map((q, i) => [q, i]));
    this.#instructions = Object.freeze([...instructions]);
  }

  // ─── Introspection ────────────────────────────────────────────────────────

  /** Number of qubits in this circuit. */
  get qubitCount() {
    return this.#qubits.length;
  }

  /**
   * Raw instruction list (frozen).  Gate names are as written by the user
   * H, CNOT, RX etc. not transpiled to U3/CNOT.
   */
  getInstructions() {
    return this.#instructions;
  }

  /**
   * Returns a human-readable summary of the circuit.
   * Counts gate types (excluding control-flow meta-ops).
   */
  summary() {
    const counts = {};
    const walk = (instrs) => {
      for (const op of instrs) {
        if (op.gate && op.gate !== "IF" && op.gate !== "WHILE") {
          counts[op.gate] = (counts[op.gate] || 0) + 1;
        }
        if (op.body) walk(op.body);
      }
    };
    walk(this.#instructions);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const breakdown = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([g, n]) => `${g}×${n}`)
      .join("  ");

    return `CapturedCircuit: ${this.#qubits.length} qubits, ${total} gates  [${breakdown}]`;
  }

  // ─── Analysis ─────────────────────────────────────────────────────────────

  /**
   * Returns structured gate counts by tier, useful for cost estimation and
   * circuit profiling.
   *
   * @returns {{
   *   single: number,
   *   two:    number,
   *   three:  number,
   *   measure: number,
   *   reset:  number,
   * }}
   */
  gateStats() {
    const SINGLE = new Set(["H","X","Y","Z","S","T","RX","RY","RZ","U3"]);
    const TWO    = new Set(["CNOT","CZ","SWAP","RZZ"]);
    const THREE  = new Set(["CCX"]);

    const counts = { single: 0, two: 0, three: 0, measure: 0, reset: 0 };

    const walk = (instrs) => {
      for (const op of instrs) {
        if      (SINGLE.has(op.gate))     counts.single++;
        else if (TWO.has(op.gate))        counts.two++;
        else if (THREE.has(op.gate))      counts.three++;
        else if (op.gate === "MEASURE")   counts.measure++;
        else if (op.gate === "RESET")     counts.reset++;
        if (op.body) walk(op.body);
      }
    };
    walk(this.#instructions);
    return counts;
  }

  /**
   * Estimates the cost of executing this circuit on an Azure Quantum provider
   * using the published pricing formulas.
   *
   * Supported providers:
   *   "ionq.aria"        IonQ Aria 1 (25q).    Returns { estimatedUSD }
   *   "ionq.forte"       IonQ Forte 1 / FE1.   Returns { estimatedUSD }
   *   "quantinuum.h2"    Quantinuum H2.         Returns { estimatedHQC }
   *   "rigetti"          Rigetti Ankaa-3.       Returns { note } (time-based, not estimable)
   *   "pasqal"           PASQAL Fresnel.        Returns { note } (time-based, not estimable)
   *
   * Pricing formulas (from Azure Quantum documentation):
   *
   *   IonQ AQT = m + 0.000220·(N₁q·C) + 0.000975·(N₂q·C)
   *   where m = $97.50 (default, error mitigation on) or $12.4167 (off)
   *   CCX gates are billed as 6·(N−2) = 12 two-qubit gates.
   *
   *   Quantinuum HQC = 5 + C·(N₁q + 10·N₂q + 5·Nₘ) / 5000
   *   where Nₘ = MEASURE + RESET + initial state preparations (qubitCount).
   *
   * @param {"ionq.aria"|"ionq.forte"|"quantinuum.h2"|"rigetti"|"pasqal"} provider
   * @param {number} shots   - Number of circuit executions (default: 1000).
   * @param {{ errorMitigation?: boolean }} options
   * @returns {object}
   */
  estimateCost(provider, shots = 1000, { errorMitigation = true } = {}) {
    const stats = this.gateStats();

    switch (provider) {
      case "ionq.aria": {
        const eff2q    = stats.two + stats.three * 12;
        const minimum  = errorMitigation ? 97.50 : 12.4167;
        const variable = 0.000220 * stats.single * shots
                       + 0.000975 * eff2q        * shots;
        return {
          provider,
          shots,
          ...stats,
          effectiveTwoQubitGates: eff2q,
          errorMitigation,
          estimatedUSD: Math.max(minimum, variable),
        };
      }

      case "ionq.forte": {
        const eff2q    = stats.two + stats.three * 12;
        const minimum  = errorMitigation ? 168.195 : 25.7899;
        const variable = 0.0001645 * stats.single * shots
                       + 0.001121  * eff2q        * shots;
        return {
          provider,
          shots,
          ...stats,
          effectiveTwoQubitGates: eff2q,
          errorMitigation,
          estimatedUSD: Math.max(minimum, variable),
        };
      }

      case "quantinuum.h2": {
        const Nm  = stats.measure + stats.reset + this.#qubits.length;
        const hqc = 5 + shots * (stats.single + 10 * stats.two + 5 * Nm) / 5000;
        return {
          provider,
          shots,
          ...stats,
          spamOperations: Nm,
          estimatedHQC: hqc,
        };
      }

      case "rigetti":
        return {
          provider,
          shots,
          ...stats,
          note: "Rigetti charges $0.02 per 10ms QPU execution increment. Execution time must be profiled on hardware.",
        };

      case "pasqal":
        return {
          provider,
          shots,
          ...stats,
          note: "PASQAL charges $300/QPU hour (Fresnel) or $15/EMU-TN hour. Execution time must be profiled on hardware.",
        };

      default:
        throw new Error(
          `Unknown provider "${provider}". Supported: ionq.aria, ionq.forte, quantinuum.h2, rigetti, pasqal`,
        );
    }
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  /**
   * OpenQASM 2.0 IBM Quantum (legacy), Amazon Braket, IonQ.
   * @returns {string}
   */
  toQASM2() {
    return toQASM2(this.#qubits.length, this.#qubitIndex, this.#instructions);
  }

  /**
   * OpenQASM 3.0 IBM Quantum, Amazon Braket, Azure Quantum, IonQ.
   * Supports native block-if, while, and cleaner register declarations.
   * @returns {string}
   */
  toQASM3() {
    return toQASM3(this.#qubits.length, this.#qubitIndex, this.#instructions);
  }

  /**
   * Quil Rigetti QCS.
   * U3 is decomposed to RZ·RY·RZ.  WHILE is emitted as a comment template.
   * @returns {string}
   */
  toQuil() {
    return toQuil(this.#qubits.length, this.#qubitIndex, this.#instructions);
  }

  /**
   * IonQ JSON (ionq.circuit.v1 / qis gateset) IonQ Aria 1, Forte 1, Forte Enterprise 1.
   * U3 is decomposed to RZ·RY·RZ.  RZZ is decomposed to CNOT·RZ·CNOT.
   * Classical control (IF/WHILE) and RESET are not supported by the format and are silently dropped.
   * @returns {string}  JSON string ready for submission as ionq.circuit.v1.
   */
  toIonQJSON() {
    return toIonQJSON(this.#qubits.length, this.#qubitIndex, this.#instructions);
  }
}