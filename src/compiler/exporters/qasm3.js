/**
 * OpenQASM 3.0 Exporter
 *
 * Targets: IBM Quantum (new stack), Amazon Braket, Azure Quantum, IonQ.
 * Spec: https://openqasm.com/
 *
 * QASM 3.0 improvements over 2.0 used here:
 *   - `qubit[n]` / `bit[n]` declarations (no include needed for standard gates).
 *   - `c[i] = measure q[i]` assignment syntax.
 *   - Proper block `if (...) { ... }` / `while (...) { ... }` statements.
 *   - `reset` is a statement, not a gate.
 *
 * RZZ is defined as a custom `gate` at the top of the file when used.
 */

function fmt(n) {
  if (n === 0) return "0";
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toPrecision(10)).toString();
}

function scan(instructions, qubitIndex, measuredSet, flags) {
  for (const op of instructions) {
    if (op.gate === "MEASURE") measuredSet.add(qubitIndex.get(op.qubit));
    if (op.gate === "RZZ")     flags.hasRZZ   = true;
    if (op.gate === "WHILE")   flags.hasWhile = true;
    if (op.body)               scan(op.body, qubitIndex, measuredSet, flags);
  }
}

function emitOp(op, qubitIndex, lines, indent) {
  const qi  = (q) => qubitIndex.get(q);
  const p   = op.params || [];
  const ind = indent;

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
    case "U3":     lines.push(`${ind}U(${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])}) q[${qi(op.qubit)}];`);  break;
    case "CNOT":   lines.push(`${ind}cx q[${qi(op.qubit[0])}], q[${qi(op.qubit[1])}];`);                  break;
    case "CZ":     lines.push(`${ind}cz q[${qi(op.qubit[0])}], q[${qi(op.qubit[1])}];`);                  break;
    case "SWAP":   lines.push(`${ind}swap q[${qi(op.qubit[0])}], q[${qi(op.qubit[1])}];`);                break;
    case "RZZ":    lines.push(`${ind}rzz(${fmt(p[0])}) q[${qi(op.qubit[0])}], q[${qi(op.qubit[1])}];`);  break;
    case "CCX":    lines.push(`${ind}ccx q[${qi(op.qubit[0])}], q[${qi(op.qubit[1])}], q[${qi(op.qubit[2])}];`); break;
    case "MEASURE":lines.push(`${ind}c[${qi(op.qubit)}] = measure q[${qi(op.qubit)}];`);                  break;
    case "RESET":  lines.push(`${ind}reset q[${qi(op.qubit)}];`);                                         break;

    case "IF": {
      const cIdx = qi(op.condition.qubit);
      const val  = op.condition.value;
      lines.push(`${ind}if (c[${cIdx}] == ${val}) {`);
      for (const bodyOp of op.body) emitOp(bodyOp, qubitIndex, lines, `${ind}  `);
      lines.push(`${ind}}`);
      break;
    }

    case "WHILE": {
      const cIdx = qi(op.condition.qubit);
      const val  = op.condition.value;
      lines.push(`${ind}while (c[${cIdx}] == ${val}) {`);
      for (const bodyOp of op.body) emitOp(bodyOp, qubitIndex, lines, `${ind}  `);
      lines.push(`${ind}}`);
      break;
    }

    default:
      lines.push(`${ind}// Unsupported gate: ${op.gate}`);
  }
}

/**
 * Convert a captured circuit to an OpenQASM 3.0 string.
 *
 * @param {number}             qubitCount
 * @param {Map<symbol,number>} qubitIndex
 * @param {readonly object[]}  instructions  Raw (pre-compilation) IR.
 * @returns {string}
 */
export function toQASM3(qubitCount, qubitIndex, instructions) {
  const measuredQubits = new Set();
  const flags          = { hasRZZ: false, hasWhile: false };
  scan(instructions, qubitIndex, measuredQubits, flags);

  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push("OPENQASM 3.0;");
  lines.push("");

  // ── Custom gate definitions ────────────────────────────────────────────────
  if (flags.hasRZZ) {
    lines.push("// RZZ(θ) = exp(-i θ/2 · Z⊗Z)");
    lines.push("gate rzz(theta) a, b {");
    lines.push("  cx a, b;");
    lines.push("  rz(theta) b;");
    lines.push("  cx a, b;");
    lines.push("}");
    lines.push("");
  }

  // ── Registers ─────────────────────────────────────────────────────────────
  lines.push(`qubit[${qubitCount}] q;`);
  if (measuredQubits.size > 0) {
    lines.push(`bit[${qubitCount}] c;`);
  }
  lines.push("");

  // ── Circuit body ──────────────────────────────────────────────────────────
  for (const op of instructions) emitOp(op, qubitIndex, lines, "");

  return lines.join("\n");
}