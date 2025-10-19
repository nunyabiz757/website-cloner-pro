import * as babel from '@babel/core';

interface ModernizationOptions {
  varToLet?: boolean;
  varToConst?: boolean;
  arrowFunctions?: boolean;
  templateLiterals?: boolean;
  destructuring?: boolean;
  spreadOperator?: boolean;
  classProperties?: boolean;
  asyncAwait?: boolean;
  promisify?: boolean;
  esModules?: boolean;
  optionalChaining?: boolean;
  nullishCoalescing?: boolean;
  removeIIFE?: boolean;
  modernizeLoops?: boolean;
}

interface ModernizationResult {
  modernizedCode: string;
  transformations: Transformation[];
  warnings: string[];
  statistics: {
    varConverted: number;
    functionsConverted: number;
    callbacksConverted: number;
    linesReduced: number;
    originalLines: number;
    modernizedLines: number;
  };
  compatibilityLevel: string;
}

interface Transformation {
  type: string;
  description: string;
  lineNumber?: number;
  before?: string;
  after?: string;
}

export class LegacyCodeModernizationService {
  /**
   * Modernize legacy JavaScript code
   */
  async modernize(
    code: string,
    options: ModernizationOptions = {}
  ): Promise<ModernizationResult> {
    const defaults: ModernizationOptions = {
      varToLet: true,
      varToConst: true,
      arrowFunctions: true,
      templateLiterals: true,
      destructuring: true,
      spreadOperator: true,
      classProperties: true,
      asyncAwait: true,
      promisify: true,
      esModules: true,
      optionalChaining: true,
      nullishCoalescing: true,
      removeIIFE: true,
      modernizeLoops: true,
    };

    const opts = { ...defaults, ...options };
    const transformations: Transformation[] = [];
    const warnings: string[] = [];

    let modernizedCode = code;
    const originalLines = code.split('\n').length;

    // 1. Convert var to let/const
    if (opts.varToLet || opts.varToConst) {
      const result = this.convertVarToLetConst(modernizedCode, opts.varToConst!);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 2. Convert function expressions to arrow functions
    if (opts.arrowFunctions) {
      const result = this.convertToArrowFunctions(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 3. Convert string concatenation to template literals
    if (opts.templateLiterals) {
      const result = this.convertToTemplateLiterals(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 4. Add destructuring where applicable
    if (opts.destructuring) {
      const result = this.addDestructuring(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 5. Convert callbacks to async/await
    if (opts.asyncAwait) {
      const result = this.convertToAsyncAwait(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 6. Convert CommonJS to ES Modules
    if (opts.esModules) {
      const result = this.convertToESModules(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 7. Remove IIFE (Immediately Invoked Function Expressions)
    if (opts.removeIIFE) {
      const result = this.removeIIFE(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 8. Modernize loops
    if (opts.modernizeLoops) {
      const result = this.modernizeLoops(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 9. Add optional chaining
    if (opts.optionalChaining) {
      const result = this.addOptionalChaining(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    // 10. Add nullish coalescing
    if (opts.nullishCoalescing) {
      const result = this.addNullishCoalescing(modernizedCode);
      modernizedCode = result.code;
      transformations.push(...result.transformations);
    }

    const modernizedLines = modernizedCode.split('\n').length;

    // Count specific transformations
    const varConverted = transformations.filter((t) => t.type === 'var-to-let-const').length;
    const functionsConverted = transformations.filter((t) => t.type === 'arrow-function').length;
    const callbacksConverted = transformations.filter((t) => t.type === 'async-await').length;

    return {
      modernizedCode,
      transformations,
      warnings,
      statistics: {
        varConverted,
        functionsConverted,
        callbacksConverted,
        linesReduced: originalLines - modernizedLines,
        originalLines,
        modernizedLines,
      },
      compatibilityLevel: 'ES2020+',
    };
  }

  /**
   * Convert var to let/const
   */
  private convertVarToLetConst(
    code: string,
    preferConst: boolean
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Simple regex-based approach (production would use AST)
    const varDeclarations = code.match(/var\s+(\w+)\s*=([^;]+);/g) || [];

    varDeclarations.forEach((declaration) => {
      const varName = declaration.match(/var\s+(\w+)/)?.[1];
      if (varName) {
        // Check if variable is reassigned (simple heuristic)
        const reassignmentRegex = new RegExp(`${varName}\\s*=(?!=)`, 'g');
        const isReassigned = (code.match(reassignmentRegex) || []).length > 1;

        const newKeyword = !isReassigned && preferConst ? 'const' : 'let';
        const newDeclaration = declaration.replace('var', newKeyword);

        newCode = newCode.replace(declaration, newDeclaration);

        transformations.push({
          type: 'var-to-let-const',
          description: `Converted var ${varName} to ${newKeyword}`,
          before: declaration,
          after: newDeclaration,
        });
      }
    });

    return { code: newCode, transformations };
  }

  /**
   * Convert function expressions to arrow functions
   */
  private convertToArrowFunctions(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Convert function expressions
    const functionExpRegex = /(\w+)\s*=\s*function\s*\(([^)]*)\)\s*{/g;
    let match;
    let count = 0;

    while ((match = functionExpRegex.exec(code)) !== null) {
      const [fullMatch, varName, params] = match;
      const arrowFunc = `${varName} = (${params}) => {`;

      newCode = newCode.replace(fullMatch, arrowFunc);
      count++;
    }

    if (count > 0) {
      transformations.push({
        type: 'arrow-function',
        description: `Converted ${count} function expression(s) to arrow functions`,
      });
    }

    // Convert anonymous functions in callbacks
    const callbackRegex = /function\s*\(([^)]*)\)\s*{/g;
    newCode = newCode.replace(callbackRegex, '($1) => {');

    return { code: newCode, transformations };
  }

  /**
   * Convert string concatenation to template literals
   */
  private convertToTemplateLiterals(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Simple pattern: 'string' + variable + 'string'
    const concatRegex = /'([^']*?)'\s*\+\s*(\w+)\s*\+\s*'([^']*?)'/g;
    let count = 0;

    newCode = newCode.replace(concatRegex, (match, before, variable, after) => {
      count++;
      return `\`${before}\${${variable}}${after}\``;
    });

    if (count > 0) {
      transformations.push({
        type: 'template-literal',
        description: `Converted ${count} string concatenation(s) to template literals`,
      });
    }

    return { code: newCode, transformations };
  }

  /**
   * Add destructuring where applicable
   */
  private addDestructuring(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Convert object property access to destructuring
    // Pattern: var x = obj.x; var y = obj.y;
    const propertyRegex = /(?:var|let|const)\s+(\w+)\s*=\s*(\w+)\.(\1);/g;
    let count = 0;

    const matches = [...code.matchAll(propertyRegex)];
    if (matches.length > 0) {
      // Group by object
      const grouped = new Map<string, string[]>();

      matches.forEach((match) => {
        const [, prop, obj] = match;
        if (!grouped.has(obj)) {
          grouped.set(obj, []);
        }
        grouped.get(obj)!.push(prop);
      });

      grouped.forEach((props, obj) => {
        if (props.length > 1) {
          const destructure = `const { ${props.join(', ')} } = ${obj};`;
          props.forEach((prop) => {
            const oldPattern = new RegExp(`(?:var|let|const)\\s+${prop}\\s*=\\s*${obj}\\.${prop};`, 'g');
            newCode = newCode.replace(oldPattern, '');
          });

          // Add destructuring statement
          newCode = `${destructure}\n${newCode}`;
          count++;

          transformations.push({
            type: 'destructuring',
            description: `Added destructuring for ${props.length} properties from ${obj}`,
          });
        }
      });
    }

    return { code: newCode, transformations };
  }

  /**
   * Convert callbacks to async/await
   */
  private convertToAsyncAwait(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Convert .then() chains to async/await
    const thenChainRegex = /(\w+)\.then\(\s*(?:function\s*)?\(([^)]*)\)\s*=>\s*{([^}]+)}\s*\)/g;
    let count = 0;

    const matches = [...code.matchAll(thenChainRegex)];
    matches.forEach((match) => {
      const [fullMatch, promise, param, body] = match;
      const asyncVersion = `const ${param} = await ${promise};\n${body}`;

      newCode = newCode.replace(fullMatch, asyncVersion);
      count++;
    });

    if (count > 0) {
      // Add async keyword to function
      newCode = newCode.replace(/function\s+(\w+)\s*\(/, 'async function $1(');

      transformations.push({
        type: 'async-await',
        description: `Converted ${count} promise chain(s) to async/await`,
      });
    }

    return { code: newCode, transformations };
  }

  /**
   * Convert CommonJS to ES Modules
   */
  private convertToESModules(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Convert require() to import
    const requireRegex = /(?:const|var|let)\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g;
    let count = 0;

    newCode = newCode.replace(requireRegex, (match, varName, modulePath) => {
      count++;
      return `import ${varName} from '${modulePath}';`;
    });

    // Convert destructured require
    const destructureRequireRegex = /(?:const|var|let)\s+{\s*([^}]+)\s*}\s*=\s*require\(['"]([^'"]+)['"]\);?/g;
    newCode = newCode.replace(destructureRequireRegex, (match, imports, modulePath) => {
      count++;
      return `import { ${imports} } from '${modulePath}';`;
    });

    // Convert module.exports to export
    newCode = newCode.replace(/module\.exports\s*=\s*/g, 'export default ');
    newCode = newCode.replace(/exports\.(\w+)\s*=\s*/g, 'export const $1 = ');

    if (count > 0) {
      transformations.push({
        type: 'es-modules',
        description: `Converted ${count} require() statement(s) to ES imports`,
      });
    }

    return { code: newCode, transformations };
  }

  /**
   * Remove IIFE (Immediately Invoked Function Expressions)
   */
  private removeIIFE(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Pattern: (function() { ... })();
    const iifeRegex = /\(function\s*\([^)]*\)\s*{\s*([\s\S]*?)\s*}\)\(\);?/g;
    let count = 0;

    newCode = newCode.replace(iifeRegex, (match, body) => {
      count++;
      return `// Module scope\n${body}`;
    });

    if (count > 0) {
      transformations.push({
        type: 'remove-iife',
        description: `Removed ${count} IIFE pattern(s) (use ES modules instead)`,
      });
    }

    return { code: newCode, transformations };
  }

  /**
   * Modernize loops
   */
  private modernizeLoops(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Convert for loops to for...of where applicable
    // Pattern: for (var i = 0; i < arr.length; i++) { ... arr[i] ... }
    const forLoopRegex = /for\s*\(\s*(?:var|let)\s+(\w+)\s*=\s*0;\s*\1\s*<\s*(\w+)\.length;\s*\1\+\+\s*\)\s*{([^}]+)}/g;
    let count = 0;

    newCode = newCode.replace(forLoopRegex, (match, iterator, array, body) => {
      // Check if body uses array[i]
      if (body.includes(`${array}[${iterator}]`)) {
        const itemName = array.slice(0, -1); // Remove 's' for singular
        const newBody = body.replace(new RegExp(`${array}\\[${iterator}\\]`, 'g'), itemName);
        count++;
        return `for (const ${itemName} of ${array}) {${newBody}}`;
      }
      return match;
    });

    if (count > 0) {
      transformations.push({
        type: 'modernize-loop',
        description: `Converted ${count} for loop(s) to for...of`,
      });
    }

    return { code: newCode, transformations };
  }

  /**
   * Add optional chaining
   */
  private addOptionalChaining(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Pattern: obj && obj.prop && obj.prop.nested
    const chainRegex = /(\w+)\s*&&\s*\1\.(\w+)\s*&&\s*\1\.\2\.(\w+)/g;
    let count = 0;

    newCode = newCode.replace(chainRegex, (match, obj, prop1, prop2) => {
      count++;
      return `${obj}?.${prop1}?.${prop2}`;
    });

    if (count > 0) {
      transformations.push({
        type: 'optional-chaining',
        description: `Added optional chaining to ${count} expression(s)`,
      });
    }

    return { code: newCode, transformations };
  }

  /**
   * Add nullish coalescing
   */
  private addNullishCoalescing(
    code: string
  ): { code: string; transformations: Transformation[] } {
    const transformations: Transformation[] = [];
    let newCode = code;

    // Pattern: value !== null && value !== undefined ? value : default
    const ternaryRegex = /(\w+)\s*!==\s*null\s*&&\s*\1\s*!==\s*undefined\s*\?\s*\1\s*:\s*([^;]+)/g;
    let count = 0;

    newCode = newCode.replace(ternaryRegex, (match, value, defaultValue) => {
      count++;
      return `${value} ?? ${defaultValue}`;
    });

    // Simpler pattern: value || default (when null/undefined check is intended)
    // This is more aggressive and might need context
    // const orRegex = /(\w+)\s*\|\|\s*([^;]+)/g;
    // newCode = newCode.replace(orRegex, '$1 ?? $2');

    if (count > 0) {
      transformations.push({
        type: 'nullish-coalescing',
        description: `Added nullish coalescing to ${count} expression(s)`,
      });
    }

    return { code: newCode, transformations };
  }

  /**
   * Analyze code and suggest modernizations
   */
  async analyzeCode(code: string): Promise<{
    suggestions: string[];
    compatibility: {
      es5Features: number;
      es6Features: number;
      modernFeatures: number;
    };
    estimatedImprovement: number;
  }> {
    const suggestions: string[] = [];
    let es5Features = 0;
    let es6Features = 0;
    let modernFeatures = 0;

    // Check for var usage
    const varCount = (code.match(/\bvar\s+/g) || []).length;
    if (varCount > 0) {
      es5Features += varCount;
      suggestions.push(`Replace ${varCount} var declaration(s) with let/const`);
    }

    // Check for function expressions
    const funcExpCount = (code.match(/function\s*\(/g) || []).length;
    if (funcExpCount > 0) {
      es5Features += funcExpCount;
      suggestions.push(`Convert ${funcExpCount} function(s) to arrow functions`);
    }

    // Check for string concatenation
    const concatCount = (code.match(/['"][^'"]*['"]\s*\+\s*/g) || []).length;
    if (concatCount > 0) {
      es5Features += concatCount;
      suggestions.push(`Convert ${concatCount} string concatenation(s) to template literals`);
    }

    // Check for callbacks
    const callbackCount = (code.match(/\.then\(/g) || []).length;
    if (callbackCount > 0) {
      es6Features += callbackCount;
      suggestions.push(`Convert ${callbackCount} promise(s) to async/await`);
    }

    // Check for require()
    const requireCount = (code.match(/require\(/g) || []).length;
    if (requireCount > 0) {
      es5Features += requireCount;
      suggestions.push(`Convert ${requireCount} require() to ES6 imports`);
    }

    // Check for modern features already present
    if (code.includes('?.')) modernFeatures++;
    if (code.includes('??')) modernFeatures++;
    if (code.includes('async ') || code.includes('await ')) modernFeatures++;

    const totalFeatures = es5Features + es6Features + modernFeatures;
    const estimatedImprovement = totalFeatures > 0
      ? Math.round((es5Features + es6Features * 0.5) / totalFeatures * 100)
      : 0;

    return {
      suggestions,
      compatibility: {
        es5Features,
        es6Features,
        modernFeatures,
      },
      estimatedImprovement,
    };
  }
}
