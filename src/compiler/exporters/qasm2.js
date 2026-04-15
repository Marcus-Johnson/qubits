/**
 * OpenQASM 2.0 Exporter
 *
 * Targets: IBM Quantum (legacy), Amazon Braket (OpenQASM 2), IonQ (via Braket).
 * Spec: https://arxiv.org/abs/1707.03429
 *
 * Gate basis: qelib1.inc standard library.
 * RZZ is not in qelib1.inc it is defined inline as a custom gate.
 *
 * QASM 2.0 control flow is limited: `if` only guards a single gate and there
 * is no while loop.  Multi-gate IF bodies have the condition repeated per gate
 * (semantically equivalent for pure unitary bodies).  WHILE loops are emitted
 * as a comment block.
 *
 * Classical bits: one 1-bit creg per qubit (c0, c1, …) declared on demand.
 * This avoids the integer-encoding ambiguity of a single wide creg.
 */

/** Format a floating-point parameter with enough precision for gate angles. */
function fmt(n) {
  if (n === 0) return "0";
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toPrecision(10)).toString();
}

/**
 * Recursively walk instructions, collecting every qubit index that appears in
 * a MEASURE op and flagging whether RZZ is used anywhere.
 */
function scan(instructions, qubitIndex, measuredSet, flags) {
  for (const op of instructions) {
    if (op.gate === "MEASURE") measuredSet.add(qubitIndex.get(op.qubit));
    if (op.gate === "RZZ")     flags.hasRZZ = true;
    if (op.body)               scan(op.body, qubitIndex, measuredSet, flags);
  }
}

/** Emit one instruction (or a block of instructions for IF bodies). */
function emitOp(op, qubitIndex, lines, indent) {
  const qi   = (q) => qubitIndex.get(q);
  const p    = op.params || [];
  const ind  = indent;

  switch (op.gate) {
    case "H":      lines.push(`${ind}h q[${qi(op.qubit)}];`);                                              break;
    case "X":      lines.push(`${ind}x q[${qi(op.qubit)}];`);                                              break;
    case "Y":      lines.push(`${ind}y q[${qi(op.qubit)}];`);                                              break;
    case "Z":      lines.push(`${ind}z q[${qi(op.qubit)}];`);                                              break;
    case "S":      lines.push(`${ind}s q[${qi(op.qubit)}];`);                                              break;
    case "T":      lines.push(`${ind}t q[${qi(op.qubit)}];`);                                              break;
    case "RX":     lines.push(`${ind}rx(${fmt(p[0])}) q[${qi(op.qubit)}];`);                              break;
    case "RY":     lines.push(`${ind}ry(${fmt(p[0])}) q[${qi(op.qubit)}];`);                              break;
    case "RZ":     lines.push(`${ind}rz(${fmt(p[0])}) q[${qi(op.qubit)}];`);                              break;
    case "U3":     lines.push(`${ind}u3(${fmt(p[0])},${fmt(p[1])},${fmt(p[2])}) q[${qi(op.qubit)}];`);   break;
    case "CNOT":   lines.push(`${ind}cx q[${qi(op.qubit[0])}],q[${qi(op.qubit[1])}];`);                   break;
    case "CZ":     lines.push(`${ind}cz q[${qi(op.qubit[0])}],q[${qi(op.qubit[1])}];`);                   break;
    case "SWAP":   lines.push(`${ind}swap q[${qi(op.qubit[0])}],q[${qi(op.qubit[1])}];`);                 break;
    case "RZZ":    lines.push(`${ind}rzz(${fmt(p[0])}) q[${qi(op.qubit[0])}],q[${qi(op.qubit[1])}];`);   break;
    case "CCX":    lines.push(`${ind}ccx q[${qi(op.qubit[0])}],q[${qi(op.qubit[1])}],q[${qi(op.qubit[2])}];`); break;
    case "MEASURE":lines.push(`${ind}measure q[${qi(op.qubit)}] -> c${qi(op.qubit)}[0];`);                break;
    case "RESET":  lines.push(`${ind}reset q[${qi(op.qubit)}];`);                                         break;

    case "IF": {
      // QASM 2.0: repeat the condition before every body gate.
      const cIdx = qi(op.condition.qubit);
      const val  = op.condition.value;
      for (const bodyOp of op.body) {
        // Temporarily capture the body gate as a string, then prepend the if guard.
        const bodyLines = [];
        emitOp(bodyOp, qubitIndex, bodyLines, "");
        for (const line of bodyLines) {
          lines.push(`${ind}if(c${cIdx}==${val}) ${line.trim()}`);
        }
      }
      break;
    }

    case "WHILE": {
      const cIdx = qi(op.condition.qubit);
      const val  = op.condition.value;
      lines.push(`${ind}// WHILE (c${cIdx}==${val}): no direct QASM 2.0 equivalent.`);
      lines.push(`${ind}// Unroll manually or migrate to QASM 3.0 for native while support.`);
      lines.push(`${ind}// Body:`);
      for (const bodyOp of op.body) emitOp(bodyOp, qubitIndex, lines, `${ind}//   `);
      break;
    }

    default:
      lines.push(`${ind}// Unsupported gate: ${op.gate}`);
  }
}

/**
 * Convert a captured circuit to an OpenQASM 2.0 string.
 *
 * @param {number}          qubitCount
 * @param {Map<symbol,number>} qubitIndex
 * @param {readonly object[]}  instructions  Raw (pre-compilation) IR.
 * @returns {string}
 */
export function toQASM2(qubitCount, qubitIndex, instructions) {
  const measuredQubits = new Set();
  const flags          = { hasRZZ: false };
  scan(instructions, qubitIndex, measuredQubits, flags);

  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push("OPENQASM 2.0;");
  lines.push('include "qelib1.inc";');
  lines.push("");

  // ── Registers ─────────────────────────────────────────────────────────────
  lines.push(`qreg q[${qubitCount}];`);
  for (const qi of [...measuredQubits].sort((a, b) => a - b)) {
    lines.push(`creg c${qi}[1];`);
  }

  // ── Custom gate definitions ────────────────────────────────────────────────
  if (flags.hasRZZ) {
    lines.push("");
    lines.push("// RZZ(θ) = exp(-i θ/2 · Z⊗Z) not in qelib1.inc");
    lines.push("gate rzz(theta) a,b {");
    lines.push("    cx a,b;");
    lines.push("    rz(theta) b;");
    lines.push("    cx a,b;");
    lines.push("}");
  }

  // ── Circuit body ──────────────────────────────────────────────────────────
  lines.push("");
  for (const op of instructions) emitOp(op, qubitIndex, lines, "");

  return lines.join("\n");
}