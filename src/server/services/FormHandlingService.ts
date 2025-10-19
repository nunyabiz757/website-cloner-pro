import * as cheerio from 'cheerio';

/**
 * FormHandlingService
 *
 * Comprehensive form handling migration:
 * - Detect form submission endpoints and methods
 * - Extract and preserve form validation rules
 * - Map to WordPress form plugins (Contact Form 7, Gravity Forms, WPForms)
 * - Convert forms to WordPress blocks (Gutenberg)
 * - Generate form configuration for migration
 */

// Form detection result
export interface FormDetectionResult {
  forms: DetectedForm[];
  totalForms: number;
  formPluginRecommendation: FormPluginRecommendation;
  migrationComplexity: 'simple' | 'moderate' | 'complex';
}

export interface DetectedForm {
  id: string;
  name?: string;
  action: string;
  method: 'GET' | 'POST';
  fields: FormField[];
  validationRules: ValidationRule[];
  submitButton: SubmitButton;
  hasFileUpload: boolean;
  hasRecaptcha: boolean;
  enctype?: string;
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedConversionTime: string;
}

export interface FormField {
  id: string;
  name: string;
  type: string;
  label?: string;
  placeholder?: string;
  value?: string;
  required: boolean;
  validationRules: ValidationRule[];
  options?: string[]; // For select, radio, checkbox
  attributes: Record<string, string>;
}

export interface ValidationRule {
  type: 'required' | 'email' | 'url' | 'number' | 'min' | 'max' | 'minlength' | 'maxlength' | 'pattern' | 'custom';
  value?: any;
  message?: string;
  pattern?: string;
}

export interface SubmitButton {
  text: string;
  id?: string;
  classes?: string[];
}

// Form plugin recommendation
export interface FormPluginRecommendation {
  recommendedPlugin: 'contact-form-7' | 'gravity-forms' | 'wpforms' | 'ninja-forms' | 'formidable';
  confidence: number;
  reasons: string[];
  alternatives: string[];
}

// WordPress form plugin conversions
export interface ContactForm7Config {
  title: string;
  form: string;
  mail: CF7MailConfig;
  messages: Record<string, string>;
}

export interface CF7MailConfig {
  subject: string;
  sender: string;
  recipient: string;
  body: string;
  additionalHeaders: string;
}

export interface GravityFormsConfig {
  title: string;
  description: string;
  fields: GFField[];
  button: {
    text: string;
  };
  confirmations: any[];
  notifications: any[];
}

export interface GFField {
  id: number;
  type: string;
  label: string;
  isRequired: boolean;
  placeholder?: string;
  defaultValue?: string;
  choices?: Array<{ text: string; value: string }>;
  validation?: any;
}

export interface WPFormsConfig {
  form_name: string;
  fields: WPFField[];
  settings: {
    submit_text: string;
    notification_enable: string;
    notifications: any[];
  };
}

export interface WPFField {
  id: string;
  type: string;
  label: string;
  required: string;
  placeholder?: string;
  default_value?: string;
  choices?: string;
  size?: string;
}

// Gutenberg block conversion
export interface GutenbergFormBlock {
  blockName: string;
  attributes: Record<string, any>;
  innerBlocks: GutenbergBlock[];
  innerHTML: string;
}

export interface GutenbergBlock {
  blockName: string;
  attributes: Record<string, any>;
  innerBlocks: GutenbergBlock[];
  innerHTML: string;
}

class FormHandlingService {
  /**
   * Detect forms in HTML
   */
  async detectForms(html: string): Promise<FormDetectionResult> {
    const $ = cheerio.load(html);
    const forms: DetectedForm[] = [];

    $('form').each((index, elem) => {
      const $form = $(elem);
      const form = this.extractFormDetails($form, $, index);
      forms.push(form);
    });

    const totalForms = forms.length;
    const formPluginRecommendation = this.recommendFormPlugin(forms);
    const migrationComplexity = this.calculateMigrationComplexity(forms);

    return {
      forms,
      totalForms,
      formPluginRecommendation,
      migrationComplexity,
    };
  }

