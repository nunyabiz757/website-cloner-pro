/**
 * ACF/Custom Field Mapping
 *
 * Maps content to Advanced Custom Fields:
 * - Field type detection
 * - Field group generation
 * - Location rules
 * - ACF JSON export
 * - Field value extraction
 */

export interface ACFMapping {
  fieldGroups: ACFFieldGroup[];
  fields: ACFField[];
  exportJSON: string;
  phpCode: string;
}

export interface ACFFieldGroup {
  key: string;
  title: string;
  fields: ACFField[];
  location: ACFLocation[][];
  menu_order: number;
  position: 'normal' | 'side' | 'acf_after_title';
  style: 'default' | 'seamless';
  label_placement: 'top' | 'left';
  instruction_placement: 'label' | 'field';
  active: boolean;
}

export interface ACFField {
  key: string;
  label: string;
  name: string;
  type: ACFFieldType;
  instructions?: string;
  required: boolean;
  default_value?: any;
  placeholder?: string;
  conditional_logic?: any;
  wrapper?: {
    width: string;
    class: string;
    id: string;
  };
  // Type-specific properties
  choices?: Record<string, string>; // For select, checkbox, radio
  multiple?: boolean; // For select
  allow_null?: boolean;
  ui?: boolean;
  return_format?: string; // For date, image, etc.
  min?: number;
  max?: number;
  step?: number;
  rows?: number; // For textarea
  new_lines?: 'wpautop' | 'br' | ''; // For textarea
  maxlength?: number;
  library?: 'all' | 'uploadedTo'; // For image/file
  min_width?: number;
  min_height?: number;
  mime_types?: string;
  sub_fields?: ACFField[]; // For repeater, group
  layout?: 'table' | 'block' | 'row';
  button_label?: string;
  detectedFrom?: string[];
  confidence?: number;
}

export type ACFFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'range'
  | 'email'
  | 'url'
  | 'password'
  | 'image'
  | 'file'
  | 'wysiwyg'
  | 'oembed'
  | 'gallery'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'button_group'
  | 'true_false'
  | 'link'
  | 'post_object'
  | 'page_link'
  | 'relationship'
  | 'taxonomy'
  | 'user'
  | 'google_map'
  | 'date_picker'
  | 'date_time_picker'
  | 'time_picker'
  | 'color_picker'
  | 'message'
  | 'accordion'
  | 'tab'
  | 'group'
  | 'repeater'
  | 'flexible_content'
  | 'clone';

export interface ACFLocation {
  param: string; // 'post_type', 'post', 'page_template', etc.
  operator: '==' | '!=' | '>' | '<';
  value: string;
}

export class ACFFieldMapper {
  private fieldGroups: Map<string, ACFFieldGroup> = new Map();
  private detectedFields: Map<string, ACFField> = new Map();

  /**
   * Map content to ACF fields
   */
  map(pageData: PageContentData[], postTypes?: string[]): ACFMapping {
    // Detect fields from content
    this.detectFields(pageData);

    // Create field groups
    this.createFieldGroups(postTypes || []);

    // Generate JSON export
    const exportJSON = this.generateJSONExport();

    // Generate PHP code
    const phpCode = this.generatePHPCode();

    return {
      fieldGroups: Array.from(this.fieldGroups.values()),
      fields: Array.from(this.detectedFields.values()),
      exportJSON,
      phpCode,
    };
  }

  /**
   * Detect ACF fields from page content
   */
  private detectFields(pageData: PageContentData[]): void {
    for (const page of pageData) {
      const components = page.components || [];

      for (const component of components) {
        // Detect different field types
        this.detectTextField(component, page.id);
        this.detectImageField(component, page.id);
        this.detectLinkField(component, page.id);
        this.detectDateField(component, page.id);
        this.detectRepeaterField(component, page.id);
        this.detectSelectField(component, page.id);
        this.detectWYSIWYGField(component, page.id);
        this.detectColorField(component, page.id);
        this.detectMapField(component, page.id);
        this.detectGalleryField(component, page.id);
      }
    }
  }

