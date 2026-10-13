import { supabase } from './supabase'
import { filesToSlideImages } from './importSlides'

// Content Library imports: PDFs and images only. Everything is stored as compressed slide JPEGs:
//  - an image (or a 1-page PDF)  → media_items row, type 'image', url = the slide
//  - a PDF with several pages    → media_items row, type 'presentation' (a "slide folder"),
//                                  metadata.images = [{ url, storage_path }, …] in page order

export const ACCEPT = 'application/pdf,.pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif'

export const isAllowedFile = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || f.type.startsWith('image/')

const baseName = f => f.name.replace(/\.[^.]+$/, '')

// Read files into slide pages (blobs + preview urls), grouped per file. Rejects other file types.
export async function readImports(files, onProgress) {
  const list = Array.from(files || [])
  const bad = list.filter(f => !isAllowedFile(f))
  if (bad.length) throw new Error(`Only PDFs and images can be added (${bad.map(f => `"${f.name}"`).join(', ')} ${bad.length === 1 ? "isn't" : "aren't"}). For PowerPoint or Keynote, export to PDF first.`)
  const groups = []
  for (const file of list) {
    const pages = await filesToSlideImages([file], onProgress)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    groups.push({ file, isPdf, name: baseName(file), pages })
  }
  return groups
}

async function uploadPage(userId, folder, page, i) {
  const path = `${userId}/content/${folder}/${String(i + 1).padStart(3, '0')}.jpg`
  const { error } = await supabase.storage.from('media').upload(path, page.blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(error.message)
  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)
  return { url: publicUrl, storage_path: path }
}

// Save one group (from readImports) to the library. `name` overrides the folder / image name.
export async function saveImport(userId, group, name, onProgress) {
  const folder = crypto.randomUUID()
  const images = []
  for (let i = 0; i < group.pages.length; i++) {
    onProgress?.(i + 1, group.pages.length)
    images.push(await uploadPage(userId, folder, group.pages[i], i))
  }
  const multi = images.length > 1
  const row = {
    user_id: userId,
    name: (name || group.name).trim() || group.name,
    type: multi ? 'presentation' : 'image',
    storage_path: images[0].storage_path,
    url: images[0].url,
    file_size: group.pages.reduce((n, p) => n + (p.blob?.size || 0), 0),
    mime_type: 'image/jpeg',
    metadata: multi ? { images, pages: images.length, source: group.file.name } : { source: group.file.name },
  }
  const { data, error } = await supabase.from('media_items').insert(row).select().single()
  if (error) {
    await supabase.storage.from('media').remove(images.map(im => im.storage_path))
    throw new Error(error.message)
  }
  return data
}

// The slide images for a library item ([] for old raw files that can't be shown as slides).
export function itemSlides(item) {
  if (item?.metadata?.images?.length) return item.metadata.images
  if (item?.type === 'image' && item.url && !/\.(pdf|pptx?|key)$/i.test(item.storage_path || item.url)) {
    return [{ url: item.url, storage_path: item.storage_path }]
  }
  return []
}

export async function deleteLibraryItem(item) {
  const paths = [...new Set([item.storage_path, ...(item.metadata?.images || []).map(im => im.storage_path)].filter(Boolean))]
  if (paths.length) await supabase.storage.from('media').remove(paths)
  await supabase.from('media_items').delete().eq('id', item.id)
}

export async function renameLibraryItem(item, name) {
  const { error } = await supabase.from('media_items').update({ name }).eq('id', item.id)
  if (error) throw new Error(error.message)
}

// Set item content for a library item (slides are copied in so the set keeps working offline).
export const setItemContent = item => ({
  media_id: item.id,
  media_name: item.name,
  media_category: item.type === 'presentation' ? 'presentation' : 'image',
  images: itemSlides(item).map(({ url, storage_path }) => ({ url, storage_path })),
})
