/**
 * Form Component Recognition Patterns
 *
 * Detects all types of form elements:
 * - Input fields (text, email, tel, number, password)
 * - Textarea
 * - Select/Dropdown
 * - Checkbox
 * - Radio buttons
 * - Form container
 * - File upload
 * - Multi-step forms
 */

import type { RecognitionPattern } from '../../types/component.types.js';

/**
 * Helper: Analyze input field type
 */
function getInputType(element: Element): string {
  const type = element.getAttribute('type')?.toLowerCase() || 'text';
  return type;
}

/**
 * Helper: Check if input has label
 */
function hasLabel(element: Element): boolean {
  const id = element.id;
  if (id) {
    return !!document.querySelector(`label[for="${id}"]`);
  }

  // Check if wrapped in label
  return !!element.closest('label');
}

/**
 * Helper: Get input validation attributes
 */
function getValidationAttributes(element: Element): {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: string;
  max?: string;
} {
  return {
    required: element.hasAttribute('required'),
    minLength: element.hasAttribute('minlength') ? parseInt(element.getAttribute('minlength')!) : undefined,
    maxLength: element.hasAttribute('maxlength') ? parseInt(element.getAttribute('maxlength')!) : undefined,
    pattern: element.getAttribute('pattern') || undefined,
    min: element.getAttribute('min') || undefined,
    max: element.getAttribute('max') || undefined,
  };
}

// ============================================================================
// INPUT FIELD PATTERNS
// ============================================================================

export const inputPatterns: RecognitionPattern[] = [
  // Pattern 1: Text input
  {
    componentType: 'input',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const type = getInputType(element);
        return type === 'text' || type === 'search';
      },
    },
    confidence: 95,
    priority: 90,
  },

  // Pattern 2: Email input
  {
    componentType: 'input',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'email';
      },
    },
    confidence: 95,
    priority: 90,
  },

  // Pattern 3: Tel input
  {
    componentType: 'input',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'tel';
      },
    },
    confidence: 95,
    priority: 90,
  },

  // Pattern 4: Number input
  {
    componentType: 'input',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'number';
      },
    },
    confidence: 95,
    priority: 90,
  },

  // Pattern 5: Password input
  {
    componentType: 'input',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'password';
      },
    },
    confidence: 95,
    priority: 90,
  },

  // Pattern 6: Date/time inputs
  {
    componentType: 'input',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const type = getInputType(element);
        return ['date', 'time', 'datetime-local', 'month', 'week'].includes(type);
      },
    },
    confidence: 95,
    priority: 90,
  },

  // Pattern 7: URL input
  {
    componentType: 'input',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'url';
      },
    },
    confidence: 95,
    priority: 90,
  },

  // Pattern 8: Hidden input (low priority, usually not rendered)
  {
    componentType: 'input',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'hidden';
      },
    },
    confidence: 50,
    priority: 20,
  },
];

// ============================================================================
// TEXTAREA PATTERNS
// ============================================================================