  /**
   * Extract form details
   */
  private extractFormDetails($form: cheerio.Cheerio<any>, $: cheerio.CheerioAPI, index: number): DetectedForm {
    const action = $form.attr('action') || '';
    const method = ($form.attr('method')?.toUpperCase() || 'GET') as 'GET' | 'POST';
    const enctype = $form.attr('enctype');
    const name = $form.attr('name') || $form.attr('id') || `form-${index}`;
    const id = $form.attr('id') || `form-${index}`;

    // Extract fields
    const fields = this.extractFormFields($form, $);

    // Extract validation rules
    const validationRules = this.extractValidationRules($form, $);

    // Extract submit button
    const submitButton = this.extractSubmitButton($form, $);

    // Check for file upload
    const hasFileUpload = $form.find('input[type="file"]').length > 0;

    // Check for reCAPTCHA
    const hasRecaptcha = $form.find('.g-recaptcha, [data-sitekey]').length > 0 ||
                         html.includes('grecaptcha') ||
                         html.includes('recaptcha');

    // Calculate complexity
    const complexity = this.calculateFormComplexity(fields, hasFileUpload, hasRecaptcha);

    // Estimate conversion time
    const estimatedConversionTime = this.estimateConversionTime(complexity, fields.length);

    return {
      id,
      name,
      action,
      method,
      fields,
      validationRules,
      submitButton,
      hasFileUpload,
      hasRecaptcha,
      enctype,
      complexity,
      estimatedConversionTime,
    };
  }

  /**
   * Extract form fields
   */
  private extractFormFields($form: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): FormField[] {
    const fields: FormField[] = [];

    $form.find('input, textarea, select').each((_, elem) => {
      const $field = $(elem);
      const type = $field.attr('type') || $field.prop('tagName').toLowerCase();

      // Skip submit buttons
      if (type === 'submit' || type === 'button') return;

      const name = $field.attr('name') || '';
      if (!name) return;

      const id = $field.attr('id') || name;
      const label = this.findLabel($field, $);
      const placeholder = $field.attr('placeholder');
      const value = $field.attr('value');
      const required = $field.attr('required') !== undefined;

      // Extract options for select/radio/checkbox
      const options = this.extractOptions($field, $, type);

      // Extract attributes
      const attributes: Record<string, string> = {};
      const attrNames = ['min', 'max', 'minlength', 'maxlength', 'pattern', 'step'];
      attrNames.forEach(attr => {
        const val = $field.attr(attr);
        if (val) attributes[attr] = val;
      });

      // Extract field validation rules
      const validationRules = this.extractFieldValidation($field, type);

      fields.push({
        id,
        name,
        type,
        label,
        placeholder,
        value,
        required,
        validationRules,
        options,
        attributes,
      });
    });

    return fields;
  }

  /**
   * Find label for field
   */
  private findLabel($field: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): string | undefined {
    const fieldId = $field.attr('id');

    // Check for label with for attribute
    if (fieldId) {
      const $label = $(`label[for="${fieldId}"]`);
      if ($label.length > 0) {
        return $label.text().trim();
      }
    }

    // Check for wrapping label
    const $parentLabel = $field.closest('label');
    if ($parentLabel.length > 0) {
      return $parentLabel.text().trim();
    }

    // Check for previous sibling label
    const $prevLabel = $field.prev('label');
    if ($prevLabel.length > 0) {
      return $prevLabel.text().trim();
    }

    return undefined;
  }

  /**
   * Extract options for select/radio/checkbox
   */
  private extractOptions($field: cheerio.Cheerio<any>, $: cheerio.CheerioAPI, type: string): string[] | undefined {
    if (type === 'select') {
      const options: string[] = [];
      $field.find('option').each((_, opt) => {
        const text = $(opt).text().trim();
        if (text) options.push(text);
      });
      return options.length > 0 ? options : undefined;
    }

    if (type === 'radio' || type === 'checkbox') {
      const name = $field.attr('name');
      const options: string[] = [];
      $(`input[name="${name}"]`).each((_, input) => {
        const value = $(input).attr('value');
        if (value) options.push(value);
      });
      return options.length > 1 ? options : undefined;
    }

    return undefined;
  }

