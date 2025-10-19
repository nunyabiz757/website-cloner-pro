import express from 'express';
import AnimationHandlingService from '../services/AnimationHandlingService.js';

const router = express.Router();

/**
 * Detect All Animations
 * POST /api/animation-handling/detect
 */
router.post('/detect', async (req, res) => {
  try {
    const { html, css = '' } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const result = await AnimationHandlingService.detectAnimations(html, css);

    res.json({
      success: true,
      animations: result,
    });
  } catch (error) {
    console.error('Failed to detect animations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect animations',
    });
  }
});

/**
 * Detect Lottie Animations Only
 * POST /api/animation-handling/detect-lottie
 */
router.post('/detect-lottie', async (req, res) => {
  try {
    const { html } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const result = await AnimationHandlingService.detectAnimations(html);

    res.json({
      success: true,
      lottieAnimations: result.lottieAnimations,
      totalCount: result.lottieAnimations.length,
    });
  } catch (error) {
    console.error('Failed to detect Lottie animations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect Lottie animations',
    });
  }
});

/**
 * Detect Scroll Animations Only
 * POST /api/animation-handling/detect-scroll
 */
router.post('/detect-scroll', async (req, res) => {
  try {
    const { html } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const result = await AnimationHandlingService.detectAnimations(html);

    res.json({
      success: true,
      scrollAnimations: result.scrollAnimations,
      totalCount: result.scrollAnimations.length,
      librariesDetected: result.libraries.map(l => l.name),
    });
  } catch (error) {
    console.error('Failed to detect scroll animations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect scroll animations',
    });
  }
});

/**
 * Detect Animation Libraries
 * POST /api/animation-handling/detect-libraries
 */
router.post('/detect-libraries', async (req, res) => {
  try {
    const { html } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const result = await AnimationHandlingService.detectAnimations(html);

    res.json({
      success: true,
      libraries: result.libraries,
      totalLibraries: result.libraries.length,
    });
  } catch (error) {
    console.error('Failed to detect animation libraries:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect libraries',
    });
  }
});

/**
 * Analyze Performance Impact
 * POST /api/animation-handling/performance-impact
 */
router.post('/performance-impact', async (req, res) => {
  try {
    const { html, css = '' } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const result = await AnimationHandlingService.detectAnimations(html, css);

    res.json({
      success: true,
      performanceImpact: result.performanceImpact,
      summary: {
        score: result.performanceImpact.score,
        level: result.performanceImpact.level,
        totalAnimations: result.totalAnimations,
        estimatedFPS: result.performanceImpact.estimatedCost.fps,
      },
    });
  } catch (error) {
    console.error('Failed to analyze performance impact:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze performance',
    });
  }
});

/**
 * Get Optimization Recommendations
 * POST /api/animation-handling/optimize
 */
router.post('/optimize', async (req, res) => {
  try {
    const { html, css = '' } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await AnimationHandlingService.detectAnimations(html, css);
    const optimization = await AnimationHandlingService.analyzeOptimization(detection);

    res.json({
      success: true,
      optimization,
      currentScore: optimization.current.performanceScore,
      optimizedScore: optimization.optimized.performanceScore,
      improvement: optimization.estimatedImprovement,
    });
  } catch (error) {
    console.error('Failed to generate optimization recommendations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate recommendations',
    });
  }
});

/**
 * Generate WordPress Setup Guide
 * POST /api/animation-handling/wordpress-setup
 */
router.post('/wordpress-setup', async (req, res) => {
  try {
    const { html, css = '' } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await AnimationHandlingService.detectAnimations(html, css);
    const setup = await AnimationHandlingService.generateWordPressSetup(detection);

    res.json({
      success: true,
      setup,
      recommendedPlugins: setup.plugins.filter(p => p.recommended),
      hasLottie: detection.lottieAnimations.length > 0,
      hasScrollAnimations: detection.scrollAnimations.length > 0,
    });
  } catch (error) {
    console.error('Failed to generate WordPress setup:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate setup',
    });
  }
});

/**
 * Get Animation Library Information
 * GET /api/animation-handling/libraries
 */
