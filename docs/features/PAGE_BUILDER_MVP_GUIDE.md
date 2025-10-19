# Page Builder Conversion MVP - User Guide

## 🎉 Overview

The Page Builder Conversion feature converts cloned HTML websites into native **Elementor** page builder components, allowing you to edit pages in WordPress page builders instead of dealing with raw HTML code.

### What It Does

- ✅ Analyzes HTML structure and styles
- ✅ Recognizes common components (buttons, headings, text, images, sections)
- ✅ Maps components to Elementor widgets
- ✅ Generates Elementor JSON export files
- ✅ Provides confidence scores for recognition accuracy
- ✅ Falls back to HTML widget for complex components

### Current Capabilities (MVP)

**Supported Components:**
- **Buttons** (95% confidence on `<button>` tags, 85% on styled links)
- **Headings** (95% on `<h1>`-`<h6>` tags)
- **Text/Paragraphs** (95% on `<p>` tags)
- **Images** (98% on `<img>` tags, 70% on background images)
- **Icons** (90% on Font Awesome, Material Icons)
- **Sections/Containers** (90% on `<section>` tags)

**Supported Page Builder:**
- Elementor (v3.16.0 format)

**Coming Soon:**
- Gutenberg blocks
- Divi modules
- Beaver Builder modules
- Bricks elements
- Oxygen components

---

## 📡 API Endpoints

### 1. Convert Raw HTML

Convert any HTML string to Elementor format.

**Endpoint:** `POST /api/page-builder/convert`

**Request:**
```json
{
  "html": "<h1>Welcome</h1><p>This is a paragraph</p><button>Click Me</button>",
  "targetBuilder": "elementor",
  "minConfidence": 60,
  "fallbackToHTML": true
}
```

**Response:**
```json
{
  "success": true,
  "builder": "elementor",
  "exportData": {
    "version": "3.16.0",
    "title": "Converted Page",
    "type": "page",
    "content": [
      {
        "id": "1",
        "elType": "section",
        "settings": {},
        "elements": [
          {
            "id": "2",
            "elType": "column",
            "settings": { "_column_size": 100 },
            "elements": [
              {
                "id": "3e8",
                "elType": "widget",
                "widgetType": "heading",
                "settings": {
                  "title": "Welcome",
                  "header_size": "h1"
                }
              },
              {
                "id": "3e9",
                "elType": "widget",
                "widgetType": "text-editor",
                "settings": {
                  "editor": "This is a paragraph"
                }
              },
              {
                "id": "3ea",
                "elType": "widget",
                "widgetType": "button",
                "settings": {
                  "text": "Click Me"
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "stats": {
    "totalElements": 3,
    "recognizedComponents": 3,
    "nativeWidgets": 3,
    "htmlFallbacks": 0,
    "manualReview": 0,
    "conversionTime": 145,
    "confidenceAverage": 96
  },
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": [],
    "suggestions": []
  },
  "fallbacks": [],
  "componentsSummary": {
    "total": 3,
    "byType": {
      "heading": 1,
      "paragraph": 1,
      "button": 1
    }
  }
}
```

---

### 2. Convert Page from Crawl Results

Convert a specific page from your crawl results.

**Endpoint:** `POST /api/page-builder/convert-page`

**Request:**
```json
{
  "crawlId": "crawl_1234567890_abc123",
  "pageIndex": 0,
  "targetBuilder": "elementor"
}
```

**Response:**
```json
{
  "success": true,
  "builder": "elementor",
  "exportData": { /* Elementor JSON */ },
  "exportPath": "/path/to/crawled-sites/crawl_xxx/exports/page-0_elementor.json",
  "stats": {
    "totalElements": 45,
    "recognizedComponents": 42,
    "nativeWidgets": 38,
    "htmlFallbacks": 4,
    "manualReview": 3,
    "conversionTime": 523,
    "confidenceAverage": 78
  },
  "validation": { /* validation result */ },
  "pageInfo": {
    "index": 0,
    "title": "Home - Example Company",
    "url": "https://example.com/"
  }
}
```