export const textareaPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic textarea tag
  {
    componentType: 'textarea',
    patterns: {
      tagNames: ['textarea'],
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 2: Contenteditable div (rich text editor)
  {
    componentType: 'textarea',
    patterns: {
      tagNames: ['div'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') === 'true';
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 3: WYSIWYG editor containers
  {
    componentType: 'textarea',
    patterns: {
      classKeywords: ['editor', 'wysiwyg', 'rich-text', 'tinymce', 'ckeditor', 'quill'],
    },
    confidence: 80,
    priority: 80,
  },
];

// ============================================================================
// SELECT/DROPDOWN PATTERNS
// ============================================================================

export const selectPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic select tag
  {
    componentType: 'select',
    patterns: {
      tagNames: ['select'],
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 2: Custom dropdown (button + menu)
  {
    componentType: 'select',
    patterns: {
      classKeywords: ['dropdown', 'select', 'picker'],
      cssProperties: (styles, element) => {
        if (!element) return false;

        // Check for dropdown structure
        const hasButton = !!element.querySelector('button, [role="button"]');
        const hasMenu = !!element.querySelector('[role="menu"], [role="listbox"], .menu, .options');

        return hasButton && hasMenu;
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 3: Select2/Chosen style custom selects
  {
    componentType: 'select',
    patterns: {
      classKeywords: ['select2', 'chosen', 'selectize', 'nice-select'],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 4: ARIA combobox
  {
    componentType: 'select',
    patterns: {
      ariaRole: 'combobox',
    },
    confidence: 90,
    priority: 90,
  },
];

// ============================================================================
// CHECKBOX PATTERNS
// ============================================================================

export const checkboxPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic checkbox input
  {
    componentType: 'checkbox',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'checkbox';
      },
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 2: Custom checkbox (with label)
  {
    componentType: 'checkbox',
    patterns: {
      classKeywords: ['checkbox', 'check', 'toggle', 'switch'],
      cssProperties: (styles, element) => {
        if (!element) return false;

        // Check if contains hidden checkbox
        const hasCheckboxInput = !!element.querySelector('input[type="checkbox"]');
        return hasCheckboxInput;
      },
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 3: ARIA checkbox role
  {
    componentType: 'checkbox',
    patterns: {
      ariaRole: 'checkbox',
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 4: Toggle switch (special checkbox variant)
  {
    componentType: 'checkbox',
    patterns: {
      classKeywords: ['toggle', 'switch', 'slider'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasCheckbox = !!element.querySelector('input[type="checkbox"]');
        return hasCheckbox;
      },
    },
    confidence: 85,
    priority: 85,
  },
];

// ============================================================================
// RADIO BUTTON PATTERNS
// ============================================================================

export const radioPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic radio input
  {
    componentType: 'radio',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'radio';
      },
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 2: Custom radio button
  {
    componentType: 'radio',
    patterns: {
      classKeywords: ['radio', 'option'],
      cssProperties: (styles, element) => {
        if (!element) return false;

        // Check if contains hidden radio input
        const hasRadioInput = !!element.querySelector('input[type="radio"]');
        return hasRadioInput;
      },
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 3: ARIA radio role
  {
    componentType: 'radio',
    patterns: {
      ariaRole: 'radio',
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 4: Radio group container
  {
    componentType: 'radio',
    patterns: {
      ariaRole: 'radiogroup',
      cssProperties: (styles, element) => {
        if (!element) return false;
        const radios = element.querySelectorAll('input[type="radio"]');
        return radios.length >= 2;
      },
    },
    confidence: 85,
    priority: 85,
  },
];

// ============================================================================
// FILE UPLOAD PATTERNS
// ============================================================================

export const fileUploadPatterns: RecognitionPattern[] = [
  // Pattern 1: File input
  {
    componentType: 'file-upload',
    patterns: {
      tagNames: ['input'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return getInputType(element) === 'file';
      },
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 2: Custom file upload with drag-drop
  {
    componentType: 'file-upload',
    patterns: {
      classKeywords: ['file-upload', 'dropzone', 'file-drop', 'upload'],
      cssProperties: (styles, element) => {
        if (!element) return false;

        // Check for hidden file input
        const hasFileInput = !!element.querySelector('input[type="file"]');
        return hasFileInput;
      },
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 3: Dropzone.js style uploaders
  {
    componentType: 'file-upload',
    patterns: {
      classKeywords: ['dropzone', 'dz-', 'filepond', 'uppy'],
    },
    confidence: 90,
    priority: 90,
  },
];

// ============================================================================
// FORM CONTAINER PATTERNS
// ============================================================================

export const formContainerPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic form tag
  {
    componentType: 'form',
    patterns: {
      tagNames: ['form'],
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 2: Form with multiple inputs
  {
    componentType: 'form',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        // Count form elements
        const inputs = element.querySelectorAll('input:not([type="hidden"]), textarea, select');
        const buttons = element.querySelectorAll('button[type="submit"], input[type="submit"]');

        return inputs.length >= 2 && buttons.length >= 1;
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 3: Form class names
  {
    componentType: 'form',
    patterns: {
      classKeywords: ['form', 'contact-form', 'signup', 'register', 'login'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasInputs = element.querySelectorAll('input, textarea, select').length >= 1;
        return hasInputs;
      },
    },
    confidence: 80,
    priority: 80,
  },

  // Pattern 4: ARIA form role
  {
    componentType: 'form',
    patterns: {
      ariaRole: 'form',
    },
    confidence: 90,
    priority: 90,
  },
];

// ============================================================================
// MULTI-STEP FORM PATTERNS
// ============================================================================

export const multiStepFormPatterns: RecognitionPattern[] = [
  // Pattern 1: Wizard/stepper class names
  {
    componentType: 'form',
    patterns: {
      classKeywords: ['wizard', 'stepper', 'multi-step', 'step-form', 'form-wizard'],
    },
    confidence: 90,
    priority: 95,
  },

  // Pattern 2: Form with step indicators
  {
    componentType: 'form',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        // Check for step indicators
        const hasSteps = !!(
          element.querySelector('[class*="step"]') ||
          element.querySelector('[class*="progress"]') ||
          element.querySelector('[role="progressbar"]')
        );

        // Check for multiple sections
        const sections = element.querySelectorAll('[class*="step"], section, fieldset');

        return hasSteps && sections.length >= 2;
      },
    },
    confidence: 85,
    priority: 90,
  },

  // Pattern 3: Form with prev/next buttons
  {
    componentType: 'form',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const buttons = Array.from(element.querySelectorAll('button, input[type="button"]'));
        const hasNextPrev = buttons.some(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          const classes = Array.from(btn.classList).join(' ').toLowerCase();
          return /next|previous|prev|continue|back/.test(text + classes);
        });

        return hasNextPrev;
      },
    },
    confidence: 75,
    priority: 80,
  },
];

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze input field in detail
 */
export function analyzeInputField(element: Element): {
  inputType: string;
  hasLabel: boolean;
  labelText?: string;
  placeholder?: string;
  validation: {
    required: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: string;
    max?: string;
  };
  autocomplete?: string;
  disabled: boolean;
  readonly: boolean;
} {
  const inputType = getInputType(element);
  const label = document.querySelector(`label[for="${element.id}"]`);
  const validation = getValidationAttributes(element);

  return {
    inputType,
    hasLabel: hasLabel(element),
    labelText: label?.textContent?.trim(),
    placeholder: element.getAttribute('placeholder') || undefined,
    validation,
    autocomplete: element.getAttribute('autocomplete') || undefined,
    disabled: element.hasAttribute('disabled'),
    readonly: element.hasAttribute('readonly'),
  };
}

/**
 * Analyze textarea in detail
 */
export function analyzeTextarea(element: Element): {
  rows?: number;
  cols?: number;
  hasLabel: boolean;
  labelText?: string;
  placeholder?: string;
  maxLength?: number;
  disabled: boolean;
  readonly: boolean;
  isRichText: boolean;
} {
  const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;

  return {
    rows: element.hasAttribute('rows') ? parseInt(element.getAttribute('rows')!) : undefined,
    cols: element.hasAttribute('cols') ? parseInt(element.getAttribute('cols')!) : undefined,
    hasLabel: hasLabel(element),
    labelText: label?.textContent?.trim(),
    placeholder: element.getAttribute('placeholder') || undefined,
    maxLength: element.hasAttribute('maxlength') ? parseInt(element.getAttribute('maxlength')!) : undefined,
    disabled: element.hasAttribute('disabled'),
    readonly: element.hasAttribute('readonly'),
    isRichText: element.hasAttribute('contenteditable'),
  };
}

/**
 * Analyze select/dropdown in detail
 */
export function analyzeSelect(element: Element): {
  optionCount: number;
  hasLabel: boolean;
  labelText?: string;
  multiple: boolean;
  size?: number;
  disabled: boolean;
  options: { value: string; text: string; selected: boolean }[];
} {
  const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
  const options = Array.from(element.querySelectorAll('option')).map(opt => ({
    value: opt.getAttribute('value') || opt.textContent?.trim() || '',
    text: opt.textContent?.trim() || '',
    selected: opt.hasAttribute('selected'),
  }));

  return {
    optionCount: options.length,
    hasLabel: hasLabel(element),
    labelText: label?.textContent?.trim(),
    multiple: element.hasAttribute('multiple'),
    size: element.hasAttribute('size') ? parseInt(element.getAttribute('size')!) : undefined,
    disabled: element.hasAttribute('disabled'),
    options,
  };
}

/**
 * Analyze checkbox in detail
 */
export function analyzeCheckbox(element: Element): {
  hasLabel: boolean;
  labelText?: string;
  checked: boolean;
  disabled: boolean;
  value?: string;
  isSwitch: boolean;
} {
  const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : element.closest('label');
  const classes = Array.from(element.classList).join(' ').toLowerCase();
  const parentClasses = Array.from(element.parentElement?.classList || []).join(' ').toLowerCase();

  return {
    hasLabel: !!label,
    labelText: label?.textContent?.trim(),
    checked: element.hasAttribute('checked'),
    disabled: element.hasAttribute('disabled'),
    value: element.getAttribute('value') || undefined,
    isSwitch: /toggle|switch/.test(classes + parentClasses),
  };
}

/**
 * Analyze radio button group
 */
export function analyzeRadioGroup(element: Element): {
  name: string;
  optionCount: number;
  options: { value: string; label?: string; checked: boolean }[];
  disabled: boolean;
} {
  const name = element.getAttribute('name') || '';
  const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${name}"]`));

  const options = radios.map(radio => {
    const label = radio.id ? document.querySelector(`label[for="${radio.id}"]`) : radio.closest('label');
    return {
      value: radio.getAttribute('value') || '',
      label: label?.textContent?.trim(),
      checked: radio.hasAttribute('checked'),
    };
  });

  return {
    name,
    optionCount: options.length,
    options,
    disabled: element.hasAttribute('disabled'),
  };
}

/**
 * Analyze file upload in detail
 */
export function analyzeFileUpload(element: Element): {
  accept?: string;
  multiple: boolean;
  hasLabel: boolean;
  labelText?: string;
  disabled: boolean;
  isDragDrop: boolean;
} {
  const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : element.closest('label');
  const parent = element.parentElement;
  const parentClasses = Array.from(parent?.classList || []).join(' ').toLowerCase();

  return {
    accept: element.getAttribute('accept') || undefined,
    multiple: element.hasAttribute('multiple'),
    hasLabel: !!label,
    labelText: label?.textContent?.trim(),
    disabled: element.hasAttribute('disabled'),
    isDragDrop: /dropzone|drag|drop/.test(parentClasses),
  };
}

/**
 * Analyze form container
 */
export function analyzeForm(element: Element): {
  action?: string;
  method: string;
  fieldCount: number;
  hasValidation: boolean;
  isAjax: boolean;
  formType: 'contact' | 'login' | 'signup' | 'search' | 'newsletter' | 'checkout' | 'generic';
  isMultiStep: boolean;
  stepCount?: number;
} {
  const classes = Array.from(element.classList).join(' ').toLowerCase();
  const inputs = element.querySelectorAll('input:not([type="hidden"]), textarea, select');
  const hasValidation = Array.from(inputs).some(input => input.hasAttribute('required'));

  // Detect form type
  let formType: 'contact' | 'login' | 'signup' | 'search' | 'newsletter' | 'checkout' | 'generic' = 'generic';

  if (/contact/.test(classes)) formType = 'contact';
  else if (/login|signin/.test(classes)) formType = 'login';
  else if (/signup|register/.test(classes)) formType = 'signup';
  else if (/search/.test(classes)) formType = 'search';
  else if (/newsletter|subscribe/.test(classes)) formType = 'newsletter';
  else if (/checkout|payment/.test(classes)) formType = 'checkout';

  // Detect multi-step
  const isMultiStep = /wizard|stepper|multi-step/.test(classes);
  const steps = element.querySelectorAll('[class*="step"], fieldset');
  const stepCount = isMultiStep ? steps.length : undefined;

  // Check if AJAX (no action or has data-ajax attribute)
  const isAjax = !element.hasAttribute('action') || element.hasAttribute('data-ajax');

  return {
    action: element.getAttribute('action') || undefined,
    method: element.getAttribute('method')?.toUpperCase() || 'GET',
    fieldCount: inputs.length,
    hasValidation,
    isAjax,
    formType,
    isMultiStep,
    stepCount,
  };
}
