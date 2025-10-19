# Architecture Documentation - Website Cloner Pro

## System Overview

Website Cloner Pro is a full-stack web application built with a **React frontend** and **Node.js backend** that enables comprehensive website cloning, performance optimization, and WordPress builder conversion.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (React)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Home   │  │  Perf    │  │  Optim   │  │  Export  │   │
│  │   Page   │  │Dashboard │  │  Center  │  │   Page   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          State Management (React Query + Zustand)     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (Node.js/Express)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Clone   │  │   Perf   │  │  Optim   │  │  Deploy  │   │
│  │  Routes  │  │  Routes  │  │  Routes  │  │  Routes  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                              │                               │
│  ┌──────────────────────────┼─────────────────────────┐    │
│  │         SERVICE LAYER    │                          │    │
│  │  ┌─────────────────┐     │     ┌─────────────────┐ │    │
│  │  │ CloneService    │     │     │ PerformanceServ │ │    │
│  │  │ - Puppeteer     │     │     │ - Lighthouse    │ │    │
│  │  │ - Cheerio       │     │     │ - Web Vitals    │ │    │
│  │  └─────────────────┘     │     └─────────────────┘ │    │
│  │                           │                          │    │
│  │  ┌─────────────────┐     │     ┌─────────────────┐ │    │
│  │  │ OptimizationSrv │     │     │ DeploymentServ  │ │    │
│  │  │ - Sharp         │     │     │ - Vercel API    │ │    │
│  │  │ - Terser        │     │     │ - Netlify API   │ │    │
│  │  │ - PurgeCSS      │     │     └─────────────────┘ │    │
│  │  └─────────────────┘     │                          │    │
│  └──────────────────────────┴─────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Vercel  │  │ Netlify  │  │  Claude  │  │ Lighthouse│  │
│  │   API    │  │   API    │  │   API    │  │    CI     │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend Architecture

#### Pages Layer
- **HomePage**: Entry point with URL/file upload interface
- **PerformancePage**: Performance dashboard with Core Web Vitals
- **OptimizationPage**: Fix application with settings configuration
- **PreviewPage**: Live preview with before/after comparison
- **ExportPage**: WordPress builder selection and download

#### State Management
```typescript
// React Query for server state
const { data, isLoading } = useQuery({
  queryKey: ['performance', projectId],
  queryFn: () => fetchPerformanceData(projectId)
});

// Zustand for client state
const useProjectStore = create((set) => ({
  currentProject: null,
  setProject: (project) => set({ currentProject: project }),
}));
```

#### Component Hierarchy
```
App
├── Layout
│   ├── Header
│   └── Footer
├── HomePage
│   ├── CloneInput (URL/Upload)
│   └── FeatureCards
├── PerformancePage
│   ├── MetricsOverview
│   ├── CoreWebVitals
│   ├── IssuesList
│   └── OpportunitiesList
├── OptimizationPage
│   ├── SettingsPanel
│   ├── IssueManager
│   ├── CodeDiffViewer
│   └── ApplyFixesButton
└── ExportPage
    ├── BuilderSelector
    ├── PerformanceReport
    └── DownloadButton
```

### 2. Backend Architecture

#### Service Layer Pattern

Each service handles a specific domain:

**CloneService**
```typescript
class CloneService {
  // Uses Puppeteer to render pages
  // Uses Cheerio to parse HTML
  // Downloads all assets

  async cloneWebsite(request: CloneRequest): Promise<ClonedWebsite>
  private async cloneFromUrl(url: string): Promise<ClonedWebsite>
  private async extractAssets(page: Page): Promise<Asset[]>
  private async downloadAssets(assets: Asset[]): Promise<Asset[]>
}
```

**PerformanceService**
```typescript
class PerformanceService {
  // Runs Lighthouse audits
  // Extracts Core Web Vitals
  // Identifies performance issues

  async analyzePerformance(website: ClonedWebsite): Promise<PerformanceAnalysis>
  private async runLighthouse(url: string): Promise<LighthouseResult>
  private async identifyIssues(website: ClonedWebsite): Promise<PerformanceIssue[]>
}
```

**OptimizationService**
```typescript
class OptimizationService {
  // Applies performance fixes
  // Optimizes images, CSS, JS, fonts

  async applyFix(issue: PerformanceIssue, settings: Settings): Promise<OptimizationResult>
  private async optimizeImages(settings: ImageSettings): Promise<OptimizationResult>
  private async optimizeCSS(settings: CSSSettings): Promise<OptimizationResult>
  private async optimizeJavaScript(settings: JSSettings): Promise<OptimizationResult>
}
```