  /**
   * Extract field validation
   */
  private extractFieldValidation($field: cheerio.Cheerio<any>, type: string): ValidationRule[] {
    const rules: ValidationRule[] = [];

    if ($field.attr('required') !== undefined) {
      rules.push({ type: 'required', message: 'This field is required' });
    }

    if (type === 'email') {
      rules.push({ type: 'email', message: 'Please enter a valid email address' });
    }

    if (type === 'url') {
      rules.push({ type: 'url', message: 'Please enter a valid URL' });
    }

    if (type === 'number') {
      rules.push({ type: 'number', message: 'Please enter a valid number' });
    }

    const min = $field.attr('min');
    if (min) {
      rules.push({ type: 'min', value: min, message: `Minimum value is ${min}` });
    }

    const max = $field.attr('max');
    if (max) {
      rules.push({ type: 'max', value: max, message: `Maximum value is ${max}` });
    }

    const minlength = $field.attr('minlength');
    if (minlength) {
      rules.push({ type: 'minlength', value: minlength, message: `Minimum length is ${minlength}` });
    }

    const maxlength = $field.attr('maxlength');
    if (maxlength) {
      rules.push({ type: 'maxlength', value: maxlength, message: `Maximum length is ${maxlength}` });
    }

    const pattern = $field.attr('pattern');
    if (pattern) {
      rules.push({ type: 'pattern', pattern, message: 'Please match the required format' });
    }

    return rules;
  }

  /**
   * Extract form-level validation rules
   */
  private extractValidationRules($form: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): ValidationRule[] {
    const rules: ValidationRule[] = [];

    // Check for data-validate attribute
    const validateAttr = $form.attr('data-validate');
    if (validateAttr) {
      rules.push({ type: 'custom', value: validateAttr });
    }

    // Check for validation libraries
    const formClasses = $form.attr('class') || '';
    if (formClasses.includes('validate') || formClasses.includes('validation')) {
      rules.push({ type: 'custom', value: 'validation-library-detected' });
    }

    return rules;
  }

  /**
   * Extract submit button
   */
  private extractSubmitButton($form: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): SubmitButton {
    const $submit = $form.find('button[type="submit"], input[type="submit"]').first();

    if ($submit.length > 0) {
      return {
        text: $submit.attr('value') || $submit.text().trim() || 'Submit',
        id: $submit.attr('id'),
        classes: $submit.attr('class')?.split(' '),
      };
    }

    return { text: 'Submit' };
  }

  /**
   * Calculate form complexity
   */
  private calculateFormComplexity(fields: FormField[], hasFileUpload: boolean, hasRecaptcha: boolean): 'simple' | 'moderate' | 'complex' {
    let score = fields.length;

    if (hasFileUpload) score += 5;
    if (hasRecaptcha) score += 3;

    // Add complexity for special field types
    fields.forEach(field => {
      if (field.type === 'file') score += 2;
      if (field.options && field.options.length > 5) score += 2;
      if (field.validationRules.length > 2) score += 1;
    });

    if (score <= 5) return 'simple';
    if (score <= 15) return 'moderate';
    return 'complex';
  }

  /**
   * Estimate conversion time
   */
  private estimateConversionTime(complexity: string, fieldCount: number): string {
    const baseTime = {
      simple: 5,
      moderate: 15,
      complex: 30,
    };

    const time = baseTime[complexity as keyof typeof baseTime] + Math.floor(fieldCount / 3);
    return `${time}-${time + 10} minutes`;
  }

  /**
   * Calculate migration complexity
   */
  private calculateMigrationComplexity(forms: DetectedForm[]): 'simple' | 'moderate' | 'complex' {
    if (forms.length === 0) return 'simple';
    if (forms.length === 1 && forms[0].complexity === 'simple') return 'simple';
    if (forms.length <= 3 && forms.every(f => f.complexity !== 'complex')) return 'moderate';
    return 'complex';
  }

