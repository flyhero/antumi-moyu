import { UPLOAD_TYPES } from '../../src/community'

// What a picture becomes before it leaves the page: small enough for the host's 3 MiB call once
// in base64, and for the forum. Small ones go as they are (the forum optimizes them itself, and a
// GIF stays animated); larger ones are redrawn smaller as JPEG.
export const UPLOAD_LIMIT = 2 * 1024 * 1024
const AS_IS = 1.5 * 1024 * 1024
const EDGES = [2048, 1600, 1200]

type Upload = { name: string; type: (typeof UPLOAD_TYPES)[number]; data: string }
export class PictureError extends Error {
  constructor(readonly reason: 'not-image' | 'too-large') { super(reason) }
}

function uploadType(type: string): type is Upload['type'] {
  return UPLOAD_TYPES.some((known) => known === type)
}

export async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return btoa(text)
}

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

async function redrawn(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new PictureError('not-image') })
  try {
    for (const edge of EDGES) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) break
      // JPEG has no transparency: what was clear reads as white, as it would on the forum's page.
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.85, 0.7]) {
        const blob = await jpeg(canvas, quality)
        if (blob && blob.size <= UPLOAD_LIMIT) return blob
      }
    }
  } finally {
    bitmap.close()
  }
  throw new PictureError('too-large')
}

export async function preparePicture(file: File): Promise<Upload> {
  if (!file.type.startsWith('image/')) throw new PictureError('not-image')
  const name = file.name || 'image'
  if (uploadType(file.type) && file.size <= AS_IS) return { name, type: file.type, data: await base64Of(file) }
  // A GIF redrawn would stop moving; a large one is refused rather than flattened.
  if (file.type === 'image/gif') throw new PictureError('too-large')
  const blob = await redrawn(file)
  return { name: name.replace(/\.[a-z0-9]{1,5}$/i, '') + '.jpg', type: 'image/jpeg', data: await base64Of(blob) }
}
