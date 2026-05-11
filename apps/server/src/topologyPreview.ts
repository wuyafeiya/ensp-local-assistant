import { readFile } from 'node:fs/promises'
import { XMLParser } from 'fast-xml-parser'
import type { TopologyDeviceType, TopologyPreview, TopologyPreviewLink, TopologyPreviewNode } from '@ensp-assistant/shared'

type UnknownRecord = Record<string, unknown>

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value)
    return []
  return Array.isArray(value) ? value : [value]
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function valueAsString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null)
    return fallback
  return String(value)
}

function valueAsNumber(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function getAny(record: UnknownRecord, keys: string[]): unknown {
  const normalized = new Map(Object.keys(record).map(key => [key.toLowerCase(), key]))
  for (const key of keys) {
    const exact = record[key]
    if (exact !== undefined)
      return exact
    const actualKey = normalized.get(key.toLowerCase())
    if (actualKey)
      return record[actualKey]
  }
  return undefined
}

function collectByKey(value: unknown, matcher: (key: string) => boolean, results: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value)
      collectByKey(item, matcher, results)
    return results
  }

  if (!isRecord(value))
    return results

  for (const [key, child] of Object.entries(value)) {
    if (matcher(key))
      results.push(...asArray(child))

    collectByKey(child, matcher, results)
  }

  return results
}

function inferType(model: string, name: string): TopologyDeviceType {
  const text = `${model} ${name}`.toLowerCase()
  if (text.includes('cloud'))
    return 'cloud'
  if (text.includes('firewall') || text.includes('usg'))
    return 'firewall'
  if (text.includes('server'))
    return 'server'
  if (text.includes('pc') || text.includes('host') || text.includes('client'))
    return 'pc'
  if (text.includes('s57') || text.includes('s37') || text.includes('switch') || text.includes('sw'))
    return 'switch'
  if (text.includes('ar') || text.includes('router') || /^r\d+/i.test(name))
    return 'router'
  return 'unknown'
}

function pickDeviceId(record: UnknownRecord, index: number): string {
  return valueAsString(getAny(record, [
    'id',
    'devId',
    'deviceId',
    'uuid',
    'guid',
    'name',
    'devName',
  ]), `node-${index + 1}`)
}

function parseNodes(parsed: unknown): TopologyPreviewNode[] {
  const rawDevices = collectByKey(parsed, key => ['dev', 'device', 'node'].includes(key.toLowerCase()))
    .filter(isRecord)

  return rawDevices.map((record, index) => {
    const id = pickDeviceId(record, index)
    const name = valueAsString(getAny(record, ['name', 'devName', 'label', 'caption']), `Device ${index + 1}`)
    const model = valueAsString(getAny(record, ['model', 'type', 'devType', 'subType', 'deviceType']), 'Unknown')
    const x = valueAsNumber(getAny(record, ['x', 'left', 'posX', 'locX', 'locationX']))
    const y = valueAsNumber(getAny(record, ['y', 'top', 'posY', 'locY', 'locationY']))

    return {
      id,
      name,
      type: inferType(model, name),
      model,
      x: x ?? Number.NaN,
      y: y ?? Number.NaN,
    }
  })
}

function parseLinks(parsed: unknown, nodeIds: Set<string>): TopologyPreviewLink[] {
  const rawLinks = collectByKey(parsed, key => ['interfacepair', 'line', 'link', 'connection'].includes(key.toLowerCase()))
    .filter(isRecord)

  const links: TopologyPreviewLink[] = []

  rawLinks.forEach((record, index) => {
    const sourceId = valueAsString(getAny(record, [
      'srcDeviceId',
      'srcDevId',
      'srcId',
      'sourceId',
      'startDeviceId',
      'startDev',
      'from',
      'device1',
    ]))
    const targetId = valueAsString(getAny(record, [
      'dstDeviceId',
      'destDeviceId',
      'dstDevId',
      'dstId',
      'targetId',
      'endDeviceId',
      'endDev',
      'to',
      'device2',
    ]))

    if (!sourceId || !targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId))
      return

    links.push({
      id: valueAsString(getAny(record, ['id', 'lineId', 'linkId']), `link-${index + 1}`),
      sourceId,
      targetId,
      sourceInterface: valueAsString(getAny(record, ['srcInterface', 'srcIfName', 'sourceInterface', 'startInterface']), ''),
      targetInterface: valueAsString(getAny(record, ['dstInterface', 'destInterface', 'dstIfName', 'targetInterface', 'endInterface']), ''),
    })
  })

  return links
}

function applyAutoLayout(nodes: TopologyPreviewNode[]): TopologyPreviewNode[] {
  if (!nodes.length)
    return nodes

  const hasUsableCoordinates = nodes.some(node => Number.isFinite(node.x) && Number.isFinite(node.y))
  if (hasUsableCoordinates) {
    return nodes.map((node, index) => ({
      ...node,
      x: Number.isFinite(node.x) ? node.x : 160 + (index % 4) * 150,
      y: Number.isFinite(node.y) ? node.y : 120 + Math.floor(index / 4) * 120,
    }))
  }

  const centerX = 300
  const centerY = 160
  const radiusX = Math.max(110, Math.min(210, nodes.length * 34))
  const radiusY = Math.max(72, Math.min(122, nodes.length * 22))

  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2
    return {
      ...node,
      x: Math.round(centerX + Math.cos(angle) * radiusX),
      y: Math.round(centerY + Math.sin(angle) * radiusY),
    }
  })
}

function normalizeBounds(nodes: TopologyPreviewNode[]): TopologyPreviewNode[] {
  if (!nodes.length)
    return nodes

  const xs = nodes.map(node => node.x)
  const ys = nodes.map(node => node.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)

  return nodes.map(node => ({
    ...node,
    x: Math.round(72 + ((node.x - minX) / width) * 456),
    y: Math.round(62 + ((node.y - minY) / height) * 206),
  }))
}

export async function buildTopologyPreview(filePath: string): Promise<TopologyPreview> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: true,
      trimValues: true,
    })
    const parsed = parser.parse(raw)
    const nodes = normalizeBounds(applyAutoLayout(parseNodes(parsed))).slice(0, 18)
    const links = parseLinks(parsed, new Set(nodes.map(node => node.id))).slice(0, 28)
    const warnings: string[] = []

    if (!nodes.length)
      warnings.push('未识别到设备')
    if (!links.length && nodes.length > 1)
      warnings.push('未识别到完整链路')

    return {
      parseStatus: warnings.length ? 'partial' : 'ready',
      nodes,
      links,
      warnings,
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '拓扑解析失败'
    return {
      parseStatus: 'failed',
      nodes: [],
      links: [],
      warnings: [message],
    }
  }
}
