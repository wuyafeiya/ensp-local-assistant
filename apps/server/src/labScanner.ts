import { readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import type { LabProject } from '@ensp-assistant/shared'
import { demoLabs } from './demo.js'

export const labIndex = new Map<string, LabProject>()

function idForPath(path: string): string {
  return createHash('sha1').update(path).digest('hex').slice(0, 16)
}

function inferProtocol(name: string): string {
  const text = name.toLowerCase()
  const protocols = ['ospf', 'bgp', 'vlan', 'nat', 'acl', 'dhcp', 'stp', 'vrrp', 'isis']
  return protocols.find(item => text.includes(item))?.toUpperCase() ?? 'General'
}

function inferDifficulty(name: string): LabProject['difficulty'] {
  const text = name.toLowerCase()
  if (text.includes('综合') || text.includes('advanced'))
    return 'advanced'
  if (text.includes('进阶') || text.includes('intermediate'))
    return 'intermediate'
  if (text.includes('基础') || text.includes('入门') || text.includes('starter'))
    return 'starter'
  return 'unknown'
}

async function findFiles(root: string, depth = 2): Promise<string[]> {
  if (depth < 0)
    return []
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await findFiles(fullPath, depth - 1))
    }
    else {
      files.push(fullPath)
    }
  }
  return files
}

async function projectFromPath(path: string): Promise<LabProject> {
  const info = await stat(path)
  const isDirectory = info.isDirectory()
  const files = isDirectory ? await findFiles(path, 2) : [path]
  const topologyFile = files.find(file => extname(file).toLowerCase() === '.topo') ?? null
  const readmeFile = files.find(file => /^readme\.md$/i.test(basename(file))) ?? null
  const configCount = files.filter(file => ['.cfg', '.txt', '.vrpcfg'].includes(extname(file).toLowerCase())).length
  const name = basename(path).replace(/\.topo$/i, '')
  const protocol = inferProtocol(name)

  return {
    id: idForPath(path),
    name,
    path,
    topologyFile,
    readmeFile,
    configCount,
    tags: [protocol, isDirectory ? 'Folder' : 'File'].filter(Boolean),
    difficulty: inferDifficulty(name),
    protocol,
    deviceCount: 0,
    linkCount: 0,
    modifiedAt: info.mtime.toISOString(),
    status: topologyFile ? 'ready' : 'missing-topology',
  }
}

export async function scanLabs(labRoot: string): Promise<LabProject[]> {
  labIndex.clear()

  if (!labRoot)
    return demoLabs

  try {
    const rootInfo = await stat(labRoot)
    const candidates = rootInfo.isDirectory()
      ? (await readdir(labRoot, { withFileTypes: true }))
          .filter(entry => entry.isDirectory() || extname(entry.name).toLowerCase() === '.topo')
          .map(entry => join(labRoot, entry.name))
      : [labRoot]

    const labs = await Promise.all(candidates.map(projectFromPath))
    for (const lab of labs)
      labIndex.set(lab.id, lab)
    return labs.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  }
  catch {
    return demoLabs
  }
}
