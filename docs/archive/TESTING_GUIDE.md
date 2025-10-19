# Website Cloner Pro - GHL Integration Testing Guide

Complete testing guide for Phase 1 (Backend) and Phase 2 (Chrome Extension).

## 🚀 Quick Start

### Prerequisites
- PostgreSQL database running
- Redis server running
- Node.js 18+ installed
- Chrome browser for extension testing
- Stripe account (for payment testing)

### Environment Setup

1. **Configure Environment Variables**
   ```bash
   # .env file

   # Database
   DATABASE_URL=postgresql://user:password@localhost:5432/website_cloner_pro
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=website_cloner_pro
   DB_USER=postgres
   DB_PASSWORD=your_password

   # Redis
   REDIS_URL=redis://localhost:6379

   # Stripe
   STRIPE_SECRET_KEY=sk_test_your_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

   # Server
   PORT=3000
   NODE_ENV=development
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Database Migrations**
   ```bash
   # Run migrations 017-020
   npm run migrate
   ```

4. **Start the Server**
   ```bash
   npm run dev
   ```

---

## 📋 Phase 1: Backend Testing

### 1. Database Verification

**Check Tables Exist:**
```sql
-- Connect to PostgreSQL
psql -U postgres -d website_cloner_pro

-- Verify credit tables
\dt credits*
\dt stripe*
\dt subscriptions

-- Verify GHL tables
\dt ghl*

-- Check functions
\df consume_credits
\df add_credits
\df get_user_clone_stats
```

**Expected Output:**
- 11 new tables created
- 17 functions created
- No errors

### 2. Credit System API Testing

**A. Get Credit Packages**
```bash
curl http://localhost:3000/api/credits/packages \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** List of 8 credit packages (5 one-time + 3 subscriptions)

**B. Get Credit Balance**
```bash
curl http://localhost:3000/api/credits/balance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** User's credit balance object

**C. Create Payment Intent**
```bash
curl -X POST http://localhost:3000/api/credits/purchase \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "packageId": "PACKAGE_UUID"
  }'
```

**Expected:**
- `clientSecret` for Stripe payment
- `paymentIntentId`
- `amount` in cents

**D. Create Subscription**
```bash
curl -X POST http://localhost:3000/api/credits/subscribe \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "packageId": "PACKAGE_UUID",
    "paymentMethodId": "pm_test_card"
  }'
```

**Expected:**
- `subscriptionId`
- `status`: "active" or "incomplete"
- `currentPeriodEnd` date

### 3. GHL Detection Testing

**A. Validate GHL Site**
```bash
curl -X POST http://localhost:3000/api/ghl/validate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.gohighlevel.com/page"
  }'
```

**Expected:**
- `isGhlSite`: true/false
- `confidence`: 0.00-1.00
- `detectionMarkers` object with findings

**B. Copy GHL Page**
```bash
curl -X POST http://localhost:3000/api/ghl/copy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.gohighlevel.com/page"
  }'
```

**Expected:**
- `clonedPageId` UUID
- `creditsConsumed`: 1
- `detection` object
- `pageData` with CSS, JS, forms, assets

**C. List Cloned Pages**
```bash
curl http://localhost:3000/api/ghl/cloned \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Array of cloned pages with metadata

### 4. Stripe Webhook Testing

**A. Setup Stripe CLI**
```bash
stripe login
stripe listen --forward-to localhost:3000/api/credits/webhook
```

**B. Test Payment Success**
```bash
stripe trigger payment_intent.succeeded
```

**Expected:**
- Credits added to user account
- Transaction logged
- Webhook event recorded

