const MAX_WIDTH = 1920
const MAX_PAGES = 150

const toBlob = (canvas, quality = 0.88) =>
  new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality))

function whiteCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w); canvas.height = Math.round(h)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

async function pdfToBlobs(file, onProgress) {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await task.promise
  const total = Math.min(doc.numPages, MAX_PAGES)
  const out = []
  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total)
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(3, MAX_WIDTH / base.width) })
    const { canvas, ctx } = whiteCanvas(viewport.width, viewport.height)
    await page.render({ canvasContext: ctx, canvas, viewport }).promise
    out.push({ blob: await toBlob(canvas), name: `${file.name.replace(/\.pdf$/i, '')} – ${i}` })
    page.cleanup()
  }
  await task.destroy()
  return out
}

async function imageToBlob(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_WIDTH / bmp.width)
  const { canvas, ctx } = whiteCanvas(bmp.width * scale, bmp.height * scale)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  return { blob: await toBlob(canvas), name: file.name.replace(/\.[^.]+$/, '') }
}

// Converts PDFs (one image per page) and images into slide-ready JPEG blobs.
export async function filesToSlideImages(files, onProgress) {
  const out = []
  for (const file of files) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      out.push(...await pdfToBlobs(file, (i, n) => onProgress?.(`${file.name}: page ${i} of ${n}`)))
    } else if (file.type.startsWith('image/')) {
      onProgress?.(file.name)
      out.push(await imageToBlob(file))
    } else {
      throw new Error(`"${file.name}" isn't a PDF or image. For PowerPoint or Keynote, export to PDF first.`)
    }
  }
  return out.map(p => ({ ...p, url: URL.createObjectURL(p.blob) }))
}