  /**
   * Detect text field
   */
  private detectTextField(component: ComponentData, pageId: string): void {
    const text = component.textContent || '';
    const classes = (component.className || '').toLowerCase();

    // Look for labeled text patterns
    const labelMatch = text.match(/^([A-Z][^:]+):\s*(.+)$/);
    if (labelMatch) {
      const label = labelMatch[1].trim();
      const value = labelMatch[2].trim();

      // Skip if value is too long (likely not a field)
      if (value.length > 200) return;

      const fieldName = this.labelToFieldName(label);
      const fieldKey = `field_${fieldName}`;

      if (!this.detectedFields.has(fieldKey)) {
        this.detectedFields.set(fieldKey, {
          key: fieldKey,
          label,
          name: fieldName,
          type: 'text',
          required: false,
          detectedFrom: [pageId],
          confidence: 60,
        });
      } else {
        const field = this.detectedFields.get(fieldKey)!;
        if (!field.detectedFrom?.includes(pageId)) {
          field.detectedFrom?.push(pageId);
          field.confidence = Math.min((field.confidence || 60) + 10, 100);
        }
      }
    }
  }

  /**
   * Detect image field
   */
  private detectImageField(component: ComponentData, pageId: string): void {
    if (component.tagName === 'img' && component.attributes?.src) {
      const classes = (component.className || '').toLowerCase();
      const alt = component.attributes.alt || '';

      // Skip if looks like a logo or icon
      if (classes.includes('logo') || classes.includes('icon')) return;

      // Try to infer field name from alt text or classes
      let fieldName = 'featured_image';
      if (alt) {
        fieldName = this.labelToFieldName(alt);
      } else if (classes.includes('hero')) {
        fieldName = 'hero_image';
      } else if (classes.includes('banner')) {
        fieldName = 'banner_image';
      }

      const fieldKey = `field_${fieldName}`;

      if (!this.detectedFields.has(fieldKey)) {
        this.detectedFields.set(fieldKey, {
          key: fieldKey,
          label: this.fieldNameToLabel(fieldName),
          name: fieldName,
          type: 'image',
          required: false,
          return_format: 'array',
          library: 'all',
          detectedFrom: [pageId],
          confidence: 70,
        });
      }
    }
  }

  /**
   * Detect link field
   */
  private detectLinkField(component: ComponentData, pageId: string): void {
    if (component.tagName === 'a' && component.attributes?.href) {
      const href = component.attributes.href;
      const text = component.textContent?.trim() || '';
      const classes = (component.className || '').toLowerCase();

      // Skip internal navigation links
      if (href.startsWith('#') || href.startsWith('/')) return;

      // CTA buttons
      if (classes.includes('cta') || classes.includes('button')) {
        const fieldKey = 'field_cta_link';

        if (!this.detectedFields.has(fieldKey)) {
          this.detectedFields.set(fieldKey, {
            key: fieldKey,
            label: 'CTA Link',
            name: 'cta_link',
            type: 'link',
            required: false,
            return_format: 'array',
            detectedFrom: [pageId],
            confidence: 75,
          });
        }
      }
    }
  }

  /**
   * Detect date field
   */
  private detectDateField(component: ComponentData, pageId: string): void {
    const text = component.textContent || '';
    const classes = (component.className || '').toLowerCase();

    // Look for date patterns
    const datePatterns = [
      /\d{4}-\d{2}-\d{2}/,
      /\d{1,2}\/\d{1,2}\/\d{4}/,
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/i,
    ];

    const hasDate = datePatterns.some(pattern => pattern.test(text));

    if (hasDate || classes.includes('date') || classes.includes('event-date')) {
      const fieldKey = 'field_event_date';

      if (!this.detectedFields.has(fieldKey)) {
        this.detectedFields.set(fieldKey, {
          key: fieldKey,
          label: 'Event Date',
          name: 'event_date',
          type: 'date_picker',
          required: false,
          return_format: 'Y-m-d',
          detectedFrom: [pageId],
          confidence: 80,
        });
      }
    }
  }

