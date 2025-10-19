import * as cheerio from 'cheerio';
import * as babel from '@babel/core';

type Framework = 'react' | 'vue' | 'angular' | 'svelte' | 'vanilla';

interface FrameworkConversionOptions {
  sourceFramework?: Framework;
  targetFramework: Framework;
  typescript?: boolean;
  preserveComments?: boolean;
  generateConfig?: boolean;
}

interface FrameworkConversionResult {
  convertedCode: string;
  framework: Framework;
  files: ConvertedFile[];
  configFiles: ConfigFile[];
  warnings: string[];
  statistics: {
    componentsConverted: number;
    hooksConverted: number;
    linesOfCode: number;
  };
}

interface ConvertedFile {
  path: string;
  content: string;
  type: 'component' | 'style' | 'config' | 'util';
}

interface ConfigFile {
  filename: string;
  content: string;
  description: string;
}

interface DetectedFramework {
  framework: Framework;
  confidence: number;
  version?: string;
  indicators: string[];
}

export class FrameworkConversionService {
  /**
   * Detect framework from code
   */
  async detectFramework(code: string): Promise<DetectedFramework> {
    const indicators: string[] = [];
    let framework: Framework = 'vanilla';
    let confidence = 0;

    // React detection
    if (
      code.includes('import React') ||
      code.includes('from "react"') ||
      code.includes('from \'react\'') ||
      code.includes('useState') ||
      code.includes('useEffect') ||
      code.includes('React.Component')
    ) {
      framework = 'react';
      confidence = 95;
      indicators.push('React imports', 'React hooks');
    }

    // Vue detection
    if (
      code.includes('from "vue"') ||
      code.includes('from \'vue\'') ||
      code.includes('export default {') && code.includes('data()') ||
      code.includes('<template>') ||
      code.includes('v-bind') ||
      code.includes('v-for')
    ) {
      framework = 'vue';
      confidence = 95;
      indicators.push('Vue imports', 'Vue directives');
    }

    // Angular detection
    if (
      code.includes('@angular/core') ||
      code.includes('@Component') ||
      code.includes('@Injectable') ||
      code.includes('ngOnInit')
    ) {
      framework = 'angular';
      confidence = 95;
      indicators.push('Angular decorators', 'Angular lifecycle');
    }

    // Svelte detection
    if (
      code.includes('<script>') && code.includes('</script>') &&
      code.includes('<style>') && code.includes('</style>') &&
      code.includes('export let')
    ) {
      framework = 'svelte';
      confidence = 90;
      indicators.push('Svelte component structure');
    }

    return { framework, confidence, indicators };
  }

  /**
   * Convert between frameworks
   */
  async convertFramework(
    code: string,
    htmlContent: string,
    options: FrameworkConversionOptions
  ): Promise<FrameworkConversionResult> {
    const warnings: string[] = [];
    const files: ConvertedFile[] = [];
    let componentsConverted = 0;
    let hooksConverted = 0;

    // Detect source framework if not provided
    const sourceFramework = options.sourceFramework || (await this.detectFramework(code)).framework;

    let convertedCode = '';

    // Conversion matrix
    if (sourceFramework === 'react' && options.targetFramework === 'vue') {
      const result = this.reactToVue(code, htmlContent, options);
      convertedCode = result.code;
      files.push(...result.files);
      componentsConverted = result.componentsConverted;
      hooksConverted = result.hooksConverted;
    } else if (sourceFramework === 'vue' && options.targetFramework === 'react') {
      const result = this.vueToReact(code, htmlContent, options);
      convertedCode = result.code;
      files.push(...result.files);
      componentsConverted = result.componentsConverted;
    } else if (options.targetFramework === 'vanilla') {
      const result = this.toVanilla(code, htmlContent, sourceFramework, options);
      convertedCode = result.code;
      files.push(...result.files);
      componentsConverted = result.componentsConverted;
    } else {
      warnings.push(`Conversion from ${sourceFramework} to ${options.targetFramework} not yet implemented`);
      convertedCode = code; // Return original
    }

    // Generate config files
    const configFiles = options.generateConfig
      ? this.generateConfigFiles(options.targetFramework, options.typescript)
      : [];

    const linesOfCode = convertedCode.split('\n').length;

    return {
      convertedCode,
      framework: options.targetFramework,
      files,
      configFiles,
      warnings,
      statistics: {
        componentsConverted,
        hooksConverted,
        linesOfCode,
      },
    };
  }

