#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')

function argumentsFrom(argv) {
  const options = { sourceDirectory: 'dist', outputPath: 'publish-review.html' }
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inlineValue] = argv[index].replace(/^--/, '').split('=', 2)
    if (!['sourceDirectory', 'liveBase', 'outputPath'].includes(key)) throw new Error(`Unknown argument: ${argv[index]}`)
    const value = inlineValue ?? argv[++index]
    if (!value) throw new Error(`Missing value for --${key}`)
    options[key] = value
  }
  return options
}

async function filesUnder(directory, base = directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(fullPath, base))
    else if (entry.isFile()) files.push({ fullPath, relativePath: path.relative(base, fullPath).split(path.sep).join('/') })
  }
  return files
}

function text(value = '') {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim()
}

function attributes(tag) {
  const result = {}
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  return result
}

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => ({ tag: match[0], attrs: attributes(match[0]) }))
}

function itemsFrom(html, pagePath) {
  const found = []
  const add = (group, label, value, status, note = '') => found.push({ group, label, value: value || 'Missing', status, note, sourcePath: pagePath })
  const metas = tags(html, 'meta').map(({ attrs }) => attrs)
  const getMeta = name => metas.find(meta => (meta.name || meta.property || meta['http-equiv'] || '').toLowerCase() === name.toLowerCase())?.content || ''
  const headTitle = text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(match => ({ level: Number(match[1]), value: text(match[2]) }))
  add('Page', 'Title', headTitle, headTitle ? 'passed' : 'attention')
  add('Page', 'Description', getMeta('description'), getMeta('description') ? 'passed' : 'attention')
  const canonical = tags(html, 'link').find(({ attrs }) => (attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical'))?.attrs.href || ''
  add('Page', 'Canonical', canonical, canonical ? 'passed' : 'attention', canonical ? '' : 'Canonical URL not declared')
  const h1 = headings.filter(item => item.level === 1).map(item => item.value).join(' · ')
  add('Page', 'H1', h1, h1 ? 'passed' : 'pending', h1 ? '' : 'Client-rendered heading needs browser review')
  for (const heading of headings.filter(item => item.level > 1)) add('Headings', `H${heading.level}`, heading.value, 'passed')

  for (const { attrs } of tags(html, 'meta')) {
    const key = attrs.property || attrs.name || ''
    if (/^(og:|twitter:)/i.test(key)) add(/twitter/i.test(key) ? 'Twitter' : 'Open Graph', key, attrs.content || '', attrs.content ? 'passed' : 'attention')
  }
  for (const { attrs } of tags(html, 'link')) {
    const rel = (attrs.rel || '').toLowerCase()
    if (rel.split(/\s+/).some(value => ['icon', 'shortcut', 'apple-touch-icon', 'mask-icon'].includes(value))) add('Icons', rel, attrs.href || '', attrs.href ? 'passed' : 'attention')
    if (rel.includes('manifest')) add('Manifest', 'Manifest URL', attrs.href || '', attrs.href ? 'passed' : 'attention')
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = attributes(`<script ${match[1]}>`)
    if ((attrs.type || '').toLowerCase() === 'application/ld+json') add('Schema', 'JSON-LD', text(match[2]).slice(0, 1200), text(match[2]) ? 'passed' : 'attention')
  }
  const robots = getMeta('robots')
  add('Crawler', 'Meta robots', robots, robots ? 'passed' : 'attention')
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = attributes(`<a ${match[1]}>`)
    if (attrs.href) add('Links', text(match[2]) || attrs['aria-label'] || attrs.href, attrs.href, 'pending', 'Destination not requested during review')
  }
  return found
}

function configuredHeaders(configText) {
  try {
    const config = JSON.parse(configText)
    return Array.isArray(config.headers) ? config.headers : []
  } catch {
    return []
  }
}

function mediaType(file) {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon' })[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

async function imageData(file) {
  const extension = path.extname(file).toLowerCase()
  if (!['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico'].includes(extension)) return null
  const bytes = await readFile(file)
  return `data:${mediaType(file)};base64,${bytes.toString('base64')}`
}

async function repositoryInventory() {
  const candidates = ['README.md', 'docs', 'scripts']
  const result = []
  for (const candidate of candidates) {
    const fullPath = path.join(projectDir, candidate)
    try {
      const stat = await import('node:fs/promises').then(fs => fs.stat(fullPath))
      if (stat.isDirectory()) result.push(...(await filesUnder(fullPath, projectDir)).map(file => ({ ...file, category: 'Repository only' })))
      else result.push({ fullPath, relativePath: candidate, category: 'Repository only' })
    } catch { /* Missing inventory paths are optional. */ }
  }
  return result
}

async function getLive(requestUrl, expectedOrigin, captureImage = false) {
  let current = requestUrl
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const url = new URL(current)
    if (url.origin !== expectedOrigin) return { requestUrl, finalURL: current, status: null, headers: {}, state: 'not-applicable', note: 'Cross-origin request or redirect skipped' }
    try {
      const response = await fetch(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000) })
      const observedHeaders = ['content-type', 'cache-control', 'x-robots-tag', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'strict-transport-security', 'referrer-policy', 'permissions-policy', 'vary', 'etag', 'last-modified', 'location']
      const headers = Object.fromEntries(observedHeaders.filter(key => response.headers.has(key)).map(key => [key, response.headers.get(key)]))
      if ([301, 302, 303, 307, 308].includes(response.status) && headers.location && redirects < 5) {
        const next = new URL(headers.location, current)
        if (next.origin === expectedOrigin) {
          await response.body?.cancel()
          current = next.href
          continue
        }
      }
      const contentType = response.headers.get('content-type') || ''
      const image = captureImage && response.ok && contentType.toLowerCase().startsWith('image/')
        ? `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
        : null
      if (!image) await response.body?.cancel()
      return { requestUrl, finalURL: response.url || current, status: response.status, headers, state: response.ok ? 'passed' : 'attention', note: response.ok ? '' : 'GET response was not successful', image }
    } catch (error) {
      return { requestUrl, finalURL: current, status: null, headers: {}, state: 'attention', note: `GET failed: ${error.message}` }
    }
  }
  return { requestUrl, finalURL: current, status: null, headers: {}, state: 'attention', note: 'Redirect limit reached' }
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2))
  const sourceDirectory = path.resolve(projectDir, options.sourceDirectory)
  const outputPath = path.resolve(projectDir, options.outputPath)
  const publishedFiles = await filesUnder(sourceDirectory)
  const htmlFiles = publishedFiles.filter(file => file.relativePath.toLowerCase().endsWith('.html'))
  const primary = htmlFiles.find(file => file.relativePath === 'index.html') || htmlFiles[0]
  const pageHtml = primary ? await readFile(primary.fullPath, 'utf8') : ''
  const items = primary ? itemsFrom(pageHtml, primary.fullPath) : []
  const published = publishedFiles.map(file => ({ ...file, category: 'Published' }))
  const repositoryOnly = await repositoryInventory()
  const configPath = path.join(projectDir, 'vercel.json')
  let headersConfig = []
  try { headersConfig = configuredHeaders(await readFile(configPath, 'utf8')) } catch { /* No repository header config. */ }
  const robotsFile = publishedFiles.find(file => file.relativePath === 'robots.txt')
  if (robotsFile) items.push({ group: 'Crawler', label: 'robots.txt', value: (await readFile(robotsFile.fullPath, 'utf8')).trim(), status: 'passed', sourcePath: robotsFile.fullPath })
  else items.push({ group: 'Crawler', label: 'robots.txt', value: 'Not present in publication files', status: 'attention', sourcePath: sourceDirectory })
  items.push({ group: 'Headers', label: 'Configured response headers', value: headersConfig.length ? JSON.stringify(headersConfig) : 'No Vercel header rules found', status: headersConfig.length ? 'passed' : 'pending', sourcePath: configPath, note: 'Configuration is not a live response' })

  const manifestLink = tags(pageHtml, 'link').find(({ attrs }) => (attrs.rel || '').includes('manifest'))?.attrs.href
  if (manifestLink) {
    const manifestPath = path.join(sourceDirectory, decodeURIComponent(new URL(manifestLink, 'https://local.invalid').pathname).replace(/^\//, ''))
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      items.push({ group: 'Manifest', label: 'Manifest details', value: JSON.stringify({ name: manifest.name, short_name: manifest.short_name, theme_color: manifest.theme_color, background_color: manifest.background_color, icons: manifest.icons }, null, 2), status: 'passed', sourcePath: manifestPath })
    } catch { items.push({ group: 'Manifest', label: 'Manifest details', value: 'Manifest could not be read from publication files', status: 'attention', sourcePath: manifestPath }) }
  } else items.push({ group: 'Manifest', label: 'Manifest details', value: 'No manifest linked', status: 'not-applicable', sourcePath: primary?.fullPath || sourceDirectory })

  const manual = ['Publishing dashboard and deployment state', 'Site owner and domain settings', 'Search provider verification', 'Manual checks: forms, interaction, mobile, accessibility, and live redirects']
  for (const label of manual) items.push({ group: 'Manual checks', label, value: 'Pending owner review', status: 'pending', sourcePath: '' })

  let live = []
  let livePreview = null
  if (options.liveBase) {
    const base = new URL(options.liveBase)
    const eligible = publishedFiles.filter(file => /\.(html|css|js|mjs|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|json|xml|txt|webmanifest|avif)$/i.test(file.relativePath))
    live = await Promise.all(eligible.map(file => getLive(new URL(file.relativePath.split('/').map(encodeURIComponent).join('/'), `${base.href.replace(/\/?$/, '/')}`).href, base.origin)))
    for (const check of live) items.push({ group: 'Live GET', label: new URL(check.requestUrl).pathname, value: `HTTP ${check.status ?? 'unavailable'} · finalURL ${check.finalURL} · ${JSON.stringify(check.headers)}`, status: check.state, sourcePath: '' , note: check.note })
    const ogImageUrl = tags(pageHtml, 'meta').map(({ attrs }) => attrs).find(meta => meta.property === 'og:image')?.content
    if (ogImageUrl) {
      const imageUrl = new URL(ogImageUrl, base)
      if (imageUrl.origin === base.origin && ['http:', 'https:'].includes(imageUrl.protocol)) {
        livePreview = await getLive(imageUrl.href, base.origin, true)
        items.push({ group: 'Live GET', label: 'Open Graph image', value: `HTTP ${livePreview.status ?? 'unavailable'} · finalURL ${livePreview.finalURL} · ${JSON.stringify(livePreview.headers)}`, status: livePreview.state, sourcePath: '', note: livePreview.note })
      }
    }
  } else items.push({ group: 'Live GET', label: 'Live pages and assets', value: 'No liveBase supplied', status: 'pending', sourcePath: '' })

  let publicationCommit = 'Pending'
  try { publicationCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'Pending' } catch { /* Source may not be in a Git worktree. */ }
  const ogImage = tags(pageHtml, 'meta').map(({ attrs }) => attrs).find(meta => meta.property === 'og:image')?.content
  let preview = null
  if (ogImage) {
    const local = publishedFiles.find(file => `/${file.relativePath}` === new URL(ogImage, 'https://local.invalid').pathname || file.relativePath === ogImage)
    if (local) preview = { title: text(tags(pageHtml, 'meta').find(({ attrs }) => attrs.property === 'og:title')?.attrs.content || (primary ? path.basename(primary.relativePath) : 'Publication')), image: await imageData(local.fullPath), sourcePath: local.fullPath, sourceHref: pathToFileURL(local.fullPath).href, imageName: local.relativePath }
    else if (livePreview?.image) preview = { title: text(tags(pageHtml, 'meta').find(({ attrs }) => attrs.property === 'og:title')?.attrs.content || (primary ? path.basename(primary.relativePath) : 'Publication')), image: livePreview.image, sourcePath: livePreview.finalURL, sourceHref: livePreview.finalURL, imageName: new URL(livePreview.finalURL).pathname.split('/').pop() || 'Open Graph image' }
  }
  const docs = [...repositoryOnly, ...published].map(file => ({ path: file.relativePath, category: file.category, href: pathToFileURL(file.fullPath).href }))
  const previewImages = await Promise.all(published.filter(file => /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(file.relativePath)).map(async file => ({ path: file.relativePath, href: pathToFileURL(file.fullPath).href, image: await imageData(file.fullPath) })))
  for (const item of items) if (item.sourcePath) item.sourceHref = pathToFileURL(item.sourcePath).href
  const report = { generatedAt: new Date().toISOString(), sourceDirectory, liveBase: options.liveBase || '', publicationCommit, items, docs, previewImages, publishedCount: published.length, repositoryOnlyCount: repositoryOnly.length, preview }
  const template = await readFile(path.join(scriptDir, 'publish-review.html'), 'utf8')
  const safeJson = JSON.stringify(report).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  await writeFile(outputPath, template.replace('/*REPORT_DATA*/null', safeJson))
  console.log(`Review written: ${outputPath}`)
  console.log(`Publication commit: ${publicationCommit}`)
  console.log(`Published files: ${published.length}; repository-only files: ${repositoryOnly.length}; review items: ${items.length}`)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
