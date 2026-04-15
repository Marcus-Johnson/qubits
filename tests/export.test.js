import { Q, CapturedCircuit } from "../src/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Capture a circuit and return the CapturedCircuit. */
function capture(count, fn) {
  return Q.circuit(count, fn);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Circuit Export Q.circuit()", () => {
  // ── Capture mechanics ────────────────────────────────────────────────────

  describe("Capture", () => {
    test("56. Q.circuit() returns a CapturedCircuit", () => {
      const c = capture(1, (q, ops) => {
        ops.h(q);
        ops.reset(q);
      });
      expect(c).toBeInstanceOf(CapturedCircuit);
    });

    test("57. qubitCount matches allocation", () => {
      const c = capture(3, (a, b, cc, ops) => {
        ops.reset(a);
        ops.reset(b);
        ops.reset(cc);
      });
      expect(c.qubitCount).toBe(3);
    });

    test("58. getInstructions() returns frozen array", () => {
      const c = capture(1, (q, ops) => {
        ops.h(q);
        ops.reset(q);
      });
      expect(Object.isFrozen(c.getInstructions())).toBe(true);
    });

    test("59. Raw gate names are preserved (not transpiled to U3)", () => {
      const c = capture(1, (q, ops) => {
        ops.h(q);
        ops.x(q);
        ops.reset(q);
      });
      const gates = c.getInstructions().map((i) => i.gate);
      expect(gates).toContain("H");
      expect(gates).toContain("X");
      expect(gates).not.toContain("U3");
    });

    test("60. IF body is always captured regardless of mock measurement", () => {
      const c = capture(2, (q0, q1, ops) => {
        ops.x(q0);
        ops.m(q0); // returns mock 0, but…
        ops.if(q0, 1, (sub) => {
          sub.x(q1); // …body still captured
        });
        ops.reset(q0);
        ops.reset(q1);
      });
      const ifOp = c.getInstructions().find((i) => i.gate === "IF");
      expect(ifOp).toBeDefined();
      expect(ifOp.body.length).toBeGreaterThan(0);
    });

    test("61. WHILE body is always captured", () => {
      const c = capture(1, (q, ops) => {
        ops.while(q, 1, (sub) => {
          sub.x(q);
        });
        ops.reset(q);
      });
      const whileOp = c.getInstructions().find((i) => i.gate === "WHILE");
      expect(whileOp).toBeDefined();
      expect(whileOp.body.length).toBe(1);
    });

    test("62. summary() returns a non-empty string", () => {
      const c = capture(2, (q0, q1, ops) => {
        ops.h(q0);
        ops.cnot(q0, q1);
        ops.reset(q0);
        ops.reset(q1);
      });
      expect(typeof c.summary()).toBe("string");
      expect(c.summary()).toMatch(/CapturedCircuit/);
      expect(c.summary()).toMatch(/2 qubits/);
    });
  });

  // ── OpenQASM 2.0 ─────────────────────────────────────────────────────────

  describe("OpenQASM 2.0", () => {
    function bellQASM2() {
      return capture(2, (q0, q1, ops) => {
        ops.h(q0);
        ops.cnot(q0, q1);
        ops.m(q0);
        ops.m(q1);
        ops.reset(q0);
        ops.reset(q1);
      }).toQASM2();
    }

    test("63. Starts with OPENQASM 2.0 header", () => {
      expect(bellQASM2()).toMatch(/^OPENQASM 2\.0;/);
    });

    test("64. Includes qelib1.inc", () => {
      expect(bellQASM2()).toContain('include "qelib1.inc"');
    });

    test("65. Declares qreg with correct size", () => {
      expect(bellQASM2()).toMatch(/qreg q\[2\]/);
    });

    test("66. Declares cregs only for measured qubits", () => {
      const out = bellQASM2();
      expect(out).toMatch(/creg c0\[1\]/);
      expect(out).toMatch(/creg c1\[1\]/);
    });

    test("67. H gate emits as 'h q[0]'", () => {
      expect(bellQASM2()).toContain("h q[0]");
    });

    test("68. CNOT emits as 'cx'", () => {
      expect(bellQASM2()).toContain("cx q[0],q[1]");
    });

    test("69. MEASURE emits correctly", () => {
      expect(bellQASM2()).toContain("measure q[0] -> c0[0]");
    });

    test("70. RESET emits correctly", () => {
      expect(bellQASM2()).toContain("reset q[0]");
    });

    test("71. Parameterised gates include angle", () => {
      const out = capture(1, (q, ops) => {
        ops.rx(q, Math.PI / 2);
        ops.reset(q);
      }).toQASM2();
      expect(out).toMatch(/rx\(1\.5707963/);
    });

    test("72. RZZ emits custom gate definition", () => {
      const out = capture(2, (q0, q1, ops) => {
        ops.h(q0);
        ops.rzz(q0, q1, 0.5);
        ops.reset(q0);
        ops.reset(q1);
      }).toQASM2();
      expect(out).toContain("gate rzz");
      expect(out).toMatch(/rzz\(0\.5\) q\[0\],q\[1\]/);
    });

    test("73. IF emits per-gate condition guards", () => {
      const out = capture(2, (q0, q1, ops) => {
        ops.x(q0);
        ops.m(q0);
        ops.if(q0, 1, (sub) => {
          sub.x(q1);
        });
        ops.reset(q0);
        ops.reset(q1);
      }).toQASM2();
      expect(out).toMatch(/if\(c0==1\)/);
    });

    test("74. WHILE emits as comment", () => {
      const out = capture(1, (q, ops) => {
        ops.while(q, 1, (sub) => {
          sub.x(q);
        });
        ops.reset(q);
      }).toQASM2();
      expect(out).toMatch(/\/\/ WHILE/);
    });

    test("75. U3 gate emits with three parameters", () => {
      const out = capture(1, (q, ops) => {
        ops.u3(q, Math.PI, 0, Math.PI);
        ops.reset(q);
      }).toQASM2();
      expect(out).toMatch(/u3\(/);
    });

    test("76. CCX emits as 'ccx'", () => {
      const out = capture(3, (c1, c2, t, ops) => {
        ops.ccx(c1, c2, t);
        ops.reset(c1);
        ops.reset(c2);
        ops.reset(t);
      }).toQASM2();
      expect(out).toContain("ccx q[0],q[1],q[2]");
    });

    test("77. CZ emits as 'cz'", () => {
      const out = capture(2, (q0, q1, ops) => {
        ops.cz(q0, q1);
        ops.reset(q0);
        ops.reset(q1);
      }).toQASM2();
      expect(out).toContain("cz q[0],q[1]");
    });

    test("78. SWAP emits as 'swap'", () => {
      const out = capture(2, (q0, q1, ops) => {
        ops.swap(q0, q1);
        ops.reset(q0);
        ops.reset(q1);
      }).toQASM2();
      expect(out).toContain("swap q[0],q[1]");
    });
  });

  // ── OpenQASM 3.0 ─────────────────────────────────────────────────────────

  describe("OpenQASM 3.0", () => {
    function bell3() {
      return capture(2, (q0, q1, ops) => {
        ops.h(q0);
        ops.cnot(q0, q1);
        ops.m(q0);
        ops.m(q1);
        ops.reset(q0);
        ops.reset(q1);
      }).toQASM3();
    }

    test("79. Starts with OPENQASM 3.0 header", () => {
      expect(bell3()).toMatch(/^OPENQASM 3\.0;/);
    });

    test("80. Declares qubit[] register", () => {
      expect(bell3()).toMatch(/qubit\[2\] q/);
    });

    test("81. Declares bit[] register when measurements present", () => {
      expect(bell3()).toMatch(/bit\[2\] c/);
    });

    test("82. No classical bit[] when no measurements", () => {
      const out = capture(1, (q, ops) => {
        ops.h(q);
        ops.reset(q);
      }).toQASM3();
      // bit[ appears in "qubit[" too check specifically for the creg declaration line
      expect(out).not.toMatch(/^bit\[/m);
    });

    test("83. Measurement uses assignment syntax", () => {
      expect(bell3()).toContain("c[0] = measure q[0]");
    });

    test("84. IF emits as block statement", () => {
      const out = capture(2, (q0, q1, ops) => {
        ops.x(q0);
        ops.m(q0);
        ops.if(q0, 1, (sub) => {
          sub.x(q1);
          sub.y(q1);
        });
        ops.reset(q0);
        ops.reset(q1);
      }).toQASM3();
      expect(out).toMatch(/if \(c\[0\] == 1\) \{/);
      // Both body gates should be indented inside the block
      expect(out).toMatch(/x q\[1\]/);
      expect(out).toMatch(/y q\[1\]/);
    });

    test("85. WHILE emits as block statement", () => {
      const out = capture(1, (q, ops) => {
        ops.while(q, 1, (sub) => {
          sub.x(q);
        });
        ops.reset(q);
      }).toQASM3();
      expect(out).toMatch(/while \(c\[0\] == 1\) \{/);
    });

    test("86. U3 emits as capital U() in QASM 3.0", () => {
      const out = capture(1, (q, ops) => {
        ops.u3(q, Math.PI, 0, Math.PI);
        ops.reset(q);
      }).toQASM3();
      expect(out).toMatch(/U\(/);
    });

    test("87. No include directive (QASM 3.0 has built-in gates)", () => {
      expect(bell3()).not.toContain("include");
    });
  });

  // ── Quil ──────────────────────────────────────────────────────────────────

  describe("Quil", () => {
    function bellQuil() {
      return capture(2, (q0, q1, ops) => {
        ops.h(q0);
        ops.cnot(q0, q1);
        ops.m(q0);
        ops.m(q1);
        ops.reset(q0);
        ops.reset(q1);
      }).toQuil();
    }

    test("88. DECLARE ro BIT block present when measured", () => {
      expect(bellQuil()).toMatch(/DECLARE ro BIT\[2\]/);
    });

    test("89. H gate emits as uppercase 'H'", () => {
      expect(bellQuil()).toMatch(/^H 0$/m);
    });

    test("90. CNOT emits as 'CNOT'", () => {
      expect(bellQuil()).toMatch(/^CNOT 0 1$/m);
    });

    test("91. MEASURE emits with ro[] reference", () => {
      expect(bellQuil()).toMatch(/MEASURE 0 ro\[0\]/);
    });

    test("92. RESET emits as 'RESET i'", () => {
      expect(bellQuil()).toMatch(/^RESET 0$/m);
    });

    test("93. No DECLARE when no measurements", () => {
      const out = capture(1, (q, ops) => {
        ops.h(q);
        ops.reset(q);
      }).toQuil();
      expect(out).not.toContain("DECLARE");
    });

    test("94. U3 decomposes to RZ·RY·RZ", () => {
      const out = capture(1, (q, ops) => {
        ops.u3(q, Math.PI, 0.5, 1.0);
        ops.reset(q);
      }).toQuil();
      const rzCount = (out.match(/^RZ/gm) || []).length;
      const ryCount = (out.match(/^RY/gm) || []).length;
      expect(rzCount).toBe(2);
      expect(ryCount).toBe(1);
    });

    test("95. CCX emits as 'CCNOT'", () => {
      const out = capture(3, (c1, c2, t, ops) => {
        ops.ccx(c1, c2, t);
        ops.reset(c1);
        ops.reset(c2);
        ops.reset(t);
      }).toQuil();
      expect(out).toMatch(/^CCNOT 0 1 2$/m);
    });

    test("96. RZZ emits DEFGATE definition", () => {
      const out = capture(2, (q0, q1, ops) => {
        ops.rzz(q0, q1, 0.3);
        ops.reset(q0);
        ops.reset(q1);
      }).toQuil();
      expect(out).toContain("DEFGATE RZZ");
    });

    test("97. IF (value=1) uses JUMP-WHEN pattern", () => {
      const out = capture(2, (q0, q1, ops) => {
        ops.x(q0);
        ops.m(q0);
        ops.if(q0, 1, (sub) => {
          sub.x(q1);
        });
        ops.reset(q0);
        ops.reset(q1);
      }).toQuil();
      expect(out).toMatch(/JUMP-WHEN @if_true_\d+ ro\[0\]/);
    });

    test("98. IF (value=0) skips body when bit is set", () => {
      const out = capture(2, (q0, q1, ops) => {
        ops.m(q0);
        ops.if(q0, 0, (sub) => {
          sub.x(q1);
        });
        ops.reset(q0);
        ops.reset(q1);
      }).toQuil();
      expect(out).toMatch(/JUMP-WHEN @if_end_\d+ ro\[0\]/);
    });

    test("99. WHILE emits as commented JUMP template", () => {
      const out = capture(1, (q, ops) => {
        ops.while(q, 1, (sub) => {
          sub.x(q);
        });
        ops.reset(q);
      }).toQuil();
      expect(out).toMatch(/# WHILE/);
      expect(out).toMatch(/# JUMP-WHEN/);
    });

    test("100. Parameterised gates include angle", () => {
      const out = capture(1, (q, ops) => {
        ops.rx(q, 1.23);
        ops.reset(q);
      }).toQuil();
      expect(out).toMatch(/RX\(1\.23\) 0/);
    });
  });

  // ── Cross-format consistency ──────────────────────────────────────────────

  describe("Cross-format", () => {
    test("101. All three formats export without throwing", () => {
      const c = capture(3, (q0, q1, q2, ops) => {
        ops.h(q0);
        ops.cnot(q0, q1);
        ops.cz(q1, q2);
        ops.rx(q0, 0.5);
        ops.ry(q1, 1.0);
        ops.rz(q2, 1.5);
        ops.ccx(q0, q1, q2);
        ops.m(q0);
        ops.m(q1);
        ops.m(q2);
        ops.reset(q0);
        ops.reset(q1);
        ops.reset(q2);
      });
      expect(() => c.toQASM2()).not.toThrow();
      expect(() => c.toQASM3()).not.toThrow();
      expect(() => c.toQuil()).not.toThrow();
    });

    test("102. toQASM2() output is a non-empty string", () => {
      const c = capture(1, (q, ops) => {
        ops.h(q);
        ops.reset(q);
      });
      expect(typeof c.toQASM2()).toBe("string");
      expect(c.toQASM2().length).toBeGreaterThan(0);
    });

    test("103. toQASM3() output is a non-empty string", () => {
      const c = capture(1, (q, ops) => {
        ops.h(q);
        ops.reset(q);
      });
      expect(typeof c.toQASM3()).toBe("string");
      expect(c.toQASM3().length).toBeGreaterThan(0);
    });

    test("104. toQuil() output is a non-empty string", () => {
      const c = capture(1, (q, ops) => {
        ops.h(q);
        ops.reset(q);
      });
      expect(typeof c.toQuil()).toBe("string");
      expect(c.toQuil().length).toBeGreaterThan(0);
    });

    test("105. Q.use() still works after Q.circuit() calls", () => {
      capture(1, (q, ops) => {
        ops.h(q);
        ops.reset(q);
      });
      expect(() => {
        Q.use(1, (q, ops) => {
          ops.x(q);
          expect(ops.m(q)).toBe(1);
          ops.reset(q);
        });
      }).not.toThrow();
    });
  });
});
