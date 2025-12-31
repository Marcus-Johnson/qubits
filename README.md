# qubitsjs

![qubitsjs CI](https://github.com/marcus-johnson/qubits/actions/workflows/ci.yml/badge.svg)

A high-performance, sparse-matrix quantum simulator designed for the simulation of NISQ-era (Noisy Intermediate-Scale Quantum) algorithms within a modern JavaScript/Node.js ecosystem. Unlike traditional simulators that rely on dense state vectors, **qubitsjs** employs a memory-efficient sparse-map representation and optimized scatter-logic execution to handle high qubit counts with low-to-moderate entanglement.

---

## Installation

```bash
npm install qubitsjs
```

---

## Getting Started

### Creating Entanglement (Bell State)

```javascript
import { Q } from 'qubitsjs';

Q.use(2, (q1, q2, ops) => {
    ops.h(q1);
    ops.cnot(q1, q2);
    
    const m1 = ops.m(q1);
    const m2 = ops.m(q2);
    
    console.log(`Results: q1=${m1}, q2=${m2}`);
    
    ops.reset(q1);
    ops.reset(q2);
});
```

### Classical Control (Iterative Logic)

```javascript
Q.use(2, (aux, target, ops) => {
    ops.h(aux);
    ops.cnot(aux, target);
    
    const res = ops.m(aux);
    
    ops.if(aux, 1, (subOps) => {
        subOps.x(target);
    });

    ops.reset(aux);
    ops.reset(target);
});
```

### Advanced Noisy Simulation

```javascript
import { Q, NoiseModel } from 'qubitsjs';

const noise = new NoiseModel({ 
    gateError: 0.01, 
    readoutError: 0.05,
    t1: 0.02,
    t2: 0.01
});

Q.use(1, (q, ops) => {
    ops.h(q);
    console.log(ops.m(q));
    ops.reset(q);
}, noise);
```

---

## Core Architectural Philosophies

### 1. Sparse-Matrix State Representation

Traditional simulators represent the quantum state as a dense complex vector of size $2^N$. **qubitsjs** utilizes a Map-based sparse representation that tracks only non-zero amplitudes. This allows the simulator to maintain a constant memory footprint for basis states and scales with active amplitudes, supporting up to 64 qubits for low-depth circuits.

### 2. Adaptive Memory Management

To maintain performance during noisy simulations, the simulator employs **Adaptive Pruning**. If the state Map size exceeds a memory budget (default 5,000 entries), the pruning threshold (base $10^{-15}$) increases dynamically to clear out low-magnitude amplitudes.

### 3. Scatter-Logic Execution Engine

The engine uses a "Scatter" strategy for gate application, iterating over active states once to update target indices. This approach reduces gate complexity to $O(S)$, where $S$ is the number of non-zero amplitudes.

---

## API Reference

### NoiseModel(params)

Defines a comprehensive noise profile including decoherence effects.

- **`gateError`**: Probability of a bit-flip (Pauli-X) after a gate.
- **`readoutError`**: Probability of a measurement result being flipped.
- **`t1`**: Amplitude Damping probability ($|1\rangle \rightarrow |0\rangle$).
- **`t2`**: Phase Damping probability (Pauli-Z flip).

---

### Quantum Operations (`ops`)

#### Single-Qubit Gates

- **`ops.h(q)`**, **`ops.x(q)`**, **`ops.y(q)`**, **`ops.z(q)`**: Standard Basis Gates.
- **`ops.s(q)`**, **`ops.t(q)`**: Phase and T gates (Essential for universality).
- **`ops.rx(q, theta)`**, **`ops.ry(q, theta)`**, **`ops.rz(q, theta)`**: Parameterized rotations.
- **`ops.u3(q, theta, phi, lambda)`**: Universal unitary gate.

#### Multi-Qubit & Three-Qubit Gates

- **`ops.cnot(ctrl, trgt)`**, **`ops.cz(ctrl, trgt)`**: Controlled operations.
- **`ops.swap(q1, q2)`**: Swaps states of two qubits.
- **`ops.rzz(q1, q2, theta)`**: Parameterized ZZ rotation.
- **`ops.ccx(c1, c2, t)`**: Toffoli (Controlled-Controlled-NOT) gate.

#### Classical Control Flow

- **`ops.if(qubit, value, callback)`**: Executes the callback if the last measurement of qubit matches value.
- **`ops.while(qubit, value, callback)`**: Repeatedly executes the callback while the measurement of qubit matches value.

---

## Algorithms Library

The **qubit** library includes several pre-built industry-standard algorithms:

- **Search**: `runGrover(qops, qubits, oracle)`
- **Phase Estimation**: `iterativePhaseEstimation` and standard `quantumPhaseEstimation`
- **Transformations**: `qft` (Quantum Fourier Transform) and `inverseQft`
- **Oracles**: `runBernsteinVazirani` and `runDeutschJozsa`
- **Variational**: `vqeAnsatz` and `qaoaLayer`

---

## Technical Specifications

| Feature | Implementation Detail |
|---------|----------------------|
| **State Storage** | Sparse Map: `BigUint64Array` indices & `Float64Array` amplitudes |
| **Compiler Logic** | Double-Prune: IR → Optimizer → Transpiler → Optimizer |
| **Native Basis Set** | $U_3$ (Universal Single-Qubit) and $CNOT$ |
| **Noise Modeling** | Bit-flip, Readout, $T_1$ (Amplitude), and $T_2$ (Phase) Damping |
| **Memory Safety** | Mandatory reset to $|0\rangle$ before scope exit |

---

## License

MIT