  /**
   * Recommend form plugin
   */
  private recommendFormPlugin(forms: DetectedForm[]): FormPluginRecommendation {
    if (forms.length === 0) {
      return {
        recommendedPlugin: 'contact-form-7',
        confidence: 1.0,
        reasons: ['No forms detected'],
        alternatives: [],
      };
    }

    const hasComplexForms = forms.some(f => f.complexity === 'complex');
    const hasFileUploads = forms.some(f => f.hasFileUpload);
    const totalFields = forms.reduce((sum, f) => sum + f.fields.length, 0);
    const avgFields = totalFields / forms.length;

    // Gravity Forms - best for complex forms
    if (hasComplexForms || avgFields > 15 || forms.length > 5) {
      return {
        recommendedPlugin: 'gravity-forms',
        confidence: 0.9,
        reasons: [
          'Complex form structure detected',
          hasFileUploads ? 'File upload support required' : '',
          forms.length > 5 ? 'Multiple forms to manage' : '',
        ].filter(Boolean),
        alternatives: ['wpforms', 'formidable'],
      };
    }

    // WPForms - good balance
    if (avgFields > 8 || hasFileUploads) {
      return {
        recommendedPlugin: 'wpforms',
        confidence: 0.85,
        reasons: [
          'Moderate form complexity',
          'User-friendly interface',
          hasFileUploads ? 'File upload support' : '',
        ].filter(Boolean),
        alternatives: ['gravity-forms', 'ninja-forms'],
      };
    }

    // Contact Form 7 - simple forms
    return {
      recommendedPlugin: 'contact-form-7',
      confidence: 0.95,
      reasons: [
        'Simple form structure',
        'Free and widely used',
        'Easy to setup',
      ],
      alternatives: ['wpforms', 'ninja-forms'],
    };
  }

  /**
   * Convert to Contact Form 7
   */
  convertToContactForm7(form: DetectedForm, recipientEmail: string = 'admin@example.com'): ContactForm7Config {
    let formCode = '';

    form.fields.forEach(field => {
      const required = field.required ? '*' : '';
      const fieldName = field.name;

      switch (field.type) {
        case 'text':
        case 'email':
        case 'url':
        case 'tel':
          formCode += `<p>\n`;
          if (field.label) formCode += `  <label>${field.label}</label>\n`;
          formCode += `  [${field.type}${required} ${fieldName}`;
          if (field.placeholder) formCode += ` placeholder "${field.placeholder}"`;
          formCode += `]\n</p>\n\n`;
          break;

        case 'textarea':
          formCode += `<p>\n`;
          if (field.label) formCode += `  <label>${field.label}</label>\n`;
          formCode += `  [textarea${required} ${fieldName}`;
          if (field.placeholder) formCode += ` placeholder "${field.placeholder}"`;
          formCode += `]\n</p>\n\n`;
          break;

        case 'select':
          formCode += `<p>\n`;
          if (field.label) formCode += `  <label>${field.label}</label>\n`;
          formCode += `  [select${required} ${fieldName}`;
          if (field.options) {
            formCode += ` "${field.options.join('" "')}";
          }
          formCode += `]\n</p>\n\n`;
          break;

        case 'checkbox':
          formCode += `<p>\n`;
          if (field.label) formCode += `  <label>${field.label}</label>\n`;
          formCode += `  [checkbox${required} ${fieldName}`;
          if (field.options) {
            formCode += ` "${field.options.join('" "')}`;
          }
          formCode += `]\n</p>\n\n`;
          break;

        case 'radio':
          formCode += `<p>\n`;
          if (field.label) formCode += `  <label>${field.label}</label>\n`;
          formCode += `  [radio${required} ${fieldName}`;
          if (field.options) {
            formCode += ` "${field.options.join('" "')}`;
          }
          formCode += `]\n</p>\n\n`;
          break;

        case 'file':
          formCode += `<p>\n`;
          if (field.label) formCode += `  <label>${field.label}</label>\n`;
          formCode += `  [file${required} ${fieldName}]\n</p>\n\n`;
          break;
      }
    });

    // Add submit button
    formCode += `<p>\n  [submit "${form.submitButton.text}"]\n</p>`;

    // Generate mail body
    const mailBody = form.fields
      .map(field => `${field.label || field.name}: [${field.name}]`)
      .join('\n\n');

    return {
      title: form.name || 'Contact Form',
      form: formCode,
      mail: {
        subject: `New submission from ${form.name || 'Contact Form'}`,
        sender: '[_site_title] <wordpress@[_site_domain]>',
        recipient: recipientEmail,
        body: mailBody,
        additionalHeaders: 'Reply-To: [your-email]',
      },
      messages: {
        mail_sent_ok: 'Thank you for your message. It has been sent.',
        mail_sent_ng: 'There was an error sending your message. Please try again.',
        validation_error: 'One or more fields have an error. Please check and try again.',
      },
    };
  }

