/**
 * Quil Exporter
 *
 * Targets: Rigetti QCS (Quantum Cloud Services).
 * Spec: https://github.com/quil-lang/quil
 *
 * Quil uses integer qubit indices (0-based), a DECLARE block for classical
 * memory, and MEASURE writes to named classical memory regions.
 *
 * Gate mapping notes:
 *   - U3(θ,φ,λ) has no Quil equivalent.  It is decomposed to the ZYZ sequence
 *     RZ(λ)·RY(θ)·RZ(φ), which is equivalent up to global phase.
 *   - CCX → CCNOT (Quil spelling).
 *   - RZZ is emitted via DEFGATE when used.
 *   - WHILE is not supported in standard Quil 1/2; emitted as a comment.
 *   - IF is implemented with JUMP-WHEN / JUMP / LABEL.
 *
 * Classical memory: one shared `ro` BIT region sized to the qubit count.
 */

function fmt(n) {
  if (n === 0) return "0";
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toPrecision(10)).toString();
}

/** Counter for generating unique label names. */
let _labelCounter = 0;
function nextLabel(prefix) {
  return `@${prefix}_${_labelCounter++}`;
}

function scan(instructions, qubitIndex, measuredSet, flags) {
  for (const op of instructions) {
    if (op.gate === "MEASURE") measuredSet.add(qubitIndex.get(op.qubit));
    if (op.gate === "RZZ")     flags.hasRZZ   = true;
    if (op.gate === "WHILE")   flags.hasWhile = true;
    if (op.body)               scan(op.body, qubitIndex, measuredSet, flags);
  }
}

/**
 * Build the 4×4 RZZ matrix rows in Quil DEFGATE format.
 * RZZ(θ): diag(e^{-iθ/2}, e^{iθ/2}, e^{iθ/2}, e^{-iθ/2})
 * Quil DEFGATE uses symbolic `theta` via DEFGATE-PRAGMA or a static matrix.
 * We emit a parameterised DEFGATE using the Quil 2.0 syntax.
 */
function rzzDefgate() {
  return [
    "DEFGATE RZZ(%theta) p q",
    "    cis(-(%theta/2)), 0, 0, 0",
    "    0, cis(%theta/2), 0, 0",
    "    0, 0, cis(%theta/2), 0",
    "    0, 0, 0, cis(-(%theta/2))",
    "END",
    "",
  ];
}

