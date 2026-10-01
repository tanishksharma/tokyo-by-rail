import { cp, readdir, rm, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const root = process.cwd()
const excludes = new Set(['.git','.vercel','node_modules','docs','scripts','dist','AGENTS.md','CLAUDE.md','README.md','.gitignore','.vercelignore','vercel.json','package.json','package-lock.json','offline-remote.json','offline-assets.json','supabase'])
await rm('dist',{recursive:true,force:true})
await mkdir('dist')
for (const entry of await readdir(root,{withFileTypes:true})) {
  if (excludes.has(entry.name) || entry.name.startsWith('.')) continue
  await cp(entry.name,`dist/${entry.name}`,{recursive:true})
}
const args=['scripts/build-offline.mjs','dist']
if (process.argv[2]) args.push(process.argv[2])
execFileSync(process.execPath,args,{stdio:'inherit'})