**Export File Location:**
The Elementor JSON is saved at:
```
crawled-sites/
  {crawlId}/
    exports/
      page-0_elementor.json
```

---

### 3. Convert Entire Crawl

Convert all pages (or selected pages) from a crawl to Elementor.

**Endpoint:** `POST /api/page-builder/convert-crawl`

**Request (all pages):**
```json
{
  "crawlId": "crawl_1234567890_abc123",
  "targetBuilder": "elementor"
}
```

**Request (specific pages):**
```json
{
  "crawlId": "crawl_1234567890_abc123",
  "targetBuilder": "elementor",
  "pageIndices": [0, 5, 10, 15]
}
```

**Response:**
```json
{
  "success": true,
  "builder": "elementor",
  "pagesConverted": 4,
  "stats": {
    "totalElements": 187,
    "recognizedComponents": 165,
    "nativeWidgets": 142,
    "htmlFallbacks": 23,
    "manualReview": 12,
    "conversionTime": 2145,
    "confidenceAverage": 75
  },
  "results": [
    {
      "pageIndex": 0,
      "title": "Home",
      "success": true,
      "stats": { /* page stats */ },
      "validation": { /* page validation */ }
    },
    {
      "pageIndex": 5,
      "title": "About",
      "success": true,
      "stats": { /* page stats */ },
      "validation": { /* page validation */ }
    }
  ]
}
```

---

### 4. Download Export File

Download the generated Elementor JSON file.

**Endpoint:** `GET /api/page-builder/export/:crawlId/:pageIndex/:builder?`

**Example:**
```
GET /api/page-builder/export/crawl_123/0/elementor
```

**Response:**
Downloads file: `Home_elementor.json`

---

## 🚀 Usage Workflows

### Workflow 1: Quick HTML Conversion

**Use Case:** You have HTML code you want to convert to Elementor.

```bash
# Step 1: Send HTML to conversion endpoint
curl -X POST http://localhost:5000/api/page-builder/convert \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>My Heading</h1><p>Some text</p><button>Click</button>",
    "targetBuilder": "elementor"
  }'

# Step 2: Copy the `exportData` from response

# Step 3: In WordPress:
# - Go to Pages > Add New
# - Click "Edit with Elementor"
# - Click Tools > Import JSON
# - Paste the exportData
# - Click "Import"
```

---

### Workflow 2: Convert Cloned Website Pages

**Use Case:** You've crawled a website and want to convert pages to Elementor.

```bash
# Step 1: Crawl website (using existing functionality)
curl -X POST http://localhost:5000/api/multi-page-crawler/start \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "useSitemap": true,
    "maxPages": 10
  }'

# Response: { "crawlId": "crawl_123" }

# Step 2: Wait for crawl to complete
curl http://localhost:5000/api/multi-page-crawler/status/crawl_123

# Step 3: List available pages
curl http://localhost:5000/api/multi-page-crawler/pages/crawl_123

# Step 4: Convert specific page
curl -X POST http://localhost:5000/api/page-builder/convert-page \
  -H "Content-Type: application/json" \
  -d '{
    "crawlId": "crawl_123",
    "pageIndex": 0,
    "targetBuilder": "elementor"
  }'

# Step 5: Download export file
curl http://localhost:5000/api/page-builder/export/crawl_123/0/elementor \
  --output homepage_elementor.json

# Step 6: Import into WordPress Elementor
```

---

### Workflow 3: Batch Convert All Pages

**Use Case:** Convert entire cloned website to Elementor pages.

```bash
# After crawling (see Workflow 2), convert all pages at once
curl -X POST http://localhost:5000/api/page-builder/convert-crawl \
  -H "Content-Type: application/json" \
  -d '{
    "crawlId": "crawl_123",
    "targetBuilder": "elementor"
  }'

# Download each converted page
for i in {0..9}; do
  curl http://localhost:5000/api/page-builder/export/crawl_123/$i/elementor \
    --output page_${i}_elementor.json
done
```

