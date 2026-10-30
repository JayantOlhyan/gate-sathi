import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BRAND_BLUE = { r: 30, g: 58, b: 138, alpha: 1 }; // #1E3A8A
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }; // #FFFFFF
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

function buildIcoFromPngBuffers(
  images: Array<{ size: number; png: Buffer }>
): Buffer {
  const headerSize = 6;
  const dirEntrySize = 16;
  const count = images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO type = 1
  header.writeUInt16LE(count, 4);

  const dirEntries = Buffer.alloc(dirEntrySize * count);
  let dataOffset = headerSize + dirEntrySize * count;

  images.forEach((img, idx) => {
    const entryOffset = idx * dirEntrySize;
    const dim = img.size >= 256 ? 0 : img.size;
    dirEntries.writeUInt8(dim, entryOffset + 0); // width
    dirEntries.writeUInt8(dim, entryOffset + 1); // height
    dirEntries.writeUInt8(0, entryOffset + 2); // color palette
    dirEntries.writeUInt8(0, entryOffset + 3); // reserved
    dirEntries.writeUInt16LE(1, entryOffset + 4); // color planes
    dirEntries.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    dirEntries.writeUInt32LE(img.png.length, entryOffset + 8); // size
    dirEntries.writeUInt32LE(dataOffset, entryOffset + 12); // offset
    dataOffset += img.png.length;
  });

  return Buffer.concat([header, dirEntries, ...images.map((i) => i.png)]);
}

async function createWhiteSymbolBuffer(inputPngPath: string): Promise<Buffer> {
  const { data, info } = await sharp(inputPngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 0;

    if (a === 0) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = 0;
      continue;
    }

    // Preserve saffron checkmark (#F59E0B) with clean anti-aliased alpha, convert navy shield/gate to pure white (#FFFFFF)
    const isSaffron = r - b > 35 && g > b;
    if (isSaffron) {
      const sAlpha = Math.min(
        a,
        Math.max(0, Math.round(((250 - b) / 220) * 255))
      );
      out[i] = 245;
      out[i + 1] = 158;
      out[i + 2] = 11;
      out[i + 3] = sAlpha;
    } else {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = a;
    }
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function main() {
  const rootDir = process.cwd();
  const brandDir = path.join(rootDir, 'brand');
  const publicIconsDir = path.join(rootDir, 'public', 'icons');
  const publicBrandDir = path.join(rootDir, 'public', 'brand');

  fs.mkdirSync(publicIconsDir, { recursive: true });
  fs.mkdirSync(publicBrandDir, { recursive: true });

  const srcIconPath = path.join(brandDir, 'icon.png');
  const srcLogoHorizPath = path.join(brandDir, 'logo-horizontal.png');
  const srcLogoHorizWhitePath = path.join(
    brandDir,
    'logo-horizontal-white.png'
  );

  // Copy brand logos to /public/brand/
  fs.copyFileSync(srcIconPath, path.join(publicBrandDir, 'icon.png'));
  fs.copyFileSync(
    srcLogoHorizPath,
    path.join(publicBrandDir, 'logo-horizontal.png')
  );
  fs.copyFileSync(
    srcLogoHorizWhitePath,
    path.join(publicBrandDir, 'logo-horizontal-white.png')
  );

  // Trim transparent margin around the symbol so scaling/padding is exact
  const trimmedBlueSymbol = await sharp(srcIconPath).trim().png().toBuffer();
  const whiteSymbolFull = await createWhiteSymbolBuffer(srcIconPath);
  const trimmedWhiteSymbol = await sharp(whiteSymbolFull)
    .trim()
    .png()
    .toBuffer();

  // Also save white icon variant in /public/brand/icon-white.png for dark/brand-blue headers
  await sharp(trimmedWhiteSymbol)
    .resize(128, 128, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toFile(path.join(publicBrandDir, 'icon-white.png'));

  // 1. favicon-32.png and favicon.ico (16, 32, 48 combined)
  const icoSizes = [16, 32, 48];
  const icoBuffers: Array<{ size: number; png: Buffer }> = [];
  for (const sz of icoSizes) {
    const png = await sharp(trimmedBlueSymbol)
      .resize(sz, sz, { fit: 'contain', background: TRANSPARENT })
      .png()
      .toBuffer();
    icoBuffers.push({ size: sz, png });
    if (sz === 32) {
      fs.writeFileSync(path.join(publicIconsDir, 'favicon-32.png'), png);
    }
  }
  const icoFile = buildIcoFromPngBuffers(icoBuffers);
  fs.writeFileSync(path.join(publicIconsDir, 'favicon.ico'), icoFile);

  // 2. apple-touch-icon.png (180x180, white background, 12% padding -> 137px inner icon)
  const appleSize = 180;
  const applePad = Math.round(appleSize * 0.12); // 22px each side
  const appleInner = appleSize - applePad * 2; // 136px
  const appleSymbol = await sharp(trimmedBlueSymbol)
    .resize(appleInner, appleInner, { fit: 'contain', background: WHITE })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: appleSize,
      height: appleSize,
      channels: 4,
      background: WHITE,
    },
  })
    .composite([{ input: appleSymbol, gravity: 'center' }])
    .png()
    .toFile(path.join(publicIconsDir, 'apple-touch-icon.png'));

  // 3. icon-192.png and icon-512.png (purpose "any", transparent background)
  for (const sz of [192, 512]) {
    await sharp(srcIconPath)
      .resize(sz, sz, { fit: 'contain', background: TRANSPARENT })
      .png()
      .toFile(path.join(publicIconsDir, `icon-${sz}.png`));
  }

  // 4. icon-maskable-192.png and icon-maskable-512.png (purpose "maskable"):
  // White version of symbol scaled to 70% and centred on a solid #1E3A8A square
  for (const sz of [192, 512]) {
    const innerSz = Math.round(sz * 0.7);
    const scaledWhiteSymbol = await sharp(trimmedWhiteSymbol)
      .resize(innerSz, innerSz, { fit: 'contain', background: TRANSPARENT })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: sz,
        height: sz,
        channels: 4,
        background: BRAND_BLUE,
      },
    })
      .composite([{ input: scaledWhiteSymbol, gravity: 'center' }])
      .png()
      .toFile(path.join(publicIconsDir, `icon-maskable-${sz}.png`));
  }

  console.log('Generated icons in /public/icons and copied logos to /public/brand.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
