# Quick Start Guide - Website Cloner Pro

Get up and running in 5 minutes!

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- npm (comes with Node.js)
- Chrome browser (for Puppeteer)

## Installation Steps

### 1. Install Dependencies

```bash
cd website-cloner-pro
npm install
```

This will install all required packages (may take 2-3 minutes).

### 2. Create Required Directories

```bash
mkdir uploads temp
mkdir uploads/temp
```

### 3. Set Up Environment (Optional for basic usage)

```bash
cp .env.example .env
```

**Note:** You can skip API keys for now - basic cloning and optimization will work without them.

### 4. Start the Application

```bash
npm run dev
```

This starts:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000

### 5. Open Your Browser

Navigate to: http://localhost:3000

You should see the Website Cloner Pro homepage!

## First Test Run

Let's clone a simple website:

1. **Enter a URL** in the input field:
   ```
   https://example.com
   ```

2. **Click "Clone"**

3. **Wait for the process** to complete (15-30 seconds)

4. **You'll be redirected** to the dashboard showing the cloned website

5. **Click "Run Performance Analysis"** to see metrics

6. **Navigate to Optimization** to apply automated fixes

## Common Issues

### Port Already in Use

If ports 3000 or 5000 are busy:

```bash
# Kill processes on those ports (Windows)
npx kill-port 3000 5000

# Or change ports in vite.config.ts and src/server/index.ts
```

### Puppeteer Installation Failed

Puppeteer needs Chrome. If installation fails:

```bash
# Install Puppeteer with bundled Chromium
npm install puppeteer --legacy-peer-deps
```

### Module Not Found Errors

Clear cache and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

## What to Try Next

### 1. Clone a Real Website
```
Try cloning: https://tailwindcss.com
```

### 2. Run Performance Analysis
- Click "Performance" tab
- Review Core Web Vitals
- Examine optimization opportunities

### 3. Apply Optimizations
- Go to "Optimization" tab
- Click "Fix All Auto-fixable Issues"
- See before/after comparison

### 4. Upload Local HTML
- Switch to "Upload Files" tab
- Upload your HTML file
- Process and optimize it

## Advanced Setup (Optional)

### Enable Vercel Deployment

1. Get Vercel API token from: https://vercel.com/account/tokens
2. Add to `.env`:
   ```
   VERCEL_TOKEN=your_token_here
   ```
3. Deploy from Preview tab

### Enable AI-Powered Suggestions

1. Get Claude API key from: https://console.anthropic.com/
2. Add to `.env`:
   ```
   ANTHROPIC_API_KEY=your_key_here
   ```
3. Get intelligent optimization recommendations

## Development Mode Features

- **Hot Module Replacement** - Changes reflect instantly
- **Auto-restart Server** - Backend restarts on code changes
- **TypeScript Checking** - Real-time type checking
- **Source Maps** - Easy debugging

## Production Build

When ready to deploy:

```bash
# Build both client and server
npm run build
npm run build:server

# Start production server
PORT=5000 node dist/server/index.js
```

## Next Steps

1. Read the full [README.md](README.md) for comprehensive documentation
2. Explore the codebase structure
3. Customize optimization settings
4. Add WordPress builder conversion
5. Integrate deployment APIs

## Need Help?

- Check the [README.md](README.md) for detailed docs
- Review code comments in source files
- Check console for error messages
- Look at network tab for API issues

## Key Files to Explore

- `src/server/services/` - Core business logic
- `src/client/pages/` - UI pages
- `src/shared/types/` - TypeScript definitions
- `.env.example` - Configuration options

---

**Happy Cloning!** 🚀

Built a cool optimization? Found a bug? Contributions welcome!
