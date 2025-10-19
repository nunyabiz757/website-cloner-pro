import * as cheerio from 'cheerio';

/**
 * Animation Handling Service
 *
 * Detects and preserves advanced animations including:
 * - Lottie animations
 * - Scroll-triggered animations (AOS, ScrollMagic, GSAP, etc.)
 * - CSS animations and transitions
 * - Performance impact analysis
 * - Optimization recommendations
 */

// Types
export interface AnimationDetectionResult {
  hasAnimations: boolean;
  totalAnimations: number;
  lottieAnimations: LottieAnimation[];
  scrollAnimations: ScrollAnimation[];
  cssAnimations: CSSAnimation[];
  libraries: AnimationLibrary[];
  performanceImpact: PerformanceImpact;
  recommendations: string[];
}

export interface LottieAnimation {
  id: string;
  element: string;
  jsonPath?: string;
  config: LottieConfig;
  location: string;
  preservationMethod: 'file' | 'cdn' | 'inline';
}

export interface LottieConfig {
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  renderer?: 'svg' | 'canvas' | 'html';
  path?: string;
  animationData?: any;
}

export interface ScrollAnimation {
  id: string;
  library: string;
  element: string;
  trigger: ScrollTrigger;
  animation: AnimationEffect;
  performance: 'good' | 'moderate' | 'poor';
}

export interface ScrollTrigger {
  type: 'scroll' | 'viewport' | 'element';
  offset?: string;
  duration?: number;
  scrub?: boolean;
}

export interface AnimationEffect {
  type: string;
  properties: Record<string, any>;
  duration?: number;
  easing?: string;
  delay?: number;
}

export interface CSSAnimation {
  name: string;
  element: string;
  type: 'animation' | 'transition';
  properties: CSSAnimationProperties;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface CSSAnimationProperties {
  duration?: string;
  timingFunction?: string;
  delay?: string;
  iterationCount?: string;
  direction?: string;
  fillMode?: string;
  property?: string; // for transitions
}

export interface AnimationLibrary {
  name: string;
  version?: string;
  detected: boolean;
  usage: 'high' | 'medium' | 'low';
  loadMethod: 'cdn' | 'local' | 'inline';
  scriptUrl?: string;
  animationCount: number;
  features: string[];
}

export interface PerformanceImpact {
  score: number; // 0-100 (higher is better)
  level: 'excellent' | 'good' | 'moderate' | 'poor';
  factors: PerformanceFactor[];
  estimatedCost: {
    cpu: 'low' | 'medium' | 'high';
    memory: 'low' | 'medium' | 'high';
    fps: number; // estimated frames per second
  };
}

export interface PerformanceFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  weight: number;
}

export interface AnimationOptimization {
  current: AnimationMetrics;
  optimized: AnimationMetrics;
  suggestions: OptimizationSuggestion[];
  estimatedImprovement: number; // percentage
}

export interface AnimationMetrics {
  totalAnimations: number;
  lottieCount: number;
  scrollAnimationCount: number;
  cssAnimationCount: number;
  averageComplexity: number;
  performanceScore: number;
}

export interface OptimizationSuggestion {
  category: 'lottie' | 'scroll' | 'css' | 'library' | 'general';
  priority: 'high' | 'medium' | 'low';
  issue: string;
  suggestion: string;
  expectedGain: string;
  implementation: string;
}

export interface WordPressAnimationSetup {
  plugins: WordPressAnimationPlugin[];
  lottieSetup: LottieWordPressSetup;
  scrollAnimationSetup: ScrollAnimationWordPressSetup;
  customCSS: string;
  scripts: string[];
}

export interface WordPressAnimationPlugin {
  name: string;
  purpose: string;
  features: string[];
  free: boolean;
  recommended: boolean;
  wpOrgUrl?: string;
}

export interface LottieWordPressSetup {
  method: 'plugin' | 'manual';
  plugin?: string;
  files: string[];
  shortcodes: string[];
  implementation: string;
}

export interface ScrollAnimationWordPressSetup {
  method: 'plugin' | 'library' | 'custom';
  recommendedPlugin?: string;
  library?: string;
  classes: string[];
  attributes: string[];
  implementation: string;
}

