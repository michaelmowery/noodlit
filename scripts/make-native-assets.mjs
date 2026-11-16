// Builds the source images @capacitor/assets turns into the iOS app icon and splash.
// Source of truth is www/icons/icon.svg (the touch-ripple mark), so the native icon
// never drifts from the PWA icon. Run with: npm run assets
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync(new URL('../www/icons/icon.svg', import.meta.url), 'utf8');
const BG = '#1b242b'; // matches manifest background_color

// App Store icons must be square, full-bleed and opaque: iOS applies its own corner mask,
// so drop the rounded-rect clip from the PWA artwork.
const fullBleed = svg.replace(' clip-path="url(#r1c)"', '');
await sharp(Buffer.from(fullBleed), { density: 288 })
  .resize(1024, 1024).flatten({ background: '#0e1630' }).removeAlpha()
  .png().toFile('assets/icon-only.png');

// Splash: the rounded mark centred on the app background.
const mark = await sharp(Buffer.from(svg), { density: 288 }).resize(560, 560).png().toBuffer();
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 3, background: BG } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png().toFile(`assets/${name}`);
}
console.log('Wrote assets/icon-only.png, splash.png, splash-dark.png');
