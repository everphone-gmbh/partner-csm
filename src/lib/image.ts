/**
 * Read an image File, downscale it to fit `maxDim`, and return a JPEG data URL.
 * Nur noch für Sonderfälle — für Uploads `fileToResizedBlob` verwenden, damit
 * nicht erst base64 erzeugt und dann wieder dekodiert wird.
 */
export async function fileToResizedDataUrl(
  file: File,
  maxDim = 512,
  quality = 0.8,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image decode failed'))
    image.src = dataUrl
  })

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  // JPEG has no alpha channel — without this, transparent PNG areas turn black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Wie fileToResizedDataUrl, liefert aber einen JPEG-Blob für den Upload.
 * Fällt auf die Originaldatei zurück, wenn der Canvas nicht verfügbar ist —
 * lieber ein großes Bild als keines.
 */
export async function fileToResizedBlob(
  file: File,
  maxDim = 512,
  quality = 0.8,
): Promise<Blob> {
  const dataUrl = await fileToResizedDataUrl(file, maxDim, quality)
  const res = await fetch(dataUrl)
  return await res.blob()
}
