import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp, { type OverlayOptions } from 'sharp';

const sourceDirectory = fileURLToPath(
  new URL('../demo-assets/rich-catalog/models/', import.meta.url),
);
const outputDirectory = fileURLToPath(new URL('../../../../.local/rich-catalog/', import.meta.url));
const outputPath = fileURLToPath(
  new URL('../../../../.local/rich-catalog/model-contact-sheet.png', import.meta.url),
);
const columns = 6;
const cellWidth = 220;
const cellHeight = 250;
const imageSize = 190;

const files = (await readdir(sourceDirectory))
  .filter((fileName) => fileName.endsWith('.webp'))
  .sort((left, right) => left.localeCompare(right));
const rows = Math.ceil(files.length / columns);
const composites: OverlayOptions[] = [];

for (const [index, fileName] of files.entries()) {
  const left = (index % columns) * cellWidth;
  const top = Math.floor(index / columns) * cellHeight;
  const image = await sharp(`${sourceDirectory}/${fileName}`)
    .resize(imageSize, imageSize, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();
  composites.push({ input: image, left: left + 15, top: top + 5 });
  composites.push({
    input: Buffer.from(labelSvg(fileName.replace(/\.webp$/, ''))),
    left: left + 5,
    top: top + imageSize + 10,
  });
}

await mkdir(outputDirectory, { recursive: true });
await sharp({
  create: {
    width: columns * cellWidth,
    height: rows * cellHeight,
    channels: 3,
    background: '#f7f9fb',
  },
})
  .composite(composites)
  .png()
  .toFile(outputPath);

console.log(`Rendered ${String(files.length)} model assets to ${outputPath}.`);

function labelSvg(label: string): string {
  const safeLabel = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<svg width="210" height="45" xmlns="http://www.w3.org/2000/svg">
    <text x="105" y="19" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#0c1728">${safeLabel}</text>
  </svg>`;
}
