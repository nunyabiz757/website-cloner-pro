# Form Handling Migration

Comprehensive guide to detecting HTML forms and migrating them to WordPress form plugins.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Form Detection](#form-detection)
- [WordPress Form Plugins](#wordpress-form-plugins)
- [Form Conversion](#form-conversion)
- [Gutenberg Blocks](#gutenberg-blocks)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)

---

## Overview

Website Cloner Pro's **Form Handling Migration** service detects HTML forms on websites and converts them to WordPress form plugins (Contact Form 7, Gravity Forms, WPForms).

### Key Features

✅ **Form Detection**
- Automatic form discovery
- Field extraction with validation rules
- Submit endpoint detection
- Complexity analysis

✅ **Validation Preservation**
- Required fields
- Email validation
- URL validation
- Pattern matching (regex)
- Min/max length
- Number ranges

✅ **WordPress Plugin Support**
- Contact Form 7 (simple forms)
- Gravity Forms (complex forms)
- WPForms (balanced approach)
- Automatic plugin recommendation

✅ **Gutenberg Conversion**
- Plugin-specific blocks
- Visual editor compatibility
- Block settings preservation

---

## Features

### 1. Form Detection

Automatically detects all forms on a webpage.

**Detection Criteria:**
- `<form>` elements
- Action URLs (submission endpoints)
- HTTP method (GET/POST)
- Form fields (input, textarea, select)
- Submit buttons
- Validation rules (HTML5 attributes)

**Example Detection:**
```typescript
{
  id: 'contact-form',
  action: '/submit-contact',
  method: 'POST',
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Your Name',
      required: true,
      validation: { required: true }
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
      required: true,
      validation: { required: true, email: true }
    }
  ],
  submitButton: 'Send Message',
  complexity: 'simple'
}
```

### 2. Field Types

**Supported Input Types:**
- `text` - Single-line text
- `email` - Email address
- `tel` - Telephone number
- `url` - Website URL
- `number` - Numeric input
- `date` - Date picker
- `textarea` - Multi-line text
- `select` - Dropdown
- `checkbox` - Checkboxes
- `radio` - Radio buttons
- `file` - File upload

**Field Properties:**
- Name/ID
- Label (from `<label>` or placeholder)
- Type
- Required status
- Validation rules
- Default value
- Options (for select/radio/checkbox)

### 3. Validation Rules

**HTML5 Validation Attributes:**
- `required` - Field is mandatory
- `type="email"` - Email validation
- `type="url"` - URL validation
- `type="number"` - Numeric validation
- `min` / `max` - Number range
- `minlength` / `maxlength` - String length
- `pattern` - Regular expression

**Example:**
```html
<input
  type="email"
  name="email"
  required
  pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
>
```

**Detected Validation:**
```typescript
{
  required: true,
  email: true,
  pattern: '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$'
}
```

### 4. Complexity Analysis

**Complexity Levels:**

**Simple:**
- 1-5 fields
- Basic field types (text, email)
- No file uploads
- Recommended: Contact Form 7

**Medium:**
- 6-10 fields
- Mixed field types
- Optional file upload
- Recommended: WPForms

**Complex:**
- 10+ fields
- Advanced field types
- Multiple file uploads
- Conditional logic
- Recommended: Gravity Forms

---

## Form Detection

### Detection Process

**Step 1: Find Forms**
```javascript
const forms = document.querySelectorAll('form');
```

**Step 2: Extract Form Attributes**
```javascript
const form = {
  id: form.getAttribute('id') || `form-${index}`,
  action: form.getAttribute('action'),
  method: form.getAttribute('method') || 'GET',
  enctype: form.getAttribute('enctype')
};
```

**Step 3: Extract Fields**
```javascript
const fields = [];
form.querySelectorAll('input, textarea, select').forEach(field => {
  fields.push({
    name: field.name,
    type: field.type,
    label: findLabel(field),
    required: field.required,
    validation: extractValidation(field)
  });
});
```

**Step 4: Find Labels**
```javascript
function findLabel(field) {
  // Method 1: <label for="fieldId">
  const label = document.querySelector(`label[for="${field.id}"]`);
  if (label) return label.textContent.trim();

  // Method 2: Wrapper label
  const wrapper = field.closest('label');
  if (wrapper) return wrapper.textContent.replace(field.value, '').trim();

  // Method 3: Placeholder
  return field.placeholder || field.name;
}
```

**Step 5: Extract Validation**
```javascript
function extractValidation(field) {
  return {
    required: field.required,
    email: field.type === 'email',
    url: field.type === 'url',
    number: field.type === 'number',
    min: field.min,
    max: field.max,
    minlength: field.minLength,
    maxlength: field.maxLength,
    pattern: field.pattern
  };
}
```

### Field Type Detection

**Text Input:**
```html
<input type="text" name="name" required>
```

**Email Input:**
```html
<input type="email" name="email" required>
```

**Textarea:**
```html
<textarea name="message" rows="5" minlength="10"></textarea>
```

**Select Dropdown:**
```html
<select name="subject">
  <option value="general">General Inquiry</option>
  <option value="support">Support</option>
</select>
```

**Checkbox:**
```html
<input type="checkbox" name="subscribe" value="yes">
```

**Radio Buttons:**
```html
<input type="radio" name="gender" value="male"> Male
<input type="radio" name="gender" value="female"> Female
```

**File Upload:**
```html
<input type="file" name="attachment" accept=".pdf,.doc">
```

---

## WordPress Form Plugins

### 1. Contact Form 7

**Best For:**
- Simple contact forms
- 1-5 fields
- Basic validation
- No complex logic

**Pros:**
- Free and lightweight
- Easy to use
- Wide plugin support
- Large community

**Cons:**
- Basic features only
- Limited styling options
- No visual form builder
- Basic spam protection

**Example Form:**
```
<p>
  <label>Your Name (required)</label>
  [text* your-name]
</p>

<p>
  <label>Your Email (required)</label>
  [email* your-email]
</p>

<p>
  <label>Subject</label>
  [text your-subject]
</p>

<p>
  <label>Your Message</label>
  [textarea your-message]
</p>

<p>
  [submit "Send"]
</p>
```

### 2. Gravity Forms

**Best For:**
- Complex forms
- 10+ fields
- Conditional logic
- Payment integration
- Advanced validation

**Pros:**
- Visual form builder
- Conditional logic
- Advanced field types
- Entry management
- Add-ons for payments, CRM

**Cons:**
- Premium plugin (paid)
- Can be complex
- Heavier performance impact

**Example Configuration:**
```json
{
  "title": "Contact Form",
  "fields": [
    {
      "type": "text",
      "label": "Name",
      "isRequired": true,
      "id": 1
    },
    {
      "type": "email",
      "label": "Email",
      "isRequired": true,
      "id": 2
    },
    {
      "type": "textarea",
      "label": "Message",
      "id": 3
    }
  ],
  "button": {
    "type": "text",
    "text": "Submit"
  }
}
```

### 3. WPForms

**Best For:**
- Medium complexity forms
- 5-10 fields
- Drag-and-drop building
- Good balance of features/simplicity

**Pros:**
- User-friendly interface
- Visual form builder
- Template library
- Good spam protection
- Free version available

**Cons:**
- Some features require Pro
- Limited conditional logic in free version

**Example Configuration:**
```json
{
  "fields": [
    {
      "id": "1",
      "type": "name",
      "label": "Name",
      "required": "1",
      "format": "first-last"
    },
    {
      "id": "2",
      "type": "email",
      "label": "Email",
      "required": "1"
    },
    {
      "id": "3",
      "type": "textarea",
      "label": "Message",
      "size": "medium"
    }
  ],
  "settings": {
    "submit_text": "Send Message"
  }
}
```

### Plugin Recommendation Algorithm

```typescript
function recommendPlugin(form: DetectedForm): string {
  const fieldCount = form.fields.length;
  const hasFileUpload = form.fields.some(f => f.type === 'file');
  const complexityScore = calculateComplexity(form);

  if (fieldCount <= 5 && !hasFileUpload && complexityScore < 30) {
    return 'contact-form-7'; // Simple
  } else if (fieldCount <= 10 && complexityScore < 60) {
    return 'wpforms'; // Medium
  } else {
    return 'gravity-forms'; // Complex
  }
}

function calculateComplexity(form: DetectedForm): number {
  let score = 0;

  // Field count
  score += form.fields.length * 5;

  // File uploads
  score += form.fields.filter(f => f.type === 'file').length * 20;

  // Complex field types
  const complexTypes = ['date', 'number', 'tel'];
  score += form.fields.filter(f => complexTypes.includes(f.type)).length * 10;

  // Validation rules
  score += form.fields.filter(f => f.validation.pattern).length * 15;

  return score;
}
```

---

## Form Conversion

### Contact Form 7 Conversion

**Conversion Process:**

**1. Text Field:**
```html
HTML: <input type="text" name="name" required>
CF7:  [text* your-name]
```

**2. Email Field:**
```html
HTML: <input type="email" name="email" required>
CF7:  [email* your-email]
```

**3. Textarea:**
```html
HTML: <textarea name="message" minlength="10"></textarea>
CF7:  [textarea your-message minlength:10]
```

**4. Number Field:**
```html
HTML: <input type="number" name="age" min="18" max="100">
CF7:  [number your-age min:18 max:100]
```

**5. Select Dropdown:**
```html
HTML: <select name="subject">
        <option>General</option>
        <option>Support</option>
      </select>
CF7:  [select your-subject "General" "Support"]
```

**6. Checkbox:**
```html
HTML: <input type="checkbox" name="subscribe" value="yes">
CF7:  [checkbox your-subscribe "Yes"]
```

**7. File Upload:**
```html
HTML: <input type="file" name="resume" accept=".pdf">
CF7:  [file your-resume filetypes:pdf]
```

**Complete Example:**
```
<p>
  <label>Name (required)</label>
  [text* name]
</p>

<p>
  <label>Email (required)</label>
  [email* email]
</p>

<p>
  <label>Phone</label>
  [tel phone]
</p>

<p>
  <label>Message</label>
  [textarea message minlength:10]
</p>

<p>
  [submit "Send Message"]
</p>
```

### Gravity Forms Conversion

**Field Mapping:**

```typescript
{
  type: 'text',
  label: 'Name',
  isRequired: true,
  id: 1,
  size: 'medium'
}
```

**Validation Rules:**
```typescript
{
  type: 'email',
  label: 'Email',
  isRequired: true,
  id: 2,
  emailConfirmEnabled: false
}
```

**Advanced Fields:**
```typescript
{
  type: 'fileupload',
  label: 'Resume',
  id: 3,
  allowedExtensions: 'pdf,doc,docx',
  maxFileSize: 5 // MB
}
```

**Complete Form:**
```json
{
  "title": "Contact Form",
  "description": "Please fill out the form below",
  "fields": [
    {
      "type": "text",
      "id": 1,
      "label": "Name",
      "isRequired": true,
      "size": "medium"
    },
    {
      "type": "email",
      "id": 2,
      "label": "Email",
      "isRequired": true
    },
    {
      "type": "phone",
      "id": 3,
      "label": "Phone",
      "phoneFormat": "standard"
    },
    {
      "type": "textarea",
      "id": 4,
      "label": "Message",
      "size": "medium"
    }
  ],
  "button": {
    "type": "text",
    "text": "Send Message"
  }
}
```

### WPForms Conversion

**Field Structure:**
```json
{
  "id": "1",
  "type": "name",
  "label": "Name",
  "required": "1",
  "format": "first-last",
  "first_placeholder": "First Name",
  "last_placeholder": "Last Name"
}
```

**Email Field:**
```json
{
  "id": "2",
  "type": "email",
  "label": "Email Address",
  "required": "1",
  "confirmation": "0"
}
```

**Complete Form:**
```json
{
  "fields": [
    {
      "id": "1",
      "type": "name",
      "label": "Name",
      "required": "1",
      "format": "first-last"
    },
    {
      "id": "2",
      "type": "email",
      "label": "Email",
      "required": "1"
    },
    {
      "id": "3",
      "type": "phone",
      "label": "Phone",
      "format": "us"
    },
    {
      "id": "4",
      "type": "textarea",
      "label": "Message",
      "size": "medium",
      "placeholder": "Enter your message"
    }
  ],
  "settings": {
    "form_title": "Contact Form",
    "submit_text": "Send Message",
    "submit_text_processing": "Sending...",
    "notification_enable": "1",
    "confirmations": {
      "1": {
        "type": "message",
        "message": "Thanks for contacting us!"
      }
    }
  }
}
```

---

## Gutenberg Blocks

### Contact Form 7 Block

**Block Code:**
```html
<!-- wp:contact-form-7/contact-form-selector {"id":123,"title":"Contact Form"} /-->
```

**Block Properties:**
```typescript
{
  blockName: 'contact-form-7/contact-form-selector',
  attrs: {
    id: 123,
    title: 'Contact Form'
  }
}
```

### Gravity Forms Block

**Block Code:**
```html
<!-- wp:gravityforms/form {"formId":"1","title":true,"description":false,"ajax":true} /-->
```

**Block Properties:**
```typescript
{
  blockName: 'gravityforms/form',
  attrs: {
    formId: '1',
    title: true,
    description: false,
    ajax: true
  }
}
```

### WPForms Block

**Block Code:**
```html
<!-- wp:wpforms/form-selector {"formId":"123","displayTitle":false,"displayDesc":false} /-->
```

**Block Properties:**
```typescript
{
  blockName: 'wpforms/form-selector',
  attrs: {
    formId: '123',
    displayTitle: false,
    displayDesc: false
  }
}
```

---

## API Reference

### 1. Detect Forms

**Endpoint:** `POST /api/form-handling/detect`

**Request:**
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/contact"
}
```

**Response:**
```json
{
  "success": true,
  "forms": [
    {
      "id": "contact-form",
      "action": "/submit-contact",
      "method": "POST",
      "fields": [
        {
          "name": "name",
          "type": "text",
          "label": "Your Name",
          "required": true,
          "validation": {
            "required": true
          }
        },
        {
          "name": "email",
          "type": "email",
          "label": "Email",
          "required": true,
          "validation": {
            "required": true,
            "email": true
          }
        }
      ],
      "submitButton": "Send Message",
      "complexity": "simple"
    }
  ],
  "totalForms": 1
}
```

---

### 2. Convert to Contact Form 7

**Endpoint:** `POST /api/form-handling/convert/contact-form-7`

**Request:**
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/contact",
  "formId": "contact-form",
  "recipientEmail": "admin@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "conversion": {
    "plugin": "contact-form-7",
    "formCode": "<p>\n  <label>Name</label>\n  [text* name]\n</p>...",
    "shortcode": "[contact-form-7 id=\"123\" title=\"Contact Form\"]",
    "emailSettings": {
      "to": "admin@example.com",
      "subject": "Contact Form Submission",
      "from": "[your-email]"
    }
  }
}
```

---

### 3. Convert to Gravity Forms

**Endpoint:** `POST /api/form-handling/convert/gravity-forms`

**Request:**
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/contact",
  "formId": "contact-form"
}
```

**Response:**
```json
{
  "success": true,
  "conversion": {
    "plugin": "gravity-forms",
    "config": {
      "title": "Contact Form",
      "fields": [...],
      "button": {
        "type": "text",
        "text": "Submit"
      }
    },
    "importInstructions": [
      "Go to Forms > Import/Export",
      "Paste the JSON configuration",
      "Click Import Forms"
    ]
  }
}
```

---

### 4. Convert to WPForms

**Endpoint:** `POST /api/form-handling/convert/wpforms`

**Request:**
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/contact",
  "formId": "contact-form"
}
```

**Response:**
```json
{
  "success": true,
  "conversion": {
    "plugin": "wpforms",
    "config": {
      "fields": [...],
      "settings": {
        "form_title": "Contact Form",
        "submit_text": "Send Message"
      }
    },
    "importInstructions": [
      "Go to WPForms > Tools",
      "Click Import/Export",
      "Paste the form code",
      "Click Import"
    ]
  }
}
```

---

### 5. Convert All Forms

**Endpoint:** `POST /api/form-handling/convert-all`

**Request:**
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com",
  "targetPlugin": "wpforms"
}
```

**Response:**
```json
{
  "success": true,
  "conversions": [
    {
      "originalFormId": "contact-form",
      "plugin": "wpforms",
      "config": {...},
      "complexity": "simple",
      "confidence": 0.95
    },
    {
      "originalFormId": "newsletter-form",
      "plugin": "wpforms",
      "config": {...},
      "complexity": "simple",
      "confidence": 0.9
    }
  ],
  "totalForms": 2,
  "successfulConversions": 2
}
```

---

### 6. Get Plugin Recommendations

**Endpoint:** `POST /api/form-handling/recommend-plugin`

**Request:**
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/contact",
  "formId": "contact-form"
}
```

**Response:**
```json
{
  "success": true,
  "recommendations": [
    {
      "plugin": "contact-form-7",
      "confidence": 0.9,
      "reason": "Simple form with basic fields",
      "pros": ["Free", "Lightweight", "Easy to use"],
      "cons": ["Basic features only"]
    },
    {
      "plugin": "wpforms",
      "confidence": 0.7,
      "reason": "Good alternative with visual builder",
      "pros": ["Visual builder", "User-friendly"],
      "cons": ["Pro features require payment"]
    }
  ],
  "topRecommendation": "contact-form-7"
}
```

---

### 7. Convert to Gutenberg Block

**Endpoint:** `POST /api/form-handling/convert/gutenberg`

**Request:**
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/contact",
  "formId": "contact-form",
  "targetPlugin": "contact-form-7"
}
```

**Response:**
```json
{
  "success": true,
  "block": {
    "blockName": "contact-form-7/contact-form-selector",
    "blockCode": "<!-- wp:contact-form-7/contact-form-selector {\"id\":123,\"title\":\"Contact Form\"} /-->",
    "attrs": {
      "id": 123,
      "title": "Contact Form"
    },
    "instructions": [
      "Copy the block code",
      "Paste into WordPress block editor",
      "Update form ID after creating the form"
    ]
  }
}
```

---

## Usage Examples

### Example 1: Detect and Convert Forms

```javascript
// Step 1: Detect all forms
const detectResponse = await fetch('/api/form-handling/detect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    html: pageHTML,
    url: 'https://example.com/contact'
  })
});

