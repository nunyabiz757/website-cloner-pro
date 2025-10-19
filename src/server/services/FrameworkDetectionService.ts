import * as cheerio from 'cheerio';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

interface Framework {
  name: string;
  version?: string;
  confidence: number; // 0-100
  indicators: string[];
}

interface Library {
  name: string;
  version?: string;
  type: 'ui' | 'utility' | 'animation' | 'chart' | 'form' | 'other';
  cdnUrl?: string;
}

interface BuildTool {
  name: string;
  indicators: string[];
}

interface FrameworkAnalysis {
  frameworks: Framework[];
  libraries: Library[];
  buildTools: BuildTool[];
  cssFrameworks: string[];
  uiComponents: string[];
  stateManagement: string[];
  recommendations: string[];
}

export class FrameworkDetectionService {
  private readonly frameworkPatterns = {
    react: {
      html: ['data-reactroot', 'data-reactid', '_reactRootContainer'],
      js: ['React.createElement', 'ReactDOM.render', 'useState', 'useEffect', '__REACT'],
      files: ['react.js', 'react.min.js', 'react-dom'],
    },
    vue: {
      html: ['v-if', 'v-for', 'v-bind', 'v-model', 'v-on', ':class', '@click'],
      js: ['Vue.component', 'new Vue', 'createApp', '__VUE__'],
      files: ['vue.js', 'vue.min.js', 'vue.runtime'],
    },
    angular: {
      html: ['ng-app', 'ng-controller', 'ng-model', 'ng-repeat', '*ngIf', '*ngFor', '[ngClass]'],
      js: ['angular.module', 'Angular', '@angular/core', '__NG__'],
      files: ['angular.js', 'angular.min.js', '@angular'],
    },
    svelte: {
      html: ['svelte-', 'class:'],
      js: ['SvelteComponent', 'svelte', '__SVELTE__'],
      files: ['svelte'],
    },
    nextjs: {
      html: ['__NEXT_DATA__', '__next'],
      js: ['next/router', 'next/link', '__NEXT__'],
      files: ['_next/', 'next.js'],
    },
    nuxt: {
      html: ['__NUXT__', '__nuxt'],
      js: ['nuxtReady', '$nuxt'],
      files: ['_nuxt/', 'nuxt.js'],
    },
    gatsby: {
      html: ['___gatsby', 'gatsby-'],
      js: ['gatsby', '___loader'],
      files: ['gatsby-'],
    },
    jquery: {
      html: ['data-toggle', 'data-target'],
      js: ['jQuery', '$', '$.fn', 'jquery'],
      files: ['jquery.js', 'jquery.min.js'],
    },
    backbone: {
      html: [],
      js: ['Backbone', 'Backbone.Model', 'Backbone.View'],
      files: ['backbone.js', 'backbone.min.js'],
    },
    ember: {
      html: ['ember-', 'data-ember-'],
      js: ['Ember', 'Ember.Application'],
      files: ['ember.js', 'ember.min.js'],
    },
  };

  private readonly cssFrameworks = {
    bootstrap: ['bootstrap', 'container', 'row', 'col-', 'btn-', 'navbar'],
    tailwind: ['tailwind', 'flex', 'grid', 'bg-', 'text-', 'px-', 'py-'],
    materialui: ['material-ui', 'MuiButton', 'MuiTextField', 'makeStyles'],
    bulma: ['bulma', 'columns', 'column', 'is-primary', 'has-text'],
    foundation: ['foundation', 'grid-x', 'cell', 'button', 'callout'],
    semantic: ['semantic-ui', 'ui container', 'ui button', 'ui grid'],
    antd: ['ant-', 'ant-btn', 'ant-table', 'ant-form'],
    chakra: ['chakra-ui', 'css-'],
  };

  private readonly libraries = {
    ui: ['material-ui', 'ant-design', 'chakra-ui', 'semantic-ui', 'blueprint', 'evergreen'],
    utility: ['lodash', 'underscore', 'ramda', 'moment', 'date-fns', 'axios', 'fetch'],
    animation: ['gsap', 'anime.js', 'framer-motion', 'react-spring', 'aos', 'wow.js'],
    chart: ['chart.js', 'd3', 'recharts', 'victory', 'highcharts', 'plotly'],
    form: ['formik', 'react-hook-form', 'redux-form', 'final-form'],
    state: ['redux', 'mobx', 'zustand', 'recoil', 'jotai', 'valtio'],
  };