class AnimationHandlingService {
  /**
   * Detect all animations on a page
   */
  async detectAnimations(html: string, css: string = ''): Promise<AnimationDetectionResult> {
    const $ = cheerio.load(html);

    // Detect Lottie animations
    const lottieAnimations = this.detectLottieAnimations($, html);

    // Detect scroll animations
    const scrollAnimations = this.detectScrollAnimations($, html);

    // Detect CSS animations
    const cssAnimations = this.detectCSSAnimations($, css);

    // Detect animation libraries
    const libraries = this.detectAnimationLibraries($, html);

    // Calculate performance impact
    const performanceImpact = this.calculatePerformanceImpact(
      lottieAnimations,
      scrollAnimations,
      cssAnimations,
      libraries
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      lottieAnimations,
      scrollAnimations,
      cssAnimations,
      libraries,
      performanceImpact
    );

    const totalAnimations = lottieAnimations.length + scrollAnimations.length + cssAnimations.length;

    return {
      hasAnimations: totalAnimations > 0,
      totalAnimations,
      lottieAnimations,
      scrollAnimations,
      cssAnimations,
      libraries,
      performanceImpact,
      recommendations,
    };
  }

  /**
   * Detect Lottie animations
   */
  private detectLottieAnimations($: cheerio.CheerioAPI, html: string): LottieAnimation[] {
    const animations: LottieAnimation[] = [];
    let idCounter = 1;

    // Check for lottie-player elements
    $('lottie-player').each((_, element) => {
      const $el = $(element);
      animations.push({
        id: $el.attr('id') || `lottie-${idCounter++}`,
        element: 'lottie-player',
        jsonPath: $el.attr('src'),
        config: {
          loop: $el.attr('loop') === 'true' || $el.attr('loop') === '',
          autoplay: $el.attr('autoplay') === 'true' || $el.attr('autoplay') === '',
          speed: parseFloat($el.attr('speed') || '1'),
          renderer: ($el.attr('renderer') as any) || 'svg',
        },
        location: this.getElementLocation($el),
        preservationMethod: $el.attr('src')?.startsWith('http') ? 'cdn' : 'file',
      });
    });

    // Check for Lottie library usage
    if (html.includes('lottie.loadAnimation') || html.includes('bodymovin')) {
      // Try to extract Lottie configurations from scripts
      const lottieMatches = html.match(/lottie\.loadAnimation\s*\(\s*\{[\s\S]*?\}\s*\)/g);
      if (lottieMatches) {
        lottieMatches.forEach((match) => {
          try {
            // Extract config object
            const configMatch = match.match(/\{[\s\S]*?\}/);
            if (configMatch) {
              animations.push({
                id: `lottie-script-${idCounter++}`,
                element: 'script',
                config: this.parseLottieConfig(configMatch[0]),
                location: 'inline-script',
                preservationMethod: 'inline',
              });
            }
          } catch (error) {
            // Skip invalid configs
          }
        });
      }
    }

    // Check for data-lottie attributes
    $('[data-lottie]').each((_, element) => {
      const $el = $(element);
      animations.push({
        id: $el.attr('id') || `lottie-data-${idCounter++}`,
        element: element.name || 'div',
        jsonPath: $el.attr('data-lottie'),
        config: {
          loop: $el.attr('data-loop') === 'true',
          autoplay: $el.attr('data-autoplay') === 'true',
        },
        location: this.getElementLocation($el),
        preservationMethod: 'file',
      });
    });

    return animations;
  }

  /**
   * Parse Lottie configuration from string
   */
  private parseLottieConfig(configStr: string): LottieConfig {
    const config: LottieConfig = {};

    if (configStr.includes('loop:')) {
      const loopMatch = configStr.match(/loop:\s*(true|false)/);
      if (loopMatch) config.loop = loopMatch[1] === 'true';
    }

    if (configStr.includes('autoplay:')) {
      const autoplayMatch = configStr.match(/autoplay:\s*(true|false)/);
      if (autoplayMatch) config.autoplay = autoplayMatch[1] === 'true';
    }

    if (configStr.includes('path:')) {
      const pathMatch = configStr.match(/path:\s*['"]([^'"]+)['"]/);
      if (pathMatch) config.path = pathMatch[1];
    }

    if (configStr.includes('renderer:')) {
      const rendererMatch = configStr.match(/renderer:\s*['"]([^'"]+)['"]/);
      if (rendererMatch) config.renderer = rendererMatch[1] as any;
    }

    return config;
  }

