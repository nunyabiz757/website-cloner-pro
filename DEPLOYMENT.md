# Deployment Guide for Bolt.new

## Quick Start

This tool is optimized for deployment on bolt.new, Vercel, or any Node.js hosting platform.

## Prerequisites

- Node.js 18+
- PostgreSQL database (or SQLite for development)
- Environment variables configured

## Files Removed for Lightweight Deployment

The following files have been removed from Git to keep the repository lightweight:

### Database Files
- `prisma/dev.db` - Development SQLite database (regenerated on first run)
- All `.db`, `.db-journal`, `.db-shm`, `.db-wal` files

### Optional Removals
- `package-lock.json` - Can be regenerated via `npm install`
- Test files - `test-*.js`, `*-test.js`, `security-audit.json`
- Excess documentation - Kept only README.md, QUICKSTART.md, and this file

## Deployment Steps

### For Bolt.new:

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Optimize for bolt.new deployment"
   git push origin main
   ```

2. **Import to Bolt.new:**
   - Go to bolt.new
   - Import from GitHub repository
   - Bolt.new will automatically run `npm install`

3. **Configure Environment Variables:**
   ```env
   DATABASE_URL=your_database_url
   SESSION_SECRET=your_secret_key
   ANTHROPIC_API_KEY=your_api_key
   # Add other required env vars from .env.example
   ```

4. **Build Command:**
   ```bash
   npm run build
   ```

5. **Start Command:**
   ```bash
   node dist/server/index.js
   ```

### For Vercel:

1. **vercel.json** is already configured
2. Push to GitHub
3. Import to Vercel
4. Add environment variables in Vercel dashboard
5. Deploy

## Post-Deployment Setup

1. **Run Prisma migrations:**
   ```bash
   npx prisma migrate deploy
   ```

2. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```

3. **Verify deployment:**
   - Check health endpoint: `/api/health`
   - Test core features

## What Gets Regenerated

These files/folders are NOT in Git and will be created automatically:

- `node_modules/` - Via `npm install`
- `dist/` - Via `npm run build`
- `generated/prisma/` - Via `prisma generate`
- `prisma/dev.db` - Created on first run (development only)

## Repository Size

- Before optimization: ~1.3GB (with node_modules)
- After optimization: ~4-5MB (Git repository only)
- Deployable package: Full functionality maintained

## Troubleshooting

**GitHub file size error:**
- Ensure `node_modules/`, `dist/`, and `generated/` are in `.gitignore`
- Run: `git rm -r --cached node_modules dist generated` if already tracked

**Bolt.new build fails:**
- Check that all required dependencies are in `package.json`
- Verify environment variables are set
- Check build logs for missing native dependencies

**Database issues:**
- Ensure DATABASE_URL is set correctly
- For production, use PostgreSQL instead of SQLite
- Run migrations: `npx prisma migrate deploy`

## Further Optimization

If you need an even lighter deployment:

1. **Remove extension folder** (if not using browser extension):
   ```bash
   rm -rf extension
   ```

2. **Remove package-lock.json** (uncomment in .gitignore):
   - Saves 684KB
   - Will be regenerated on `npm install`

3. **Consolidate documentation:**
   - Keep only essential docs
   - Move detailed docs to wiki or separate repo

## Support

For issues, see:
- [QUICKSTART.md](./QUICKSTART.md) - Quick start guide
- [README.md](./README.md) - Full documentation
