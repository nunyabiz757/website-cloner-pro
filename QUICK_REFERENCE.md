# GHL Integration - Quick Reference Card

## 🚀 Quick Start (5 Minutes)

```bash
# 1. Install Stripe package
npm install stripe @types/stripe

# 2. Set environment variables
echo "STRIPE_SECRET_KEY=sk_test_..." >> .env
echo "STRIPE_WEBHOOK_SECRET=whsec_..." >> .env

# 3. Run migrations
npm run migrate  # Runs 017-020

# 4. Start server
npm run dev

# 5. Load extension
# chrome://extensions/ → Load unpacked → select extension/
```

## 📋 Key Files

| Type | File | Purpose |
|------|------|---------|
| Migration | `017_credit_system.sql` | Credits, packages, transactions |
| Migration | `018_ghl_cloning.sql` | Cloned pages, detection log |
| Migration | `019_ghl_rbac_permissions.sql` | 20 new permissions |
| Migration | `020_stripe_enhancements.sql` | Webhook tracking |
| Service | `credit.service.ts` | Credit operations |
| Service | `stripe.service.ts` | Payment handling |
| Service | `ghl-detection.service.ts` | GHL detection |
| Service | `ghl-paste.service.ts` | Paste sessions |
| Routes | `credits.routes.ts` | 17 endpoints |
| Routes | `ghl.routes.ts` | 20 endpoints |
| Extension | `extension/` folder | Chrome extension |

## 🔑 API Endpoints

### Credits
```
GET    /api/credits/balance
GET    /api/credits/packages
GET    /api/credits/transactions
POST   /api/credits/purchase
POST   /api/credits/subscribe
POST   /api/credits/webhook (Stripe)
```

### GHL
```
POST   /api/ghl/validate         # Detect GHL site
POST   /api/ghl/copy            # Copy page (1 credit)
GET    /api/ghl/cloned          # List cloned pages
GET    /api/ghl/cloned/:id      # Get specific page
DELETE /api/ghl/cloned/:id      # Delete page
POST   /api/ghl/paste/session   # Create paste session
GET    /api/ghl/paste/data/:token  # Get paste data
POST   /api/ghl/paste/complete  # Complete paste
```

## 🧪 Quick Tests

### Test Credit Balance
```bash
curl http://localhost:3000/api/credits/balance \
  -H "Authorization: Bearer TOKEN"
```

### Test GHL Detection
```bash
curl -X POST http://localhost:3000/api/ghl/validate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://app.gohighlevel.com"}'
```

### Test Copy Page
```bash
curl -X POST http://localhost:3000/api/ghl/copy \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.gohighlevel.com/page"}'
```

## 🔧 Common Commands

```bash
# Database
psql -U postgres -d website_cloner_pro
\dt ghl*                    # List GHL tables
\dt credits*                # List credit tables
\df consume_credits         # View function

# Redis
redis-cli
KEYS credits:*              # View cached credits
KEYS ghl_detection:*        # View cached detection

# Stripe CLI
stripe listen --forward-to localhost:3000/api/credits/webhook
stripe trigger payment_intent.succeeded

# Extension
chrome://extensions/        # Manage extensions
chrome.storage.local.get()  # In console (view storage)
```

## 📊 Default Credit Packages

| Package | Credits | Price | Type |
|---------|---------|-------|------|
| Starter | 2 | $25 | One-time |
| Small | 10 | $125 | One-time |
| Medium | 20 | $200 | One-time |
| Large | 50 | $375 | One-time |
| Enterprise | 100 | $500 | One-time |
| Basic Monthly | 10 | $99/mo | Subscription |
| Pro Monthly | 50 | $299/mo | Subscription |
| Enterprise Monthly | 200 | $799/mo | Subscription |

## 🎯 Detection Methods (7)

1. **Domain patterns** (40% weight) - gohighlevel.com, etc.
2. **Meta tags** (20%) - generator, og:site_name
3. **Data attributes** (20%) - data-page-id, data-funnel-id
4. **CSS classes** (15%) - hl_page, funnel-body
5. **Scripts** (20%) - ghl-builder.js patterns
6. **HTML patterns** (10%) - Regex matching
7. **Builder signature** (10%) - HTML comments, structure

**Confidence threshold:** 50% (0.50)

## 🔒 RBAC Permissions (20 New)

**GHL Cloning (10):**
- clone:ghl:copy, paste, view, delete, export
- clone:ghl:template, manage_templates
- clone:ghl:search, bulk_clone, admin

**Credits (7):**
- credits:view, purchase, history
- credits:admin_view_all, admin_adjust
- credits:refund, subscription_manage

**GHL Detection (3):**
- ghl:detect, validate, admin

## ⚡ Performance Targets

| Operation | Target | Caching |
|-----------|--------|---------|
| Credit balance | <100ms | 5 min |
| GHL detection (cached) | <100ms | 24 hrs |
| GHL detection (fresh) | <2s | - |
| Copy page | <5s | - |
| Create session | <500ms | - |
| Paste inject | <2s | - |

## 🐛 Error Codes

| Code | Meaning | HTTP |
|------|---------|------|
| AUTH_REQUIRED | Not logged in | 401 |
| INSUFFICIENT_CREDITS | Need more credits | 402 |
| FORBIDDEN | No permission | 403 |
| NOT_FOUND | Resource missing | 404 |
| INVALID_SESSION | Session expired | 404 |
| VALIDATION_ERROR | Bad request | 400 |

## 📝 Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
PORT=3000
NODE_ENV=development
```

## 🎨 Extension Badge States

| Symbol | Color | Meaning |
|--------|-------|---------|
| ✓ | Green | Ready |
| ... | Blue | Processing |
| ! | Red | Error |
| ⚠ | Orange | Warning |

## 📦 Database Tables (11)

**Credit System:**
- credits
- credit_packages
- credit_transactions
- payment_intents
- stripe_customers
- subscriptions
- stripe_webhook_events

**GHL System:**
- ghl_cloned_pages
- ghl_page_assets
- ghl_detection_log
- ghl_clone_sessions

## 🔄 Workflow Summary

```
1. User buys credits → Stripe webhook → Credits added
2. User copies GHL page → Detection → 1 credit consumed → Stored
3. User opens extension → Authenticates → Views cloned pages
4. User selects page → Creates session → Fetches data
5. Extension injects content → Completes → Status updated
```

## 💾 Data Retention

| Item | Retention |
|------|-----------|
| Cloned pages | 30 days |
| Paste sessions | 2 hours |
| Detection cache | 24 hours |
| Credit balance cache | 5 minutes |
| Transaction history | Forever |
| Webhook events | Forever |

## 🎓 Documentation

- **TESTING_GUIDE.md** - Comprehensive testing procedures
- **GHL_IMPLEMENTATION_COMPLETE.md** - Full implementation details
- **QUICK_REFERENCE.md** - This file
- **extension/icons/README.md** - Icon guide

---

**Version:** 1.0.0
**Status:** ✅ Ready for Testing