  /**
   * Detect repeater field
   */
  private detectRepeaterField(component: ComponentData, pageId: string): void {
    // Look for repeated structures (lists, grids)
    if (component.children && component.children.length >= 3) {
      // Check if children have similar structure
      const firstChild = component.children[0];
      const similarChildren = component.children.filter(child =>
        child.componentType === firstChild.componentType &&
        child.tagName === firstChild.tagName
      );

      if (similarChildren.length >= 3) {
        const classes = (component.className || '').toLowerCase();
        let fieldName = 'items';

        if (classes.includes('team')) fieldName = 'team_members';
        else if (classes.includes('testimonial')) fieldName = 'testimonials';
        else if (classes.includes('feature')) fieldName = 'features';
        else if (classes.includes('service')) fieldName = 'services';
        else if (classes.includes('benefit')) fieldName = 'benefits';

        const fieldKey = `field_${fieldName}`;

        if (!this.detectedFields.has(fieldKey)) {
          // Detect sub-fields from first child
          const subFields = this.detectSubFields(firstChild);

          this.detectedFields.set(fieldKey, {
            key: fieldKey,
            label: this.fieldNameToLabel(fieldName),
            name: fieldName,
            type: 'repeater',
            required: false,
            layout: 'table',
            button_label: `Add ${this.fieldNameToLabel(fieldName).slice(0, -1)}`,
            sub_fields: subFields,
            detectedFrom: [pageId],
            confidence: 85,
          });
        }
      }
    }
  }

  /**
   * Detect sub-fields from component
   */
  private detectSubFields(component: ComponentData): ACFField[] {
    const subFields: ACFField[] = [];

    // Look for title
    const hasTitle = component.children?.some(c =>
      c.tagName?.match(/^h[1-6]$/)
    );

    if (hasTitle) {
      subFields.push({
        key: 'field_title',
        label: 'Title',
        name: 'title',
        type: 'text',
        required: true,
      });
    }

    // Look for description/text
    const hasText = component.children?.some(c =>
      c.tagName === 'p' || c.componentType === 'paragraph'
    );

    if (hasText) {
      subFields.push({
        key: 'field_description',
        label: 'Description',
        name: 'description',
        type: 'textarea',
        required: false,
        rows: 4,
      });
    }

    // Look for image
    const hasImage = component.children?.some(c =>
      c.tagName === 'img'
    );

    if (hasImage) {
      subFields.push({
        key: 'field_image',
        label: 'Image',
        name: 'image',
        type: 'image',
        required: false,
        return_format: 'array',
      });
    }

    return subFields;
  }

  /**
   * Detect select/dropdown field
   */
  private detectSelectField(component: ComponentData, pageId: string): void {
    if (component.tagName === 'select' || component.componentType === 'select') {
      const name = component.attributes?.name || 'select_field';
      const fieldName = this.labelToFieldName(name);
      const fieldKey = `field_${fieldName}`;

      if (!this.detectedFields.has(fieldKey)) {
        this.detectedFields.set(fieldKey, {
          key: fieldKey,
          label: this.fieldNameToLabel(fieldName),
          name: fieldName,
          type: 'select',
          required: false,
          choices: {}, // Would need to extract options
          allow_null: true,
          detectedFrom: [pageId],
          confidence: 90,
        });
      }
    }
  }

  /**
   * Detect WYSIWYG field
   */
  private detectWYSIWYGField(component: ComponentData, pageId: string): void {
    const text = component.textContent || '';

    // Long text content likely needs WYSIWYG
    if (text.length > 500 && component.componentType === 'div') {
      const fieldKey = 'field_content';

      if (!this.detectedFields.has(fieldKey)) {
        this.detectedFields.set(fieldKey, {
          key: fieldKey,
          label: 'Content',
          name: 'content',
          type: 'wysiwyg',
          required: false,
          tabs: 'all',
          toolbar: 'full',
          media_upload: true,
          detectedFrom: [pageId],
          confidence: 70,
        } as ACFField);
      }
    }
  }