#### Route Layer

Express routes handle HTTP requests:

```typescript
// Clone Routes
POST   /api/clone/url        - Clone from URL
POST   /api/clone/upload     - Clone from file

// Performance Routes
POST   /api/performance/analyze   - Run analysis
GET    /api/performance/:id       - Get results

// Optimization Routes
POST   /api/optimization/apply    - Apply fixes
POST   /api/optimization/apply-all - Apply all

// Deployment Routes
POST   /api/deployment/deploy     - Deploy to hosting
GET    /api/deployment/:id        - Get status

// Export Routes
POST   /api/export/generate       - Generate package
GET    /api/export/download/:id   - Download ZIP
```

### 3. Data Flow

#### Complete Request Flow Example

```
User enters URL → Frontend sends POST to /api/clone/url
                   ↓
              CloneService.cloneWebsite()
                   ↓
              Puppeteer launches browser
                   ↓
              Page rendered & HTML extracted
                   ↓
              Assets downloaded to uploads/{id}/
                   ↓
              ClonedWebsite object returned
                   ↓
              Stored in memory (or DB in production)
                   ↓
              Response sent to frontend
                   ↓
              User redirected to /dashboard/{id}
                   ↓
              User clicks "Analyze Performance"
                   ↓
              Frontend sends POST to /api/performance/analyze
                   ↓
              PerformanceService.analyzePerformance()
                   ↓
              Lighthouse runs on local HTML
                   ↓
              Metrics extracted, issues identified
                   ↓
              PerformanceAnalysis returned
                   ↓
              Frontend displays dashboard with metrics
                   ↓
              User reviews issues
                   ↓
              User clicks "Fix All"
                   ↓
              Frontend sends POST to /api/optimization/apply
                   ↓
              OptimizationService.applyMultipleFixes()
                   ↓
              Each fix applied sequentially
                   ↓
              Images converted to WebP
              CSS minified & purged
              JS minified & deferred
              Fonts optimized
                   ↓
              Optimized website saved
                   ↓
              OptimizationResults returned
                   ↓
              Frontend shows before/after comparison
```

## Technology Stack Deep Dive

### Frontend Technologies

**React 18**
- Concurrent rendering
- Automatic batching
- Suspense support

**TypeScript**
- Full type safety
- Shared types between client/server
- Enhanced IDE support

**Tailwind CSS**
- Utility-first styling
- Custom design system
- Responsive by default

**React Query**
- Server state management
- Automatic caching
- Background refetching
- Optimistic updates

**React Router**
- Client-side routing
- Nested routes
- URL parameter handling

### Backend Technologies

**Node.js + Express**
- Fast, event-driven
- Middleware-based
- RESTful API

**Puppeteer**
- Headless Chrome control
- Page rendering
- Screenshot capture
- Network interception

**Lighthouse**
- Performance auditing
- Core Web Vitals
- Best practices scoring
- Accessibility checks

**Sharp**
- Image processing
- Format conversion (WebP, AVIF)
- Resizing & compression
- Metadata extraction

**Cheerio**
- jQuery-like HTML parsing
- Fast DOM manipulation
- Server-side rendering

**Terser**
- JavaScript minification
- Dead code elimination
- Mangling & compression

**PurgeCSS**
- Unused CSS removal
- Content-aware purging
- Whitelist support

**PostCSS + Critical**
- Critical CSS extraction
- CSS transformations
- Above-the-fold optimization

### Build Tools

**Vite**
- Lightning-fast HMR
- ES modules native
- Optimized bundling
- Plugin ecosystem

**TypeScript Compiler**
- Type checking
- Transpilation
- Declaration files

**ESLint**
- Code quality
- Style enforcement
- Best practices

## Performance Optimization Pipeline

### Image Optimization Flow

```
Original Image (2.5MB JPEG)
         │
         ▼
    Sharp Processing
         │
         ├──► Convert to WebP (150KB)
         ├──► Generate responsive sizes:
         │    - 400w: 30KB
         │    - 800w: 80KB
         │    - 1200w: 120KB
         │    - 1600w: 150KB
         │
         ├──► Add dimensions to prevent CLS
         ├──► Add lazy loading attribute
         │
         ▼
    HTML Transformation
         │
         ▼
    <picture>
      <source srcset="image-400.webp 400w, ..." type="image/webp">
      <img src="image.jpg" width="800" height="600" loading="lazy">
    </picture>
```

### CSS Optimization Flow