  /**
   * Convert React to Vue
   */
  private reactToVue(
    code: string,
    htmlContent: string,
    options: FrameworkConversionOptions
  ): { code: string; files: ConvertedFile[]; componentsConverted: number; hooksConverted: number } {
    const files: ConvertedFile[] = [];
    let componentsConverted = 0;
    let hooksConverted = 0;

    // Parse React component
    const componentName = this.extractComponentName(code) || 'MyComponent';
    const $ = cheerio.load(htmlContent);

    // Convert JSX to Vue template
    let template = this.convertJSXToVueTemplate(htmlContent);

    // Convert hooks to Vue Composition API
    const { script, hooks } = this.convertReactHooksToVue(code);
    hooksConverted = hooks;

    // Generate Vue 3 SFC
    const vueComponent = `<template>
${template}
</template>

<script${options.typescript ? ' lang="ts"' : ''}>
${script}
</script>

<style scoped>
/* Component styles */
</style>
`;

    files.push({
      path: `${componentName}.vue`,
      content: vueComponent,
      type: 'component',
    });

    componentsConverted = 1;

    return {
      code: vueComponent,
      files,
      componentsConverted,
      hooksConverted,
    };
  }

  /**
   * Convert Vue to React
   */
  private vueToReact(
    code: string,
    htmlContent: string,
    options: FrameworkConversionOptions
  ): { code: string; files: ConvertedFile[]; componentsConverted: number } {
    const files: ConvertedFile[] = [];
    let componentsConverted = 0;

    const componentName = this.extractComponentName(code) || 'MyComponent';

    // Convert Vue template to JSX
    const jsx = this.convertVueTemplateToJSX(htmlContent);

    // Convert Vue script to React
    const reactCode = this.convertVueScriptToReact(code, componentName, options.typescript);

    // Generate React component
    const reactComponent = `${reactCode}

function ${componentName}() {
  // Component logic here

  return (
    ${jsx}
  );
}

export default ${componentName};
`;

    files.push({
      path: `${componentName}.${options.typescript ? 'tsx' : 'jsx'}`,
      content: reactComponent,
      type: 'component',
    });

    componentsConverted = 1;

    return {
      code: reactComponent,
      files,
      componentsConverted,
    };
  }