---

## 📊 Understanding Conversion Stats

### Confidence Scores

Each recognized component gets a confidence score (0-100%):

- **90-100%**: High confidence - Exact match (e.g., `<button>` tag)
- **70-89%**: Good confidence - Pattern match (e.g., styled link as button)
- **50-69%**: Medium confidence - Style-based detection
- **0-49%**: Low confidence - Uncertain, may need manual review

### Stats Breakdown

```json
{
  "totalElements": 45,           // Total HTML elements analyzed
  "recognizedComponents": 42,    // Components successfully recognized
  "nativeWidgets": 38,           // Mapped to native Elementor widgets
  "htmlFallbacks": 4,            // Fell back to HTML widget
  "manualReview": 3,             // Need manual review (confidence < 50%)
  "conversionTime": 523,         // Time in milliseconds
  "confidenceAverage": 78        // Average confidence score
}
```

**Interpretation:**
- **High recognition rate** (90%+): Great! Most components will work natively
- **Medium rate** (70-89%): Good, but check fallbacks
- **Low rate** (<70%): Many complex components, expect HTML widgets

---

## 🛠️ Importing into Elementor

### Method 1: JSON Import (Recommended)

1. **In WordPress:**
   - Go to Pages > Add New
   - Click "Edit with Elementor"

2. **Import JSON:**
   - Click the hamburger menu (≡) in top left
   - Go to Tools
   - Click "Import Templates"
   - Select "Import" tab
   - Choose "Upload File"
   - Upload the `.json` file
   - Click "Import Now"

3. **Done!** Your page is now editable in Elementor.

### Method 2: Copy-Paste JSON

1. Open the exported JSON file
2. Copy all contents
3. In Elementor, go to Tools > Import
4. Paste JSON into the text area
5. Click "Import"

---

## 🔍 Component Recognition Examples

### Button Recognition

**High Confidence (95%):**
```html
<button>Click Me</button>
```
→ Elementor Button Widget

**High Confidence (90%):**
```html
<a href="/contact" class="btn btn-primary">Contact Us</a>
```
→ Elementor Button Widget

**Medium Confidence (75%):**
```html
<a href="/signup" style="background: #007bff; padding: 10px 20px; border-radius: 5px;">
  Sign Up
</a>
```
→ Elementor Button Widget

**Low Confidence (60%):**
```html
<div class="call-to-action">Get Started</div>
```
→ May fall back to HTML widget

---

### Heading Recognition

**High Confidence (95%):**
```html
<h1>Page Title</h1>
<h2>Section Heading</h2>
```
→ Elementor Heading Widget

**Medium Confidence (75%):**
```html
<div class="heading-large">Featured Title</div>
```
→ Elementor Heading Widget (if styled like heading)

---

### Image Recognition

**High Confidence (98%):**
```html
<img src="image.jpg" alt="Description">
```
→ Elementor Image Widget

**Medium Confidence (70%):**
```html
<div style="background-image: url('bg.jpg')"></div>
```
→ Elementor Image Widget (or Section background)

---

## ⚠️ Current Limitations (MVP)

1. **Desktop Only** - No responsive styles yet (coming soon)
2. **No Hover States** - Normal state only
3. **Simple Layouts** - Single-column sections (multi-column coming soon)
4. **No Animations** - Static components only
5. **Limited Component Types** - 10 basic types (expanding)
6. **Elementor Only** - Other builders coming soon

### Fallback Strategy

When a component can't be confidently recognized, it falls back to **Elementor HTML Widget** containing the original HTML. This preserves the design but requires manual conversion in Elementor if you want native editing.

---

## 📈 Best Practices

### 1. Start with Simple Pages

Test with simpler pages first (homepage, about page) before attempting complex pages.

### 2. Review Fallbacks

