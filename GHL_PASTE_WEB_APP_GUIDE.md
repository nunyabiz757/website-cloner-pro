# GHL Paste Web App - Complete Guide

## Overview

The GHL Paste Web App allows users to:
1. **Clone** GoHighLevel pages via the dashboard
2. **Generate paste codes** for cloned pages
3. **Use a bookmarklet** to paste content into GHL pages

This replaces the need for the Chrome extension with a web-based solution.

---

## 🎯 Architecture

```
┌─────────────────┐
│   Web Dashboard │  (React Frontend)
│   /ghl-paste    │
└────────┬────────┘
         │
         │ REST API
         │
┌────────▼────────┐
│  Backend API    │  (Express + TypeScript)
│  /api/ghl-paste │
└────────┬────────┘
         │
         │ Prisma ORM
         │
┌────────▼────────┐
│    SQLite DB    │
│  - ClonedPage   │
│  - PasteSession │
└─────────────────┘

┌─────────────────┐
│  Bookmarklet    │  (JavaScript snippet)
│  User's Browser │
└─────────────────┘
```

---

## 📊 Database Schema

### ClonedPage Table
```prisma
model ClonedPage {
  id              String   @id @default(uuid())
  userId          String
  sourceUrl       String
  sourceTitle     String?
  pageData        String   // JSON string
  creditsConsumed Int      @default(1)
  status          String   @default("copied")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  pasteSessions PasteSession[]
}
```

### PasteSession Table
```prisma
model PasteSession {
  id              String    @id @default(uuid())
  clonedPageId    String
  pasteCode       String    @unique  // 8-char code
  userId          String
  status          String    @default("pending")
  destinationUrl  String?
  elementsCount   Int?
  errors          String?   // JSON
  warnings        String?   // JSON
  expiresAt       DateTime
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

---

## 🔌 API Endpoints

### 1. Cloned Pages Management

#### POST `/api/ghl-paste/cloned-pages`
Create a new cloned page

**Request:**
```json
{
  "sourceUrl": "https://example.gohighlevel.com/page",
  "sourceTitle": "Landing Page",
  "pageData": {
    "html": "<div>...</div>",
    "css": "...",
    "elements": [...]
  },
  "creditsConsumed": 1
}
```

**Response:**
```json
{
  "success": true,
  "clonedPage": {
    "id": "uuid",
    "sourceUrl": "...",
    "sourceTitle": "...",
    "createdAt": "..."
  }
}
```

#### GET `/api/ghl-paste/cloned-pages`
List user's cloned pages

**Query Params:**
- `limit` (optional): Number of pages to return
- `status` (optional): Filter by status ('copied' | 'failed')
- `search` (optional): Search by title/URL

**Response:**
```json
{
  "success": true,
  "clonedPages": [
    {
      "id": "uuid",
      "sourceUrl": "...",
      "sourceTitle": "...",
      "creditsConsumed": 1,
      "status": "copied",
      "createdAt": "...",
      "pasteCount": 3
    }
  ]
}
```

#### GET `/api/ghl-paste/cloned-pages/:id`
Get a specific cloned page with full page data

#### DELETE `/api/ghl-paste/cloned-pages/:id`
Delete a cloned page

#### GET `/api/ghl-paste/statistics`
Get user's statistics

**Response:**
```json
{
  "success": true,
  "statistics": {
    "totalPages": 10,
    "totalCreditsUsed": 15,
    "totalPasteSessions": 25,
    "successfulPastes": 23
  }
}
```

### 2. Paste Session Management

#### POST `/api/ghl-paste/paste-sessions`
Create a new paste session (generates paste code)

**Request:**
```json
{
  "clonedPageId": "uuid",
  "expiresInMinutes": 5
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "uuid",
    "pasteCode": "ABC12345",
    "status": "pending",
    "expiresAt": "2025-01-19T14:10:00Z",
    "expiresIn": 300,
    "clonedPage": {
      "id": "uuid",
      "sourceUrl": "...",
      "sourceTitle": "...",
      "pageData": {...}
    }
  }
}
```

#### GET `/api/ghl-paste/paste-sessions`
List user's paste sessions

#### GET `/api/ghl-paste/paste-data/:pasteCode`
Get paste data by paste code (**NO AUTH REQUIRED** - for bookmarklet)

**Response:**
```json
{
  "success": true,
  "data": {
    "html": "...",
    "css": "...",
    "elements": [...]
  },
  "expiresIn": 245,
  "sourceUrl": "...",
  "sourceTitle": "..."
}
```

#### POST `/api/ghl-paste/paste-complete/:pasteCode`
Complete a paste session (**NO AUTH REQUIRED** - called by bookmarklet)

**Request:**
```json
{
  "destinationUrl": "https://ghl.com/editor/page",
  "status": "completed",
  "elementsCount": 25,
  "errors": [],
  "warnings": []
}
```

#### GET `/api/ghl-paste/bookmarklet?pasteCode=ABC12345`
Generate bookmarklet code for a paste session

**Response:**
```json
{
  "success": true,
  "bookmarklet": "javascript:(function()%7B...%7D)()",
  "raw": "(function() { ... })()"
}
```

---

## 🎨 Frontend Components

### GHLPastePage (`/ghl-paste`)

**Features:**
- List all cloned pages
- Search/filter pages
- Generate paste codes
- View paste history
- Statistics dashboard

**Tabs:**
1. **Cloned Pages** - Browse and manage cloned pages
2. **Paste History** - View past paste sessions

**Actions:**
- Click "Generate Paste Code" → Opens modal with paste code and bookmarklet
- Click "Delete" → Removes cloned page
- Search bar → Filter pages by title/URL

---

## 🔖 Bookmarklet Usage

### How It Works

1. User generates paste code in dashboard
2. System creates bookmarklet with embedded paste code
3. User copies bookmarklet to clipboard
4. User navigates to GHL page editor
5. User pastes bookmarklet into browser address bar
6. Bookmarklet fetches paste data from API
7. Content is injected into GHL editor
8. Bookmarklet reports completion back to API

### Bookmarklet Code Structure

```javascript
(function() {
  const API_URL = 'https://your-app.com/api/ghl-paste';
  const PASTE_CODE = 'ABC12345';

  // 1. Show loading overlay
  // 2. Fetch paste data
  // 3. Inject content into editor
  // 4. Report completion
  // 5. Show success message
})();
```

---

## 🚀 Usage Workflow

### Complete User Journey

**Step 1: Clone a Page**
```bash
# User clones a GHL page via the dashboard
POST /api/ghl-paste/cloned-pages
{
  "sourceUrl": "https://example.gohighlevel.com/page",
  "pageData": {...}
}
```

**Step 2: Generate Paste Code**
```bash
# User clicks "Generate Paste Code" button
POST /api/ghl-paste/paste-sessions
{
  "clonedPageId": "uuid",
  "expiresInMinutes": 5
}

