#!/usr/bin/env node

/**
 * Extension Build Script
 *
 * Builds the browser extension with environment-specific configuration.
 *
 * Usage:
 *   npm run build:extension              # Development build
 *   npm run build:extension:prod         # Production build
 *   VITE_API_URL=https://api.example.com npm run build:extension:prod
 *
 * Environment Variables:
 *   VITE_API_URL        - Production API URL (required for production builds)
 *   NODE_ENV            - Build environment (development/production)
 *   EXTENSION_VERSION   - Override extension version (optional)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const extensionDir = path.join(rootDir, 'extension');
const distDir = path.join(rootDir, 'dist-extension');

// Configuration
const environment = process.env.NODE_ENV || 'development';
const isProd = environment === 'production';
const apiBaseUrl = process.env.VITE_API_URL || 'http://localhost:3000/api';
const extensionVersion = process.env.EXTENSION_VERSION || null;

console.log('🔨 Building browser extension...');
console.log('');
console.log('Configuration:');
console.log(`  Environment: ${environment}`);
console.log(`  API URL: ${apiBaseUrl}`);
console.log('');

// Validate production build
if (isProd) {
  if (!process.env.VITE_API_URL) {
    console.error('❌ Error: VITE_API_URL environment variable is required for production builds');
    console.error('');
    console.error('Example:');
    console.error('  VITE_API_URL=https://api.yoursite.com npm run build:extension:prod');
    console.error('');
    process.exit(1);
  }

  if (apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1')) {
    console.error('❌ Error: Production build cannot use localhost URL');
    console.error(`  Current URL: ${apiBaseUrl}`);
    console.error('');
    process.exit(1);
  }
}

// Create dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Files to copy
const filesToCopy = [
  'background.js',
  'content.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'manifest.json',
];

const directoriesToCopy = ['icons'];

/**
 * Replace placeholders in file content
 */
function replacePlaceholders(content, filePath) {
  const fileName = path.basename(filePath);

  // Only replace placeholders in specific files
  if (fileName === 'config.js') {
    content = content
      .replace(/__ENV__/g, environment)
      .replace(/__API_BASE_URL__/g, apiBaseUrl);

    console.log(`  ✓ Configured config.js for ${environment}`);
  }

  if (fileName === 'manifest.json' && extensionVersion) {
    const manifest = JSON.parse(content);
    manifest.version = extensionVersion;
    content = JSON.stringify(manifest, null, 2);

    console.log(`  ✓ Set extension version to ${extensionVersion}`);
  }

  // Update manifest host_permissions for production
  if (fileName === 'manifest.json' && isProd) {
    const manifest = JSON.parse(content);

    // Extract domain from API URL
    const apiUrl = new URL(apiBaseUrl.replace('/api', ''));
    const apiDomain = `${apiUrl.protocol}//${apiUrl.host}`;

    // Add production API domain to host_permissions
    if (!manifest.host_permissions.includes(`${apiDomain}/*`)) {
      manifest.host_permissions = manifest.host_permissions.filter(
        (perm) => !perm.includes('localhost')
      );
      manifest.host_permissions.push(`${apiDomain}/*`);

      console.log(`  ✓ Added ${apiDomain}/* to host_permissions`);
    }

    content = JSON.stringify(manifest, null, 2);
  }

  return content;
}

/**
 * Copy file with placeholder replacement
 */
function copyFile(src, dest) {
  let content = fs.readFileSync(src, 'utf8');
  content = replacePlaceholders(content, src);
  fs.writeFileSync(dest, content, 'utf8');
}

/**
 * Copy directory recursively
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy extension files
console.log('📦 Copying extension files...');

// Copy config.js first (needs placeholder replacement)
const configSrc = path.join(extensionDir, 'config.js');
const configDest = path.join(distDir, 'config.js');
copyFile(configSrc, configDest);

// Copy other files
for (const file of filesToCopy) {
  const src = path.join(extensionDir, file);
  const dest = path.join(distDir, file);

  if (fs.existsSync(src)) {
    copyFile(src, dest);
    console.log(`  ✓ Copied ${file}`);
  } else {
    console.warn(`  ⚠ Skipped ${file} (not found)`);
  }
}

// Copy directories
for (const dir of directoriesToCopy) {
  const src = path.join(extensionDir, dir);
  const dest = path.join(distDir, dir);

  if (fs.existsSync(src)) {
    copyDirectory(src, dest);
    console.log(`  ✓ Copied ${dir}/ directory`);
  } else {
    console.warn(`  ⚠ Skipped ${dir}/ (not found)`);
  }
}

console.log('');
console.log('📦 Creating extension package...');

// Create ZIP archive for distribution
const zipPath = path.join(rootDir, `extension-${environment}-${Date.now()}.zip`);
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`  ✓ Created ${path.basename(zipPath)} (${sizeInMB} MB)`);
  console.log('');
  console.log('✅ Extension build complete!');
  console.log('');
  console.log('Distribution:');
  console.log(`  Source: ${distDir}`);
  console.log(`  Package: ${zipPath}`);
  console.log('');

  if (isProd) {
    console.log('📋 Next steps for production:');
    console.log('  1. Test the extension from dist-extension/ directory');
    console.log('  2. Upload the .zip file to Chrome Web Store');
    console.log('  3. Or distribute the .zip file for manual installation');
  } else {
    console.log('💡 To load in Chrome:');
    console.log('  1. Open chrome://extensions/');
    console.log('  2. Enable "Developer mode"');
    console.log('  3. Click "Load unpacked"');
    console.log(`  4. Select: ${distDir}`);
  }

  console.log('');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();