router.get('/libraries', (req, res) => {
  try {
    const libraries = [
      {
        name: 'Lottie',
        description: 'Airbnb\'s animation library for rendering Adobe After Effects animations',
        features: ['Vector animations', 'Lightweight', 'Cross-platform', 'JSON-based'],
        bestFor: 'Complex vector animations, illustrations, icons',
        performance: 'Good',
        fileSize: '~140KB',
        website: 'https://airbnb.design/lottie/',
        wpPlugin: 'Lottie Player',
      },
      {
        name: 'GSAP',
        description: 'Professional-grade JavaScript animation library',
        features: ['Timeline support', 'ScrollTrigger', 'High performance', 'Advanced easing'],
        bestFor: 'Complex animations, timelines, professional projects',
        performance: 'Excellent',
        fileSize: '~50KB (core)',
        website: 'https://greensock.com/gsap/',
        wpPlugin: 'GSAP WordPress Plugin (premium)',
      },
      {
        name: 'AOS (Animate On Scroll)',
        description: 'Simple scroll animation library',
        features: ['Easy setup', 'CSS-based', 'Multiple animations', 'Data attributes'],
        bestFor: 'Simple scroll animations, fade-ins, slides',
        performance: 'Good',
        fileSize: '~10KB',
        website: 'https://michalsnik.github.io/aos/',
        wpPlugin: 'AOS WordPress Plugin',
      },
      {
        name: 'Anime.js',
        description: 'Lightweight JavaScript animation library',
        features: ['CSS/SVG/DOM animations', 'Timeline', 'Easing functions', 'Small size'],
        bestFor: 'CSS and SVG animations, interactive elements',
        performance: 'Excellent',
        fileSize: '~17KB',
        website: 'https://animejs.com/',
        wpPlugin: 'Manual integration',
      },
      {
        name: 'ScrollMagic',
        description: 'Scroll interaction library',
        features: ['Scene management', 'Parallax scrolling', 'Pin elements', 'Works with GSAP'],
        bestFor: 'Scroll-based interactions, parallax effects',
        performance: 'Good',
        fileSize: '~22KB',
        website: 'https://scrollmagic.io/',
        wpPlugin: 'Manual integration',
      },
      {
        name: 'Locomotive Scroll',
        description: 'Modern smooth scrolling library',
        features: ['Smooth scrolling', 'Parallax', 'Speed control', 'Modern approach'],
        bestFor: 'Smooth scrolling websites, parallax effects',
        performance: 'Good',
        fileSize: '~50KB',
        website: 'https://locomotivemtl.github.io/locomotive-scroll/',
        wpPlugin: 'Manual integration',
      },
      {
        name: 'WOW.js',
        description: 'Reveal animations on scroll',
        features: ['Works with Animate.css', 'Simple setup', 'Lightweight', 'Cross-browser'],
        bestFor: 'Simple scroll reveals with Animate.css',
        performance: 'Excellent',
        fileSize: '~3KB',
        website: 'https://wowjs.uk/',
        wpPlugin: 'WOW Animation',
      },
      {
        name: 'Animate.css',
        description: 'CSS animation library',
        features: ['CSS-only', 'Ready-made animations', 'Easy to use', 'No JavaScript'],
        bestFor: 'Quick CSS animations, prototyping',
        performance: 'Excellent',
        fileSize: '~80KB (full), ~10KB (minimal)',
        website: 'https://animate.style/',
        wpPlugin: 'Animate It!',
      },
      {
        name: 'Three.js',
        description: '3D JavaScript library',
        features: ['WebGL', '3D graphics', 'Physics', 'Complex scenes'],
        bestFor: '3D animations, interactive 3D experiences',
        performance: 'Depends on complexity',
        fileSize: '~600KB',
        website: 'https://threejs.org/',
        wpPlugin: 'Manual integration',
      },
    ];

    res.json({
      success: true,
      libraries,
      totalLibraries: libraries.length,
    });
  } catch (error) {
    console.error('Failed to get library information:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get libraries',
    });
  }
});

/**
 * Get WordPress Animation Plugins
 * GET /api/animation-handling/wordpress-plugins
 */
router.get('/wordpress-plugins', (req, res) => {
  try {
    const plugins = [
      {
        name: 'Lottie Player',
        purpose: 'Add Lottie animations to WordPress',
        features: [
          'Shortcode support',
          'Gutenberg block',
          'Upload JSON files',
          'Customizable settings',
        ],
        free: true,
        recommended: true,
        rating: 4.8,
        activeInstalls: '10,000+',
        wpOrgUrl: 'https://wordpress.org/plugins/lottie-player/',
      },
      {
        name: 'Ultimate Addons for Gutenberg',
        purpose: 'Advanced Gutenberg blocks with animations',
        features: [
          'Block animations',
          'Scroll effects',
          'Visual editor',
          '50+ blocks',
        ],
        free: true,
        recommended: true,
        rating: 4.9,
        activeInstalls: '1,000,000+',
        wpOrgUrl: 'https://wordpress.org/plugins/ultimate-addons-for-gutenberg/',
      },
      {
        name: 'AOS - Animate On Scroll',
        purpose: 'Add AOS animations to WordPress',
        features: [
          'Data attribute support',
          'Multiple animations',
          'Easy setup',
          'Lightweight',
        ],
        free: true,
        recommended: true,
        rating: 4.5,
        activeInstalls: '5,000+',
        wpOrgUrl: 'https://wordpress.org/plugins/aos-animate-on-scroll/',
      },
      {
        name: 'Animate It!',
        purpose: 'CSS animations for WordPress',
        features: [
          '50+ animations',
          'Scroll trigger',
          'Click trigger',
          'Visual builder',
        ],
        free: true,
        recommended: true,
        rating: 4.3,
        activeInstalls: '70,000+',
        wpOrgUrl: 'https://wordpress.org/plugins/animate-it/',
      },
      {
        name: 'WOW Animation',
        purpose: 'WOW.js integration',
        features: [
          'Works with Animate.css',
          'Simple setup',
          'Scroll animations',
          'Customizable',
        ],
        free: true,
        recommended: true,
        rating: 4.2,
        activeInstalls: '20,000+',
      },
      {
        name: 'Motion.page',
        purpose: 'Advanced animation builder',
        features: [
          'Visual animation builder',
          'Timeline support',
          'Complex animations',
          'Professional tools',
        ],
        free: false,
        recommended: false,
        rating: 4.7,
        activeInstalls: '5,000+',
      },
    ];

    res.json({
      success: true,
      plugins,
      totalPlugins: plugins.length,
      freePlugins: plugins.filter(p => p.free).length,
      recommendedPlugins: plugins.filter(p => p.recommended).length,
    });
  } catch (error) {
    console.error('Failed to get WordPress plugins:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get plugins',
    });
  }
});