# Response includes:
{
  "pasteCode": "ABC12345",
  "expiresAt": "2025-01-19T14:10:00Z"
}
```

**Step 3: Get Bookmarklet**
```bash
# Frontend automatically requests bookmarklet
GET /api/ghl-paste/bookmarklet?pasteCode=ABC12345

# Response:
{
  "bookmarklet": "javascript:(function()%7B...%7D)()"
}
```

**Step 4: Copy Bookmarklet**
User copies bookmarklet to clipboard

**Step 5: Navigate to GHL Editor**
User opens GHL page editor where they want to paste

**Step 6: Run Bookmarklet**
User pastes bookmarklet into browser address bar and presses Enter

**Step 7: Content Injected**
Bookmarklet:
1. Fetches paste data: `GET /api/ghl-paste/paste-data/ABC12345`
2. Injects content into editor
3. Reports completion: `POST /api/ghl-paste/paste-complete/ABC12345`

**Step 8: Success!**
Content is now pasted in GHL editor

---

## 🛡️ Security Features

### 1. Paste Code Expiration
- Default: 5 minutes
- Prevents unauthorized access to old paste codes
- Cron job cleans up expired sessions

### 2. One-Time Use
- Paste code marked as "completed" after first use
- Cannot be reused (prevents replay attacks)

### 3. User Ownership
- Cloned pages tied to user ID
- Only owner can generate paste codes for their pages

### 4. No Sensitive Data in Bookmarklet
- Paste code is the only data embedded
- All content fetched via API at runtime

---

## ⚙️ Configuration

### Environment Variables

```env
# Database
DATABASE_URL="file:./dev.db"

# Server
PORT=5000