  /**
   * Convert to Vanilla JavaScript
   */
  private toVanilla(
    code: string,
    htmlContent: string,
    sourceFramework: Framework,
    options: FrameworkConversionOptions
  ): { code: string; files: ConvertedFile[]; componentsConverted: number } {
    const files: ConvertedFile[] = [];
    let componentsConverted = 0;

    // Remove framework-specific code
    let vanillaCode = code;

    // Remove imports
    vanillaCode = vanillaCode.replace(/import .+ from .+;?\n/g, '');

    // Remove exports
    vanillaCode = vanillaCode.replace(/export (default |{ .+ })?/g, '');

    // Convert to plain DOM manipulation
    const domCode = `
// Vanilla JavaScript implementation
document.addEventListener('DOMContentLoaded', function() {
  // Component logic
  ${vanillaCode}

  // Render function
  function render() {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = \`${htmlContent}\`;
    }
  }

  render();
});
`;

    files.push({
      path: 'app.js',
      content: domCode,
      type: 'component',
    });

    files.push({
      path: 'index.html',
      content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Vanilla JS App</title>
</head>
<body>
  <div id="root"></div>
  <script src="app.js"></script>
</body>
</html>`,
      type: 'config',
    });

    componentsConverted = 1;

    return {
      code: domCode,
      files,
      componentsConverted,
    };
  }

  /**
   * Convert JSX to Vue template
   */
  private convertJSXToVueTemplate(jsx: string): string {
    let template = jsx;

    // Convert className to class
    template = template.replace(/className=/g, 'class=');

    // Convert onClick to @click
    template = template.replace(/onClick=/g, '@click=');

    // Convert onChange to @input
    template = template.replace(/onChange=/g, '@input=');

    // Convert {variable} to {{ variable }}
    template = template.replace(/\{([^}]+)\}/g, '{{ $1 }}');

    // Convert map to v-for
    template = template.replace(/\.map\(([^)]+)\s*=>\s*\(/g, 'v-for="$1 in items"');

    return template;
  }

  /**
   * Convert React hooks to Vue Composition API
   */
  private convertReactHooksToVue(code: string): { script: string; hooks: number } {
    let script = code;
    let hooks = 0;

    // Convert useState to ref
    const useStateRegex = /const\s+\[(\w+),\s*set(\w+)\]\s*=\s*useState\(([^)]*)\)/g;
    script = script.replace(useStateRegex, (match, name, setter, initial) => {
      hooks++;
      return `const ${name} = ref(${initial})`;
    });

    // Convert useEffect to onMounted/watch
    if (script.includes('useEffect')) {
      hooks++;
      script = script.replace(/useEffect\(/g, 'onMounted(');
    }

    // Add Vue imports
    const imports = [];
    if (script.includes('ref(')) imports.push('ref');
    if (script.includes('onMounted(')) imports.push('onMounted');

    if (imports.length > 0) {
      script = `import { ${imports.join(', ')} } from 'vue';\n\n${script}`;
    }

    return { script, hooks };
  }

  /**
   * Convert Vue template to JSX
   */
  private convertVueTemplateToJSX(template: string): string {
    let jsx = template;

    // Convert v-for to map
    jsx = jsx.replace(/v-for="(\w+)\s+in\s+(\w+)"/g, (match, item, items) => {
      return `{${items}.map(${item} => (`;
    });

    // Convert v-if to conditional rendering
    jsx = jsx.replace(/v-if="([^"]+)"/g, '{$1 && (');

    // Convert @click to onClick
    jsx = jsx.replace(/@click=/g, 'onClick=');

    // Convert class to className
    jsx = jsx.replace(/\sclass=/g, ' className=');

    return jsx;
  }

  /**
   * Convert Vue script to React
   */
  private convertVueScriptToReact(code: string, componentName: string, typescript?: boolean): string {
    let reactCode = '';

    // Add React import
    reactCode += `import React, { useState, useEffect } from 'react';\n\n`;

    // Convert data() to useState
    const dataMatch = code.match(/data\(\)\s*{\s*return\s*{([^}]+)}/);
    if (dataMatch) {
      const dataProperties = dataMatch[1].split(',').map((prop) => prop.trim());
      dataProperties.forEach((prop) => {
        const [name, value] = prop.split(':').map((s) => s.trim());
        if (name && value) {
          reactCode += `const [${name}, set${name.charAt(0).toUpperCase() + name.slice(1)}] = useState(${value});\n`;
        }
      });
    }

    return reactCode;
  }

  /**
   * Extract component name from code
   */
  private extractComponentName(code: string): string | null {
    // Try to find component name
    const matches = [
      code.match(/function\s+(\w+)/),
      code.match(/const\s+(\w+)\s*=/),
      code.match(/class\s+(\w+)/),
      code.match(/export\s+default\s+(\w+)/),
    ];

    for (const match of matches) {
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Generate config files for target framework
   */
  private generateConfigFiles(framework: Framework, typescript?: boolean): ConfigFile[] {
    const configs: ConfigFile[] = [];

    switch (framework) {
      case 'react':
        configs.push({
          filename: 'package.json',
          content: JSON.stringify({
            name: 'converted-react-app',
            version: '1.0.0',
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0',
            },
            devDependencies: typescript ? {
              '@types/react': '^18.2.0',
              '@types/react-dom': '^18.2.0',
              typescript: '^5.0.0',
            } : {},
          }, null, 2),
          description: 'React package configuration',
        });

        if (typescript) {
          configs.push({
            filename: 'tsconfig.json',
            content: JSON.stringify({
              compilerOptions: {
                target: 'ES2020',
                lib: ['ES2020', 'DOM'],
                jsx: 'react-jsx',
                module: 'ESNext',
                moduleResolution: 'bundler',
                strict: true,
              },
            }, null, 2),
            description: 'TypeScript configuration',
          });
        }
        break;

      case 'vue':
        configs.push({
          filename: 'package.json',
          content: JSON.stringify({
            name: 'converted-vue-app',
            version: '1.0.0',
            dependencies: {
              vue: '^3.3.0',
            },
            devDependencies: typescript ? {
              '@vue/compiler-sfc': '^3.3.0',
              typescript: '^5.0.0',
            } : {},
          }, null, 2),
          description: 'Vue package configuration',
        });

        configs.push({
          filename: 'vite.config.js',
          content: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
})`,
          description: 'Vite configuration for Vue',
        });
        break;

      case 'vanilla':
        configs.push({
          filename: 'package.json',
          content: JSON.stringify({
            name: 'converted-vanilla-app',
            version: '1.0.0',
            scripts: {
              start: 'npx serve .',
            },
          }, null, 2),
          description: 'Package configuration',
        });
        break;
    }

    return configs;
  }
}