Check the `fallbacks` array in the response. These components may need manual adjustment after import.

### 3. Adjust Confidence Threshold

For stricter recognition:
```json
{
  "minConfidence": 80
}
```

For more lenient (more native widgets, but less accurate):
```json
{
  "minConfidence": 50
}
```

### 4. Inspect Component Summary

Use `componentsSummary` to see what was recognized:
```json
{
  "byType": {
    "heading": 5,
    "button": 3,
    "image": 8,
    "text": 12,
    "unknown": 2
  }
}
```

If many `unknown`, consider using regular HTML export instead.

### 5. Post-Import Cleanup

After importing to Elementor:
1. Review spacing (may need adjustment)
2. Check colors match
3. Verify links work
4. Test responsive view
5. Replace HTML widgets with native widgets where possible

---

## 🐛 Troubleshooting

### Issue: Low Confidence Scores

**Cause:** HTML uses non-semantic tags or unusual structures

**Solution:**
- Use fallbackToHTML: true (default)
- Lower minConfidence threshold
- Manually adjust in Elementor after import

### Issue: Export Fails Validation

**Cause:** Malformed HTML or unsupported elements

**Solution:**
- Check `validation.errors` in response
- Fix HTML markup
- Try converting smaller sections

### Issue: Import Fails in Elementor

**Cause:** JSON format incompatibility

**Solution:**
- Ensure Elementor is v3.16+
- Check JSON is valid
- Try importing smaller sections

### Issue: Styles Don't Match Original

**Cause:** MVP doesn't capture all CSS properties yet

**Solution:**
- Adjust in Elementor after import
- Use Custom CSS in Elementor
- Wait for enhanced style extraction (coming soon)

---

## 🚦 Status Indicators

When converting, watch for these indicators:

**✅ Good Conversion:**
```json
{
  "confidenceAverage": 85,
  "nativeWidgets": 95,
  "htmlFallbacks": 5
}
```

**⚠️ Needs Review:**
```json
{
  "confidenceAverage": 65,
  "nativeWidgets": 70,
  "htmlFallbacks": 30
}
```

**❌ Manual Work Needed:**
```json
{
  "confidenceAverage": 45,
  "nativeWidgets": 40,
  "htmlFallbacks": 60
}
```

---

## 🎯 Roadmap

### Coming Soon (Phase 2)

- ✨ Responsive styles support
- ✨ Hover/focus state preservation
- ✨ Multi-column layout detection
- ✨ Form components recognition
- ✨ Advanced components (accordions, tabs, sliders)

### Future (Phase 3)

- ✨ Gutenberg block export
- ✨ Divi module export
- ✨ Beaver Builder export
- ✨ ML-enhanced recognition
- ✨ Visual comparison validation

---

## 💡 Tips & Tricks

### Tip 1: Batch Processing

Process multiple pages overnight:
```bash
# Convert all 100 pages
curl -X POST http://localhost:5000/api/page-builder/convert-crawl \
  -d '{"crawlId": "crawl_123"}'

# Download all exports in the morning
```

### Tip 2: Selective Conversion

Convert only key pages (home, contact, services):
```bash
curl -X POST http://localhost:5000/api/page-builder/convert-crawl \
  -d '{"crawlId": "crawl_123", "pageIndices": [0, 5, 10]}'
```

### Tip 3: Quality Check

Before mass converting, test one page:
```bash
# Convert page 0 only
curl -X POST http://localhost:5000/api/page-builder/convert-page \
  -d '{"crawlId": "crawl_123", "pageIndex": 0}'

# Review the stats
# If confidenceAverage > 75%, proceed with all pages
```

---

## 📞 Support

For issues or questions:
1. Check this guide first
2. Review the [MVP Implementation Status](MVP_IMPLEMENTATION_STATUS.md)
3. Check console logs for detailed errors
4. Report issues with sample HTML and expected output

---

**Page Builder Conversion MVP - Making Elementor imports effortless!** 🚀