function emitOp(op, qubitIndex, lines, indent) {
  const qi  = (q) => qubitIndex.get(q);
  const p   = op.params || [];
  const ind = indent;

  switch (op.gate) {
    case "H":    lines.push(`${ind}H ${qi(op.qubit)}`);                                               break;
    case "X":    lines.push(`${ind}X ${qi(op.qubit)}`);                                               break;
    case "Y":    lines.push(`${ind}Y ${qi(op.qubit)}`);                                               break;
    case "Z":    lines.push(`${ind}Z ${qi(op.qubit)}`);                                               break;
    case "S":    lines.push(`${ind}S ${qi(op.qubit)}`);                                               break;
    case "T":    lines.push(`${ind}T ${qi(op.qubit)}`);                                               break;
    case "RX":   lines.push(`${ind}RX(${fmt(p[0])}) ${qi(op.qubit)}`);                               break;
    case "RY":   lines.push(`${ind}RY(${fmt(p[0])}) ${qi(op.qubit)}`);                               break;
    case "RZ":   lines.push(`${ind}RZ(${fmt(p[0])}) ${qi(op.qubit)}`);                               break;

    case "U3": {
      // Decompose U3(θ,φ,λ) = RZ(φ)·RY(θ)·RZ(λ)  (up to global phase)
      const [theta, phi, lambda] = p;
      lines.push(`${ind}RZ(${fmt(lambda)}) ${qi(op.qubit)}`);
      lines.push(`${ind}RY(${fmt(theta)}) ${qi(op.qubit)}`);
      lines.push(`${ind}RZ(${fmt(phi)}) ${qi(op.qubit)}`);
      break;
    }

    case "CNOT": lines.push(`${ind}CNOT ${qi(op.qubit[0])} ${qi(op.qubit[1])}`);                     break;
    case "CZ":   lines.push(`${ind}CZ ${qi(op.qubit[0])} ${qi(op.qubit[1])}`);                       break;
    case "SWAP": lines.push(`${ind}SWAP ${qi(op.qubit[0])} ${qi(op.qubit[1])}`);                     break;
    case "RZZ":  lines.push(`${ind}RZZ(${fmt(p[0])}) ${qi(op.qubit[0])} ${qi(op.qubit[1])}`);        break;
    case "CCX":  lines.push(`${ind}CCNOT ${qi(op.qubit[0])} ${qi(op.qubit[1])} ${qi(op.qubit[2])}`); break;
    case "MEASURE": lines.push(`${ind}MEASURE ${qi(op.qubit)} ro[${qi(op.qubit)}]`);                 break;
    case "RESET":   lines.push(`${ind}RESET ${qi(op.qubit)}`);                                       break;

    case "IF": {
      // Quil: JUMP-WHEN / JUMP / LABEL pattern.
      const roIdx  = qi(op.condition.qubit);
      const val    = op.condition.value;
      const lTrue  = nextLabel("if_true");
      const lEnd   = nextLabel("if_end");

      if (val === 1) {
        lines.push(`${ind}JUMP-WHEN ${lTrue} ro[${roIdx}]`);
        lines.push(`${ind}JUMP ${lEnd}`);
        lines.push(`${ind}LABEL ${lTrue}`);
        for (const bodyOp of op.body) emitOp(bodyOp, qubitIndex, lines, ind);
        lines.push(`${ind}LABEL ${lEnd}`);
      } else {
        // Condition is 0: skip body when bit is 1
        lines.push(`${ind}JUMP-WHEN ${lEnd} ro[${roIdx}]`);
        for (const bodyOp of op.body) emitOp(bodyOp, qubitIndex, lines, ind);
        lines.push(`${ind}LABEL ${lEnd}`);
      }
      break;
    }

    case "WHILE": {
      const cIdx = qi(op.condition.qubit);
      const val  = op.condition.value;
      lines.push(`${ind}# WHILE (ro[${cIdx}]==${val}): Quil has no native while.`);
      lines.push(`${ind}# Equivalent JUMP pattern (requires re-measurement inside body):`);
      const lCheck = nextLabel("while_check");
      const lBody  = nextLabel("while_body");
      const lEnd   = nextLabel("while_end");
      lines.push(`${ind}# LABEL ${lCheck}`);
      if (val === 1) {
        lines.push(`${ind}# JUMP-WHEN ${lBody} ro[${cIdx}]`);
        lines.push(`${ind}# JUMP ${lEnd}`);
      } else {
        lines.push(`${ind}# JUMP-WHEN ${lEnd} ro[${cIdx}]`);
      }
      lines.push(`${ind}# LABEL ${lBody}`);
      for (const bodyOp of op.body) lines.push(`${ind}#   ${bodyOpToString(bodyOp, qubitIndex)}`);
      lines.push(`${ind}# JUMP ${lCheck}`);
      lines.push(`${ind}# LABEL ${lEnd}`);
      break;
    }

    default:
      lines.push(`${ind}# Unsupported gate: ${op.gate}`);
  }
}

function bodyOpToString(op, qubitIndex) {
  const tmp = [];
  emitOp(op, qubitIndex, tmp, "");
  return tmp.join(" / ");
}

/**
 * Convert a captured circuit to a Quil string.
 *
 * @param {number}             qubitCount
 * @param {Map<symbol,number>} qubitIndex
 * @param {readonly object[]}  instructions  Raw (pre-compilation) IR.
 * @returns {string}
 */
export function toQuil(qubitCount, qubitIndex, instructions) {
  _labelCounter = 0; // reset for deterministic output

  const measuredQubits = new Set();
  const flags          = { hasRZZ: false, hasWhile: false };
  scan(instructions, qubitIndex, measuredQubits, flags);

  const lines = [];

  // ── Custom gate definitions ────────────────────────────────────────────────
  if (flags.hasRZZ) {
    lines.push(...rzzDefgate());
  }

  // ── Classical memory declaration ──────────────────────────────────────────
  if (measuredQubits.size > 0) {
    lines.push(`DECLARE ro BIT[${qubitCount}]`);
    lines.push("");
  }

  // ── Circuit body ──────────────────────────────────────────────────────────
  for (const op of instructions) emitOp(op, qubitIndex, lines, "");

  return lines.join("\n");
}