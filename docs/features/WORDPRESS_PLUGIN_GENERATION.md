# WordPress Plugin Generation

Comprehensive guide to generating minimal custom WordPress plugins for complex features.

## Table of Contents
- [Overview](#overview)
- [When to Use](#when-to-use)
- [Supported Features](#supported-features)
- [Plugin Structure](#plugin-structure)
- [Conflict Detection](#conflict-detection)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)

---

## Overview

Website Cloner Pro's **WordPress Plugin Generator** creates minimal, secure custom plugins **only when absolutely necessary** for complex features that cannot be replicated with standalone code.

### Key Principles

✅ **Only When Needed**
- Generate plugins only for features requiring WordPress integration
- Prefer plugin-free solutions when possible
- Minimal code, maximum functionality

✅ **Security First**
- WordPress coding standards compliance
- Automatic nonce verification
- Input sanitization and output escaping
- Security score calculation (0-100)

✅ **Conflict Prevention**
- Detects conflicts with core WordPress
- Checks for duplicate post types, taxonomies, shortcodes
- Provides resolution recommendations

✅ **Professional Quality**
- Clean, readable code
- Comprehensive documentation
- Proper WordPress hooks and filters
- Translation-ready

---

## When to Use

### ✅ Generate Plugin For:

| Feature | Reason |
|---------|--------|
| **Custom Post Types** | Requires WordPress `register_post_type()` |
| **Custom Taxonomies** | Requires WordPress `register_taxonomy()` |
| **Custom Widgets** | Extends `WP_Widget` class |
| **REST API Endpoints** | Custom API routes |
| **AJAX Handlers** | Server-side AJAX processing |
| **Gutenberg Blocks** | Block registration with WordPress |
| **Scheduled Tasks** | WordPress cron jobs |

### ❌ Don't Generate Plugin For:

| Feature | Alternative |
|---------|-------------|
| **Static HTML/CSS** | Include directly in theme |
| **Simple JavaScript** | Enqueue in theme |
| **Page Templates** | Export as template files |
| **Menu Items** | Export menu configuration |
| **Settings/Options** | Export as JSON config |

---

## Supported Features

### 1. Custom Post Type

Register a custom content type (Portfolio, Products, etc.)

**Configuration:**
```typescript
{
  type: 'custom-post-type',
  name: 'Portfolio Items',
  config: {
    postType: 'portfolio',
    labels: {
      name: 'Portfolio',
      singular_name: 'Portfolio Item'
    },
    public: true,
    supports: ['title', 'editor', 'thumbnail'],
    has_archive: true,
    show_in_rest: true
  }
}
```

**Generated Code:**
- Proper label translations
- REST API support
- Archive pages
- Admin UI integration

### 2. Custom Taxonomy

Register custom categories/tags.

**Configuration:**
```typescript
{
  type: 'custom-taxonomy',
  name: 'Portfolio Categories',
  config: {
    taxonomy: 'portfolio_category',
    postTypes: ['portfolio'],
    labels: {
      name: 'Categories',
      singular_name: 'Category'
    },
    hierarchical: true
  }
}
```

### 3. Shortcode

Create custom shortcodes.

**Configuration:**
```typescript
{
  type: 'shortcode',
  name: 'Contact Form',
  config: {
    tag: 'contact_form',
    attributes: {
      email: 'admin@example.com',
      subject: 'Contact'
    },
    supportedContent: false
  }
}
```

**Usage:** `[contact_form email="user@example.com"]`

### 4. Widget

Create sidebar widgets.

**Configuration:**
```typescript
{
  type: 'widget',
  name: 'Custom Widget',
  config: {
    name: 'My Widget',
    widgetId: 'custom_widget',
    description: 'A custom sidebar widget'
  }
}
```

### 5. REST API Endpoint

Add custom REST API routes.

**Configuration:**
```typescript
{
  type: 'rest-api-endpoint',
  name: 'Custom API',
  config: {
    endpoint: 'data',
    method: 'GET',
    requireAuth: false
  }
}
```

**Access:** `GET /wp-json/plugin-slug/v1/data`

### 6. AJAX Handler

Server-side AJAX processing.

**Configuration:**
```typescript
{
  type: 'ajax-handler',
  name: 'Form Handler',
  config: {
    action: 'submit_form',
    nopriv: false
  }
}
```

### 7. Gutenberg Block

Custom Gutenberg editor blocks.

**Configuration:**
```typescript
{
  type: 'gutenberg-block',
  name: 'Custom Block',
  config: {
    blockName: 'custom_block',
    name: 'My Custom Block'
  }
}
```

### 8. Admin Page

Custom admin pages.

**Configuration:**
```typescript
{
  type: 'admin-page',
  name: 'Settings Page',
  config: {
    pageTitle: 'Plugin Settings',
    menuTitle: 'Settings'
  }
}
```

### 9. Custom Fields

Meta fields for posts/pages.

**Configuration:**
```typescript
{
  type: 'custom-fields',
  name: 'Product Fields',
  config: {
    fields: [
      { name: 'price', type: 'number' },
      { name: 'sku', type: 'text' }
    ],
    postTypes: ['product']
  }
}
```

### 10. Cron Job

Scheduled recurring tasks.

**Configuration:**
```typescript
{
  type: 'cron-job',
  name: 'Daily Cleanup',
  config: {
    schedule: 'daily',
    callback: 'cleanup_task'
  }
}
```

---

## Plugin Structure

### Generated Files

```
my-plugin/
├── my-plugin.php              # Main plugin file
├── readme.txt                 # WordPress.org readme
├── includes/                  # Feature files
│   ├── post-type-portfolio.php
│   ├── taxonomy-category.php
│   ├── shortcode-contact.php
│   └── rest-api.php
├── admin/                     # Admin pages
│   └── admin-page.php
├── assets/                    # Static assets
│   ├── css/
│   │   ├── admin.css
│   │   └── frontend.css
│   └── js/
│       ├── admin.js
│       └── frontend.js
└── languages/                 # Translation files
    └── my-plugin.pot
```

### Main Plugin File Structure

```php
<?php
/**
 * Plugin Name: My Plugin
 * Description: Custom plugin for complex features
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

// Security check
if (!defined('ABSPATH')) {
    exit;
}

// Define constants
define('MY_PLUGIN_VERSION', '1.0.0');
define('MY_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('MY_PLUGIN_URL', plugin_dir_url(__FILE__));

// Main plugin class (Singleton pattern)
class My_Plugin {
    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->init_hooks();
    }

    // ... initialization
}

// Initialize
My_Plugin::get_instance();
```

---

## Conflict Detection

### Detected Conflicts

**1. Post Type Conflicts**
- Checks against WordPress core post types
- Detects common plugin post types
- **Critical** if conflicts with core

**2. Taxonomy Conflicts**
- Checks against core taxonomies (category, post_tag)
- Warns about common taxonomy names

**3. Shortcode Conflicts**
- Checks against core shortcodes (gallery, caption, etc.)
- **High severity** for core conflicts

**4. Function/Class Conflicts**
- Checks for duplicate function names
- Prevents fatal PHP errors

### Conflict Report

```typescript
{
  hasConflicts: true,
  conflicts: [
    {
      type: 'post-type',
      name: 'post',
      conflictsWith: ['WordPress Core'],
      severity: 'critical',
      resolution: "Use 'my_plugin_post' instead"
    }
  ],
  warnings: [
    "Post type 'pt' is very short - use longer name"
  ],
  recommendations: [
    'Use unique prefixes for all features',
    'Test on staging site before production'
  ]
}
```

---

## API Reference

### Generate Plugin

**Endpoint:** `POST /api/wordpress-plugin-generator/generate`

**Request:**
```json
{
  "pluginName": "Portfolio Manager",
  "pluginSlug": "portfolio-manager",
  "description": "Manage portfolio items",
  "author": "John Doe",
  "version": "1.0.0",
  "features": [
    {
      "type": "custom-post-type",
      "name": "Portfolio Items",
      "config": {
        "postType": "portfolio",
        "labels": {
          "name": "Portfolio",
          "singular_name": "Portfolio Item"
        },
        "public": true,
        "supports": ["title", "editor", "thumbnail"]
      }
    }
  ],
  "conflictCheck": true
}
```

**Response:**
```json
{
  "success": true,
  "plugin": {
    "pluginName": "Portfolio Manager",
    "pluginSlug": "portfolio-manager",
    "version": "1.0.0",
    "files": [...],
    "structure": {...},
    "installation": {...},
    "conflictReport": {...},
    "size": 25600,
    "securityScore": 95,
    "complexityLevel": "minimal"
  }
}
```

---

### Download Plugin

**Endpoint:** `POST /api/wordpress-plugin-generator/download`

**Request:** Same as `/generate`

**Response:** ZIP file download

---

### Detect Conflicts

**Endpoint:** `POST /api/wordpress-plugin-generator/detect-conflicts`

**Request:**
```json
{
  "pluginSlug": "my-plugin",
  "features": [...]
}
```

**Response:**
```json
{
  "success": true,
  "conflictReport": {
    "hasConflicts": false,
    "conflicts": [],
    "warnings": [],
    "recommendations": []
  }
}
```

---

### Validate Configuration

**Endpoint:** `POST /api/wordpress-plugin-generator/validate`

**Response:**
```json
{
  "success": true,
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": ["Plugin has many features"]
  }
}
```

---

### Get Templates

**Endpoint:** `GET /api/wordpress-plugin-generator/templates`

**Response:**
```json
{
  "success": true,
  "templates": [
    {
      "id": "custom-post-type",
      "name": "Custom Post Type Plugin",
      "description": "Plugin with CPT and taxonomy",
      "features": [...]
    }
  ]
}
```

---

### Preview Code

**Endpoint:** `POST /api/wordpress-plugin-generator/preview`

**Request:**
```json
{
  "pluginName": "My Plugin",
  "pluginSlug": "my-plugin",
  "features": [...],
  "fileToPreview": "my-plugin.php"
}
```

**Response:**
```json
{
  "success": true,
  "preview": {
    "file": "my-plugin.php",
    "content": "<?php\n/**\n * Plugin Name...",
    "type": "php",
    "size": 5120,
    "availableFiles": [...]
  }
}
```

---

## Usage Examples

### Example 1: Generate Simple Plugin

```javascript
const response = await fetch('/api/wordpress-plugin-generator/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pluginName: 'Portfolio Manager',
    pluginSlug: 'portfolio-manager',
    description: 'Manage portfolio items with custom post type',
    features: [
      {
        type: 'custom-post-type',
        name: 'Portfolio',
        config: {
          postType: 'portfolio',
          labels: {
            name: 'Portfolio',
            singular_name: 'Portfolio Item'
          },
          public: true,
          supports: ['title', 'editor', 'thumbnail'],
          show_in_rest: true
        }
      }
    ]
  })
});

const { plugin } = await response.json();
console.log(`Generated ${plugin.files.length} files`);
console.log(`Total size: ${plugin.size} bytes`);
console.log(`Security score: ${plugin.securityScore}/100`);
```

### Example 2: Check Conflicts Before Generation

```javascript
// Step 1: Check conflicts
const conflictCheck = await fetch('/api/wordpress-plugin-generator/detect-conflicts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pluginSlug: 'my-plugin',
    features: [...]
  })
});

const { conflictReport } = await conflictCheck.json();

if (conflictReport.hasConflicts) {
  console.error('Conflicts detected:');
  conflictReport.conflicts.forEach(conflict => {
    console.error(`  - ${conflict.name}: ${conflict.resolution}`);
  });
  return;
}

// Step 2: Generate if no conflicts
const plugin = await generatePlugin({...});
```

### Example 3: Download Plugin

```javascript
const response = await fetch('/api/wordpress-plugin-generator/download', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pluginName: 'My Plugin',
    pluginSlug: 'my-plugin',
    features: [...]
  })
});

// Trigger download
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'my-plugin.zip';
a.click();
```

---

## Best Practices

### 1. Use Unique Prefixes

✅ **DO:**
```javascript
{
  pluginSlug: 'mycompany-portfolio',
  features: [{
    config: {
      postType: 'mycompany_portfolio'
    }
  }]
}
```

❌ **DON'T:**
```javascript
{
  pluginSlug: 'portfolio',
  features: [{
    config: {
      postType: 'portfolio'  // Too generic
    }
  }]
}
```

### 2. Always Check Conflicts

✅ **DO:**
```javascript
const request = {
  ...pluginConfig,
  conflictCheck: true  // Enable conflict detection
};
```

### 3. Keep Features Minimal

✅ **DO:**
- One plugin = one feature set
- Portfolio plugin with CPT + taxonomy

❌ **DON'T:**
- One plugin with 10+ unrelated features

### 4. Test on Staging First

✅ **DO:**
```javascript
// Download plugin
// Upload to staging site
// Test thoroughly
// Deploy to production
```

### 5. Use Descriptive Names

✅ **DO:**
```javascript
{
  pluginName: 'Company Portfolio Manager',
  pluginSlug: 'company-portfolio-manager'
}
```

❌ **DON'T:**
```javascript
{
  pluginName: 'CPM',
  pluginSlug: 'cpm'
}
```

---

## Security Features

### Automatic Security Measures

1. **ABSPATH Check**
   - Every file starts with: `if (!defined('ABSPATH')) { exit; }`

2. **Nonce Verification**
   - AJAX handlers use `check_ajax_referer()`
   - Forms include `wp_nonce_field()`

3. **Input Sanitization**
   - `sanitize_text_field()` for text inputs
   - `sanitize_email()` for emails
   - `absint()` for integers

4. **Output Escaping**
   - `esc_html()` for HTML output
   - `esc_attr()` for attributes
   - `esc_url()` for URLs

5. **Capability Checks**
   - `current_user_can('manage_options')`
   - Role-based access control

### Security Score Calculation

- Base score: 100
- Missing ABSPATH check: -10
- Missing sanitization with $_POST: -10
- Missing escaping with echo: -5
- Has nonce verification: +5

**Good Plugin:** 85-100
**Needs Improvement:** 60-84
**Poor Security:** < 60

---

## Troubleshooting

### Issue: Plugin conflicts detected

**Solution:**
```javascript
// Use unique prefixes
config: {
  postType: 'myprefix_portfolio'  // Instead of 'portfolio'
}
```

### Issue: Security score < 80

**Solution:**
- Check all PHP files have ABSPATH check
- Verify all $_POST usage has sanitization
- Ensure all echo statements use escaping

### Issue: Plugin too complex

**Solution:**
- Split into multiple smaller plugins
- Each plugin = one feature area

---

## Conclusion

Website Cloner Pro's **WordPress Plugin Generator** creates professional, secure, minimal plugins only when absolutely necessary for complex features requiring WordPress integration.

- ✅ **10 feature types** supported
- ✅ **Automatic conflict detection** prevents errors
- ✅ **Security-first approach** with 95+ scores
- ✅ **WordPress coding standards** compliance
- ✅ **Minimal code** for maximum efficiency
- ✅ **Production-ready** output

For questions or support, refer to the main documentation.

---

*Generated by Website Cloner Pro - WordPress Plugin Generation*
