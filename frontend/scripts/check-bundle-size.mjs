#!/usr/bin/env node
/**
 * 解析 Vite manifest，按首屏静态依赖统计 gzip 体积。
 * 预算（架构 5.5）：首屏 JS ≤200KB gzip，CSS ≤50KB gzip。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(root, 'dist')
const manifestPath = resolve(distDir, '.vite/manifest.json')

if (!existsSync(manifestPath)) {
  console.error(`未找到构建产物 manifest：${manifestPath}`)
  console.error('请先执行 `npm run build`。')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry)
if (entries.length === 0) {
  console.error('manifest 中没有 entry chunk。')
  process.exit(1)
}

const jsFiles = new Set()
const cssFiles = new Set()
const visited = new Set()

function collect(key) {
  if (visited.has(key)) return
  visited.add(key)
  const chunk = manifest[key]
  if (!chunk) return
  if (chunk.file && chunk.file.endsWith('.js')) {
    jsFiles.add(chunk.file)
  }
  for (const css of chunk.css ?? []) {
    cssFiles.add(css)
  }
  for (const imported of chunk.imports ?? []) {
    collect(imported)
  }
}

for (const [key] of entries) {
  collect(key)
}

function gzipSize(file) {
  const fullPath = resolve(distDir, file)
  if (!existsSync(fullPath)) return 0
  return gzipSync(readFileSync(fullPath)).byteLength
}

function sum(files) {
  let total = 0
  for (const file of files) total += gzipSize(file)
  return total
}

const jsSize = sum([...jsFiles])
const cssSize = sum([...cssFiles])
const budgets = {
  js: 200 * 1024,
  css: 50 * 1024,
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

console.log('首屏静态资源（gzip）')
console.log(`  JS : ${kb(jsSize)} / 预算 ${kb(budgets.js)} (${jsFiles.size} 个文件)`)
console.log(`  CSS: ${kb(cssSize)} / 预算 ${kb(budgets.css)} (${cssFiles.size} 个文件)`)

let failed = false
if (jsSize > budgets.js) {
  console.error(`✗ JS 超出预算 ${kb(jsSize - budgets.js)}`)
  failed = true
}
if (cssSize > budgets.css) {
  console.error(`✗ CSS 超出预算 ${kb(cssSize - budgets.css)}`)
  failed = true
}

if (failed) {
  process.exit(1)
}
console.log('✓ 包体预算通过')