  /**
   * Detect scroll-triggered animations
   */
  private detectScrollAnimations($: cheerio.CheerioAPI, html: string): ScrollAnimation[] {
    const animations: ScrollAnimation[] = [];
    let idCounter = 1;

    // AOS (Animate On Scroll)
    $('[data-aos]').each((_, element) => {
      const $el = $(element);
      animations.push({
        id: `aos-${idCounter++}`,
        library: 'AOS',
        element: this.getElementSelector($el),
        trigger: {
          type: 'viewport',
          offset: $el.attr('data-aos-offset') || '120',
        },
        animation: {
          type: $el.attr('data-aos') || 'fade',
          duration: parseInt($el.attr('data-aos-duration') || '400'),
          easing: $el.attr('data-aos-easing') || 'ease',
          delay: parseInt($el.attr('data-aos-delay') || '0'),
          properties: {},
        },
        performance: this.evaluateAnimationPerformance('aos', $el.attr('data-aos') || 'fade'),
      });
    });

    // ScrollReveal
    if (html.includes('ScrollReveal()') || html.includes('scrollReveal')) {
      $('[data-sr]').each((_, element) => {
        const $el = $(element);
        animations.push({
          id: `sr-${idCounter++}`,
          library: 'ScrollReveal',
          element: this.getElementSelector($el),
          trigger: {
            type: 'viewport',
          },
          animation: {
            type: 'reveal',
            properties: {},
          },
          performance: 'good',
        });
      });
    }

    // GSAP ScrollTrigger
    if (html.includes('ScrollTrigger') || html.includes('gsap.to')) {
      // Look for gsap.to, gsap.from, gsap.fromTo calls
      const gsapMatches = html.match(/gsap\.(to|from|fromTo)\s*\([^)]+\)/g);
      if (gsapMatches) {
        gsapMatches.forEach((match) => {
          animations.push({
            id: `gsap-${idCounter++}`,
            library: 'GSAP',
            element: 'script-based',
            trigger: {
              type: 'scroll',
              scrub: match.includes('scrub'),
            },
            animation: {
              type: 'custom',
              properties: {},
            },
            performance: 'good',
          });
        });
      }
    }

    // ScrollMagic
    if (html.includes('ScrollMagic') || html.includes('new ScrollMagic.Scene')) {
      animations.push({
        id: `scrollmagic-${idCounter++}`,
        library: 'ScrollMagic',
        element: 'script-based',
        trigger: {
          type: 'scroll',
        },
        animation: {
          type: 'scene',
          properties: {},
        },
        performance: 'moderate',
      });
    }

    // Locomotive Scroll
    if (html.includes('locomotive-scroll') || html.includes('data-scroll')) {
      $('[data-scroll]').each((_, element) => {
        const $el = $(element);
        animations.push({
          id: `locomotive-${idCounter++}`,
          library: 'Locomotive Scroll',
          element: this.getElementSelector($el),
          trigger: {
            type: 'scroll',
          },
          animation: {
            type: $el.attr('data-scroll-speed') ? 'parallax' : 'reveal',
            properties: {
              speed: $el.attr('data-scroll-speed'),
            },
          },
          performance: 'good',
        });
      });
    }

    // WOW.js
    $('.wow').each((_, element) => {
      const $el = $(element);
      const animationClass = $el.attr('class')?.split(' ').find(c => c.startsWith('animate__')) || 'fadeIn';
      animations.push({
        id: `wow-${idCounter++}`,
        library: 'WOW.js',
        element: this.getElementSelector($el),
        trigger: {
          type: 'viewport',
        },
        animation: {
          type: animationClass,
          properties: {},
        },
        performance: 'good',
      });
    });

