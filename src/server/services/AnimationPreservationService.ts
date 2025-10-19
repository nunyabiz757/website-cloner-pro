import puppeteer, { Browser, Page } from 'puppeteer';
import * as css from 'css';

interface CSSAnimation {
  name: string;
  duration: string;
  timingFunction: string;
  delay: string;
  iterationCount: string;
  direction: string;
  fillMode: string;
  playState: string;
  keyframes: Keyframe[];
}

interface CSSTransition {
  property: string;
  duration: string;
  timingFunction: string;
  delay: string;
}

interface Keyframe {
  offset: string;
  properties: Record<string, string>;
}

interface InteractionEvent {
  selector: string;
  eventType: string;
  handler: string;
  changes: {
    property: string;
    valueBefore: string;
    valueAfter: string;
  }[];
}

interface ScrollAnimation {
  selector: string;
  trigger: string;
  animationType: 'css' | 'js';
  description: string;
}

interface AnimationAnalysis {
  cssAnimations: CSSAnimation[];
  cssTransitions: Map<string, CSSTransition[]>;
  interactions: InteractionEvent[];
  scrollAnimations: ScrollAnimation[];
  animationLibraries: string[];
  recommendations: string[];
}

export class AnimationPreservationService {
  private readonly animationLibraries = [
    'animate.css',
    'gsap',
    'anime.js',
    'velocity.js',
    'mo.js',
    'scrollreveal',
    'aos',
    'wow.js',
    'vivus',
    'lottie',
  ];