  /**
   * Detect color picker field
   */
  private detectColorField(component: ComponentData, pageId: string): void {
    const styles = component.styles || {};

    // If component has custom colors, might be a color field
    if (styles.backgroundColor || styles.color) {
      const classes = (component.className || '').toLowerCase();

      if (classes.includes('custom') || classes.includes('theme')) {
        const fieldKey = 'field_theme_color';

        if (!this.detectedFields.has(fieldKey)) {
          this.detectedFields.set(fieldKey, {
            key: fieldKey,
            label: 'Theme Color',
            name: 'theme_color',
            type: 'color_picker',
            required: false,
            default_value: '',
            detectedFrom: [pageId],
            confidence: 65,
          });
        }
      }
    }
  }

  /**
   * Detect Google Map field
   */
  private detectMapField(component: ComponentData, pageId: string): void {
    const classes = (component.className || '').toLowerCase();
    const text = component.textContent?.toLowerCase() || '';

    if (classes.includes('map') || text.includes('location') || text.includes('address')) {
      const fieldKey = 'field_location';

      if (!this.detectedFields.has(fieldKey)) {
        this.detectedFields.set(fieldKey, {
          key: fieldKey,
          label: 'Location',
          name: 'location',
          type: 'google_map',
          required: false,
          center_lat: '',
          center_lng: '',
          zoom: 14,
          detectedFrom: [pageId],
          confidence: 75,
        } as ACFField);
      }
    }
  }

  /**
   * Detect gallery field
   */
  private detectGalleryField(component: ComponentData, pageId: string): void {
    const classes = (component.className || '').toLowerCase();

    if (classes.includes('gallery') || classes.includes('images')) {
      const imageCount = component.children?.filter(c => c.tagName === 'img').length || 0;

      if (imageCount >= 3) {
        const fieldKey = 'field_gallery';

        if (!this.detectedFields.has(fieldKey)) {
          this.detectedFields.set(fieldKey, {
            key: fieldKey,
            label: 'Gallery',
            name: 'gallery',
            type: 'gallery',
            required: false,
            return_format: 'array',
            library: 'all',
            min: 0,
            max: 0,
            detectedFrom: [pageId],
            confidence: 85,
          });
        }
      }
    }
  }

