import * as cheerio from 'cheerio';
import csstree from 'css-tree';
import postcss from 'postcss';
import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';

export interface ParsedHTML {
  html: string;
  title: string;
  meta: {
    description?: string;
    keywords?: string;
    viewport?: string;
    charset?: string;
    ogTags: Record<string, string>;
  };
  links: {
    stylesheets: string[];
    scripts: string[];
    images: string[];
    videos: string[];
    fonts: string[];
    favicons: string[];
    preloads: string[];
    prefetches: string[];
  };
  inlineStyles: string[];
  inlineScripts: string[];
  externalDependencies: string[];
  domStructure: {
    totalElements: number;
    semanticElements: number;
    interactiveElements: number;
    formElements: number;
  };
}

export interface ParsedCSS {
  raw: string;
  rules: CSSRule[];
  mediaQueries: MediaQuery[];
  keyframes: Keyframe[];
  fontFaces: FontFace[];
  customProperties: CustomProperty[];
  imports: string[];
  urls: string[];
  totalRules: number;
  selectors: string[];
}

export interface CSSRule {
  selector: string;
  properties: Record<string, string>;
  mediaQuery?: string;
}

export interface MediaQuery {
  query: string;
  rules: CSSRule[];
  minWidth?: number;
  maxWidth?: number;
  orientation?: string;
}

export interface Keyframe {
  name: string;
  frames: Array<{
    offset: string;
    properties: Record<string, string>;
  }>;
}

export interface FontFace {
  fontFamily: string;
  src: string[];
  fontWeight?: string;
  fontStyle?: string;
  fontDisplay?: string;
}

export interface CustomProperty {
  name: string;
  value: string;
  selector: string;
}