# Authentication (existing)
JWT_SECRET="your-secret-key"
```

### Paste Session Settings

Default settings in `PasteSessionService.ts`:
```typescript
const DEFAULT_EXPIRATION_MINUTES = 5;
const PASTE_CODE_LENGTH = 8;
const MAX_PASTE_CODE_GENERATION_ATTEMPTS = 10;
```

---

## 🧪 Testing

### Manual Testing Steps

**1. Create Cloned Page**
```bash
curl -X POST http://localhost:5000/api/ghl-paste/cloned-pages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://example.com",
    "sourceTitle": "Test Page",
    "pageData": {"html": "<div>Test</div>"}
  }'
```

**2. List Cloned Pages**
```bash
curl http://localhost:5000/api/ghl-paste/cloned-pages \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**3. Generate Paste Session**
```bash
curl -X POST http://localhost:5000/api/ghl-paste/paste-sessions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clonedPageId": "uuid-from-step-1"
  }'
```

**4. Get Paste Data (No Auth)**
```bash
curl http://localhost:5000/api/ghl-paste/paste-data/ABC12345
```

**5. Complete Paste (No Auth)**
```bash
curl -X POST http://localhost:5000/api/ghl-paste/paste-complete/ABC12345 \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "https://ghl.com/page",
    "status": "completed",
    "elementsCount": 10
  }'
```

---

## 🐛 Troubleshooting

### Issue: "Paste session not found"
**Cause:** Paste code expired or invalid
**Solution:** Generate a new paste code

### Issue: "Paste session already used"
**Cause:** Trying to reuse a paste code
**Solution:** Generate a new paste code for each paste

### Issue: "Paste session expired"
**Cause:** More than 5 minutes elapsed since code generation
**Solution:** Generate a new paste code

### Issue: Bookmarklet not working
**Causes:**
1. Browser blocking JavaScript in address bar
2. CSP (Content Security Policy) blocking injection
3. GHL editor structure changed

**Solutions:**
1. Try in incognito mode
2. Check browser console for errors
3. Update bookmarklet injection logic

---

## 📈 Future Enhancements

### Phase 2 Improvements
- [ ] Custom expiration times per user
- [ ] Paste code usage statistics
- [ ] Batch paste code generation
- [ ] Email notification when paste completes
- [ ] Webhook integration for paste events

### Phase 3 Advanced Features
- [ ] Browser extension integration
- [ ] Direct GHL OAuth integration (no bookmarklet needed)
- [ ] Visual diff of pasted content
- [ ] Automatic retry on paste failure
- [ ] Paste template library

---

## 🔄 Maintenance

### Cron Jobs

**Clean Up Expired Sessions** (Recommended: Every 10 minutes)
```typescript
import { PasteSessionService } from './services/PasteSessionService';

setInterval(async () => {
  const count = await PasteSessionService.cleanupExpiredSessions();
  console.log(`Cleaned up ${count} expired paste sessions`);
}, 10 * 60 * 1000);
```

**Delete Old Sessions** (Recommended: Daily)
```typescript
import { PasteSessionService } from './services/PasteSessionService';

setInterval(async () => {
  const count = await PasteSessionService.deleteOldSessions(30);
  console.log(`Deleted ${count} old paste sessions`);
}, 24 * 60 * 60 * 1000);
```

---

## 📝 Implementation Checklist

- [x] Database schema (Prisma)
- [x] Backend services (`PasteSessionService`, `ClonedPageService`)
- [x] API routes (`/api/ghl-paste/*`)
- [x] Frontend dashboard (`GHLPastePage.tsx`)
- [x] Bookmarklet generator
- [x] Route registration (`App.tsx`, `index.ts`)
- [x] Prisma migration
- [ ] Cron jobs for cleanup (recommended)
- [ ] Production testing
- [ ] User documentation

---

## 🎉 Quick Start

1. **Run migration:**
   ```bash
   npx prisma migrate dev
   ```

2. **Start server:**
   ```bash
   npm run dev
   ```

3. **Access dashboard:**
   ```
   http://localhost:5173/ghl-paste
   ```

4. **Create test cloned page via API**

5. **Generate paste code**

6. **Test bookmarklet**

---

**Status:** ✅ Ready for production testing
**Version:** 1.0.0
**Last Updated:** January 19, 2025