  /**
   * Convert label to field name
   */
  private labelToFieldName(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Convert field name to label
   */
  private fieldNameToLabel(fieldName: string): string {
    return fieldName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Create field groups
   */
  private createFieldGroups(postTypes: string[]): void {
    // Group fields by context
    const generalFields = Array.from(this.detectedFields.values())
      .filter(f => (f.confidence || 0) >= 70);

    if (generalFields.length > 0) {
      // Create field group for each post type
      for (const postType of postTypes) {
        const groupKey = `group_${postType}`;

        this.fieldGroups.set(groupKey, {
          key: groupKey,
          title: `${this.fieldNameToLabel(postType)} Fields`,
          fields: generalFields,
          location: [[
            {
              param: 'post_type',
              operator: '==',
              value: postType,
            },
          ]],
          menu_order: 0,
          position: 'normal',
          style: 'default',
          label_placement: 'top',
          instruction_placement: 'label',
          active: true,
        });
      }

      // Also create a general field group for pages
      const pageGroupKey = 'group_page_fields';
      this.fieldGroups.set(pageGroupKey, {
        key: pageGroupKey,
        title: 'Page Fields',
        fields: generalFields,
        location: [[
          {
            param: 'post_type',
            operator: '==',
            value: 'page',
          },
        ]],
        menu_order: 0,
        position: 'normal',
        style: 'default',
        label_placement: 'top',
        instruction_placement: 'label',
        active: true,
      });
    }
  }

  /**
   * Generate ACF JSON export
   */
  private generateJSONExport(): string {
    const groups = Array.from(this.fieldGroups.values()).map(group => ({
      key: group.key,
      title: group.title,
      fields: group.fields.map(f => this.fieldToJSON(f)),
      location: group.location,
      menu_order: group.menu_order,
      position: group.position,
      style: group.style,
      label_placement: group.label_placement,
      instruction_placement: group.instruction_placement,
      active: group.active,
    }));

    return JSON.stringify(groups, null, 2);
  }

  /**
   * Convert field to JSON format
   */
  private fieldToJSON(field: ACFField): any {
    const json: any = {
      key: field.key,
      label: field.label,
      name: field.name,
      type: field.type,
      required: field.required ? 1 : 0,
    };

    // Add type-specific properties
    if (field.placeholder) json.placeholder = field.placeholder;
    if (field.default_value !== undefined) json.default_value = field.default_value;
    if (field.choices) json.choices = field.choices;
    if (field.return_format) json.return_format = field.return_format;
    if (field.sub_fields) json.sub_fields = field.sub_fields.map(sf => this.fieldToJSON(sf));
    if (field.layout) json.layout = field.layout;
    if (field.button_label) json.button_label = field.button_label;

    return json;
  }

  /**
   * Generate PHP registration code
   */
  private generatePHPCode(): string {
    let code = "<?php\n";
    code += "/**\n";
    code += " * Register ACF Fields\n";
    code += " * Generated by Website Cloner Pro\n";
    code += " */\n\n";

    code += "if (function_exists('acf_add_local_field_group')) {\n\n";

    for (const group of this.fieldGroups.values()) {
      code += "  acf_add_local_field_group(array(\n";
      code += `    'key' => '${group.key}',\n`;
      code += `    'title' => '${group.title}',\n`;
      code += "    'fields' => array(\n";

      for (const field of group.fields) {
        code += this.fieldToPHP(field, 3);
      }

      code += "    ),\n";
      code += "    'location' => array(\n";

      for (const locationGroup of group.location) {
        code += "      array(\n";
        for (const rule of locationGroup) {
          code += "        array(\n";
          code += `          'param' => '${rule.param}',\n`;
          code += `          'operator' => '${rule.operator}',\n`;
          code += `          'value' => '${rule.value}',\n`;
          code += "        ),\n";
        }
        code += "      ),\n";
      }

      code += "    ),\n";
      code += `    'position' => '${group.position}',\n`;
      code += "  ));\n\n";
    }

    code += "}\n";

    return code;
  }

  /**
   * Convert field to PHP code
   */
  private fieldToPHP(field: ACFField, indent: number): string {
    const spaces = '  '.repeat(indent);
    let code = `${spaces}array(\n`;
    code += `${spaces}  'key' => '${field.key}',\n`;
    code += `${spaces}  'label' => '${field.label}',\n`;
    code += `${spaces}  'name' => '${field.name}',\n`;
    code += `${spaces}  'type' => '${field.type}',\n`;
    code += `${spaces}  'required' => ${field.required ? 1 : 0},\n`;

    if (field.placeholder) code += `${spaces}  'placeholder' => '${field.placeholder}',\n`;
    if (field.default_value !== undefined) code += `${spaces}  'default_value' => '${field.default_value}',\n`;

    code += `${spaces}),\n`;

    return code;
  }
}

interface ComponentData {
  componentType: string;
  tagName?: string;
  className?: string;
  textContent?: string;
  attributes?: Record<string, string>;
  styles?: Record<string, any>;
  children?: ComponentData[];
}

interface PageContentData {
  id: string;
  url: string;
  components?: ComponentData[];
}

/**
 * Helper function for quick mapping
 */
export function mapACFFields(pageData: PageContentData[], postTypes?: string[]): ACFMapping {
  const mapper = new ACFFieldMapper();
  return mapper.map(pageData, postTypes);
}
