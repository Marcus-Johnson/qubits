import { Optimizer } from "./optimizer.js";
import { Transpiler } from "./transpiler.js";

/**
 * Double-prune compilation pipeline:
 *   1. Optimize raw IR  (collapse obvious redundancies before decomposition).
 *   2. Transpile        (decompose to native {U3, CNOT} basis).
 *   3. Optimize again   (clean up any new identities introduced by decomposition).
 */
export class Compiler {
  /**
   * @param {ReadonlyArray} instructions - Raw instructions from the IR generator.
   * @returns {ReadonlyArray} Compiled, optimised native instructions.
   */
  static compile(instructions) {
    let ir = Optimizer.prune(instructions);
    ir     = Transpiler.transpile(ir);
    ir     = Optimizer.prune(ir);
    return ir;
  }
}