const { forms } = await detectResponse.json();

console.log(`Found ${forms.length} forms`);

// Step 2: Get recommendations for each form
for (const form of forms) {
  const recResponse = await fetch('/api/form-handling/recommend-plugin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html: pageHTML,
      url: 'https://example.com/contact',
      formId: form.id
    })
  });

  const { recommendations } = await recResponse.json();
  console.log(`\nForm: ${form.id}`);
  console.log(`Recommended: ${recommendations.topRecommendation}`);
  console.log(`Reason: ${recommendations[0].reason}`);
}

// Step 3: Convert to recommended plugin
const convertResponse = await fetch('/api/form-handling/convert/contact-form-7', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    html: pageHTML,
    url: 'https://example.com/contact',
    formId: forms[0].id,
    recipientEmail: 'admin@example.com'
  })
});

const { conversion } = await convertResponse.json();
console.log('\nContact Form 7 Code:');
console.log(conversion.formCode);
```

---

### Example 2: Bulk Form Conversion

```javascript
const response = await fetch('/api/form-handling/convert-all', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    html: siteHTML,
    url: 'https://example.com',
    targetPlugin: 'wpforms'
  })
});

const { conversions } = await response.json();

console.log('Form Conversion Summary');
console.log('======================');
console.log(`Total forms: ${conversions.length}`);
console.log(`Successful: ${conversions.filter(c => c.confidence > 0.8).length}`);

