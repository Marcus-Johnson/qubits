import { GATES } from "./gate-defs.js";

export class Simulator {
  #indices;
  #amplitudes;
  #indicesAux;
  #amplitudesAux;

  #activeCount = 0;
  #qubitMap;
  #noiseModel;
  #memoryBudget = 5000;
  #epsilon;
  #results = new Map();

  /**
   * @param {Array} qubits - Array of qubit symbols.
   * @param {NoiseModel} noiseModel - Optional noise configuration.
   * @param {Object} options - Configuration options.
   * @param {number} options.epsilon - Manual precision override for isZero checks.
   */
  constructor(qubits, noiseModel = null, options = {}) {
    this.#qubitMap = new Map(qubits.map((q, i) => [q, i]));
    this.#noiseModel = noiseModel;
    this.#epsilon = options.epsilon || null;

    const initialCapacity = this.#memoryBudget * 2;
    this.#indices = new BigUint64Array(initialCapacity);
    this.#amplitudes = new Float64Array(initialCapacity * 2);
    this.#indicesAux = new BigUint64Array(initialCapacity);
    this.#amplitudesAux = new Float64Array(initialCapacity * 2);

    this.#indices[0] = 0n;
    this.#amplitudes[0] = 1.0;
    this.#amplitudes[1] = 0.0;
    this.#activeCount = 1;
  }

  #ensureCapacity(required) {
    if (this.#indices.length < required) {
      const newSize = Math.max(this.#indices.length * 2, required);

      const newIdx = new BigUint64Array(newSize);
      const newAmp = new Float64Array(newSize * 2);
      newIdx.set(this.#indices);
      newAmp.set(this.#amplitudes);
      this.#indices = newIdx;
      this.#amplitudes = newAmp;

      this.#indicesAux = new BigUint64Array(newSize);
      this.#amplitudesAux = new Float64Array(newSize * 2);
    }
  }

  #swapBuffers() {
    const tmpIdx = this.#indices;
    this.#indices = this.#indicesAux;
    this.#indicesAux = tmpIdx;

    const tmpAmp = this.#amplitudes;
    this.#amplitudes = this.#amplitudesAux;
    this.#amplitudesAux = tmpAmp;
  }

  #getEffectiveEpsilon() {
    if (this.#epsilon !== null) return this.#epsilon;
    const overBudgetMultiplier = Math.max(
      1,
      this.#activeCount / this.#memoryBudget
    );
    const currentPruneThreshold = 1e-15 * overBudgetMultiplier;
    return currentPruneThreshold * 100;
  }

  #applyStochasticNoise(qubit) {
    const targetQubits = Array.isArray(qubit) ? qubit : [qubit];
    const { gateError, t1, t2 } = this.#noiseModel;

    targetQubits.forEach((q) => {
      const bit = 1n << BigInt(this.#qubitMap.get(q));
      const r = Math.random();

      if (r < gateError) {
        for (let i = 0; i < this.#activeCount; i++) {
          this.#indices[i] ^= bit;
        }
      }

      if (Math.random() < t2) {
        for (let i = 0; i < this.#activeCount; i++) {
          if (this.#indices[i] & bit) {
            this.#amplitudes[i * 2] *= -1;
            this.#amplitudes[i * 2 + 1] *= -1;
          }
        }
      }

      if (t1 > 0) {
        const p1 = this.#getProb1(q);
        const jumpProb = t1 * p1;

        if (Math.random() < jumpProb) {
          this.#collapse(q, 1, p1);
          for (let i = 0; i < this.#activeCount; i++) {
            this.#indices[i] ^= bit;
          }
        } else {
          const scale = Math.sqrt(1 - t1);
          for (let i = 0; i < this.#activeCount; i++) {
            if (this.#indices[i] & bit) {
              this.#amplitudes[i * 2] *= scale;
              this.#amplitudes[i * 2 + 1] *= scale;
            }
          }
          this.#normalize();
        }
      }
    });
  }

  #normalize() {
    let normSq = 0;
    for (let i = 0; i < this.#activeCount; i++) {
      normSq += this.#amplitudes[i * 2] ** 2 + this.#amplitudes[i * 2 + 1] ** 2;
    }
    const norm = Math.sqrt(normSq);
    for (let i = 0; i < this.#activeCount; i++) {
      this.#amplitudes[i * 2] /= norm;
      this.#amplitudes[i * 2 + 1] /= norm;
    }
  }

  isZero(qubitId) {
    return this.#getProb1(qubitId) < this.#getEffectiveEpsilon();
  }

