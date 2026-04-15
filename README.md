# qubitsjs

![qubitsjs CI](https://github.com/marcus-johnson/qubits/actions/workflows/ci.yml/badge.svg)

A high-performance, sparse-matrix quantum simulator for NISQ-era algorithm development in JavaScript/Node.js. **qubitsjs** uses a `Map<bigint, Float64Array>` based sparse state representation and scatter-logic execution to simulate circuits with arbitrarily many qubits, memory and circuit sparsity are the only limits, not a fixed integer width.

Circuits can be simulated locally with a full noise model, or exported to run on real quantum hardware via **OpenQASM 2.0**, **OpenQASM 3.0**, **Quil**, and **IonQ JSON**.

---

## Installation

```bash
npm install qubitsjs
```

Requires Node.js ≥ 18.

---

## What's New in v2.0

- **`Q.shots(count, numShots, callback, noiseModel?)`** Shot-based histogram execution. Runs the circuit `numShots` times and returns a `Map<string, number>` of bitstring outcomes. Supports noise models for realistic NISQ sampling.
- **`CapturedCircuit.gateStats()`** Structured gate counts by tier (`single`, `two`, `three`, `measure`, `reset`). Useful for cost estimation and circuit profiling.
- **`CapturedCircuit.estimateCost(provider, shots, options?)`** Estimates execution cost on Azure Quantum providers using the published pricing formulas. Supports `ionq.aria`, `ionq.forte`, `quantinuum.h2`, `rigetti`, and `pasqal`.
- **`CapturedCircuit.toIonQJSON()`** Exports circuits to the `ionq.circuit.v1` JSON format (qis gateset) for direct submission to IonQ Aria 1, Forte 1, and Forte Enterprise 1 via the Azure Quantum or IonQ APIs.

---

## Getting Started

### Simulating a Bell State

```javascript
import { Q } from 'qubitsjs';

Q.use(2, (q0, q1, ops) => {
    ops.h(q0);
    ops.cnot(q0, q1);

    const m0 = ops.m(q0);
    const m1 = ops.m(q1);

    console.log(`q0=${m0}, q1=${m1}`);  // always equal: 00 or 11

    ops.reset(q0);
    ops.reset(q1);
});
```

### Shot-Based Histogram

```javascript
import { Q } from 'qubitsjs';

const histogram = Q.shots(2, 1000, (q0, q1, ops) => {
    ops.h(q0);
    ops.cnot(q0, q1);

    const m0 = ops.m(q0);
    const m1 = ops.m(q1);

    ops.reset(q0);
    ops.reset(q1);

    return [m0, m1];
});

console.log(histogram);
// → Map { '00' => 503, '11' => 497 }
```

### Classical Control Flow

```javascript
import { Q } from 'qubitsjs';

Q.use(2, (aux, target, ops) => {
    ops.h(aux);
    ops.cnot(aux, target);

    ops.m(aux);

    ops.if(aux, 1, (sub) => {
        sub.x(target);
    });

    ops.reset(aux);
    ops.reset(target);
});
```

### Noisy Simulation

```javascript
import { Q, NoiseModel } from 'qubitsjs';

const noise = new NoiseModel({
    gateError:    0.01,
    readoutError: 0.05,
    t1:           0.02,
    t2:           0.01,
});

Q.use(2, (q0, q1, ops) => {
    ops.h(q0);
    ops.cnot(q0, q1);
    console.log(ops.m(q0), ops.m(q1));
    ops.reset(q0);
    ops.reset(q1);
}, noise);
```

---

## Exporting to Real Hardware

Use `Q.circuit()` instead of `Q.use()`. The callback is identical, same qubit symbols, same `ops` object but the circuit is captured rather than simulated, and returned as a `CapturedCircuit` ready for export.

```javascript
import { Q } from 'qubitsjs';

const circuit = Q.circuit(2, (q0, q1, ops) => {
    ops.h(q0);
    ops.cnot(q0, q1);
    ops.m(q0);
    ops.m(q1);
    ops.reset(q0);
    ops.reset(q1);
});

console.log(circuit.summary());
// → CapturedCircuit: 2 qubits, 6 gates  [H×1  CNOT×1  MEASURE×2  RESET×2]
```

### IonQ JSON, IonQ Aria 1, Forte 1, Forte Enterprise 1

```javascript
console.log(circuit.toIonQJSON());
```

```json
{
  "format": "ionq.circuit.v1",
  "gateset": "qis",
  "qubits": 2,
  "circuit": [
    { "gate": "h",    "targets": [0] },
    { "gate": "cnot", "control": 0, "target": 1 },
    { "gate": "measure", "qubit": 0 },
    { "gate": "measure", "qubit": 1 }
  ]
}
```

The JSON is ready for submission via the Azure Quantum CLI:

```bash
az quantum execute \
  -g MyResourceGroup -w MyWorkspace -l eastus \
  -t ionq.simulator \
  --job-input-file circuit.json \
  --job-input-format ionq.circuit.v1 \
  --job-output-format ionq.quantum-results.v1 \
  --job-params count=1000 content-type=application/json
```

### OpenQASM 2.0 IBM Quantum (legacy), Amazon Braket, IonQ

```javascript
console.log(circuit.toQASM2());
```

```
OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c0[1];
creg c1[1];

h q[0];
cx q[0],q[1];
measure q[0] -> c0[0];
measure q[1] -> c1[0];
reset q[0];
reset q[1];
```

### OpenQASM 3.0 IBM Quantum (new stack), Azure Quantum, Amazon Braket

```javascript
console.log(circuit.toQASM3());
```

```
OPENQASM 3.0;

qubit[2] q;
bit[2] c;

h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
reset q[0];
reset q[1];
```

### Quil Rigetti QCS

```javascript
console.log(circuit.toQuil());
```

```
DECLARE ro BIT[2]

H 0
CNOT 0 1
MEASURE 0 ro[0]
MEASURE 1 ro[1]
RESET 0
RESET 1
```

### Platform Reference

| Method | Platform |
|--------|----------|
| `toIonQJSON()` | IonQ Aria 1 (25q), Forte 1 / Forte Enterprise 1 (36q) via Azure Quantum or IonQ API |
| `toQASM2()` | IBM Quantum (legacy backends), Amazon Braket (OpenQASM 2 devices), IonQ via Braket/Azure |
| `toQASM3()` | IBM Quantum (new stack), Amazon Braket, Azure Quantum, IonQ direct |
| `toQuil()` | Rigetti QCS, Ankaa-3, Cepheus-1-36Q |

### Export Notes

**Gate names are preserved.** Captured circuits export raw gate names (H, CNOT, RX, etc.) rather than the U3/CNOT decompositions used internally by the simulator. Each hardware platform runs its own compiler, qubitsjs only needs to describe intent.

**IonQ JSON decompositions.** `U3(θ,φ,λ)` is decomposed to the ZYZ sequence `RZ(λ)·RY(θ)·RZ(φ)` since the qis gateset has no U3. `RZZ(θ)` is decomposed to `CNOT·RZ(θ)·CNOT`. `CCX` maps to the IonQ `ccnot` named gate. `IF`, `WHILE`, and `RESET` have no representation in `ionq.circuit.v1` and are silently dropped, validate your circuit with `gateStats()` before submitting.

**Classical control flow.** `if` blocks export natively in all three QASM/Quil formats. QASM 2.0 repeats the condition guard before each body gate. QASM 3.0 exports as a proper `if (...) { }` block. Quil uses a `JUMP-WHEN`/`LABEL` pattern. `while` loops export natively in QASM 3.0; Quil emits a commented jump-label template since Quil has no native while loop.

**`U3` in Quil.** There is no U3 gate in Quil. `toQuil()` automatically decomposes it to the equivalent `RZ·RY·RZ` sequence.

**`RZZ`.** Not included in any standard library, so `toQASM2()` and `toQASM3()` emit an inline `gate rzz` definition, and `toQuil()` emits a `DEFGATE RZZ` block.

---

## Cost Estimation

`gateStats()` returns structured gate counts. `estimateCost()` applies the Azure Quantum published pricing formulas against those counts.

```javascript
import { Q } from 'qubitsjs';

const circuit = Q.circuit(3, (q0, q1, q2, ops) => {
    ops.h(q0);
    ops.cnot(q0, q1);
    ops.ccx(q0, q1, q2);
    ops.rx(q0, 0.5);
    ops.m(q0); ops.m(q1); ops.m(q2);
    ops.reset(q0); ops.reset(q1); ops.reset(q2);
});

console.log(circuit.gateStats());
// → { single: 2, two: 1, three: 1, measure: 3, reset: 3 }

console.log(circuit.estimateCost('ionq.aria', 1000));
// → {
//     provider: 'ionq.aria',
//     shots: 1000,
//     single: 2, two: 1, three: 1, measure: 3, reset: 3,
//     effectiveTwoQubitGates: 13,   // CCX billed as 12 two-qubit gates
//     errorMitigation: true,
//     estimatedUSD: 97.5            // minimum price applies
//   }

console.log(circuit.estimateCost('quantinuum.h2', 500));
// → {
//     provider: 'quantinuum.h2',
//     shots: 500,
//     single: 2, two: 1, three: 1, measure: 3, reset: 3,
//     spamOperations: 9,            // measure + reset + qubitCount
//     estimatedHQC: 10.7
//   }
```

### Pricing Formulas

**IonQ** (Azure Quantum Token model):
```
AQT = m + 0.000220·(N₁q·C) + 0.000975·(N₂q·C)

where m = $97.50 (error mitigation on, default) or $12.4167 (off)
CCX gates are billed as 6·(N−2) = 12 two-qubit gates
```

| Target | 1q gate-shot | 2q gate-shot | Min/program (EM on) |
|--------|-------------|-------------|---------------------|
| IonQ Aria 1 (25q) | $0.000220 | $0.000975 | $97.50 |
| IonQ Forte 1 / Forte Enterprise 1 (36q) | $0.0001645 | $0.001121 | $168.195 |

**Quantinuum** (Hardware Quantum Credits):
```
HQC = 5 + C·(N₁q + 10·N₂q + 5·Nₘ) / 5000

where Nₘ = MEASURE + RESET + initial state preparations (qubitCount)
```

**Rigetti** and **PASQAL** charge by QPU execution time and cannot be estimated without profiling on hardware. `estimateCost()` returns a descriptive note for these providers.

---

## API Reference

### `Q.use(count, callback, noiseModel?)`

Allocates `count` qubits, simulates the circuit, then releases all qubits. All qubits must be reset to |0⟩ before the callback returns or an error is thrown.

```javascript
Q.use(3, (q0, q1, q2, ops) => {
    // ...
    ops.reset(q0); ops.reset(q1); ops.reset(q2);
});
```

### `Q.shots(count, numShots, callback, noiseModel?)`

Runs the circuit `numShots` times and returns a `Map<string, number>` of bitstring → count. The callback must return an array of measurement results (`0 | 1`) which are joined into the bitstring key. All qubits must still be reset before the callback returns.

```javascript
const histogram = Q.shots(2, 1000, (q0, q1, ops) => {
    ops.h(q0);
    ops.cnot(q0, q1);
    const m0 = ops.m(q0);
    const m1 = ops.m(q1);
    ops.reset(q0);
    ops.reset(q1);
    return [m0, m1];
});

// Sort by count descending
const sorted = [...histogram.entries()].sort(([,a],[,b]) => b - a);
// → [['00', 503], ['11', 497]]
```

Noise models work identically to `Q.use()`:

```javascript
import { Q, NoiseModel } from 'qubitsjs';

const noise = new NoiseModel({ readoutError: 0.02, gateError: 0.005 });
const noisyHistogram = Q.shots(2, 500, (q0, q1, ops) => { /* ... */ }, noise);
```

### `Q.circuit(count, callback)`

Same signature as `Q.use()` but captures rather than simulates. Returns a `CapturedCircuit`. Measurements return `0` as a mock value so that `if`/`while` body callbacks always execute and are fully captured.

```javascript
const circuit = Q.circuit(2, (q0, q1, ops) => { /* ... */ });
```

---

### `NoiseModel(params?)`

Defines a physical noise profile applied stochastically after each gate.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `gateError` | Probability of a Pauli-X bit-flip after any gate | `0.0` |
| `readoutError` | Probability of flipping a measurement result | `0.0` |
| `t1` | Amplitude damping probability $|1\rangle \rightarrow |0\rangle$ per gate | `0.0` |
| `t2` | Phase damping probability Pauli-Z flip per gate | `0.0` |

---

### Quantum Operations (`ops`)

#### Single-Qubit Gates

| Method | Gate |
|--------|------|
| `ops.h(q)` | Hadamard |
| `ops.x(q)` | Pauli-X (NOT) |
| `ops.y(q)` | Pauli-Y |
| `ops.z(q)` | Pauli-Z |
| `ops.s(q)` | Phase gate (S = √Z) |
| `ops.t(q)` | T gate (= √S) |
| `ops.rx(q, θ)` | Rotation around X-axis by θ radians |
| `ops.ry(q, θ)` | Rotation around Y-axis by θ radians |
| `ops.rz(q, θ)` | Rotation around Z-axis by θ radians |
| `ops.u3(q, θ, φ, λ)` | Universal single-qubit gate |

#### Multi-Qubit Gates

| Method | Gate |
|--------|------|
| `ops.cnot(ctrl, trgt)` | Controlled-NOT |
| `ops.cz(ctrl, trgt)` | Controlled-Z |
| `ops.swap(q1, q2)` | Swap |
| `ops.rzz(q1, q2, θ)` | Parameterised ZZ rotation $e^{-i\theta/2 \cdot Z \otimes Z}$ |
| `ops.ccx(c1, c2, t)` | Toffoli (Controlled-Controlled-NOT) |

#### Classical Control

| Method | Behaviour |
|--------|-----------|
| `ops.if(qubit, value, callback)` | Execute `callback(subOps)` if the last measurement of `qubit` equals `value` |
| `ops.while(qubit, value, callback)` | Repeat `callback(subOps)` while the last measurement of `qubit` equals `value` |

#### Lifecycle

| Method | Behaviour |
|--------|-----------|
| `ops.m(q)` | Measure `q`, collapse the state, return `0` or `1`. Flushes and compiles all pending gates before measuring. |
| `ops.reset(q)` | Actively reset `q` to $|0\rangle$. Must be called on every qubit before the callback returns. |

---

### `CapturedCircuit`

Returned by `Q.circuit()`. Holds the raw instruction list and exposes analysis and export methods.

| Member | Description |
|--------|-------------|
| `circuit.qubitCount` | Number of qubits allocated in the circuit |
| `circuit.getInstructions()` | Frozen array of raw IR instructions |
| `circuit.summary()` | Human-readable gate-count breakdown |
| `circuit.gateStats()` | Structured gate counts by tier `{ single, two, three, measure, reset }` |
| `circuit.estimateCost(provider, shots?, options?)` | Azure Quantum cost estimate using published pricing formulas |
| `circuit.toQASM2()` | OpenQASM 2.0 string |
| `circuit.toQASM3()` | OpenQASM 3.0 string |
| `circuit.toQuil()` | Quil string |
| `circuit.toIonQJSON()` | IonQ JSON (`ionq.circuit.v1` / qis gateset) |

---

### `Simulator` (advanced)

The `Simulator` class is used internally by `Q.use()` but can be instantiated directly for lower-level access.

```javascript
import { Simulator } from 'qubitsjs/src/core/simulator.js';
import { QubitManager } from 'qubitsjs/src/api/qubit-manager.js';
```

#### `simulator.getAmplitudes()`

Returns the full sparse state vector as a sorted array.

```javascript
// After H+CNOT, state is (|00⟩ + |11⟩)/√2:
// [ { index: 0n, re: 0.707, im: 0, probability: 0.5 },
//   { index: 3n, re: 0.707, im: 0, probability: 0.5 } ]
```

#### `simulator.stateSize`

The number of non-zero basis states currently tracked.

---

## Algorithm Library

```javascript
import {
    runGrover,
    iterativePhaseEstimation,
    quantumPhaseEstimation,
    qft,
    inverseQft,
    runBernsteinVazirani,
    runDeutschJozsa,
    vqeAnsatz,
    qaoaLayer,
} from 'qubitsjs';
```

### `runGrover(qops, qubits, oracle)`

Applies $\lfloor \frac{\pi}{4}\sqrt{2^n} \rfloor$ iterations of oracle + diffusion. Returns measurement outcomes.

```javascript
Q.use(2, (q0, q1, ops) => {
    const oracle = (o, qs) => { o.cz(qs[0], qs[1]); };
    const result = runGrover(ops, [q0, q1], oracle);
    console.log(result);  // → [1, 1]
    ops.reset(q0); ops.reset(q1);
});
```

### `qft(qops, qubits)` / `inverseQft(qops, qubits)`

Quantum Fourier Transform and its inverse.

### `quantumPhaseEstimation(qops, countingQubits, targetQubits, controlledU)`

Standard (non-iterative) QPE.

### `iterativePhaseEstimation(qops, aux, target, precision, controlledU)`

Single-auxiliary-qubit QPE via mid-circuit measurements.

### `runBernsteinVazirani(qops, qubits, ancilla, oracle)`

Recovers a hidden bitstring in a single oracle query.

### `runDeutschJozsa(qops, qubits, ancilla, oracle)`

Returns `"constant"` or `"balanced"` in one query.

### `vqeAnsatz(qops, qubits, params)`

Hardware-efficient VQE ansatz: two layers of `RY+RZ` with linear `CNOT` entangling. Expects `4 * qubits.length` parameters.

### `qaoaLayer(qops, qubits, edges, gamma, beta)`

One QAOA layer for Max-Cut: cost unitary over graph edges + mixing unitary.

---

## Architecture

### Project Layout

```
src/
├── index.js                      Entry point Q.use(), Q.circuit(), Q.shots()
├── core/
│   ├── simulator.js              Sparse state simulator (BigInt keys)
│   ├── gate-defs.js              Gate matrices (Float64Array, row-major complex)
│   └── noise-model.js            NoiseModel class
├── compiler/
│   ├── ir-generator.js           Circuit raw instruction accumulator
│   ├── compiler.js               Double-prune pipeline orchestrator
│   ├── optimizer.js              Peephole optimizer
│   ├── transpiler.js             Decomposes to native {U3, CNOT} basis
│   ├── captured-circuit.js       CapturedCircuit IR, analysis, and export
│   └── exporters/
│       ├── qasm2.js              OpenQASM 2.0 emitter
│       ├── qasm3.js              OpenQASM 3.0 emitter
│       ├── quil.js               Quil emitter
│       └── ionq.js               IonQ JSON (ionq.circuit.v1) emitter
└── api/
    ├── qubit-manager.js          Qubit allocation and safety enforcement
    ├── operations.js             ops proxy validates, records, flushes
    └── algorithms.js             Pre-built algorithm library
```

### Sparse State Representation

The quantum state is stored as `Map<bigint, Float64Array(2)>`:

- **Key:** a `BigInt` basis-state index where bit position `i` represents qubit `i`'s value. `BigInt` arithmetic has no upper bit limit, removing the prior 64-qubit ceiling.
- **Value:** a two-element `Float64Array` holding `[re, im]` the complex amplitude for that basis state.

Only states with non-zero amplitudes are tracked. A Bell state between two qubits in a 100-qubit register holds exactly two entries regardless of the total qubit count. Gate complexity is $O(S)$ where $S$ is the number of active amplitudes, not $O(2^N)$.

### Adaptive Pruning

After every gate application the simulator discards any entry whose magnitude-squared falls below a dynamic threshold. The base threshold is $10^{-15}$; when the active state count exceeds the memory budget of 5,000 entries, the threshold scales proportionally to shed the lowest-amplitude states first.

### Compiler Pipeline

Every call to `ops.m()` triggers a flush: accumulated IR instructions are compiled to native form before the simulator executes them.

```
Raw IR  →  Optimizer.prune()  →  Transpiler.transpile()  →  Optimizer.prune()  →  Simulator.run()
```

The double-prune catches redundancies both before and after decomposition. The native basis is $\{U_3, CNOT\}$.

### Peephole Optimiser

The optimizer makes a single forward pass, applying:

- **Identity elimination** zero-angle rotations and `U3(0,0,0)` are dropped.
- **Rotation merging** adjacent `RX`, `RY`, or `RZ` on the same qubit add their angles.
- **Self-inverse cancellation** consecutive identical gates from `{H, X, Y, Z, CNOT, CZ, SWAP}` cancel.
- **Phase upgrades** `S·S → Z`, `T·T → S`.
- **Commutation** single-qubit gates that commute through the intervening two-qubit gate are passed over so their partner can still be found.

### Noise Model

| Channel | Implementation |
|---------|---------------|
| **Gate error** ($p_x$) | Pauli-X flip on all active state indices for the qubit with probability $p_x$. |
| **Phase damping** ($T_2$) | Negate amplitude of every basis state where the qubit is $|1\rangle$ with probability $t_2$. |
| **Amplitude damping** ($T_1$) | Quantum jump to $|0\rangle$ with probability $t_1 \cdot p_1$; otherwise scale $|1\rangle$ amplitudes by $\sqrt{1-t_1}$ and renormalise. |
| **Readout error** | Swap $|0\rangle$/$|1\rangle$ probabilities before sampling with probability $p_r$. |

### Memory Safety

Every qubit must be explicitly reset to $|0\rangle$ before the `Q.use()` or `Q.shots()` callback returns. The `QubitManager` calls `simulator.isZero()` for each qubit at scope exit and throws if any remain non-zero.

---

## Technical Specifications

| Feature | Detail |
|---------|--------|
| **State storage** | `Map<bigint, Float64Array(2)>` arbitrary qubit count |
| **Previous ceiling** | 64 qubits (`BigUint64Array`) **removed in v2** |
| **Gate complexity** | $O(S)$ per gate where $S$ = active amplitude count |
| **Compiler pipeline** | IR → Optimizer → Transpiler → Optimizer |
| **Native basis** | $U_3$ (universal single-qubit) and $CNOT$ |
| **Noise channels** | Bit-flip, Readout, $T_1$ Amplitude, $T_2$ Phase |
| **Memory budget** | 5,000 active states (adaptive pruning threshold scales beyond this) |
| **Pruning threshold** | Base $10^{-15}$, scales with $S / \text{budget}$ |
| **Export formats** | OpenQASM 2.0, OpenQASM 3.0, Quil, IonQ JSON (`ionq.circuit.v1`) |
| **Memory safety** | Mandatory $|0\rangle$ reset enforced at scope exit |
| **Node.js requirement** | ≥ 18 |

---

## License

MIT