  /**
   * Analyze and preserve animations from a website
   */
  async analyzeAnimations(
    url: string,
    htmlContent: string,
    cssContent?: string[]
  ): Promise<AnimationAnalysis> {
    let browser: Browser | null = null;

    try {
      // Parse CSS animations and transitions
      const cssAnimations = cssContent ? this.extractCSSAnimations(cssContent) : [];
      const cssTransitions = cssContent ? this.extractCSSTransitions(cssContent) : new Map();

      // Detect animation libraries
      const animationLibraries = this.detectAnimationLibraries(htmlContent, cssContent);

      // Launch browser for runtime analysis
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Detect interaction-based animations
      const interactions = await this.detectInteractionAnimations(page);

      // Detect scroll-based animations
      const scrollAnimations = await this.detectScrollAnimations(page);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        cssAnimations,
        cssTransitions,
        interactions,
        scrollAnimations,
        animationLibraries
      );

      await browser.close();

      return {
        cssAnimations,
        cssTransitions,
        interactions,
        scrollAnimations,
        animationLibraries,
        recommendations,
      };
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Extract CSS @keyframes animations
   */
  private extractCSSAnimations(cssFiles: string[]): CSSAnimation[] {
    const animations: CSSAnimation[] = [];
    const keyframesMap = new Map<string, Keyframe[]>();

    for (const cssContent of cssFiles) {
      try {
        const ast = css.parse(cssContent);

        if (ast.stylesheet?.rules) {
          // First pass: collect keyframes
          for (const rule of ast.stylesheet.rules) {
            if (rule.type === 'keyframes' && (rule as any).name) {
              const name = (rule as any).name;
              const keyframes: Keyframe[] = [];

              if ((rule as any).keyframes) {
                for (const keyframe of (rule as any).keyframes) {
                  const properties: Record<string, string> = {};

                  if (keyframe.declarations) {
                    for (const decl of keyframe.declarations) {
                      if (decl.type === 'declaration' && decl.property && decl.value) {
                        properties[decl.property] = decl.value;
                      }
                    }
                  }

                  keyframes.push({
                    offset: keyframe.values?.join(', ') || '0%',
                    properties,
                  });
                }
              }

              keyframesMap.set(name, keyframes);
            }
          }

          // Second pass: find animation usages
          this.findAnimationUsages(ast.stylesheet.rules, keyframesMap, animations);
        }
      } catch (error) {
        console.error('Failed to parse CSS animations:', error);
      }
    }

    return animations;
  }

  /**
   * Find usages of animations in CSS rules
   */
  private findAnimationUsages(
    rules: any[],
    keyframesMap: Map<string, Keyframe[]>,
    animations: CSSAnimation[]
  ): void {
    for (const rule of rules) {
      if (rule.type === 'rule' && rule.declarations) {
        let animationName = '';
        let duration = '0s';
        let timingFunction = 'ease';
        let delay = '0s';
        let iterationCount = '1';
        let direction = 'normal';
        let fillMode = 'none';
        let playState = 'running';

        for (const decl of rule.declarations) {
          if (decl.type !== 'declaration') continue;

          switch (decl.property) {
            case 'animation-name':
              animationName = decl.value;
              break;
            case 'animation-duration':
              duration = decl.value;
              break;
            case 'animation-timing-function':
              timingFunction = decl.value;
              break;
            case 'animation-delay':
              delay = decl.value;
              break;
            case 'animation-iteration-count':
              iterationCount = decl.value;
              break;
            case 'animation-direction':
              direction = decl.value;
              break;
            case 'animation-fill-mode':
              fillMode = decl.value;
              break;
            case 'animation-play-state':
              playState = decl.value;
              break;
            case 'animation':
              // Parse shorthand
              const parts = decl.value.split(/\s+/);
              animationName = parts[0];
              if (parts[1]?.match(/[\d.]+m?s/)) duration = parts[1];
              if (parts[2]?.match(/ease|linear|cubic-bezier/)) timingFunction = parts[2];
              if (parts[3]?.match(/[\d.]+m?s/)) delay = parts[3];
              if (parts[4]?.match(/\d+|infinite/)) iterationCount = parts[4];
              break;
          }
        }

        if (animationName && keyframesMap.has(animationName)) {
          animations.push({
            name: animationName,
            duration,
            timingFunction,
            delay,
            iterationCount,
            direction,
            fillMode,
            playState,
            keyframes: keyframesMap.get(animationName)!,
          });
        }
      } else if (rule.type === 'media' && rule.rules) {
        this.findAnimationUsages(rule.rules, keyframesMap, animations);
      }
    }
  }

  /**
   * Extract CSS transitions
   */
  private extractCSSTransitions(cssFiles: string[]): Map<string, CSSTransition[]> {
    const transitionsMap = new Map<string, CSSTransition[]>();

    for (const cssContent of cssFiles) {
      try {
        const ast = css.parse(cssContent);

        if (ast.stylesheet?.rules) {
          this.findTransitionUsages(ast.stylesheet.rules, transitionsMap);
        }
      } catch (error) {
        console.error('Failed to parse CSS transitions:', error);
      }
    }

    return transitionsMap;
  }

  /**
   * Find transition usages in CSS rules
   */
  private findTransitionUsages(
    rules: any[],
    transitionsMap: Map<string, CSSTransition[]>
  ): void {
    for (const rule of rules) {
      if (rule.type === 'rule' && rule.declarations && rule.selectors) {
        const transitions: CSSTransition[] = [];
        let transitionProperty = 'all';
        let transitionDuration = '0s';
        let transitionTimingFunction = 'ease';
        let transitionDelay = '0s';

        for (const decl of rule.declarations) {
          if (decl.type !== 'declaration') continue;

          switch (decl.property) {
            case 'transition-property':
              transitionProperty = decl.value;
              break;
            case 'transition-duration':
              transitionDuration = decl.value;
              break;
            case 'transition-timing-function':
              transitionTimingFunction = decl.value;
              break;
            case 'transition-delay':
              transitionDelay = decl.value;
              break;
            case 'transition':
              // Parse shorthand
              const parts = decl.value.split(/\s+/);
              transitionProperty = parts[0] || 'all';
              transitionDuration = parts[1] || '0s';
              transitionTimingFunction = parts[2] || 'ease';
              transitionDelay = parts[3] || '0s';
              break;
          }
        }

        if (transitionDuration !== '0s') {
          const properties = transitionProperty.split(',').map((p) => p.trim());

          for (const prop of properties) {
            transitions.push({
              property: prop,
              duration: transitionDuration,
              timingFunction: transitionTimingFunction,
              delay: transitionDelay,
            });
          }
        }

        if (transitions.length > 0) {
          for (const selector of rule.selectors) {
            transitionsMap.set(selector, transitions);
          }
        }
      } else if (rule.type === 'media' && rule.rules) {
        this.findTransitionUsages(rule.rules, transitionsMap);
      }
    }
  }

  /**
   * Detect animation libraries used
   */
  private detectAnimationLibraries(
    htmlContent: string,
    cssContent?: string[]
  ): string[] {
    const detected: string[] = [];

    // Check HTML for script/link tags
    for (const lib of this.animationLibraries) {
      const regex = new RegExp(lib.replace('.', '\\.'), 'i');
      if (regex.test(htmlContent)) {
        detected.push(lib);
      }
    }

    // Check CSS content
    if (cssContent) {
      for (const css of cssContent) {
        for (const lib of this.animationLibraries) {
          const regex = new RegExp(lib.replace('.', '\\.'), 'i');
          if (regex.test(css) && !detected.includes(lib)) {
            detected.push(lib);
          }
        }
      }
    }

    return detected;
  }

  /**
   * Detect interaction-based animations (hover, click, focus)
   */
  private async detectInteractionAnimations(page: Page): Promise<InteractionEvent[]> {
    return await page.evaluate(() => {
      const interactions: any[] = [];
      const interactiveSelectors = [
        'button',
        'a',
        'input',
        'textarea',
        '[onclick]',
        '[onmouseover]',
        '[onmouseout]',
        '.hover',
        '.active',
        '.focus',
      ];

      for (const selector of interactiveSelectors) {
        const elements = document.querySelectorAll(selector);

        elements.forEach((element, index) => {
          const beforeStyles = window.getComputedStyle(element);
          const elementSelector = `${selector}[${index}]`;

          // Check for CSS transitions/animations
          if (
            beforeStyles.transition !== 'all 0s ease 0s' ||
            beforeStyles.animation !== 'none'
          ) {
            interactions.push({
              selector: elementSelector,
              eventType: 'css-transition',
              handler: 'CSS',
              changes: [
                {
                  property: 'transition',
                  valueBefore: beforeStyles.transition,
                  valueAfter: 'N/A (runtime)',
                },
              ],
            });
          }

          // Check for event listeners
          const eventTypes = ['click', 'mouseover', 'mouseout', 'focus', 'blur'];
          for (const eventType of eventTypes) {
            const attr = `on${eventType}`;
            if (element.hasAttribute(attr)) {
              interactions.push({
                selector: elementSelector,
                eventType,
                handler: element.getAttribute(attr) || 'Unknown',
                changes: [],
              });
            }
          }
        });
      }

      return interactions;
    });
  }

  /**
   * Detect scroll-based animations
   */
  private async detectScrollAnimations(page: Page): Promise<ScrollAnimation[]> {
    return await page.evaluate(() => {
      const scrollAnimations: any[] = [];

      // Check for common scroll animation patterns
      const elements = document.querySelectorAll('*');

      elements.forEach((element) => {
        const classes = Array.from(element.classList);
        const dataAttrs = Array.from(element.attributes)
          .filter((attr) => attr.name.startsWith('data-'))
          .map((attr) => attr.name);

        // Check for AOS (Animate On Scroll)
        if (classes.some((c) => c.startsWith('aos-')) || dataAttrs.includes('data-aos')) {
          scrollAnimations.push({
            selector: element.tagName.toLowerCase(),
            trigger: 'scroll',
            animationType: 'js',
            description: 'AOS (Animate On Scroll) animation',
          });
        }

        // Check for WOW.js
        if (classes.includes('wow')) {
          scrollAnimations.push({
            selector: element.tagName.toLowerCase(),
            trigger: 'scroll',
            animationType: 'js',
            description: 'WOW.js animation',
          });
        }

        // Check for ScrollReveal
        if (dataAttrs.includes('data-sr') || dataAttrs.includes('data-scroll-reveal')) {
          scrollAnimations.push({
            selector: element.tagName.toLowerCase(),
            trigger: 'scroll',
            animationType: 'js',
            description: 'ScrollReveal animation',
          });
        }

        // Check for Intersection Observer usage
        if (
          dataAttrs.some((attr) => attr.includes('observe') || attr.includes('intersection'))
        ) {
          scrollAnimations.push({
            selector: element.tagName.toLowerCase(),
            trigger: 'scroll',
            animationType: 'js',
            description: 'Intersection Observer animation',
          });
        }
      });

      return scrollAnimations;
    });
  }

  /**
   * Generate recommendations for preserving animations
   */
  private generateRecommendations(
    cssAnimations: CSSAnimation[],
    cssTransitions: Map<string, CSSTransition[]>,
    interactions: InteractionEvent[],
    scrollAnimations: ScrollAnimation[],
    animationLibraries: string[]
  ): string[] {
    const recommendations: string[] = [];

    // CSS Animations
    if (cssAnimations.length > 0) {
      recommendations.push(
        `Found ${cssAnimations.length} CSS @keyframes animations. Ensure all keyframes are preserved in the cloned site.`
      );
    }

    // CSS Transitions
    if (cssTransitions.size > 0) {
      recommendations.push(
        `Found ${cssTransitions.size} elements with CSS transitions. Preserve :hover, :active, and :focus pseudo-class styles.`
      );
    }

    // Interaction animations
    if (interactions.length > 0) {
      recommendations.push(
        `Found ${interactions.length} interactive animations. Ensure event handlers and JavaScript interactions are preserved.`
      );
    }

    // Scroll animations
    if (scrollAnimations.length > 0) {
      recommendations.push(
        `Found ${scrollAnimations.length} scroll-based animations. Preserve Intersection Observer and scroll event handlers.`
      );
    }

    // Animation libraries
    if (animationLibraries.length > 0) {
      recommendations.push(
        `Detected animation libraries: ${animationLibraries.join(', ')}. Include these libraries in the cloned site.`
      );
    }

    // Performance recommendations
    if (cssAnimations.length > 20) {
      recommendations.push(
        'Large number of animations detected. Consider using will-change CSS property for better performance.'
      );
    }

    // Best practices
    recommendations.push(
      'Use transform and opacity for animations (GPU-accelerated) instead of width, height, top, left.'
    );

    if (cssAnimations.some((a) => a.iterationCount === 'infinite')) {
      recommendations.push(
        'Infinite animations detected. Ensure they can be paused for accessibility (prefers-reduced-motion).'
      );
    }

    return recommendations;
  }

  /**
   * Generate CSS code to preserve animations
   */
  generateAnimationCSS(analysis: AnimationAnalysis): string {
    let css = '/* Preserved Animations */\n\n';

    // Add keyframes
    css += '/* CSS Animations (@keyframes) */\n';
    for (const animation of analysis.cssAnimations) {
      css += `@keyframes ${animation.name} {\n`;
      for (const keyframe of animation.keyframes) {
        css += `  ${keyframe.offset} {\n`;
        for (const [prop, value] of Object.entries(keyframe.properties)) {
          css += `    ${prop}: ${value};\n`;
        }
        css += `  }\n`;
      }
      css += `}\n\n`;

      // Add animation usage example
      css += `/* Usage: */\n`;
      css += `.animated-element {\n`;
      css += `  animation-name: ${animation.name};\n`;
      css += `  animation-duration: ${animation.duration};\n`;
      css += `  animation-timing-function: ${animation.timingFunction};\n`;
      css += `  animation-delay: ${animation.delay};\n`;
      css += `  animation-iteration-count: ${animation.iterationCount};\n`;
      css += `  animation-direction: ${animation.direction};\n`;
      css += `  animation-fill-mode: ${animation.fillMode};\n`;
      css += `}\n\n`;
    }

    // Add transitions
    css += '/* CSS Transitions */\n';
    for (const [selector, transitions] of analysis.cssTransitions.entries()) {
      css += `${selector} {\n`;
      for (const transition of transitions) {
        css += `  transition: ${transition.property} ${transition.duration} ${transition.timingFunction} ${transition.delay};\n`;
      }
      css += `}\n\n`;
    }

    // Add accessibility support
    css += '/* Accessibility: Respect prefers-reduced-motion */\n';
    css += '@media (prefers-reduced-motion: reduce) {\n';
    css += '  *,\n';
    css += '  *::before,\n';
    css += '  *::after {\n';
    css += '    animation-duration: 0.01ms !important;\n';
    css += '    animation-iteration-count: 1 !important;\n';
    css += '    transition-duration: 0.01ms !important;\n';
    css += '  }\n';
    css += '}\n';

    return css;
  }
}