export interface ParsedJS {
  raw: string;
  type: 'module' | 'script';
  imports: string[];
  exports: string[];
  dependencies: string[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  variables: VariableInfo[];
  eventListeners: EventListenerInfo[];
  asyncOperations: string[];
  errors: string[];
}

export interface FunctionInfo {
  name: string;
  async: boolean;
  params: string[];
  type: 'function' | 'arrow' | 'method';
}

export interface ClassInfo {
  name: string;
  extends?: string;
  methods: string[];
  properties: string[];
}

export interface VariableInfo {
  name: string;
  type: 'const' | 'let' | 'var';
  scope: 'global' | 'local';
}

export interface EventListenerInfo {
  event: string;
  element?: string;
  delegated: boolean;
}

export class ParserService {
  /**
   * Parse HTML content
   */
  parseHTML(html: string, baseUrl?: string): ParsedHTML {
    const $ = cheerio.load(html);

    // Extract meta tags
    const meta = {
      description: $('meta[name="description"]').attr('content'),
      keywords: $('meta[name="keywords"]').attr('content'),
      viewport: $('meta[name="viewport"]').attr('content'),
      charset: $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content'),
      ogTags: {} as Record<string, string>,
    };

    // Extract Open Graph tags
    $('meta[property^="og:"]').each((_, el) => {
      const property = $(el).attr('property');
      const content = $(el).attr('content');
      if (property && content) {
        meta.ogTags[property] = content;
      }
    });

    // Extract links
    const links = {
      stylesheets: this.extractLinks($, 'link[rel="stylesheet"]', 'href', baseUrl),
      scripts: this.extractLinks($, 'script[src]', 'src', baseUrl),
      images: this.extractLinks($, 'img[src], source[srcset], picture source', 'src', baseUrl),
      videos: this.extractLinks($, 'video[src], video source', 'src', baseUrl),
      fonts: [] as string[],
      favicons: this.extractLinks($, 'link[rel*="icon"]', 'href', baseUrl),
      preloads: this.extractLinks($, 'link[rel="preload"]', 'href', baseUrl),
      prefetches: this.extractLinks($, 'link[rel="prefetch"]', 'href', baseUrl),
    };

    // Extract inline styles
    const inlineStyles: string[] = [];
    $('style').each((_, el) => {
      const content = $(el).html();
      if (content) inlineStyles.push(content);
    });

    // Extract inline scripts
    const inlineScripts: string[] = [];
    $('script:not([src])').each((_, el) => {
      const content = $(el).html();
      if (content) inlineScripts.push(content);
    });

    // Extract external dependencies
    const externalDependencies = new Set<string>();
    $('[src], [href]').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('href');
      if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//'))) {
        try {
          const url = new URL(src.startsWith('//') ? `https:${src}` : src);
          externalDependencies.add(url.origin);
        } catch {}
      }
    });

    // Analyze DOM structure
    const domStructure = {
      totalElements: $('*').length,
      semanticElements: $('header, nav, main, article, section, aside, footer').length,
      interactiveElements: $('button, a, input, select, textarea, [onclick], [role="button"]').length,
      formElements: $('form, input, select, textarea, button[type="submit"]').length,
    };

    return {
      html,
      title: $('title').text() || '',
      meta,
      links,
      inlineStyles,
      inlineScripts,
      externalDependencies: Array.from(externalDependencies),
      domStructure,
    };
  }

  /**
   * Extract links with optional base URL resolution
   */
  private extractLinks($: cheerio.CheerioAPI, selector: string, attr: string, baseUrl?: string): string[] {
    const links: string[] = [];
    $(selector).each((_, el) => {
      let link = $(el).attr(attr);
      if (link) {
        // Handle srcset
        if (attr === 'src' && $(el).attr('srcset')) {
          const srcset = $(el).attr('srcset');
          if (srcset) {
            srcset.split(',').forEach(src => {
              const url = src.trim().split(' ')[0];
              if (url) links.push(this.resolveUrl(url, baseUrl));
            });
          }
        }
        links.push(this.resolveUrl(link, baseUrl));
      }
    });
    return [...new Set(links)]; // Remove duplicates
  }

  /**
   * Resolve relative URLs
   */
  private resolveUrl(url: string, baseUrl?: string): string {
    if (!baseUrl || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url;
    }
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }

  /**
   * Parse CSS content
   */
  parseCSS(css: string): ParsedCSS {
    const result: ParsedCSS = {
      raw: css,
      rules: [],
      mediaQueries: [],
      keyframes: [],
      fontFaces: [],
      customProperties: [],
      imports: [],
      urls: [],
      totalRules: 0,
      selectors: [],
    };

    try {
      // Parse with postcss for better error handling
      const root = postcss.parse(css);

      root.walkRules((rule) => {
        const properties: Record<string, string> = {};

        rule.walkDecls((decl) => {
          properties[decl.prop] = decl.value;

          // Extract custom properties
          if (decl.prop.startsWith('--')) {
            result.customProperties.push({
              name: decl.prop,
              value: decl.value,
              selector: rule.selector,
            });
          }

          // Extract URLs from property values
          const urlMatches = decl.value.matchAll(/url\(['"]?([^'"]+)['"]?\)/g);
          for (const match of urlMatches) {
            result.urls.push(match[1]);
          }
        });

        // Check if rule is inside media query
        let mediaQuery: string | undefined;
        if (rule.parent && rule.parent.type === 'atrule' && rule.parent.name === 'media') {
          mediaQuery = (rule.parent as any).params;
        }

        const cssRule: CSSRule = {
          selector: rule.selector,
          properties,
          mediaQuery,
        };

        result.rules.push(cssRule);
        result.selectors.push(rule.selector);
        result.totalRules++;
      });

      // Extract media queries
      root.walkAtRules('media', (atRule) => {
        const query = atRule.params;
        const rules: CSSRule[] = [];

        atRule.walkRules((rule) => {
          const properties: Record<string, string> = {};
          rule.walkDecls((decl) => {
            properties[decl.prop] = decl.value;
          });
          rules.push({
            selector: rule.selector,
            properties,
          });
        });

        // Parse breakpoints
        const minWidthMatch = query.match(/min-width:\s*(\d+)px/);
        const maxWidthMatch = query.match(/max-width:\s*(\d+)px/);
        const orientationMatch = query.match(/orientation:\s*(landscape|portrait)/);

        result.mediaQueries.push({
          query,
          rules,
          minWidth: minWidthMatch ? parseInt(minWidthMatch[1]) : undefined,
          maxWidth: maxWidthMatch ? parseInt(maxWidthMatch[1]) : undefined,
          orientation: orientationMatch ? orientationMatch[1] : undefined,
        });
      });

      // Extract keyframes
      root.walkAtRules('keyframes', (atRule) => {
        const frames: Array<{ offset: string; properties: Record<string, string> }> = [];

        atRule.walkRules((rule) => {
          const properties: Record<string, string> = {};
          rule.walkDecls((decl) => {
            properties[decl.prop] = decl.value;
          });
          frames.push({
            offset: rule.selector,
            properties,
          });
        });

        result.keyframes.push({
          name: atRule.params,
          frames,
        });
      });

      // Extract font-face
      root.walkAtRules('font-face', (atRule) => {
        let fontFamily = '';
        const src: string[] = [];
        let fontWeight: string | undefined;
        let fontStyle: string | undefined;
        let fontDisplay: string | undefined;

        atRule.walkDecls((decl) => {
          if (decl.prop === 'font-family') {
            fontFamily = decl.value.replace(/['"]/g, '');
          } else if (decl.prop === 'src') {
            const urls = decl.value.matchAll(/url\(['"]?([^'"]+)['"]?\)/g);
            for (const match of urls) {
              src.push(match[1]);
              result.urls.push(match[1]);
            }
          } else if (decl.prop === 'font-weight') {
            fontWeight = decl.value;
          } else if (decl.prop === 'font-style') {
            fontStyle = decl.value;
          } else if (decl.prop === 'font-display') {
            fontDisplay = decl.value;
          }
        });

        if (fontFamily) {
          result.fontFaces.push({
            fontFamily,
            src,
            fontWeight,
            fontStyle,
            fontDisplay,
          });
        }
      });

      // Extract imports
      root.walkAtRules('import', (atRule) => {
        const url = atRule.params.replace(/^['"]|['"]$/g, '');
        result.imports.push(url);
      });

    } catch (error) {
      console.error('CSS parsing error:', error);
    }

    return result;
  }

  /**
   * Parse JavaScript content
   */
  parseJS(code: string): ParsedJS {
    const result: ParsedJS = {
      raw: code,
      type: 'script',
      imports: [],
      exports: [],
      dependencies: [],
      functions: [],
      classes: [],
      variables: [],
      eventListeners: [],
      asyncOperations: [],
      errors: [],
    };

    try {
      const ast = babelParse(code, {
        sourceType: 'unambiguous',
        plugins: ['jsx', 'typescript'],
      });

      result.type = ast.program.sourceType === 'module' ? 'module' : 'script';

      traverse.default(ast, {
        ImportDeclaration(path) {
          const source = path.node.source.value;
          result.imports.push(source);
          if (!source.startsWith('.') && !source.startsWith('/')) {
            result.dependencies.push(source.split('/')[0]);
          }
        },

        ExportNamedDeclaration(path) {
          if (path.node.declaration) {
            result.exports.push('named export');
          }
        },

        ExportDefaultDeclaration(path) {
          result.exports.push('default export');
        },

        FunctionDeclaration(path) {
          result.functions.push({
            name: path.node.id?.name || 'anonymous',
            async: path.node.async,
            params: path.node.params.map(p => (p as any).name || 'param'),
            type: 'function',
          });
        },

        ArrowFunctionExpression(path) {
          result.functions.push({
            name: 'arrow function',
            async: path.node.async,
            params: path.node.params.map(p => (p as any).name || 'param'),
            type: 'arrow',
          });
        },

        ClassDeclaration(path) {
          const className = path.node.id?.name || 'anonymous';
          const methods: string[] = [];
          const properties: string[] = [];

          path.node.body.body.forEach((member: any) => {
            if (member.type === 'ClassMethod') {
              methods.push(member.key.name || 'method');
            } else if (member.type === 'ClassProperty') {
              properties.push(member.key.name || 'property');
            }
          });

          result.classes.push({
            name: className,
            extends: (path.node.superClass as any)?.name,
            methods,
            properties,
          });
        },

        VariableDeclaration(path) {
          path.node.declarations.forEach((decl: any) => {
            if (decl.id.name) {
              result.variables.push({
                name: decl.id.name,
                type: path.node.kind as 'const' | 'let' | 'var',
                scope: path.scope.path.isProgram() ? 'global' : 'local',
              });
            }
          });
        },

        CallExpression(path) {
          const callee = path.node.callee;

          // Detect event listeners
          if ((callee as any).property?.name === 'addEventListener') {
            const eventArg = path.node.arguments[0];
            if (eventArg && eventArg.type === 'StringLiteral') {
              result.eventListeners.push({
                event: eventArg.value,
                delegated: false,
              });
            }
          }

          // Detect async operations
          if ((callee as any).name === 'fetch' || (callee as any).name === 'axios') {
            result.asyncOperations.push('HTTP request');
          }
          if ((callee as any).name === 'setTimeout' || (callee as any).name === 'setInterval') {
            result.asyncOperations.push('Timer');
          }
        },

        AwaitExpression(path) {
          result.asyncOperations.push('await');
        },
      });

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown parsing error');
    }

    // Remove duplicate dependencies
    result.dependencies = [...new Set(result.dependencies)];

    return result;
  }
}

export default new ParserService();
