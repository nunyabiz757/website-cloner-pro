/**
 * Test script for Advanced Element Analysis
 *
 * Run with: node test-advanced-analysis.js
 */

import { analyzeElementAdvanced, closeBrowser } from './src/server/services/page-builder/analyzer/advanced-element-analyzer.js';
import { isResponsive, hasInteractiveStates, hasPseudoElements, isAnimated } from './src/server/services/page-builder/analyzer/style-extractor.js';

async function runTests() {
  console.log('🧪 Testing Advanced Element Analysis System\n');

  // Test 1: Basic Button Analysis
  console.log('Test 1: Basic Button Analysis');
  console.log('━'.repeat(50));

  const buttonHTML = `
    <style>
      .cta-button {
        background-color: #007bff;
        color: white;
        padding: 12px 24px;
        border-radius: 5px;
        border: none;
        cursor: pointer;
        font-size: 16px;
        transition: background-color 0.3s;
      }

      .cta-button:hover {
        background-color: #0056b3;
      }

      .cta-button:active {
        background-color: #004085;
      }
    </style>
    <button class="cta-button">Click Me</button>
  `;

  try {
    const analysis = await analyzeElementAdvanced(buttonHTML, '.cta-button');

    console.log('✓ Base styles extracted:', {
      backgroundColor: analysis.baseStyles.backgroundColor,
      color: analysis.baseStyles.color,
      padding: analysis.baseStyles.padding,
      borderRadius: analysis.baseStyles.borderRadius,
    });

    if (analysis.interactiveStates?.hover) {
      console.log('✓ Hover state extracted:', {
        backgroundColor: analysis.interactiveStates.hover.backgroundColor,
      });
    }

    if (analysis.behavior) {
      console.log('✓ Behavior analysis:', {
        isInteractive: analysis.behavior.isInteractive,
        hasTransitions: analysis.behavior.hasTransitions,
        transitions: analysis.behavior.transitions,
      });
    }

    console.log('✓ Test 1 PASSED\n');
  } catch (error) {
    console.error('✗ Test 1 FAILED:', error.message, '\n');
  }

  // Test 2: Responsive Analysis
  console.log('Test 2: Responsive Analysis');
  console.log('━'.repeat(50));

  const responsiveHTML = `
    <style>
      .hero-title {
        font-size: 48px;
        line-height: 1.2;
      }

      @media (max-width: 768px) {
        .hero-title {
          font-size: 32px;
        }
      }

      @media (max-width: 375px) {
        .hero-title {
          font-size: 24px;
        }
      }
    </style>
    <h1 class="hero-title">Welcome</h1>
  `;

  try {
    const analysis = await analyzeElementAdvanced(responsiveHTML, '.hero-title');

    console.log('✓ Responsive styles extracted:', {
      desktop: analysis.responsiveStyles?.desktop?.fontSize,
      laptop: analysis.responsiveStyles?.laptop?.fontSize,
      tablet: analysis.responsiveStyles?.tablet?.fontSize,
      mobile: analysis.responsiveStyles?.mobile?.fontSize,
    });

    console.log('✓ Is responsive:', isResponsive(analysis));
    console.log('✓ Test 2 PASSED\n');
  } catch (error) {
    console.error('✗ Test 2 FAILED:', error.message, '\n');
  }

  // Test 3: Pseudo-elements
  console.log('Test 3: Pseudo-element Analysis');
  console.log('━'.repeat(50));

  const pseudoHTML = `
    <style>
      .badge::before {
        content: "★";
        color: #ffd700;
        margin-right: 5px;
      }

      .badge::after {
        content: " (NEW)";
        color: #ff0000;
        font-weight: bold;
      }
    </style>
    <span class="badge">Featured</span>
  `;

  try {
    const analysis = await analyzeElementAdvanced(pseudoHTML, '.badge');

    console.log('✓ Pseudo-elements extracted:', {
      before: analysis.pseudoElements?.before?.content,
      beforeColor: analysis.pseudoElements?.before?.color,
      after: analysis.pseudoElements?.after?.content,
      afterColor: analysis.pseudoElements?.after?.color,
    });

    console.log('✓ Has pseudo-elements:', hasPseudoElements(analysis));
    console.log('✓ Test 3 PASSED\n');
  } catch (error) {
    console.error('✗ Test 3 FAILED:', error.message, '\n');
  }

  // Test 4: Animation Detection
  console.log('Test 4: Animation Detection');
  console.log('━'.repeat(50));

  const animatedHTML = `
    <style>
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .animated {
        animation: fadeIn 0.5s ease-in-out;
        transition: transform 0.3s;
      }

      .animated:hover {
        transform: scale(1.05);
      }
    </style>
    <div class="animated">Hover me!</div>
  `;

  try {
    const analysis = await analyzeElementAdvanced(animatedHTML, '.animated');

    console.log('✓ Animation detected:', {
      hasAnimations: analysis.behavior?.hasAnimations,
      animations: analysis.behavior?.animations,
      hasTransitions: analysis.behavior?.hasTransitions,
      transitions: analysis.behavior?.transitions,
    });

    console.log('✓ Is animated:', isAnimated(analysis));
    console.log('✓ Test 4 PASSED\n');
  } catch (error) {
    console.error('✗ Test 4 FAILED:', error.message, '\n');
  }

  // Test 5: Media Query Analysis
  console.log('Test 5: Media Query Analysis');
  console.log('━'.repeat(50));

  const mqHTML = `
    <style>
      @media (min-width: 768px) {
        .container { max-width: 750px; }
      }

      @media (min-width: 992px) {
        .container { max-width: 970px; }
      }

      @media (min-width: 1200px) {
        .container { max-width: 1170px; }
      }
    </style>
    <div class="container">Content</div>
  `;

  try {
    const analysis = await analyzeElementAdvanced(mqHTML, '.container');

    console.log('✓ Media queries analyzed:', {
      breakpoints: analysis.mediaQueries?.breakpoints,
      queryCount: analysis.mediaQueries?.queries.length,
    });

    console.log('✓ Test 5 PASSED\n');
  } catch (error) {
    console.error('✗ Test 5 FAILED:', error.message, '\n');
  }

  // Close browser
  await closeBrowser();
  console.log('✓ Browser closed successfully\n');
  console.log('━'.repeat(50));
  console.log('🎉 All tests completed!');
}

// Run tests
runTests().catch(console.error);
