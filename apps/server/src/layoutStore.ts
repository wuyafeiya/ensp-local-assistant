import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { TopologyLayoutNode, TopologyPreview } from '@ensp-assistant/shared'
import { dataDir } from './paths.js'

const layoutDir = resolve(dataDir, 'layouts')

function layoutPath(labId: string) {
  return resolve(layoutDir, `${labId.replace(/[^a-zA-Z0-9_-]/g, '')}.json`)
}

export async function applySavedLayout(labId: string, preview: TopologyPreview | null): Promise<TopologyPreview | null> {
  if (!preview)
    return preview

  try {
    const raw = await readFile(layoutPath(labId), 'utf8')
    const saved = JSON.parse(raw) as TopologyLayoutNode[]
    const positions = new Map(saved.map(node => [node.id, node]))
    return {
      ...preview,
      nodes: preview.nodes.map((node) => {
        const position = positions.get(node.id)
        return position ? { ...node, x: position.x, y: position.y } : node
      }),
    }
  }
  catch {
    return preview
  }
}

export async function saveLayout(labId: string, nodes: TopologyLayoutNode[]) {
  await mkdir(layoutDir, { recursive: true })
  const sanitized = nodes.map(node => ({
    id: node.id,
    x: Math.round(Math.max(24, Math.min(576, Number(node.x)))),
    y: Math.round(Math.max(36, Math.min(304, Number(node.y)))),
  }))
  await writeFile(layoutPath(labId), JSON.stringify(sanitized, null, 2), 'utf8')
  return sanitized
}