```
Original CSS (250KB)
         │
         ▼
    PurgeCSS (remove unused)
         │
         ▼
    Reduced CSS (120KB)
         │
         ▼
    Critical CSS Extraction
         │
         ├──► Above-fold CSS (15KB) → Inline in <head>
         │
         └──► Non-critical CSS (105KB) → Defer loading
                  │
                  ▼
              CleanCSS Minify
                  │
                  ▼
              Final: 80KB (68% reduction)
```

### JavaScript Optimization Flow

```
Original JS (500KB)
         │
         ▼
    Terser Minification
         │
         ├──► Remove comments
         ├──► Shorten variable names
         ├──► Remove dead code
         ├──► Compress syntax
         │
         ▼
    Minified JS (200KB)
         │
         ▼
    Loading Strategy
         │
         ├──► Critical JS → Inline
         ├──► Essential JS → defer
         └──► Non-essential → async
```

## Deployment Architecture

### Development Environment

```
localhost:3000 (Vite Dev Server)
      │
      ├──► Hot Module Replacement
      ├──► Fast Refresh
      └──► Proxy to API
            │
            ▼
localhost:5000 (Express Server)
      │
      ├──► Auto-restart (tsx watch)
      ├──► TypeScript compilation
      └──► API endpoints
```

### Production Environment

```
CDN (Static Assets)
      │
      ▼
Frontend (React SPA)
      │
      │ HTTP Requests
      ▼
Load Balancer
      │
      ├──► App Server 1 (Node.js)
      ├──► App Server 2 (Node.js)
      └──► App Server N (Node.js)
            │
            ├──► File Storage (uploads/)
            ├──► Cache Layer (Redis)
            └──► Database (PostgreSQL)
```

## Security Considerations

### Input Validation

```typescript
// URL validation
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// File type validation
const allowedTypes = ['.html', '.htm', '.zip'];
const isValidFileType = (filename: string) => {
  return allowedTypes.some(ext => filename.endsWith(ext));
};
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### File Upload Security

```typescript
const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    if (allowedTypes.includes(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});
```

## Scaling Considerations

### Horizontal Scaling

- Stateless API servers
- Shared file storage (S3/CloudFlare R2)
- Centralized session management
- Load balancing

### Caching Strategy

```typescript
// Performance analysis results
const cacheKey = `performance:${websiteId}`;
await redis.setex(cacheKey, 3600, JSON.stringify(analysis));

// Cloned website data
const cacheKey = `website:${websiteId}`;
await redis.setex(cacheKey, 86400, JSON.stringify(website));
```

### Queue-Based Processing

```typescript
// For long-running tasks
import Bull from 'bull';

const cloneQueue = new Bull('clone', {
  redis: { host: 'localhost', port: 6379 }
});

cloneQueue.process(async (job) => {
  const { url } = job.data;
  const result = await CloneService.cloneWebsite({ url });
  return result;
});
```

## Testing Strategy

### Unit Tests

```typescript
describe('OptimizationService', () => {
  it('should optimize images to WebP', async () => {
    const result = await OptimizationService.optimizeImages(...);
    expect(result.success).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
describe('Performance Analysis', () => {
  it('should analyze website and return metrics', async () => {
    const website = await CloneService.cloneWebsite({ url: 'https://example.com' });
    const analysis = await PerformanceService.analyzePerformance(website);

    expect(analysis.metrics.performanceScore).toBeGreaterThan(0);
    expect(analysis.issues).toBeDefined();
  });
});
```

### E2E Tests

```typescript
describe('Complete Workflow', () => {
  it('should clone, analyze, optimize, and export', async () => {
    // Clone
    const website = await cloneWebsite(testUrl);

    // Analyze
    const analysis = await analyzePerformance(website.id);

    // Optimize
    const results = await applyOptimizations(website.id);

    // Export
    const exportPackage = await generateExport(website.id);

    expect(exportPackage.verificationReport.pluginFree).toBe(true);
  });
});
```

## Future Enhancements

1. **Database Integration**
   - PostgreSQL for persistent storage
   - User authentication & projects
   - Version history

2. **Advanced Features**
   - Visual regression testing
   - A/B testing framework
   - Automated WordPress import plugin
   - Chrome extension

3. **Performance Improvements**
   - Worker threads for parallel processing
   - Streaming responses
   - Progressive web app features

4. **Enterprise Features**
   - Team collaboration
   - API access for automation
   - Custom branding
   - Advanced analytics

---

This architecture is designed to be **modular**, **scalable**, and **maintainable**, allowing for easy extension and customization.
