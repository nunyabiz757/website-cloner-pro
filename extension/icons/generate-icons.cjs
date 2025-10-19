/**
 * Generate placeholder PNG icons for Chrome Extension
 * Run with: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Simple PNG file creator with gradient background
function createPNG(size, filename) {
  // Create a Canvas (using canvas npm package if available, or simple colored PNGs)
  // For now, create a simple colored square PNG using raw PNG data

  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // Create IHDR chunk (Image Header)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);        // Width
  ihdrData.writeUInt32BE(size, 4);        // Height
  ihdrData.writeUInt8(8, 8);              // Bit depth
  ihdrData.writeUInt8(2, 9);              // Color type (RGB)
  ihdrData.writeUInt8(0, 10);             // Compression
  ihdrData.writeUInt8(0, 11);             // Filter
  ihdrData.writeUInt8(0, 12);             // Interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Create IDAT chunk (Image Data) - solid purple color
  const r = 0x66, g = 0x7e, b = 0xea;     // Purple (#667eea)
  const rowSize = size * 3 + 1;           // 3 bytes per pixel + 1 filter byte
  const imageData = Buffer.alloc(rowSize * size);

  for (let y = 0; y < size; y++) {
    imageData[y * rowSize] = 0;          // Filter type: None
    for (let x = 0; x < size; x++) {
      const offset = y * rowSize + 1 + x * 3;
      imageData[offset] = r;
      imageData[offset + 1] = g;
      imageData[offset + 2] = b;
    }
  }

  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(imageData);
  const idatChunk = createChunk('IDAT', compressed);

  // Create IEND chunk (Image End)
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  // Combine all chunks
  const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);

  // Write to file
  fs.writeFileSync(path.join(__dirname, filename), png);
  console.log(`Created ${filename} (${size}x${size})`);
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  // Calculate CRC
  const crcBuffer = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(calculateCRC(crcBuffer), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function calculateCRC(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc = crc ^ buffer[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate all icon sizes
console.log('Generating placeholder PNG icons...\n');
createPNG(16, 'icon16.png');
createPNG(32, 'icon32.png');
createPNG(48, 'icon48.png');
createPNG(128, 'icon128.png');
console.log('\n✓ All placeholder icons created successfully!');
console.log('Note: These are simple purple squares. Replace with proper branded icons later.');