    return animations;
  }

  /**
   * Detect CSS animations
   */
  private detectCSSAnimations($: cheerio.CheerioAPI, css: string): CSSAnimation[] {
    const animations: CSSAnimation[] = [];

    // Parse CSS for @keyframes
    const keyframesRegex = /@keyframes\s+([\w-]+)\s*\{([^}]+\{[^}]+\})+\}/g;
    let match;

    while ((match = keyframesRegex.exec(css)) !== null) {
      const name = match[1];
      const keyframesBody = match[2];

      animations.push({
        name,
        element: 'css-rule',
        type: 'animation',
        properties: this.parseKeyframes(keyframesBody),
        complexity: this.evaluateKeyframesComplexity(keyframesBody),
      });
    }

    // Detect elements with animation property
    $('[style*="animation"]').each((_, element) => {
      const $el = $(element);
      const style = $el.attr('style') || '';
      const animationMatch = style.match(/animation:\s*([^;]+)/);

      if (animationMatch) {
        animations.push({
          name: 'inline-animation',
          element: this.getElementSelector($el),
          type: 'animation',
          properties: this.parseAnimationProperty(animationMatch[1]),
          complexity: 'simple',
        });
      }
    });

    // Detect transitions
    $('[style*="transition"]').each((_, element) => {
      const $el = $(element);
      const style = $el.attr('style') || '';
      const transitionMatch = style.match(/transition:\s*([^;]+)/);

      if (transitionMatch) {
        animations.push({
          name: 'inline-transition',
          element: this.getElementSelector($el),
          type: 'transition',
          properties: this.parseTransitionProperty(transitionMatch[1]),
          complexity: 'simple',
        });
      }
    });

    return animations;
  }

  /**
   * Parse keyframes body
   */
  private parseKeyframes(keyframesBody: string): CSSAnimationProperties {
    // Extract timing information if available
    const properties: CSSAnimationProperties = {};

    // This is a simplified parser - in production you'd want more robust parsing
    if (keyframesBody.includes('transform')) {
      properties.property = 'transform';
    }
    if (keyframesBody.includes('opacity')) {
      properties.property = properties.property ? `${properties.property}, opacity` : 'opacity';
    }

    return properties;
  }

  /**
   * Evaluate keyframes complexity
   */
  private evaluateKeyframesComplexity(keyframesBody: string): 'simple' | 'moderate' | 'complex' {
    const steps = (keyframesBody.match(/\d+%/g) || []).length;
    const properties = (keyframesBody.match(/[\w-]+:/g) || []).length;

    if (steps <= 2 && properties <= 2) return 'simple';
    if (steps <= 5 && properties <= 5) return 'moderate';
    return 'complex';
  }

  /**
   * Parse animation property
   */
  private parseAnimationProperty(value: string): CSSAnimationProperties {
    const parts = value.trim().split(/\s+/);
    const properties: CSSAnimationProperties = {};

    parts.forEach((part) => {
      if (part.match(/^\d+\.?\d*s$/)) {
        properties.duration = part;
      } else if (part.match(/^(ease|linear|ease-in|ease-out|ease-in-out)/)) {
        properties.timingFunction = part;
      } else if (part.match(/^\d+$/)) {
        properties.iterationCount = part;
      } else if (part === 'infinite') {
        properties.iterationCount = 'infinite';
      }
    });

    return properties;
  }

  /**
   * Parse transition property
   */
  private parseTransitionProperty(value: string): CSSAnimationProperties {
    const parts = value.trim().split(/\s+/);
    const properties: CSSAnimationProperties = {};

    if (parts[0] && !parts[0].match(/^\d/)) {
      properties.property = parts[0];
    }

    parts.forEach((part) => {
      if (part.match(/^\d+\.?\d*s$/)) {
        if (!properties.duration) {
          properties.duration = part;
        } else {
          properties.delay = part;
        }
      } else if (part.match(/^(ease|linear|ease-in|ease-out|ease-in-out)/)) {
        properties.timingFunction = part;
      }
    });

    return properties;
  }

  /**
   * Detect animation libraries
   */
  private detectAnimationLibraries($: cheerio.CheerioAPI, html: string): AnimationLibrary[] {
    const libraries: AnimationLibrary[] = [];

    // Lottie / Bodymovin
    if (html.includes('lottie') || html.includes('bodymovin')) {
      libraries.push({
        name: 'Lottie',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'lottie'),
        loadMethod: this.detectLoadMethod($, html, 'lottie'),
        scriptUrl: this.extractScriptUrl($, 'lottie'),
        animationCount: ($('lottie-player').length || 0) + (html.match(/lottie\.loadAnimation/g) || []).length,
        features: ['Vector animations', 'JSON-based', 'Lightweight'],
      });
    }

    // AOS (Animate On Scroll)
    if (html.includes('aos') || $('[data-aos]').length > 0) {
      libraries.push({
        name: 'AOS',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'aos'),
        loadMethod: this.detectLoadMethod($, html, 'aos'),
        scriptUrl: this.extractScriptUrl($, 'aos'),
        animationCount: $('[data-aos]').length,
        features: ['Scroll animations', 'Simple setup', 'CSS-based'],
      });
    }

    // GSAP
    if (html.includes('gsap') || html.includes('TweenMax') || html.includes('TimelineMax')) {
      libraries.push({
        name: 'GSAP',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'gsap'),
        loadMethod: this.detectLoadMethod($, html, 'gsap'),
        scriptUrl: this.extractScriptUrl($, 'gsap'),
        animationCount: (html.match(/gsap\.(to|from|fromTo)/g) || []).length,
        features: ['High performance', 'Timeline support', 'ScrollTrigger', 'Professional'],
      });
    }

    // ScrollMagic
    if (html.includes('ScrollMagic')) {
      libraries.push({
        name: 'ScrollMagic',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'ScrollMagic'),
        loadMethod: this.detectLoadMethod($, html, 'ScrollMagic'),
        scriptUrl: this.extractScriptUrl($, 'ScrollMagic'),
        animationCount: (html.match(/new ScrollMagic\.Scene/g) || []).length,
        features: ['Scroll-based animations', 'Scene management', 'Parallax'],
      });
    }

    // Locomotive Scroll
    if (html.includes('locomotive-scroll') || $('[data-scroll]').length > 0) {
      libraries.push({
        name: 'Locomotive Scroll',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'locomotive'),
        loadMethod: this.detectLoadMethod($, html, 'locomotive'),
        scriptUrl: this.extractScriptUrl($, 'locomotive'),
        animationCount: $('[data-scroll]').length,
        features: ['Smooth scrolling', 'Parallax', 'Modern approach'],
      });
    }

    // Anime.js
    if (html.includes('anime.js') || html.includes('anime(')) {
      libraries.push({
        name: 'Anime.js',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'anime'),
        loadMethod: this.detectLoadMethod($, html, 'anime'),
        scriptUrl: this.extractScriptUrl($, 'anime'),
        animationCount: (html.match(/anime\(\{/g) || []).length,
        features: ['Lightweight', 'CSS/SVG/DOM animations', 'Timeline'],
      });
    }

    // WOW.js
    if (html.includes('wow.js') || $('.wow').length > 0) {
      libraries.push({
        name: 'WOW.js',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'wow'),
        loadMethod: this.detectLoadMethod($, html, 'wow'),
        scriptUrl: this.extractScriptUrl($, 'wow'),
        animationCount: $('.wow').length,
        features: ['Scroll animations', 'Works with Animate.css', 'Simple'],
      });
    }

    // Animate.css
    if (html.includes('animate.css') || html.includes('animate__')) {
      libraries.push({
        name: 'Animate.css',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'animate'),
        loadMethod: this.detectLoadMethod($, html, 'animate'),
        animationCount: $('[class*="animate__"]').length,
        features: ['CSS-only', 'Ready-made animations', 'Lightweight'],
      });
    }

    // Three.js (for 3D animations)
    if (html.includes('three.js') || html.includes('THREE.')) {
      libraries.push({
        name: 'Three.js',
        detected: true,
        usage: this.estimateLibraryUsage(html, 'three'),
        loadMethod: this.detectLoadMethod($, html, 'three'),
        animationCount: 1,
        features: ['3D animations', 'WebGL', 'Complex scenes'],
      });
    }

    return libraries;
  }

  /**
   * Estimate library usage
   */
  private estimateLibraryUsage(html: string, library: string): 'high' | 'medium' | 'low' {
    const occurrences = (html.match(new RegExp(library, 'gi')) || []).length;

    if (occurrences > 10) return 'high';
    if (occurrences > 3) return 'medium';
    return 'low';
  }

  /**
   * Detect how library is loaded
   */
  private detectLoadMethod($: cheerio.CheerioAPI, html: string, library: string): 'cdn' | 'local' | 'inline' {
    const scripts = $('script[src*="' + library + '"]');

    if (scripts.length > 0) {
      const src = scripts.first().attr('src') || '';
      return src.startsWith('http') ? 'cdn' : 'local';
    }

    return 'inline';
  }

  /**
   * Extract script URL
   */
  private extractScriptUrl($: cheerio.CheerioAPI, library: string): string | undefined {
    const script = $('script[src*="' + library + '"]').first();
    return script.attr('src');
  }

  /**
   * Evaluate animation performance
   */
  private evaluateAnimationPerformance(library: string, animationType: string): 'good' | 'moderate' | 'poor' {
    // Animations that use transform and opacity are good
    const goodAnimations = ['fade', 'slide', 'zoom', 'flip'];
    const moderateAnimations = ['bounce', 'rotate', 'shake'];

    if (goodAnimations.some(a => animationType.includes(a))) {
      return 'good';
    }

    if (moderateAnimations.some(a => animationType.includes(a))) {
      return 'moderate';
    }

    return 'moderate';
  }

  /**
   * Calculate performance impact
   */
  private calculatePerformanceImpact(
    lottie: LottieAnimation[],
    scroll: ScrollAnimation[],
    css: CSSAnimation[],
    libraries: AnimationLibrary[]
  ): PerformanceImpact {
    const factors: PerformanceFactor[] = [];
    let score = 100;

    // Lottie animations impact
    if (lottie.length > 0) {
      const lottieImpact = lottie.length * 5;
      score -= lottieImpact;
      factors.push({
        factor: 'Lottie Animations',
        impact: 'negative',
        description: `${lottie.length} Lottie animation(s) detected`,
        weight: lottieImpact,
      });

      // Canvas renderer is more expensive
      const canvasCount = lottie.filter(l => l.config.renderer === 'canvas').length;
      if (canvasCount > 0) {
        score -= canvasCount * 3;
        factors.push({
          factor: 'Canvas Renderer',
          impact: 'negative',
          description: `${canvasCount} animation(s) using canvas renderer`,
          weight: canvasCount * 3,
        });
      }
    }

    // Scroll animations impact
    if (scroll.length > 0) {
      const poorPerformance = scroll.filter(s => s.performance === 'poor').length;
      const moderatePerformance = scroll.filter(s => s.performance === 'moderate').length;

      score -= poorPerformance * 8;
      score -= moderatePerformance * 4;
      score -= scroll.length * 2;

      factors.push({
        factor: 'Scroll Animations',
        impact: 'negative',
        description: `${scroll.length} scroll animation(s) detected`,
        weight: scroll.length * 2,
      });
    }

    // CSS animations are generally good
    if (css.length > 0) {
      const complexCount = css.filter(c => c.complexity === 'complex').length;
      score -= complexCount * 3;

      if (complexCount > 0) {
        factors.push({
          factor: 'Complex CSS Animations',
          impact: 'negative',
          description: `${complexCount} complex CSS animation(s)`,
          weight: complexCount * 3,
        });
      }

      factors.push({
        factor: 'CSS Animations',
        impact: 'positive',
        description: `${css.length} CSS animation(s) - generally efficient`,
        weight: 0,
      });
    }

    // Library overhead
    const heavyLibraries = libraries.filter(l => ['Three.js', 'GSAP'].includes(l.name));
    if (heavyLibraries.length > 0) {
      score -= heavyLibraries.length * 5;
      factors.push({
        factor: 'Heavy Libraries',
        impact: 'negative',
        description: `${heavyLibraries.map(l => l.name).join(', ')} - large file size`,
        weight: heavyLibraries.length * 5,
      });
    }

    // Ensure score is within 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine level
    let level: 'excellent' | 'good' | 'moderate' | 'poor';
    if (score >= 80) level = 'excellent';
    else if (score >= 60) level = 'good';
    else if (score >= 40) level = 'moderate';
    else level = 'poor';

    // Estimate resource costs
    const totalAnimations = lottie.length + scroll.length + css.length;
    const cpu = totalAnimations > 20 ? 'high' : totalAnimations > 10 ? 'medium' : 'low';
    const memory = lottie.length > 5 ? 'high' : lottie.length > 2 ? 'medium' : 'low';
    const fps = score >= 70 ? 60 : score >= 50 ? 45 : score >= 30 ? 30 : 20;

    return {
      score,
      level,
      factors,
      estimatedCost: {
        cpu,
        memory,
        fps,
      },
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    lottie: LottieAnimation[],
    scroll: ScrollAnimation[],
    css: CSSAnimation[],
    libraries: AnimationLibrary[],
    performance: PerformanceImpact
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (performance.level === 'poor' || performance.level === 'moderate') {
      recommendations.push('Consider reducing the number of simultaneous animations');
      recommendations.push('Optimize animations to use transform and opacity properties only');
    }

    // Lottie recommendations
    if (lottie.length > 0) {
      recommendations.push('Use SVG renderer for Lottie animations when possible (better performance than canvas)');

      const largeLottie = lottie.filter(l => l.preservationMethod === 'cdn');
      if (largeLottie.length > 0) {
        recommendations.push('Download and host Lottie JSON files locally for better performance');
      }

      const autoplayCount = lottie.filter(l => l.config.autoplay).length;
      if (autoplayCount > 3) {
        recommendations.push('Limit autoplay animations - consider scroll-triggered playback instead');
      }
    }

    // Scroll animation recommendations
    if (scroll.length > 0) {
      const poorPerf = scroll.filter(s => s.performance === 'poor');
      if (poorPerf.length > 0) {
        recommendations.push('Replace poor-performing scroll animations with CSS-based alternatives');
      }

      if (scroll.length > 15) {
        recommendations.push('Too many scroll animations may cause jank - consider reducing count');
      }
    }

    // Library recommendations
    const multipleLibraries = libraries.length > 2;
    if (multipleLibraries) {
      recommendations.push(`Multiple animation libraries detected (${libraries.length}) - consider consolidating to reduce bundle size`);
    }

    const gsap = libraries.find(l => l.name === 'GSAP');
    const scrollmagic = libraries.find(l => l.name === 'ScrollMagic');
    if (gsap && scrollmagic) {
      recommendations.push('GSAP ScrollTrigger can replace ScrollMagic - consider migrating to reduce dependencies');
    }

    // CSS animation recommendations
    const complexCSS = css.filter(c => c.complexity === 'complex');
    if (complexCSS.length > 0) {
      recommendations.push('Simplify complex CSS animations to improve performance');
    }

    // WordPress specific
    recommendations.push('Use WordPress animation plugins for easier management and editing');
    recommendations.push('Consider lazy-loading animations below the fold');

    return recommendations;
  }

  /**
   * Analyze animation optimization opportunities
   */
  async analyzeOptimization(detection: AnimationDetectionResult): Promise<AnimationOptimization> {
    const current: AnimationMetrics = {
      totalAnimations: detection.totalAnimations,
      lottieCount: detection.lottieAnimations.length,
      scrollAnimationCount: detection.scrollAnimations.length,
      cssAnimationCount: detection.cssAnimations.length,
      averageComplexity: this.calculateAverageComplexity(detection),
      performanceScore: detection.performanceImpact.score,
    };

    const suggestions: OptimizationSuggestion[] = [];

    // Lottie optimizations
    if (detection.lottieAnimations.length > 0) {
      const canvasRenderer = detection.lottieAnimations.filter(l => l.config.renderer === 'canvas');
      if (canvasRenderer.length > 0) {
        suggestions.push({
          category: 'lottie',
          priority: 'high',
          issue: `${canvasRenderer.length} Lottie animation(s) using canvas renderer`,
          suggestion: 'Switch to SVG renderer for better performance',
          expectedGain: '+10-15% performance improvement',
          implementation: 'Change renderer option in Lottie config to "svg"',
        });
      }

      const autoplay = detection.lottieAnimations.filter(l => l.config.autoplay);
      if (autoplay.length > 2) {
        suggestions.push({
          category: 'lottie',
          priority: 'medium',
          issue: `${autoplay.length} Lottie animations set to autoplay`,
          suggestion: 'Trigger animations on scroll or user interaction',
          expectedGain: '+5-10% performance improvement',
          implementation: 'Remove autoplay and add scroll trigger or click handler',
        });
      }
    }

    // Scroll animation optimizations
    const poorScrollAnims = detection.scrollAnimations.filter(s => s.performance === 'poor');
    if (poorScrollAnims.length > 0) {
      suggestions.push({
        category: 'scroll',
        priority: 'high',
        issue: `${poorScrollAnims.length} poorly performing scroll animations`,
        suggestion: 'Replace with GPU-accelerated animations (transform/opacity)',
        expectedGain: '+15-20% performance improvement',
        implementation: 'Use transform and opacity properties instead of left/top/width/height',
      });
    }

    // Library optimizations
    if (detection.libraries.length > 2) {
      suggestions.push({
        category: 'library',
        priority: 'medium',
        issue: `${detection.libraries.length} animation libraries detected`,
        suggestion: 'Consolidate to a single library (recommend GSAP)',
        expectedGain: '-50-200KB bundle size reduction',
        implementation: 'Migrate all animations to one library and remove others',
      });
    }

    // CSS optimizations
    const complexCSS = detection.cssAnimations.filter(c => c.complexity === 'complex');
    if (complexCSS.length > 0) {
      suggestions.push({
        category: 'css',
        priority: 'low',
        issue: `${complexCSS.length} complex CSS animations`,
        suggestion: 'Simplify keyframes and reduce animation steps',
        expectedGain: '+5% performance improvement',
        implementation: 'Reduce keyframe steps and animated properties',
      });
    }

    // General optimization
    if (detection.totalAnimations > 20) {
      suggestions.push({
        category: 'general',
        priority: 'high',
        issue: `${detection.totalAnimations} total animations may cause performance issues`,
        suggestion: 'Reduce animation count or implement lazy loading',
        expectedGain: '+20-30% performance improvement',
        implementation: 'Only load animations when they enter viewport',
      });
    }

    // Calculate optimized metrics
    const estimatedImprovement = suggestions.reduce((total, s) => {
      const gain = parseInt(s.expectedGain.match(/\d+/)?.[0] || '0');
      return total + gain;
    }, 0);

    const optimized: AnimationMetrics = {
      ...current,
      performanceScore: Math.min(100, current.performanceScore + estimatedImprovement),
    };

    return {
      current,
      optimized,
      suggestions,
      estimatedImprovement,
    };
  }

  /**
   * Calculate average complexity
   */
  private calculateAverageComplexity(detection: AnimationDetectionResult): number {
    let totalComplexity = 0;
    let count = 0;

    detection.cssAnimations.forEach(anim => {
      count++;
      if (anim.complexity === 'simple') totalComplexity += 1;
      else if (anim.complexity === 'moderate') totalComplexity += 2;
      else totalComplexity += 3;
    });

    detection.scrollAnimations.forEach(anim => {
      count++;
      if (anim.performance === 'good') totalComplexity += 1;
      else if (anim.performance === 'moderate') totalComplexity += 2;
      else totalComplexity += 3;
    });

    detection.lottieAnimations.forEach(() => {
      count++;
      totalComplexity += 2; // Moderate complexity
    });

    return count > 0 ? totalComplexity / count : 0;
  }

  /**
   * Generate WordPress setup guide
   */
  async generateWordPressSetup(detection: AnimationDetectionResult): Promise<WordPressAnimationSetup> {
    const plugins: WordPressAnimationPlugin[] = [
      {
        name: 'Lottie Player',
        purpose: 'Lottie animation support',
        features: ['Shortcode support', 'Gutenberg blocks', 'Easy integration'],
        free: true,
        recommended: detection.lottieAnimations.length > 0,
        wpOrgUrl: 'https://wordpress.org/plugins/lottie-player/',
      },
      {
        name: 'AOS - Animate On Scroll',
        purpose: 'Scroll-triggered animations',
        features: ['Simple setup', 'Multiple animations', 'Lightweight'],
        free: true,
        recommended: detection.scrollAnimations.length > 0,
        wpOrgUrl: 'https://wordpress.org/plugins/aos-animate-on-scroll/',
      },
      {
        name: 'Ultimate Addons for Gutenberg',
        purpose: 'Gutenberg animations',
        features: ['Block animations', 'Scroll effects', 'Visual editor'],
        free: true,
        recommended: true,
        wpOrgUrl: 'https://wordpress.org/plugins/ultimate-addons-for-gutenberg/',
      },
      {
        name: 'Animate It!',
        purpose: 'CSS animations',
        features: ['50+ animations', 'Scroll trigger', 'Easy setup'],
        free: true,
        recommended: detection.cssAnimations.length > 0,
      },
      {
        name: 'GSAP WordPress Plugin',
        purpose: 'GSAP integration',
        features: ['Professional animations', 'Timeline support', 'ScrollTrigger'],
        free: false,
        recommended: detection.libraries.some(l => l.name === 'GSAP'),
      },
    ];

    // Lottie setup
    const lottieSetup: LottieWordPressSetup = {
      method: 'plugin',
      plugin: 'Lottie Player',
      files: detection.lottieAnimations.map(l => l.jsonPath || '').filter(Boolean),
      shortcodes: detection.lottieAnimations.map((l, i) =>
        `[lottie src="${l.jsonPath}" loop="${l.config.loop}" autoplay="${l.config.autoplay}"]`
      ),
      implementation: 'Install Lottie Player plugin, upload JSON files to Media Library, use shortcodes',
    };

    // Scroll animation setup
    const scrollSetup: ScrollAnimationWordPressSetup = {
      method: 'plugin',
      recommendedPlugin: 'Ultimate Addons for Gutenberg',
      classes: ['aos-init', 'aos-animate'],
      attributes: ['data-aos', 'data-aos-duration', 'data-aos-delay'],
      implementation: 'Add animation classes to blocks or use plugin animation settings',
    };

    // Generate custom CSS
    const customCSS = this.generateCustomCSS(detection);

    // Scripts to enqueue
    const scripts = detection.libraries.map(l => l.scriptUrl).filter(Boolean) as string[];

    return {
      plugins,
      lottieSetup,
      scrollAnimationSetup: scrollSetup,
      customCSS,
      scripts,
    };
  }

  /**
   * Generate custom CSS for animations
   */
  private generateCustomCSS(detection: AnimationDetectionResult): string {
    let css = '/* Custom Animation Styles */\n\n';

    // Add CSS animations
    detection.cssAnimations.forEach(anim => {
      if (anim.type === 'animation' && anim.name !== 'inline-animation') {
        css += `/* Animation: ${anim.name} */\n`;
        css += `.${anim.name} {\n`;
        if (anim.properties.duration) css += `  animation-duration: ${anim.properties.duration};\n`;
        if (anim.properties.timingFunction) css += `  animation-timing-function: ${anim.properties.timingFunction};\n`;
        if (anim.properties.delay) css += `  animation-delay: ${anim.properties.delay};\n`;
        css += `}\n\n`;
      }
    });

    return css;
  }

  /**
   * Get element location
   */
  private getElementLocation($el: cheerio.Cheerio<any>): string {
    const parent = $el.parent();
    if (parent.is('header')) return 'header';
    if (parent.is('footer')) return 'footer';
    if (parent.hasClass('hero') || parent.hasClass('banner')) return 'hero';
    return 'content';
  }

  /**
   * Get element selector
   */
  private getElementSelector($el: cheerio.Cheerio<any>): string {
    const id = $el.attr('id');
    if (id) return `#${id}`;

    const classes = $el.attr('class');
    if (classes) return `.${classes.split(' ')[0]}`;

    return $el.prop('tagName')?.toLowerCase() || 'element';
  }
}

export default new AnimationHandlingService();
