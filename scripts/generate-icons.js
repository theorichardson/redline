/**
 * Generate placeholder PNG icons for the extension
 * Run with: node scripts/generate-icons.js
 */

import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');

// Create icons directory if it doesn't exist
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// Generate a simple SVG icon
function generateSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#1a1a2e"/>
  <rect x="${size * 0.15}" y="${size * 0.35}" width="${size * 0.7}" height="${size * 0.08}" fill="#e63946"/>
  <rect x="${size * 0.15}" y="${size * 0.48}" width="${size * 0.5}" height="${size * 0.08}" fill="#e63946" opacity="0.7"/>
  <rect x="${size * 0.15}" y="${size * 0.61}" width="${size * 0.35}" height="${size * 0.08}" fill="#e63946" opacity="0.4"/>
</svg>`;
}

// Write PNG files using sharp
const sizes = [16, 48, 128];

await Promise.all(
  sizes.map(async (size) => {
    const svg = generateSVG(size);
    const outputPath = join(iconsDir, `icon${size}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    console.log(`Created: ${outputPath}`);
  })
);

console.log('\nPNG icons created for Chrome extension.');