conversions.forEach((conversion, index) => {
  console.log(`\nForm ${index + 1}:`);
  console.log(`  ID: ${conversion.originalFormId}`);
  console.log(`  Complexity: ${conversion.complexity}`);
  console.log(`  Confidence: ${(conversion.confidence * 100).toFixed(0)}%`);
  console.log(`  Fields: ${conversion.config.fields.length}`);
});
```

---

## Best Practices

### 1. Form Detection

✅ **DO:**
- Analyze complete page HTML
- Include form submission pages
- Check for JavaScript-rendered forms
- Review detected validation rules

❌ **DON'T:**
- Rely on homepage for form detection
- Ignore validation attributes
- Skip testing converted forms

---

### 2. Plugin Selection

✅ **DO:**
- Use Contact Form 7 for simple forms (≤5 fields)
- Use WPForms for medium forms (6-10 fields)
- Use Gravity Forms for complex forms (>10 fields)
- Consider budget and requirements

❌ **DON'T:**
- Use Gravity Forms for simple contact forms
- Use Contact Form 7 for complex multi-step forms
- Ignore plugin recommendations

---

### 3. Conversion Testing

✅ **DO:**
- Test converted forms on staging site
- Verify all fields are present
- Test validation rules
- Test form submission
- Configure email notifications

❌ **DON'T:**
- Deploy without testing
- Skip email configuration
- Ignore spam protection
- Forget to test mobile responsiveness

---

## Troubleshooting

### Issue: Forms not detected

**Possible Causes:**
- Forms loaded via JavaScript
- Forms in iframes
- Custom form implementations

**Solutions:**
1. Wait for page to fully load
2. Check for JavaScript-rendered content
3. Manually specify form selectors

---

### Issue: Validation rules not converted

**Possible Causes:**
- Custom JavaScript validation
- Non-standard HTML attributes

**Solutions:**
1. Review source HTML validation
2. Manually add validation in plugin
3. Use plugin-specific validation features

---

### Issue: Complex forms not converting well

**Possible Causes:**
- Multi-step forms
- Conditional logic
- Custom field types

**Solutions:**
1. Use Gravity Forms or WPForms
2. Manually configure conditional logic
3. Split into multiple simple forms

---

## Conclusion

Website Cloner Pro's **Form Handling Migration** provides comprehensive form migration:

- ✅ **Automatic form detection** with field extraction
- ✅ **Validation preservation** including HTML5 rules
- ✅ **3 WordPress plugins** supported (CF7, Gravity Forms, WPForms)
- ✅ **Smart recommendations** based on complexity
- ✅ **Gutenberg blocks** for all plugins
- ✅ **7 API endpoints** for complete form migration

Perfect for migrating HTML forms to WordPress with minimal manual work.

---

*Generated by Website Cloner Pro - Form Handling Migration*
