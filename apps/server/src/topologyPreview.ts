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

    const sourceInterface = valueAsString(getAny(record, ['srcInterface', 'srcIfName', 'sourceInterface', 'startInterface']), '')
    const targetInterface = valueAsString(getAny(record, ['dstInterface', 'destInterface', 'dstIfName', 'targetInterface', 'endInterface']), '')
    const cableType = valueAsString(getAny(record, ['lineType', 'cableType', 'type', 'linkType']), '')
    const serialText = `${sourceInterface} ${targetInterface} ${cableType}`.toLowerCase()

    links.push({
      id: valueAsString(getAny(record, ['id', 'lineId', 'linkId']), `link-${index + 1}`),
      sourceId,
      targetId,
      sourceInterface,
      targetInterface,
      cableType,
      isSerial: serialText.includes('serial') || serialText.includes('ser') || serialText.includes('串'),
    })
  })

  return links
}

function layerForNode(node: TopologyPreviewNode): number {
  if (node.type === 'cloud')
    return 0
  if (node.type === 'firewall')
    return 1
  if (node.type === 'router')
    return 2
  if (node.type === 'switch')
    return 3
  if (node.type === 'pc' || node.type === 'server')
    return 4
  return 2
}

function connectedNeighborNames(nodeId: string, links: TopologyPreviewLink[], nameById: Map<string, string>): string {
  return links
    .filter(link => link.sourceId === nodeId || link.targetId === nodeId)
    .map(link => nameById.get(link.sourceId === nodeId ? link.targetId : link.sourceId) ?? '')
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .join('|')
}

function applyReadableLayout(nodes: TopologyPreviewNode[], links: TopologyPreviewLink[]): TopologyPreviewNode[] {
  if (!nodes.length)
    return nodes

  const nameById = new Map(nodes.map(node => [node.id, node.name]))
  const layers = new Map<number, TopologyPreviewNode[]>()
  for (const node of nodes) {
    const layer = layerForNode(node)
    layers.set(layer, [...(layers.get(layer) ?? []), node])
  }

  const orderedLayers = [...layers.entries()].sort(([a], [b]) => a - b)
  const rowGap = orderedLayers.length > 1 ? 220 / (orderedLayers.length - 1) : 0

  return orderedLayers.flatMap(([, layerNodes], layerIndex) => {
    const sorted = [...layerNodes].sort((a, b) => {
      const neighborCompare = connectedNeighborNames(a.id, links, nameById)
        .localeCompare(connectedNeighborNames(b.id, links, nameById), 'zh-Hans-CN')
      return neighborCompare || a.name.localeCompare(b.name, 'zh-Hans-CN')
    })
    const xGap = sorted.length > 1 ? 456 / (sorted.length - 1) : 0
    return sorted.map((node, index) => ({
      ...node,
      x: Math.round(sorted.length === 1 ? 300 : 72 + xGap * index),
      y: Math.round(58 + rowGap * layerIndex),
    }))
  })
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
    const rawNodes = parseNodes(parsed).slice(0, 18)
    const links = parseLinks(parsed, new Set(rawNodes.map(node => node.id))).slice(0, 28)
    const nodes = applyReadableLayout(rawNodes, links)
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
