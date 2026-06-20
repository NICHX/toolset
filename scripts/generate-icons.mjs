import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// macOS Dock uses ~22% corner ratio, Windows taskbar icons ~8-10%
// We use 10% — balanced: macOS auto-rounds further, Windows looks native
const CORNER_RATIO = 0.1
const ICON_SIZE = 256
const TRAY_SIZE = 16

/**
 * Apply rounded corner alpha mask to RGBA pixel data.
 * Pixels outside the rounded rect get alpha=0; edge pixels get smooth transition.
 */
function applyRoundedAlpha(data, width, height, channels, radius) {
  const minX = width - 1
  const minY = height - 1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alphaIdx = (y * width + x) * channels + 3
      let dist = -1

      // Top-left
      if (x < radius && y < radius) {
        dist = Math.sqrt((x - radius + 0.5) ** 2 + (y - radius + 0.5) ** 2)
      }
      // Top-right
      else if (x >= width - radius && y < radius) {
        dist = Math.sqrt((x - (minX - radius + 0.5)) ** 2 + (y - radius + 0.5) ** 2)
      }
      // Bottom-left
      else if (x < radius && y >= height - radius) {
        dist = Math.sqrt((x - radius + 0.5) ** 2 + (y - (minY - radius + 0.5)) ** 2)
      }
      // Bottom-right
      else if (x >= width - radius && y >= height - radius) {
        dist = Math.sqrt((x - (minX - radius + 0.5)) ** 2 + (y - (minY - radius + 0.5)) ** 2)
      }

      if (dist >= 0) {
        if (dist > radius) {
          data[alphaIdx] = 0
        } else if (dist > radius - 1) {
          const aa = Math.round(255 * (1 - (dist - (radius - 1))))
          data[alphaIdx] = Math.min(data[alphaIdx], aa)
        }
      }
    }
  }
}

async function generateRoundedIcon(srcBuffer, outputPath, size) {
  const radius = Math.max(1, Math.round(size * CORNER_RATIO))

  // Resize and keep original RGBA (transparent background preserved)
  const { data, info } = await sharp(srcBuffer)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const channels = info.channels // 4 (RGBA with original alpha)

  // Apply rounded corners on alpha channel.
  // The original transparent background is preserved — no white fill.
  // The resize interpolation creates a smooth alpha gradient at the content
  // edge (alpha 0→255 over ~4px). Low-alpha pixels use RGB(0,0,0) but are
  // visually invisible (< 1% opacity). Rounded corners only affect the 4
  // corner zones within `radius` pixels from each corner.
  applyRoundedAlpha(data, width, height, channels, radius)

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(outputPath)

  console.log(`[Icons] ✓ ${path.basename(outputPath)} ${size}x${size} (r=${radius}px)`)
}

async function main() {
  const srcDir = path.join(rootDir, 'assets')
  const srcIcon = path.join(srcDir, 'icon.png')

  if (!fs.existsSync(srcIcon)) {
    console.error('[Icons] Source icon not found:', srcIcon)
    process.exit(1)
  }

  const srcBuffer = fs.readFileSync(srcIcon)
  await generateRoundedIcon(srcBuffer, srcIcon, ICON_SIZE)
  await generateRoundedIcon(srcBuffer, path.join(srcDir, 'tray-icon.png'), TRAY_SIZE)

  console.log('[Icons] ✓ All icons generated successfully')
}

main().catch((err) => {
  console.error('[Icons] Error:', err)
  process.exit(1)
})