  #updateState(buffer, bIdx, re, im, gRe, gIm) {
    buffer[bIdx] += re * gRe - im * gIm;
    buffer[bIdx + 1] += re * gIm + im * gRe;
  }

  run(instructions) {
    for (const op of instructions) {
      let shouldApplyNoise = !!this.#noiseModel;
      const params = op.params || [];

      if (op.gate === "IF") {
        const actualResult = this.#results.get(op.condition.qubit);
        if (actualResult === op.condition.value) {
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
          this.apply3QubitGate(
            op.gate,
            op.qubit[0],
            op.qubit[1],
            op.qubit[2],
            params
          );
        } else {
          this.apply2QubitGate(op.gate, op.qubit[0], op.qubit[1], params);
        }
      } else if (op.gate === "RESET") {
        if (this.measure(op.qubit) === 1) this.applyGate("X", op.qubit);
        this.#prune();
        shouldApplyNoise = false;
      } else if (op.gate === "MEASURE") {
        const res = this.measure(op.qubit);
        this.#results.set(op.qubit, res);
        this.#prune();
        shouldApplyNoise = false;
      } else {
        this.applyGate(op.gate, op.qubit, params);
      }

      if (shouldApplyNoise) {
        this.#applyStochasticNoise(op.qubit);
        this.#prune();
      }
    }
  }

  getResult(qubitId) {
    return this.#results.get(qubitId);
  }

  applyGate(gateName, qubitId, params = []) {
    const targetBit = 1n << BigInt(this.#qubitMap.get(qubitId));
    let matrix = GATES[gateName];
    if (typeof matrix === "function") matrix = matrix(...params);

    this.#ensureCapacity(this.#activeCount * 2);

    const collisionMap = new Map();
    let nextCount = 0;

    for (let i = 0; i < this.#activeCount; i++) {
      const idx = this.#indices[i];
      const re = this.#amplitudes[i * 2];
      const im = this.#amplitudes[i * 2 + 1];

      if (gateName === "Z") {
        const sign = idx & targetBit ? -1 : 1;
        this.#accumulate(
          this.#indicesAux,
          this.#amplitudesAux,
          collisionMap,
          idx,
          re * sign,
          im * sign,
          nextCount++
        );
        continue;
      }

      const isBitSet = !!(idx & targetBit);
      const base = idx & ~targetBit;
      const col = isBitSet ? 1 : 0;

      const targets = [base, base | targetBit];
      for (let row = 0; row < 2; row++) {
        const tIdx = targets[row];
        const gIdx = (row * 2 + col) * 2;

        let bPos = collisionMap.get(tIdx);
        if (bPos === undefined) {
          bPos = nextCount++;
          collisionMap.set(tIdx, bPos);
          this.#indicesAux[bPos] = tIdx;
          this.#amplitudesAux[bPos * 2] = 0;
          this.#amplitudesAux[bPos * 2 + 1] = 0;
        }

        this.#updateState(
          this.#amplitudesAux,
          bPos * 2,
          re,
          im,
          matrix[gIdx],
          matrix[gIdx + 1]
        );
      }
    }

    this.#activeCount = nextCount;
    this.#swapBuffers();
    this.#prune();
  }

  apply2QubitGate(gateName, q1, q2, params = []) {
    const bit1 = 1n << BigInt(this.#qubitMap.get(q1));
    const bit2 = 1n << BigInt(this.#qubitMap.get(q2));
    const mask = bit1 | bit2;

    let matrix = GATES[gateName];
    if (typeof matrix === "function") matrix = matrix(...params);

    this.#ensureCapacity(this.#activeCount * 4);

    const collisionMap = new Map();
    let nextCount = 0;

    for (let i = 0; i < this.#activeCount; i++) {
      const idx = this.#indices[i];
      const re = this.#amplitudes[i * 2];
      const im = this.#amplitudes[i * 2 + 1];

      if (gateName === "CZ") {
        const sign = (idx & mask) === mask ? -1 : 1;
        this.#accumulate(
          this.#indicesAux,
          this.#amplitudesAux,
          collisionMap,
          idx,
          re * sign,
          im * sign,
          nextCount++
        );
      } else if (gateName === "CNOT" || gateName === "SWAP") {
        let nextIdx = idx;
        if (gateName === "CNOT") {
          if (idx & bit1) nextIdx ^= bit2;
        } else {
          if (!!(idx & bit1) !== !!(idx & bit2)) nextIdx ^= mask;
        }
        this.#accumulate(
          this.#indicesAux,
          this.#amplitudesAux,
          collisionMap,
          nextIdx,
          re,
          im,
          nextCount++
        );
      } else {
        const col = (idx & bit1 ? 2n : 0n) | (idx & bit2 ? 1n : 0n);
        const base = idx & ~mask;
        const offsets = [0n, bit2, bit1, mask];
        for (let row = 0; row < 4; row++) {
          const tIdx = base | offsets[row];
          const gIdx = (row * 4 + Number(col)) * 2;

          let bPos = collisionMap.get(tIdx);
          if (bPos === undefined) {
            bPos = nextCount++;
            collisionMap.set(tIdx, bPos);
            this.#indicesAux[bPos] = tIdx;
            this.#amplitudesAux[bPos * 2] = 0;
            this.#amplitudesAux[bPos * 2 + 1] = 0;
          }
          this.#updateState(
            this.#amplitudesAux,
            bPos * 2,
            re,
            im,
            matrix[gIdx],
            matrix[gIdx + 1]
          );
        }
      }
    }

    this.#activeCount = nextCount;
    this.#swapBuffers();
    this.#prune();
  }

  apply3QubitGate(gateName, q1, q2, q3, params = []) {
    const bit1 = 1n << BigInt(this.#qubitMap.get(q1));
    const bit2 = 1n << BigInt(this.#qubitMap.get(q2));
    const bit3 = 1n << BigInt(this.#qubitMap.get(q3));
    const mask = bit1 | bit2 | bit3;

    let matrix = GATES[gateName];
    if (typeof matrix === "function") matrix = matrix(...params);

    this.#ensureCapacity(this.#activeCount * 8);

    const collisionMap = new Map();
    let nextCount = 0;

    for (let i = 0; i < this.#activeCount; i++) {
      const idx = this.#indices[i];
      const re = this.#amplitudes[i * 2];
      const im = this.#amplitudes[i * 2 + 1];

      const col =
        (idx & bit1 ? 4n : 0n) |
        (idx & bit2 ? 2n : 0n) |
        (idx & bit3 ? 1n : 0n);

      const base = idx & ~mask;

      const offsets = [
        0n,
        bit3,
        bit2,
        bit2 | bit3,
        bit1,
        bit1 | bit3,
        bit1 | bit2,
        mask,
      ];

      for (let row = 0; row < 8; row++) {
        const tIdx = base | offsets[row];
        const gIdx = (row * 8 + Number(col)) * 2;

        let bPos = collisionMap.get(tIdx);
        if (bPos === undefined) {
          bPos = nextCount++;
          collisionMap.set(tIdx, bPos);
          this.#indicesAux[bPos] = tIdx;
          this.#amplitudesAux[bPos * 2] = 0;
          this.#amplitudesAux[bPos * 2 + 1] = 0;
        }

        this.#updateState(
          this.#amplitudesAux,
          bPos * 2,
          re,
          im,
          matrix[gIdx],
          matrix[gIdx + 1]
        );
      }
    }

    this.#activeCount = nextCount;
    this.#swapBuffers();
    this.#prune();
  }

  #accumulate(indices, amplitudes, map, idx, re, im, count) {
    let bPos = map.get(idx);
    if (bPos === undefined) {
      bPos = count;
      map.set(idx, bPos);
      indices[bPos] = idx;
      amplitudes[bPos * 2] = 0;
      amplitudes[bPos * 2 + 1] = 0;
    }
    amplitudes[bPos * 2] += re;
    amplitudes[bPos * 2 + 1] += im;
  }

  #prune() {
    const overBudgetMultiplier = Math.max(
      1,
      this.#activeCount / this.#memoryBudget
    );
    const threshold = 1e-15 * overBudgetMultiplier;
    let writeIdx = 0;

    for (let i = 0; i < this.#activeCount; i++) {
      const magnitude =
        this.#amplitudes[i * 2] ** 2 + this.#amplitudes[i * 2 + 1] ** 2;
      if (magnitude >= threshold) {
        if (writeIdx !== i) {
          this.#indices[writeIdx] = this.#indices[i];
          this.#amplitudes[writeIdx * 2] = this.#amplitudes[i * 2];
          this.#amplitudes[writeIdx * 2 + 1] = this.#amplitudes[i * 2 + 1];
        }
        writeIdx++;
      }
    }
    this.#activeCount = writeIdx;
  }

  measure(qubitId) {
    let prob1 = this.#getProb1(qubitId);
    if (this.#noiseModel && Math.random() < this.#noiseModel.readoutError)
      prob1 = 1 - prob1;
    const result = Math.random() < prob1 ? 1 : 0;
    this.#collapse(qubitId, result, prob1);
    return result;
  }

  #getProb1(qubitId) {
    const target = 1n << BigInt(this.#qubitMap.get(qubitId));
    let prob1 = 0;
    for (let i = 0; i < this.#activeCount; i++) {
      if (this.#indices[i] & target) {
        prob1 +=
          this.#amplitudes[i * 2] ** 2 + this.#amplitudes[i * 2 + 1] ** 2;
      }
    }
    return prob1;
  }

  #collapse(qubitId, result, prob1) {
    const target = 1n << BigInt(this.#qubitMap.get(qubitId));
    const norm = result === 1 ? Math.sqrt(prob1) : Math.sqrt(1 - prob1);
    let writeIdx = 0;

    for (let i = 0; i < this.#activeCount; i++) {
      const isBitSet = !!(this.#indices[i] & target);
      if ((result === 1 && isBitSet) || (result === 0 && !isBitSet)) {
        this.#indices[writeIdx] = this.#indices[i];
        this.#amplitudes[writeIdx * 2] = this.#amplitudes[i * 2] / norm;
        this.#amplitudes[writeIdx * 2 + 1] = this.#amplitudes[i * 2 + 1] / norm;
        writeIdx++;
      }
    }
    this.#activeCount = writeIdx;
  }
}