/**
 * Get Performance Best Practices
 * GET /api/animation-handling/best-practices
 */
router.get('/best-practices', (req, res) => {
  try {
    const bestPractices = {
      general: [
        {
          practice: 'Use transform and opacity',
          description: 'Animate only transform and opacity properties for 60fps performance',
          impact: 'High',
          example: 'transform: translateX(100px); opacity: 0.5;',
        },
        {
          practice: 'Avoid layout-triggering properties',
          description: 'Don\'t animate width, height, left, top, margin, padding',
          impact: 'High',
          reason: 'These trigger layout recalculation',
        },
        {
          practice: 'Use will-change',
          description: 'Add will-change: transform; to elements that will animate',
          impact: 'Medium',
          example: '.animated { will-change: transform; }',
        },
        {
          practice: 'Limit simultaneous animations',
          description: 'Don\'t animate more than 10-15 elements simultaneously',
          impact: 'High',
          reason: 'Too many animations cause performance issues',
        },
      ],
      lottie: [
        {
          practice: 'Use SVG renderer',
          description: 'SVG renderer is more performant than Canvas',
          impact: 'Medium',
          implementation: 'renderer: "svg"',
        },
        {
          practice: 'Reduce complexity',
          description: 'Simplify animations in After Effects before export',
          impact: 'High',
          tip: 'Fewer layers and effects = better performance',
        },
        {
          practice: 'Lazy load',
          description: 'Don\'t autoplay all Lottie animations',
          impact: 'High',
          implementation: 'Trigger on scroll or user interaction',
        },
      ],
      scroll: [
        {
          practice: 'Use requestAnimationFrame',
          description: 'Ensure library uses rAF for smooth animations',
          impact: 'High',
          reason: 'Syncs with browser repaint cycle',
        },
        {
          practice: 'Debounce scroll events',
          description: 'Don\'t process every scroll event',
          impact: 'Medium',
          implementation: 'Use throttling or debouncing',
        },
        {
          practice: 'Use IntersectionObserver',
          description: 'Detect when elements enter viewport efficiently',
          impact: 'High',
          reason: 'More performant than scroll listeners',
        },
      ],
      css: [
        {
          practice: 'Use hardware acceleration',
          description: 'Force GPU acceleration with transform: translateZ(0)',
          impact: 'Medium',
          example: 'transform: translateZ(0);',
        },
        {
          practice: 'Simplify @keyframes',
          description: 'Use fewer keyframe steps',
          impact: 'Low',
          tip: '3-5 steps is usually sufficient',
        },
        {
          practice: 'Avoid animating many elements',
          description: 'Limit CSS animations to key elements',
          impact: 'Medium',
          reason: 'Each animation costs performance',
        },
      ],
      wordpress: [
        {
          practice: 'Use caching',
          description: 'Cache animation libraries and files',
          impact: 'High',
          implementation: 'Use WordPress caching plugins',
        },
        {
          practice: 'Conditional loading',
          description: 'Only load animation scripts on pages that need them',
          impact: 'High',
          implementation: 'Use wp_enqueue_script conditionally',
        },
        {
          practice: 'Combine scripts',
          description: 'Minimize HTTP requests by combining files',
          impact: 'Medium',
          implementation: 'Use asset optimization plugins',
        },
      ],
    };

    res.json({
      success: true,
      bestPractices,
      categories: Object.keys(bestPractices),
    });
  } catch (error) {
    console.error('Failed to get best practices:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get best practices',
    });
  }
});

/**
 * Health Check
 * GET /api/animation-handling/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Animation Handling Service',
    status: 'operational',
    features: [
      'Lottie animation detection',
      'Scroll animation detection (AOS, GSAP, ScrollMagic, etc.)',
      'CSS animation detection',
      'Animation library detection',
      'Performance impact analysis',
      'Optimization recommendations',
      'WordPress setup generation',
    ],
    supportedLibraries: [
      'Lottie',
      'GSAP',
      'AOS',
      'ScrollMagic',
      'Locomotive Scroll',
      'Anime.js',
      'WOW.js',
      'Animate.css',
      'Three.js',
    ],
    version: '1.0.0',
  });
});

export default router;