  /**
   * Convert to Gravity Forms
   */
  convertToGravityForms(form: DetectedForm): GravityFormsConfig {
    const fields: GFField[] = form.fields.map((field, index) => {
      const gfField: GFField = {
        id: index + 1,
        type: this.mapToGravityFormsType(field.type),
        label: field.label || field.name,
        isRequired: field.required,
        placeholder: field.placeholder,
        defaultValue: field.value,
      };

      if (field.options) {
        gfField.choices = field.options.map(opt => ({
          text: opt,
          value: opt,
        }));
      }

      return gfField;
    });

    return {
      title: form.name || 'Form',
      description: '',
      fields,
      button: {
        text: form.submitButton.text,
      },
      confirmations: [
        {
          id: '1',
          name: 'Default Confirmation',
          isDefault: true,
          type: 'message',
          message: 'Thanks for contacting us! We will get in touch with you shortly.',
        },
      ],
      notifications: [
        {
          id: '1',
          name: 'Admin Notification',
          toType: 'email',
          to: '{admin_email}',
          subject: 'New submission from {form_title}',
          message: '{all_fields}',
        },
      ],
    };
  }

  /**
   * Map field type to Gravity Forms type
   */
  private mapToGravityFormsType(type: string): string {
    const mapping: Record<string, string> = {
      'text': 'text',
      'email': 'email',
      'textarea': 'textarea',
      'select': 'select',
      'radio': 'radio',
      'checkbox': 'checkbox',
      'file': 'fileupload',
      'tel': 'phone',
      'url': 'website',
      'number': 'number',
    };
    return mapping[type] || 'text';
  }

  /**
   * Convert to WPForms
   */
  convertToWPForms(form: DetectedForm): WPFormsConfig {
    const fields: WPFField[] = form.fields.map((field, index) => {
      const wpfField: WPFField = {
        id: (index + 1).toString(),
        type: this.mapToWPFormsType(field.type),
        label: field.label || field.name,
        required: field.required ? '1' : '0',
        placeholder: field.placeholder,
        default_value: field.value,
        size: 'medium',
      };

      if (field.options) {
        wpfField.choices = field.options.map((opt, i) =>
          `${i + 1}:${opt}`
        ).join('\n');
      }

      return wpfField;
    });

    return {
      form_name: form.name || 'Form',
      fields,
      settings: {
        submit_text: form.submitButton.text,
        notification_enable: '1',
        notifications: [
          {
            email: '{admin_email}',
            subject: 'New Form Entry',
            message: '{all_fields}',
          },
        ],
      },
    };
  }

  /**
   * Map field type to WPForms type
   */
  private mapToWPFormsType(type: string): string {
    const mapping: Record<string, string> = {
      'text': 'text',
      'email': 'email',
      'textarea': 'textarea',
      'select': 'select',
      'radio': 'radio',
      'checkbox': 'checkbox',
      'file': 'file-upload',
      'tel': 'phone',
      'url': 'url',
      'number': 'number',
    };
    return mapping[type] || 'text';
  }

  /**
   * Convert to Gutenberg block
   */
  convertToGutenbergBlock(form: DetectedForm, plugin: 'contact-form-7' | 'wpforms' | 'gravity-forms'): GutenbergFormBlock {
    if (plugin === 'contact-form-7') {
      return {
        blockName: 'contact-form-7/contact-form-selector',
        attributes: {
          id: 1,
          title: form.name || 'Contact Form',
        },
        innerBlocks: [],
        innerHTML: `<!-- wp:contact-form-7/contact-form-selector {"id":1,"title":"${form.name || 'Contact Form'}"} /-->`,
      };
    }

    if (plugin === 'wpforms') {
      return {
        blockName: 'wpforms/form-selector',
        attributes: {
          formId: '1',
          displayTitle: false,
          displayDesc: false,
        },
        innerBlocks: [],
        innerHTML: `<!-- wp:wpforms/form-selector {"formId":"1"} /-->`,
      };
    }

    // Gravity Forms
    return {
      blockName: 'gravityforms/form',
      attributes: {
        formId: '1',
        title: false,
        description: false,
        ajax: true,
      },
      innerBlocks: [],
      innerHTML: `<!-- wp:gravityforms/form {"formId":"1","title":false,"description":false,"ajax":true} /-->`,
    };
  }
}

// Export singleton instance
export default new FormHandlingService();