**C. Test Subscription Events**
```bash
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

**Expected:**
- Subscription status updated
- Monthly credits added
- Database updated

### 5. Cron Job Testing

**Run Subscription Refresh Job Manually:**
```bash
node -e "import('./src/server/jobs/subscription-refresh.job.js').then(m => m.runSubscriptionRefreshJob())"
```

**Expected:**
- Active subscriptions refreshed
- Credits added for current month
- Expired sessions cleaned up
- Expired clones cleaned up

---

## 🔌 Phase 2: Extension Testing

### 1. Load Extension in Chrome

1. **Open Chrome Extensions**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right)

2. **Load Unpacked Extension**
   - Click "Load unpacked"
   - Select the `extension/` folder
   - Extension should appear in toolbar

**Expected:**
- Extension icon visible
- No load errors
- Badge shows status

### 2. Extension Authentication

1. **Click Extension Icon**
   - Popup opens
   - Auth section visible

2. **Get API Token**
   - Go to http://localhost:3000/dashboard/settings
   - Generate or copy API token

3. **Login in Extension**
   - Paste token in extension popup
   - Click "Login"
   - Should redirect to main screen

**Expected:**
- Token saved to chrome.storage
- Badge shows "✓" (ready)
- Main screen visible

### 3. GHL Page Detection

1. **Navigate to GHL Site**
   - Go to any `*.gohighlevel.com` page
   - Or use: `https://app.gohighlevel.com/`

2. **Open Extension**
   - Click extension icon
   - Check detection status

**Expected:**
- "✅ GHL Page Detected" message
- Confidence percentage shown
- Badge shows "✓"

3. **Test Non-GHL Site**
   - Navigate to google.com
   - Open extension

**Expected:**
- "❌ Not a GHL Page" message
- Explanation shown

### 4. Paste Workflow Testing

**A. Copy a Page First (via Dashboard)**
1. Go to dashboard: http://localhost:3000/dashboard
2. Navigate to GHL cloning section
3. Copy a GHL page (uses 1 credit)

**B. Test Paste in Extension**
1. Navigate to a GHL builder page
2. Open extension popup
3. Click "📚 View Cloned Pages"
4. Search for your page
5. Click on page to select
6. Click "📋 Paste into Current Page"

**Expected Flow:**
- Session created (2-hour expiry)
- Page data fetched via session token
- Content script injects CSS/JS
- Success notification shown
- Database updated (copied → pasted)

**C. Verify Paste Results**
1. Check GHL page for injected content
2. Open browser DevTools
3. Look for `[data-wcp-injected]` elements
4. Check console for logs

**Expected:**
- Custom CSS applied
- Custom JS executed (if safe)
- Forms detected (warning shown)
- Assets listed (warning shown)

### 5. Error Scenarios

**A. Insufficient Credits**
```bash
# Set user credits to 0 in database
UPDATE credits SET credits_available = 0 WHERE user_id = 'USER_ID';
```

- Try to copy page
- Expected: 402 error, "Insufficient credits" message

**B. Expired Session**
```bash
# Set session expiry to past
UPDATE ghl_clone_sessions SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = 'SESSION_ID';
```

- Try to paste
- Expected: "Invalid or expired session" error

**C. Invalid Token**
- Logout from extension
- Enter invalid token
- Expected: Login fails with error message

---

## 🧪 Integration Testing

### Full End-to-End Workflow

1. **Setup**
   - User registers account
   - User purchases credits (Starter Pack: 2 credits, $25)
   - Stripe payment succeeds
   - Credits added to account

2. **Copy Phase**
   - User navigates to GHL page in dashboard
   - Clicks "Copy Page"
   - Detection runs (95%+ confidence)
   - Page data extracted
   - 1 credit consumed
   - Page stored with 30-day expiration

3. **Paste Phase**
   - User installs Chrome extension
   - Authenticates with API token
   - Navigates to GHL builder page
   - Extension detects GHL automatically
   - Opens extension popup
   - Views cloned pages
   - Selects page to paste
   - Creates session (2-hour expiry)
   - Fetches page data
   - Injects content into builder
   - Marks operation complete

4. **Verification**
   - Check user balance: 1 credit remaining
   - Check transaction history: 1 purchase + 1 consumption
   - Check cloned_pages: status = "pasted"
   - Check ghl_clone_sessions: status = "completed"

---

## 📊 Performance Testing

### Credit Operations Load Test
```bash
# Concurrent credit consumption
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/ghl/copy \
    -H "Authorization: Bearer TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://test.gohighlevel.com/page-'$i'"}' &
done
```

**Expected:**
- No race conditions
- Correct credit deductions
- All transactions logged

### Detection Speed Test
```bash
time curl -X POST http://localhost:3000/api/ghl/validate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.gohighlevel.com/page"}'
```

**Expected:**
- First call: ~1-2 seconds (API fetch + detection)
- Cached call: <100ms (Redis cache hit)

