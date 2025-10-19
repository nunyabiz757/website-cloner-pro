# Extension Icons

Place your extension icon files here with the following dimensions:

- **icon16.png** - 16x16 pixels (browser toolbar)
- **icon32.png** - 32x32 pixels (extension management page)
- **icon48.png** - 48x48 pixels (extension management page)
- **icon128.png** - 128x128 pixels (Chrome Web Store)

## Design Guidelines

- Use the Website Cloner Pro brand colors
- Include the "WCP" or "GHL" branding
- Ensure visibility on both light and dark backgrounds
- Use PNG format with transparency
- Keep design simple and recognizable at small sizes

## Temporary Solution

You can generate placeholder icons using any of these methods:

1. **Online Icon Generator**: Use tools like IconGenerator.net or Canva
2. **Design Software**: Create in Figma, Sketch, or Photoshop
3. **Command Line**: Use ImageMagick to create simple colored squares:
   ```bash
   convert -size 16x16 xc:#667eea icons/icon16.png
   convert -size 32x32 xc:#667eea icons/icon32.png
   convert -size 48x48 xc:#667eea icons/icon48.png
   convert -size 128x128 xc:#667eea icons/icon128.png
   ```

## Brand Colors

- Primary: #667eea (purple gradient start)
- Secondary: #764ba2 (purple gradient end)
- Accent: #4CAF50 (success green)
- White: #ffffff
