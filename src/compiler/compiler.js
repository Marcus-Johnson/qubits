import { Optimizer } from "./optimizer.js";
import { Transpiler } from "./transpiler.js";

export class Compiler {
  /**
   * Compiles raw circuit instructions into optimized native basis instructions.
   * @param {Array} instructions - Raw instructions from the IR generator.
   * @returns {Array} - Fully compiled and optimized instructions.
   */
  static compile(instructions) {
    let processed = Optimizer.prune(instructions);

    processed = Transpiler.transpile(processed);

    processed = Optimizer.prune(processed);

    return processed;
  }
}