---

## 🐛 Common Issues & Solutions

### Database Issues

**Issue:** Migration fails
```
ERROR: relation "credits" already exists
```
**Solution:**
```sql
-- Check migration status
SELECT * FROM schema_migrations ORDER BY created_at DESC;

-- Rollback if needed
-- Run the .down.sql files in reverse order
```

### Redis Issues

**Issue:** Redis connection fails
```
Error: Redis not connected
```
**Solution:**
```bash
# Start Redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:alpine
```

### Extension Issues

**Issue:** Extension won't load
```
Manifest version 2 is deprecated
```
**Solution:** Verify manifest.json has `"manifest_version": 3`

**Issue:** Icons not showing
```
Could not load icon 'icons/icon16.png'
```
**Solution:** Verify PNG files exist in `extension/icons/`

**Issue:** Content script not injecting
```
No response from content script
```
**Solution:**
- Reload extension
- Refresh GHL page
- Check console for errors

### API Issues

**Issue:** 401 Unauthorized
```
Authentication required
```
**Solution:** Check JWT token is valid and not expired

**Issue:** 402 Payment Required
```
Insufficient credits
```
**Solution:** Purchase credits or add via admin panel

---

## ✅ Testing Checklist

### Backend (Phase 1)
- [ ] All migrations run successfully
- [ ] Credit packages seeded
- [ ] User can view credit balance
- [ ] User can purchase credits (one-time)
- [ ] User can subscribe (monthly)
- [ ] Stripe webhooks process correctly
- [ ] Credits consumed on clone operations
- [ ] GHL detection works (95%+ accuracy)
- [ ] Page data extraction complete
- [ ] Cloned pages stored correctly
- [ ] Subscription refresh job works
- [ ] RBAC permissions enforced
- [ ] Audit logging works

### Extension (Phase 2)
- [ ] Extension loads in Chrome
- [ ] Icons display correctly
- [ ] Authentication works
- [ ] Token saved/retrieved
- [ ] GHL page detection works
- [ ] Badge updates correctly
- [ ] Cloned pages list loads
- [ ] Search functionality works
- [ ] Paste session creation works
- [ ] Content injection works
- [ ] CSS applied correctly
- [ ] JS executed (safe scripts only)
- [ ] Notifications shown
- [ ] Error handling works
- [ ] Completion reported to backend

### Integration
- [ ] Full copy → paste workflow works
- [ ] Credits deducted correctly
- [ ] Database updated at each step
- [ ] Sessions expire correctly
- [ ] Concurrent operations handled
- [ ] Error recovery works
- [ ] Performance acceptable (<2s)

---

## 📝 Test Data

### Test GHL URLs
```
https://app.gohighlevel.com/
https://builder.gohighlevel.com/
https://*.gohighlevel.com/v2/preview/*
```

### Test Stripe Cards
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
3D Secure: 4000 0027 6000 3184
```

### Test Users
```sql
-- Create test user with credits
INSERT INTO users (email, password) VALUES ('test@example.com', 'hashed_password');
INSERT INTO credits (user_id, credits_available) VALUES ('USER_ID', 10);
```

---

## 🚢 Production Deployment

### Pre-Deployment Checklist
- [ ] Update API_BASE_URL in extension/background.js
- [ ] Set production Stripe keys
- [ ] Configure production database
- [ ] Set up Redis in production
- [ ] Configure webhook endpoints
- [ ] Set up SSL certificates
- [ ] Enable CORS for production domain
- [ ] Set proper CSP headers
- [ ] Create branded extension icons
- [ ] Test on production data
- [ ] Set up monitoring/logging
- [ ] Configure backup schedule
- [ ] Set up cron jobs

### Extension Publishing
1. Create production icons (128x128 for Chrome Web Store)
2. Update manifest.json with production URLs
3. Create ZIP of extension folder
4. Submit to Chrome Web Store
5. Wait for review (typically 3-5 days)

---

## 📞 Support

If you encounter issues:
1. Check console logs (browser + server)
2. Verify environment variables
3. Check database connections
4. Review this testing guide
5. Check migration status
6. Verify Redis is running

---

**Version:** 1.0.0
**Last Updated:** 2025-10-17
**Status:** ✅ Phases 1 & 2 Complete
