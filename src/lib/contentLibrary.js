import { supabase } from './supabase'
import { filesToSlideImages } from './importSlides'

// Content Library imports: PDFs and images only, organised into folders (media_folders).
// Everything is stored as compressed slide JPEGs:
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
export async function saveImport(userId, group, name, onProgress, folderId = null) {
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
    ...(folderId ? { folder_id: folderId } : {}),
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

// ─── Folders ──────────────────────────────────────────────────────────────────

// Files and folders for the library. Folders come back [] if the folders table isn't set up yet.
export async function loadLibrary(userId) {
  const [it, fo] = await Promise.all([
    supabase.from('media_items').select('*').eq('user_id', userId).in('type', ['image', 'presentation']).order('created_at', { ascending: false }),
    supabase.from('media_folders').select('*').eq('user_id', userId).order('name'),
  ])
  return { items: it.data || [], folders: fo.error ? [] : (fo.data || []), foldersReady: !fo.error, error: it.error?.message || null }
}

export async function createFolder(userId, name, parentId = null) {
  const { data, error } = await supabase.from('media_folders')
    .insert({ user_id: userId, name: name.trim() || 'New Folder', parent_id: parentId || null }).select().single()
  if (error) throw new Error(/relation|does not exist|schema cache/i.test(error.message)
    ? 'Folders need a one-time database update — run the content folders SQL in Supabase.' : error.message)
  return data
}

export async function renameFolder(folder, name) {
  const { error } = await supabase.from('media_folders').update({ name }).eq('id', folder.id)
  if (error) throw new Error(error.message)
}

// Delete a folder; its files and sub-folders move up to the folder it was in.
export async function deleteFolder(folder) {
  const parent = folder.parent_id || null
  await supabase.from('media_items').update({ folder_id: parent }).eq('folder_id', folder.id)
  await supabase.from('media_folders').update({ parent_id: parent }).eq('parent_id', folder.id)
  const { error } = await supabase.from('media_folders').delete().eq('id', folder.id)
  if (error) throw new Error(error.message)
}

export async function moveItems(ids, folderId) {
  if (!ids.length) return
  const { error } = await supabase.from('media_items').update({ folder_id: folderId || null }).in('id', ids)
  if (error) throw new Error(error.message)
}

// Folder ids from the top down to `id` (for breadcrumbs).
export function folderPath(folders, id) {
  const byId = Object.fromEntries(folders.map(f => [f.id, f]))
  const path = []
  let f = byId[id]
  while (f && path.length < 20) { path.unshift(f); f = byId[f.parent_id] }
  return path
}

// `id` and every folder inside it.
export function folderAndDescendants(folders, id) {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true }
  }
  return out
}

export const itemBytes = item => Number(item?.file_size) || 0

export function formatBytes(n) {
  if (!n) return '0 MB'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// One Program item for several library files: all their slides in order, remembering where each file starts.
export function groupContent(items, title) {
  const files = []
  const images = []
  for (const it of items) {
    const slides = itemSlides(it)
    if (!slides.length) continue
    files.push({ media_id: it.id, name: it.name, start: images.length, count: slides.length })
    images.push(...slides.map(({ url, storage_path }) => ({ url, storage_path })))
  }
  if (files.length === 1 && !title) return setItemContent(items.find(i => i.id === files[0].media_id))
  return {
    media_name: (title || '').trim() || files[0]?.name || 'Content',
    media_category: 'presentation',
    images,
    files,
  }
}

// The library files a set item was made from (for re-editing).
export const contentMediaIds = content => content?.files?.length ? content.files.map(f => f.media_id) : content?.media_id ? [content.media_id] : []

// Files in name order, numbers sorted naturally (Slide 2 before Slide 10).
export const sortFiles = list => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

// Folders in tree order with their depth, for folder pickers.
export function folderOptions(folders, parentId = null, depth = 0) {
  return folders.filter(f => (f.parent_id || null) === parentId).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(f => [{ id: f.id, name: f.name, depth }, ...folderOptions(folders, f.id, depth + 1)])
}

export async function moveFolder(id, parentId) {
  const { error } = await supabase.from('media_folders').update({ parent_id: parentId || null }).eq('id', id)
  if (error) throw new Error(error.message)
}
