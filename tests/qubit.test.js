import { 
  Q, 
  runGrover, 
  runBernsteinVazirani, 
  runDeutschJozsa, 
  qft, 
  inverseQft, 
  quantumPhaseEstimation,
  vqeAnsatz,
  qaoaLayer 
} from "../src/index.js";
import { NoiseModel } from "../src/core/noise-model.js";
import { Optimizer } from "../src/compiler/optimizer.js";
import { Transpiler } from "../src/compiler/transpiler.js";
import { QubitManager } from "../src/api/qubit-manager.js";
import { Simulator } from "../src/core/simulator.js";
import { Circuit } from "../src/compiler/ir-generator.js";

describe("Qubit Library Test Suite", () => {

  describe("QubitManager", () => {
    let manager;
    beforeEach(() => { manager = new QubitManager(); });

    test("1. allocate(): returns unique symbols", () => {
      const qs = Array.from({ length: 10 }, () => manager.allocate());
      expect(new Set(qs).size).toBe(10);
    });

    test("2. release(): removes from registry", () => {
      const q = manager.allocate();
      manager.release(q, { isZero: () => true });
      expect(manager.isAllocated(q)).toBe(false);
    });

    test("3. isAllocated(): tracks active qubits", () => {
      const q = manager.allocate();
      expect(manager.isAllocated(q)).toBe(true);
    });

    test("4. Safety: throws if releasing non-zero qubit", () => {
      const q = manager.allocate();
      const mockSim = { isZero: () => false };
      expect(() => manager.release(q, mockSim)).toThrow(/must be reset/);
    });

    test("5. Foreign symbols are not recognized", () => {
      expect(manager.isAllocated(Symbol("foreign"))).toBe(false);
    });
  });

  describe("Circuit (IR Generator)", () => {
    test("6. addOp() records instructions correctly", () => {
      const c = new Circuit();
      c.addOp("H", Symbol("q"));
      expect(c.getInstructions()).toHaveLength(1);
    });

    test("7. clear() resets operations", () => {
      const c = new Circuit();
      c.addOp("X", Symbol("q"));
      c.clear();
      expect(c.getInstructions()).toHaveLength(0);
    });

    test("8. getInstructions() returns an immutable copy", () => {
      const c = new Circuit();
      const instrs = c.getInstructions();
      expect(Object.isFrozen(instrs)).toBe(true);
    });
  });

  describe("Optimizer", () => {
    const q1 = Symbol("q1"), q2 = Symbol("q2");

    test("9. Prunes X-X identity", () => {
      const ops = [{ gate: "X", qubit: q1 }, { gate: "X", qubit: q1 }];
      expect(Optimizer.prune(ops)).toHaveLength(0);
    });

    test("10. Merges RZ rotations", () => {
      const ops = [{ gate: "RZ", qubit: q1, params: [0.1] }, { gate: "RZ", qubit: q1, params: [0.2] }];
      const res = Optimizer.prune(ops);
      expect(res[0].params[0]).toBeCloseTo(0.3);
    });

    test("11. Merges RX rotations", () => {
      const ops = [{ gate: "RX", qubit: q1, params: [Math.PI] }, { gate: "RX", qubit: q1, params: [Math.PI] }];
      expect(Optimizer.prune(ops)).toHaveLength(0);
    });

    test("12. Commutation: Z through CNOT control", () => {
      const ops = [{ gate: "Z", qubit: q1 }, { gate: "CNOT", qubit: [q1, q2] }, { gate: "Z", qubit: q1 }];
      expect(Optimizer.prune(ops)).toHaveLength(1);
    });

    test("13. Commutation: X through CNOT target", () => {
      const ops = [{ gate: "X", qubit: q2 }, { gate: "CNOT", qubit: [q1, q2] }, { gate: "X", qubit: q2 }];
      expect(Optimizer.prune(ops)).toHaveLength(1);
    });

    test("14. Merges S+S into Z", () => {
      const ops = [{ gate: "S", qubit: q1 }, { gate: "S", qubit: q1 }];
      expect(Optimizer.prune(ops)[0].gate).toBe("Z");
    });

    test("15. Merges T+T into S", () => {
      const ops = [{ gate: "T", qubit: q1 }, { gate: "T", qubit: q1 }];
      expect(Optimizer.prune(ops)[0].gate).toBe("S");
    });

    test("16. Prunes U3(0,0,0) identity", () => {
      expect(Optimizer.prune([{ gate: "U3", qubit: q1, params: [0, 0, 0] }])).toHaveLength(0);
    });

    test("17. Commutation: RZ through CZ", () => {
      const ops = [{ gate: "RZ", qubit: q1, params: [0.5] }, { gate: "CZ", qubit: [q1, q2] }, { gate: "RZ", qubit: q1, params: [0.5] }];
      expect(Optimizer.prune(ops)).toHaveLength(2);
    });

    test("18. Blocking: RX does not commute through CNOT control", () => {
      const ops = [{ gate: "RX", qubit: q1, params: [0.1] }, { gate: "CNOT", qubit: [q1, q2] }, { gate: "RX", qubit: q1, params: [0.1] }];
      expect(Optimizer.prune(ops)).toHaveLength(3);
    });

    test("19. Blocking: RZ does not commute through CNOT target", () => {
      const ops = [{ gate: "RZ", qubit: q2, params: [0.1] }, { gate: "CNOT", qubit: [q1, q2] }, { gate: "RZ", qubit: q2, params: [0.1] }];
      expect(Optimizer.prune(ops)).toHaveLength(3);
    });

    test("20. Prunes 2*PI rotations", () => {
      expect(Optimizer.prune([{ gate: "RY", qubit: q1, params: [2 * Math.PI] }])).toHaveLength(0);
    });
  });

  describe("Transpiler", () => {
    const q = Symbol("q"), q2 = Symbol("q2");

    test("21. H decomposes to U3", () => {
      const res = Transpiler.transpile([{ gate: "H", qubit: q }]);
      expect(res[0].gate).toBe("U3");
    });

    test("22. X decomposes to U3", () => {
      const res = Transpiler.transpile([{ gate: "X", qubit: q }]);
      expect(res[0].params).toEqual([Math.PI, 0, Math.PI]);
    });

    test("23. Y decomposes to U3", () => {
      const res = Transpiler.transpile([{ gate: "Y", qubit: q }]);
      expect(res[0].params).toEqual([Math.PI, Math.PI / 2, Math.PI / 2]);
    });

    test("24. Z decomposes to U3", () => {
      const res = Transpiler.transpile([{ gate: "Z", qubit: q }]);
      expect(res[0].params).toEqual([0, 0, Math.PI]);
    });

    test("25. SWAP decomposes to 3 CNOTs", () => {
      const res = Transpiler.transpile([{ gate: "SWAP", qubit: [q, q2] }]);
      expect(res).toHaveLength(3);
      expect(res.every(op => op.gate === "CNOT")).toBe(true);
    });

    test("26. CZ decomposes to U3-CNOT-U3", () => {
      const res = Transpiler.transpile([{ gate: "CZ", qubit: [q, q2] }]);
      expect(res[0].gate).toBe("U3");
      expect(res[1].gate).toBe("CNOT");
      expect(res[2].gate).toBe("U3");
    });

    test("27. RX decomposes with phases", () => {
      const res = Transpiler.transpile([{ gate: "RX", qubit: q, params: [0.5] }]);
      expect(res[0].params[1]).toBe(-Math.PI / 2);
    });

    test("28. Unknown gates are passed through", () => {
      const res = Transpiler.transpile([{ gate: "GHOST", qubit: q }]);
      expect(res[0].gate).toBe("GHOST");
    });
  });

  describe("Simulator Core Operations", () => {
    test("29. X Gate flips |0> to |1>", () => {
      Q.use(1, (q, ops) => { ops.x(q); expect(ops.m(q)).toBe(1); ops.reset(q); });
    });

    test("30. H Gate creates superposition", () => {
      const results = [];
      for(let i = 0; i < 50; i++) {
        Q.use(1, (q, ops) => {
          ops.h(q);
          results.push(ops.m(q));
          ops.reset(q);
        });
      }
      expect(results).toContain(0);
      expect(results).toContain(1);
    });

    test("31. CNOT: control |0> does nothing", () => {
      Q.use(2, (c, t, ops) => { ops.cnot(c, t); expect(ops.m(t)).toBe(0); ops.reset(c); ops.reset(t); });
    });

    test("32. CNOT: control |1> flips target", () => {
      Q.use(2, (c, t, ops) => { ops.x(c); ops.cnot(c, t); expect(ops.m(t)).toBe(1); ops.reset(c); ops.reset(t); });
    });

    test("33. Bell State (Entanglement) check", () => {
      Q.use(2, (q1, q2, ops) => {
        ops.h(q1); ops.cnot(q1, q2);
        const r1 = ops.m(q1); const r2 = ops.m(q2);
        expect(r1).toBe(r2);
        ops.reset(q1); ops.reset(q2);
      });
    });

    test("34. CCX (Toffoli): identity case", () => {
      Q.use(3, (c1, c2, t, ops) => { ops.x(c1); ops.ccx(c1, c2, t); expect(ops.m(t)).toBe(0); ops.reset(c1); ops.reset(c2); ops.reset(t); });
    });

    test("35. CCX (Toffoli): flip case", () => {
      Q.use(3, (c1, c2, t, ops) => { ops.x(c1); ops.x(c2); ops.ccx(c1, c2, t); expect(ops.m(t)).toBe(1); ops.reset(c1); ops.reset(c2); ops.reset(t); });
    });

    test("36. RZZ: functional check", () => {
      Q.use(2, (q1, q2, ops) => { ops.h(q1); ops.h(q2); ops.rzz(q1, q2, Math.PI); expect(() => ops.m(q1)).not.toThrow(); ops.reset(q1); ops.reset(q2); });
    });

    test("37. S and T phase stability", () => {
      Q.use(1, (q, ops) => { ops.h(q); ops.s(q); ops.s(q); ops.z(q); ops.h(q); expect(ops.m(q)).toBe(0); ops.reset(q); });
    });

    test("38. U3: Euler rotation to |1>", () => {
      Q.use(1, (q, ops) => { ops.u3(q, Math.PI, 0, Math.PI); expect(ops.m(q)).toBe(1); ops.reset(q); });
    });

    test("39. Reset: forces qubit to |0>", () => {
      Q.use(1, (q, ops) => { ops.x(q); ops.reset(q); expect(ops.m(q)).toBe(0); ops.reset(q); });
    });

    test("40. Sparse Pruning: stability check", () => {
      const q = Symbol("q");
      const sim = new Simulator([q]);
      expect(sim.isZero(q)).toBe(true);
    });
  });

  describe("Control Flow", () => {
    test("41. IF: executes when condition met", () => {
      Q.use(2, (q1, q2, ops) => {
        ops.x(q1); ops.m(q1);
        ops.if(q1, 1, (sub) => { sub.x(q2); });
        expect(ops.m(q2)).toBe(1);
        ops.reset(q1); ops.reset(q2);
      });
    });

    test("42. IF: skips when condition fails", () => {
      Q.use(2, (q1, q2, ops) => {
        ops.m(q1);
        ops.if(q1, 1, (sub) => { sub.x(q2); });
        expect(ops.m(q2)).toBe(0);
        ops.reset(q1); ops.reset(q2);
      });
    });

    test("43. WHILE: loop terminating on measurement", () => {
      Q.use(1, (q, ops) => {
        ops.x(q);
        ops.while(q, 0, (sub) => { sub.x(q); });
        ops.reset(q);
      });
    });

    test("44. Nested IF blocks", () => {
      Q.use(3, (q1, q2, q3, ops) => {
        ops.x(q1); ops.x(q2); ops.m(q1); ops.m(q2);
        ops.if(q1, 1, (s1) => { s1.if(q2, 1, (s2) => { s2.x(q3); }); });
        expect(ops.m(q3)).toBe(1);
        ops.reset(q1); ops.reset(q2); ops.reset(q3);
      });
    });
  });

  describe("Noise Physics", () => {
    test("45. Readout Error: flip probability", () => {
      const noise = new NoiseModel({ readoutError: 1.0 });
      Q.use(1, (q, ops) => {
        expect(ops.m(q)).toBe(1);
        ops.reset(q);
      }, noise);
    });

    test("46. Gate Error: stochastic bit-flip", () => {
      const noise = new NoiseModel({ gateError: 1.0 });
      Q.use(1, (q, ops) => {
        ops.x(q);
        expect(ops.m(q)).toBe(0);
        ops.reset(q);
      }, noise);
    });

    test("47. T1 Damping: |1> to |0>", () => {
      const noise = new NoiseModel({ t1: 1.0 });
      Q.use(1, (q, ops) => {
        ops.x(q); 
        ops.z(q);
        expect(ops.m(q)).toBe(0);
        ops.reset(q);
      }, noise);
    });

    test("48. T2 Damping: phase decay", () => {
      const noise = new NoiseModel({ t2: 1.0 });
      Q.use(1, (q, ops) => {
        ops.h(q); ops.z(q);
        expect(() => ops.m(q)).not.toThrow();
        ops.reset(q);
      }, noise);
    });
  });

  describe("Algorithms", () => {
    test("49. Bernstein-Vazirani: finds string '1'", () => {
      Q.use(2, (q, aux, ops) => {
        const oracle = (o, qs, a) => o.cnot(qs[0], a);
        const res = runBernsteinVazirani(ops, [q], aux, oracle);
        expect(res).toEqual([1]);
        ops.reset(q); ops.reset(aux);
      });
    });

    test("50. Deutsch-Jozsa: detects constant", () => {
      Q.use(2, (q, aux, ops) => {
        const oracle = () => {};
        const res = runDeutschJozsa(ops, [q], aux, oracle);
        expect(res).toBe("constant");
        ops.reset(q); ops.reset(aux);
      });
    });

    test("51. QFT/Inverse QFT Roundtrip", () => {
      Q.use(2, (q1, q2, ops) => {
        ops.x(q1); qft(ops, [q1, q2]); inverseQft(ops, [q1, q2]);
        expect(ops.m(q1)).toBe(1);
        expect(ops.m(q2)).toBe(0);
        ops.reset(q1); ops.reset(q2);
      });
    });

    test("52. Grover: 2-qubit search", () => {
      Q.use(2, (q1, q2, ops) => {
        const oracle = (o, qs) => { o.cz(qs[0], qs[1]); };
        const res = runGrover(ops, [q1, q2], oracle);
        expect(res).toEqual([1, 1]);
        ops.reset(q1); ops.reset(q2);
      });
    });

    test("53. Quantum Phase Estimation: simple phase", () => {
      Q.use(2, (c, t, ops) => {
        ops.x(t);
        const controlledU = (o, ctrl, trgt) => { o.cz(ctrl, trgt[0]); };
        const res = quantumPhaseEstimation(ops, [c], [t], controlledU);
        expect(res).toEqual([1]);
        ops.reset(c); ops.reset(t);
      });
    });

    test("54. VQE Ansatz execution", () => {
      Q.use(2, (q1, q2, ops) => {
        expect(() => vqeAnsatz(ops, [q1, q2], [0, 0, 0, 0, 0, 0, 0, 0])).not.toThrow();
        ops.reset(q1); ops.reset(q2);
      });
    });

    test("55. QAOA Layer execution", () => {
      Q.use(2, (q1, q2, ops) => {
        expect(() => qaoaLayer(ops, [q1, q2], [[q1, q2]], 0.1, 0.2)).not.toThrow();
        ops.reset(q1); ops.reset(q2);
      });
    });
  });
});