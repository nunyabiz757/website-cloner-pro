/**
 * Hierarchy Builder
 *
 * Analyzes DOM structure and builds a component hierarchy (sections -> columns -> widgets)
 */

import { JSDOM } from 'jsdom';
import {
  ComponentHierarchy,
  AnalyzedElement,
  ComponentType,
  RecognizedComponent,
} from '../types/component.types.js';
import { analyzeElement, recognizeComponent } from '../recognizer/component-recognizer.js';
import { extractStyles } from '../analyzer/style-extractor.js';

/**
 * Build component hierarchy from HTML
 */
export function buildHierarchy(html: string): ComponentHierarchy[] {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const body = document.body;

  const hierarchy: ComponentHierarchy[] = [];

  // Get top-level elements (direct children of body)
  const topLevelElements = Array.from(body.children);

  for (const element of topLevelElements) {
    const node = buildNodeHierarchy(element as Element);
    if (node) {
      hierarchy.push(node);
    }
  }

  return hierarchy;
}

/**
 * Build hierarchy node from element
 */
function buildNodeHierarchy(element: Element): ComponentHierarchy | null {
  const tagName = element.tagName.toLowerCase();
  const analyzed = analyzeElement(element);
  const styles = extractStyles(element.outerHTML);
  const recognition = recognizeComponent(element, styles, analyzed.context);

  // Determine node type
  const nodeType = determineNodeType(element, recognition.componentType);

  // Extract props
  const props = extractProps(analyzed);

  const node: ComponentHierarchy = {
    type: nodeType,
    componentType: recognition.componentType,
    id: generateId(),
    props,
    styles,
    children: [],
  };

  // Recursively build children
  if (nodeType === 'section' || nodeType === 'container' || nodeType === 'row' || nodeType === 'column') {
    const children = Array.from(element.children);

    for (const child of children) {
      const childNode = buildNodeHierarchy(child as Element);
      if (childNode) {
        node.children.push(childNode);
      }
    }
  }

  return node;
}

/**
 * Determine hierarchy node type
 */
function determineNodeType(
  element: Element,
  componentType: ComponentType
): 'section' | 'container' | 'row' | 'column' | 'widget' {
  const tagName = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).map((c) => c.toLowerCase());

  // Section-level elements
  if (tagName === 'section' || componentType === 'section' || componentType === 'hero') {
    return 'section';
  }

  // Header/Footer as sections
  if (tagName === 'header' || tagName === 'footer') {
    return 'section';
  }

  // Container-level
  if (
    classes.some((c) => c.includes('container') || c.includes('wrapper')) ||
    componentType === 'container'
  ) {
    return 'container';
  }

  // Row-level (flex/grid containers)
  const computedStyle = element.ownerDocument?.defaultView?.getComputedStyle(element);
  if (computedStyle) {
    const display = computedStyle.display;
    if (
      (display === 'flex' || display === 'grid') &&
      classes.some((c) => c.includes('row') || c.includes('flex') || c.includes('grid'))
    ) {
      return 'row';
    }
  }

  // Column-level
  if (
    classes.some((c) => c.includes('col') || c.includes('column')) ||
    componentType === 'column'
  ) {
    return 'column';
  }

  // Default to widget for leaf nodes
  return 'widget';
}

/**
 * Extract props from analyzed element
 */
function extractProps(analyzed: AnalyzedElement): Record<string, any> {
  const props: Record<string, any> = {};

  // Text content
  props.textContent = analyzed.textContent;
  props.innerHTML = analyzed.innerHTML;

  // Common attributes
  if (analyzed.attributes.href) {
    props.href = analyzed.attributes.href;
  }

  if (analyzed.attributes.src) {
    props.src = analyzed.attributes.src;
  }

  if (analyzed.attributes.alt) {
    props.alt = analyzed.attributes.alt;
  }

  if (analyzed.attributes.target) {
    props.target = analyzed.attributes.target;
  }

  if (analyzed.attributes.title) {
    props.title = analyzed.attributes.title;
  }

  // Data attributes
  const dataAttrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(analyzed.attributes)) {
    if (key.startsWith('data-')) {
      dataAttrs[key] = value;
    }
  }

  if (Object.keys(dataAttrs).length > 0) {
    props.dataAttributes = dataAttrs;
  }

  // ARIA attributes
  const ariaAttrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(analyzed.attributes)) {
    if (key.startsWith('aria-')) {
      ariaAttrs[key] = value;
    }
  }

  if (Object.keys(ariaAttrs).length > 0) {
    props.ariaAttributes = ariaAttrs;
  }

  return props;
}

/**
 * Flatten hierarchy to simple list (for simple conversion)
 */
export function flattenHierarchy(hierarchy: ComponentHierarchy[]): ComponentHierarchy[] {
  const flattened: ComponentHierarchy[] = [];

  function flatten(node: ComponentHierarchy) {
    flattened.push(node);

    for (const child of node.children) {
      flatten(child);
    }
  }

  for (const node of hierarchy) {
    flatten(node);
  }

  return flattened;
}

/**
 * Get only widget nodes from hierarchy
 */
export function extractWidgets(hierarchy: ComponentHierarchy[]): ComponentHierarchy[] {
  return flattenHierarchy(hierarchy).filter((node) => node.type === 'widget');
}

/**
 * Simplify hierarchy (merge single-child containers)
 */
export function simplifyHierarchy(hierarchy: ComponentHierarchy[]): ComponentHierarchy[] {
  return hierarchy.map((node) => simplifyNode(node)).filter(Boolean) as ComponentHierarchy[];
}

/**
 * Simplify single node
 */
function simplifyNode(node: ComponentHierarchy): ComponentHierarchy | null {
  // If node has only one child and is a container, merge with child
  if (
    (node.type === 'container' || node.type === 'row') &&
    node.children.length === 1 &&
    node.children[0].type !== 'widget'
  ) {
    return simplifyNode(node.children[0]);
  }

  // Recursively simplify children
  node.children = node.children
    .map((child) => simplifyNode(child))
    .filter(Boolean) as ComponentHierarchy[];

  return node;
}

/**
 * Generate unique ID
 */
let idCounter = 1;
function generateId(): string {
  return `node_${idCounter++}`;
}
