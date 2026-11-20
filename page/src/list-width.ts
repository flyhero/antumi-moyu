export const LIST_WIDTH_DEFAULT = 320
export const LIST_WIDTH_MIN = 240
export const LIST_WIDTH_MAX = 480
export const LIST_WIDTH_STEP = 16
// A narrow page keeps room for the thread. The sidebar's max-width uses the same share.
const LIST_WIDTH_SHARE = 0.4

export function listWidthLimit(pageWidth: number): number {
  return Math.max(LIST_WIDTH_MIN, Math.min(LIST_WIDTH_MAX, Math.floor(pageWidth * LIST_WIDTH_SHARE)))
}

export function clampListWidth(width: number, pageWidth: number): number {
  return Math.round(Math.min(listWidthLimit(pageWidth), Math.max(LIST_WIDTH_MIN, width)))
}

export function readListWidth(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= LIST_WIDTH_MIN && value <= LIST_WIDTH_MAX ? value : LIST_WIDTH_DEFAULT
}