  /**
   * Detect frameworks, libraries, and build tools
   */
  async detectFrameworks(
    htmlContent: string,
    jsContent?: string[],
    cssContent?: string[]
  ): Promise<FrameworkAnalysis> {
    const frameworks = this.detectJavaScriptFrameworks(htmlContent, jsContent);
    const libraries = this.detectLibraries(htmlContent, jsContent);
    const buildTools = this.detectBuildTools(htmlContent, jsContent);
    const cssFrameworks = this.detectCSSFrameworks(htmlContent, cssContent);
    const uiComponents = this.detectUIComponents(htmlContent, frameworks);
    const stateManagement = this.detectStateManagement(jsContent);
    const recommendations = this.generateRecommendations(frameworks, libraries, buildTools);

    return {
      frameworks,
      libraries,
      buildTools,
      cssFrameworks,
      uiComponents,
      stateManagement,
      recommendations,
    };
  }

  /**
   * Detect JavaScript frameworks
   */
  private detectJavaScriptFrameworks(
    htmlContent: string,
    jsContent?: string[]
  ): Framework[] {
    const detected: Framework[] = [];
    const $ = cheerio.load(htmlContent);

    for (const [name, patterns] of Object.entries(this.frameworkPatterns)) {
      let score = 0;
      const indicators: string[] = [];

      // Check HTML patterns
      for (const pattern of patterns.html) {
        if (htmlContent.includes(pattern)) {
          score += 20;
          indicators.push(`HTML: ${pattern}`);
        }
      }

      // Check for framework-specific attributes
      if (patterns.html.length > 0) {
        $('*').each((_, el) => {
          const attrs = Object.keys(el.attribs || {});
          for (const attr of attrs) {
            if (patterns.html.some((p) => attr.includes(p.replace(/[[\]]/g, '')))) {
              score += 10;
            }
          }
        });
      }

      // Check JavaScript patterns
      if (jsContent) {
        for (const js of jsContent) {
          for (const pattern of patterns.js) {
            if (js.includes(pattern)) {
              score += 25;
              indicators.push(`JS: ${pattern}`);
            }
          }
        }
      }

      // Check file patterns
      for (const filePattern of patterns.files) {
        if (htmlContent.includes(filePattern)) {
          score += 15;
          indicators.push(`File: ${filePattern}`);
        }
      }

      // Detect version
      const version = this.extractVersion(htmlContent, jsContent, name);

      if (score > 30) {
        // Threshold for detection
        detected.push({
          name,
          version,
          confidence: Math.min(score, 100),
          indicators,
        });
      }
    }

    // Sort by confidence
    return detected.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract version from content
   */
  private extractVersion(
    htmlContent: string,
    jsContent: string[] | undefined,
    frameworkName: string
  ): string | undefined {
    // Common version patterns
    const versionPatterns = [
      new RegExp(`${frameworkName}[/@]([\\d.]+)`, 'i'),
      new RegExp(`version['"]?:\\s*['"]([\\d.]+)['"]`, 'i'),
      /v?(\d+\.\d+\.\d+)/,
    ];

    // Check HTML
    for (const pattern of versionPatterns) {
      const match = htmlContent.match(pattern);
      if (match) return match[1];
    }

    // Check JS content
    if (jsContent) {
      for (const js of jsContent) {
        for (const pattern of versionPatterns) {
          const match = js.match(pattern);
          if (match) return match[1];
        }
      }
    }

    return undefined;
  }

  /**
   * Detect libraries
   */
  private detectLibraries(htmlContent: string, jsContent?: string[]): Library[] {
    const detected: Library[] = [];
    const allContent = [htmlContent, ...(jsContent || [])].join(' ');

    for (const [type, libs] of Object.entries(this.libraries)) {
      for (const lib of libs) {
        const regex = new RegExp(lib.replace(/[.-]/g, '[.-]'), 'i');
        if (regex.test(allContent)) {
          const version = this.extractVersion(htmlContent, jsContent, lib);
          const cdnUrl = this.extractCDNUrl(htmlContent, lib);

          detected.push({
            name: lib,
            version,
            type: type as Library['type'],
            cdnUrl,
          });
        }
      }
    }

    return detected;
  }

  /**
   * Extract CDN URL for a library
   */
  private extractCDNUrl(htmlContent: string, libraryName: string): string | undefined {
    const $ = cheerio.load(htmlContent);
    let cdnUrl: string | undefined;

    $('script[src], link[href]').each((_, el) => {
      const url = $(el).attr('src') || $(el).attr('href');
      if (url && url.includes(libraryName)) {
        cdnUrl = url;
        return false; // break
      }
    });

    return cdnUrl;
  }

  /**
   * Detect build tools
   */
  private detectBuildTools(htmlContent: string, jsContent?: string[]): BuildTool[] {
    const buildTools: BuildTool[] = [];
    const allContent = [htmlContent, ...(jsContent || [])].join(' ');

    const patterns = {
      webpack: ['webpack', '__webpack_require__', 'webpackJsonp'],
      vite: ['vite', '/@vite/', 'import.meta.hot'],
      parcel: ['parcel', 'parcelRequire'],
      rollup: ['rollup', 'rollupOptions'],
      gulp: ['gulp', 'gulpfile'],
      grunt: ['grunt', 'gruntfile'],
      browserify: ['browserify', '_browserify'],
      esbuild: ['esbuild'],
      turbopack: ['turbopack'],
    };

    for (const [name, indicators] of Object.entries(patterns)) {
      const foundIndicators = indicators.filter((indicator) =>
        allContent.toLowerCase().includes(indicator.toLowerCase())
      );

      if (foundIndicators.length > 0) {
        buildTools.push({ name, indicators: foundIndicators });
      }
    }

    return buildTools;
  }

  /**
   * Detect CSS frameworks
   */
  private detectCSSFrameworks(htmlContent: string, cssContent?: string[]): string[] {
    const detected: string[] = [];
    const $ = cheerio.load(htmlContent);
    const allClasses = new Set<string>();

    // Collect all classes
    $('[class]').each((_, el) => {
      const classes = $(el).attr('class')?.split(/\s+/) || [];
      classes.forEach((c) => allClasses.add(c));
    });

    const allClassesStr = Array.from(allClasses).join(' ');
    const allCSSContent = (cssContent || []).join(' ');

    for (const [name, patterns] of Object.entries(this.cssFrameworks)) {
      let matches = 0;

      for (const pattern of patterns) {
        if (allClassesStr.includes(pattern) || allCSSContent.includes(pattern)) {
          matches++;
        }
      }

      // Need at least 3 matching patterns to confirm
      if (matches >= 3) {
        detected.push(name);
      }
    }

    return detected;
  }

  /**
   * Detect UI component patterns
   */
  private detectUIComponents(htmlContent: string, frameworks: Framework[]): string[] {
    const components: string[] = [];
    const $ = cheerio.load(htmlContent);

    // Check for common UI patterns
    const patterns = {
      navbar: 'nav, [role="navigation"], .navbar, .nav',
      sidebar: 'aside, .sidebar, .side-nav',
      modal: '[role="dialog"], .modal, .popup',
      carousel: '.carousel, .slider, .swiper',
      tabs: '[role="tablist"], .tabs, .tab-list',
      accordion: '.accordion, .collapse',
      dropdown: '.dropdown, [role="menu"]',
      datepicker: 'input[type="date"], .datepicker',
      autocomplete: '[role="combobox"], .autocomplete',
    };

    for (const [name, selector] of Object.entries(patterns)) {
      if ($(selector).length > 0) {
        components.push(name);
      }
    }

    // Check for React/Vue specific components
    if (frameworks.some((f) => f.name === 'react')) {
      $('[class*="Component"], [class*="component"]').each((_, el) => {
        const className = $(el).attr('class') || '';
        if (className) components.push(`React: ${className}`);
      });
    }

    return [...new Set(components)];
  }

  /**
   * Detect state management libraries
   */
  private detectStateManagement(jsContent?: string[]): string[] {
    if (!jsContent) return [];

    const stateLibraries: string[] = [];
    const patterns = {
      redux: ['createStore', 'combineReducers', 'applyMiddleware', 'useSelector', 'useDispatch'],
      mobx: ['observable', 'makeObservable', 'observer', 'action'],
      zustand: ['create(', 'zustand'],
      recoil: ['atom(', 'selector(', 'useRecoilState'],
      jotai: ['atom(', 'jotai', 'useAtom'],
      valtio: ['proxy(', 'useSnapshot', 'valtio'],
      context: ['createContext', 'useContext', 'Provider'],
    };

    for (const js of jsContent) {
      for (const [name, indicators] of Object.entries(patterns)) {
        if (indicators.some((indicator) => js.includes(indicator))) {
          if (!stateLibraries.includes(name)) {
            stateLibraries.push(name);
          }
        }
      }
    }

    return stateLibraries;
  }

  /**
   * Generate recommendations based on detected frameworks
   */
  private generateRecommendations(
    frameworks: Framework[],
    libraries: Library[],
    buildTools: BuildTool[]
  ): string[] {
    const recommendations: string[] = [];

    // Framework recommendations
    if (frameworks.length === 0) {
      recommendations.push('No major JavaScript framework detected. Site may use vanilla JS.');
    } else if (frameworks.length > 1) {
      recommendations.push(
        `Multiple frameworks detected: ${frameworks.map((f) => f.name).join(', ')}. Consider consolidating to one framework.`
      );
    }

    // Version recommendations
    for (const framework of frameworks) {
      if (!framework.version) {
        recommendations.push(
          `Unable to detect version for ${framework.name}. Ensure you're using the latest stable version.`
        );
      }
    }

    // Build tool recommendations
    if (buildTools.length === 0) {
      recommendations.push(
        'No build tool detected. Consider using Vite, Webpack, or esbuild for optimization.'
      );
    } else if (buildTools.length > 1) {
      recommendations.push(
        `Multiple build tools detected: ${buildTools.map((b) => b.name).join(', ')}. This may indicate a migration or misconfiguration.`
      );
    }

    // Library recommendations
    const animationLibs = libraries.filter((l) => l.type === 'animation');
    if (animationLibs.length > 2) {
      recommendations.push(
        `Multiple animation libraries detected (${animationLibs.length}). Consider consolidating to reduce bundle size.`
      );
    }

    // Modern framework recommendations
    const modernFrameworks = ['react', 'vue', 'svelte'];
    const hasModernFramework = frameworks.some((f) => modernFrameworks.includes(f.name));

    if (hasModernFramework) {
      recommendations.push(
        'Modern framework detected. Ensure tree-shaking and code splitting are enabled.'
      );
    }

    return recommendations;
  }

  /**
   * Analyze JavaScript imports and dependencies
   */
  async analyzeJSDependencies(jsContent: string): Promise<{
    imports: string[];
    exports: string[];
    moduleType: 'esm' | 'commonjs' | 'umd' | 'unknown';
  }> {
    try {
      const ast = parse(jsContent, {
        sourceType: 'unambiguous',
        plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      });

      const imports: string[] = [];
      const exports: string[] = [];
      let moduleType: 'esm' | 'commonjs' | 'umd' | 'unknown' = 'unknown';

      traverse(ast, {
        ImportDeclaration(path) {
          moduleType = 'esm';
          if (path.node.source.value) {
            imports.push(path.node.source.value as string);
          }
        },
        ExportNamedDeclaration(path) {
          moduleType = 'esm';
          if (path.node.source?.value) {
            exports.push(path.node.source.value as string);
          }
        },
        CallExpression(path) {
          // Check for require() (CommonJS)
          if (
            path.node.callee.type === 'Identifier' &&
            path.node.callee.name === 'require' &&
            path.node.arguments[0]?.type === 'StringLiteral'
          ) {
            moduleType = 'commonjs';
            imports.push(path.node.arguments[0].value);
          }
        },
      });

      // Check for UMD pattern
      if (
        jsContent.includes('typeof define') &&
        jsContent.includes('typeof module') &&
        jsContent.includes('typeof exports')
      ) {
        moduleType = 'umd';
      }

      return {
        imports: [...new Set(imports)],
        exports: [...new Set(exports)],
        moduleType,
      };
    } catch (error) {
      console.error('Failed to analyze JS dependencies:', error);
      return { imports: [], exports: [], moduleType: 'unknown' };
    }
  }
}
