import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const directory = process.argv[2] || '.'
const excluded = new Set(['.git','.vercel','node_modules','docs','scripts','AGENTS.md','CLAUDE.md','README.md','.gitignore','.vercelignore','vercel.json','package.json','package-lock.json','offline-assets.json','sw.js','404.html'])
async function collect(dir, base = dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collect(full, base))
    else if (entry.isFile()) files.push({ full, url: '/' + path.relative(base, full).split(path.sep).join('/') })
  }
  return files.sort((a,b) => a.url.localeCompare(b.url))
}
const files = await collect(directory)
const additional = process.argv[3] ? JSON.parse(await readFile(process.argv[3],'utf8')) : []
const assets = ['/', ...files.filter(file => file.url !== '/index.html').map(file => file.url), ...additional]
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile(file.full))
hash.update(JSON.stringify(additional))
const revision = hash.digest('hex').slice(0,12)
const sw = await readFile(path.join(directory,'sw.js'),'utf8')
await writeFile(path.join(directory,'sw.js'),sw.replace(/__REVISION__|(?<=const CACHE = '[^']+-)[a-f0-9]{12}(?=';)/,revision))
await writeFile(path.join(directory,'offline-assets.json'),JSON.stringify(assets,null,2)+'\n')
console.log(`Offline inventory: ${assets.length} resources, release ${revision}`)
