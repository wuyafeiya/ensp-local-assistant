import type { AppSettings, LabProject, TopologyDeviceType, TopologyPreview, TopologyPreviewLink, TopologyPreviewNode } from '@ensp-assistant/shared'
import { applyReadableLayout } from './topologyPreview.js'

type AiTopologyResponse = {
  nodes?: Array<{
    id?: unknown
    name?: unknown
    type?: unknown
    model?: unknown
  }>
  links?: Array<{
    sourceId?: unknown
    targetId?: unknown
    sourceInterface?: unknown
    targetInterface?: unknown
    cableType?: unknown
    isSerial?: unknown
  }>
}

const validTypes: TopologyDeviceType[] = ['router', 'switch', 'pc', 'server', 'cloud', 'firewall', 'unknown']

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null)
    return fallback
  return String(value)
}

function normalizeType(value: unknown): TopologyDeviceType {
  const text = asString(value, 'unknown').toLowerCase()
  return validTypes.includes(text as TopologyDeviceType) ? text as TopologyDeviceType : 'unknown'
}

function extractJson(text: string): AiTopologyResponse {
  const trimmed = text.trim()
  if (trimmed.startsWith('{'))
    return JSON.parse(trimmed) as AiTopologyResponse

  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ?? trimmed.match(/(\{[\s\S]*\})/)
  if (!match)
    throw new Error('AI did not return JSON.')
  return JSON.parse(match[1]) as AiTopologyResponse
}

function fallbackNodes(lab: LabProject): TopologyPreviewNode[] {
  if (lab.preview?.nodes.length)
    return lab.preview.nodes

  return [
    { id: 'r1', name: 'AR1', type: 'router', model: 'AR', x: 0, y: 0 },
    { id: 'sw1', name: 'SW1', type: 'switch', model: 'Switch', x: 0, y: 0 },
    { id: 'pc1', name: 'PC1', type: 'pc', model: 'PC', x: 0, y: 0 },
  ]
}

function normalizeAiTopology(payload: AiTopologyResponse, lab: LabProject): TopologyPreview {
  const nodes = (payload.nodes ?? []).slice(0, 18).map((node, index): TopologyPreviewNode => {
    const id = asString(node.id, `ai-node-${index + 1}`).replace(/\s+/g, '-')
    return {
      id,
      name: asString(node.name, `Device ${index + 1}`),
      type: normalizeType(node.type),
      model: asString(node.model, normalizeType(node.type).toUpperCase()),
      x: 0,
      y: 0,
    }
  })

  const safeNodes = nodes.length ? nodes : fallbackNodes(lab)
  const nodeIds = new Set(safeNodes.map(node => node.id))
  const links = (payload.links ?? []).slice(0, 28).reduce<TopologyPreviewLink[]>((result, link, index) => {
    const sourceId = asString(link.sourceId)
    const targetId = asString(link.targetId)
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId) || sourceId === targetId)
      return result

    const sourceInterface = asString(link.sourceInterface)
    const targetInterface = asString(link.targetInterface)
    const cableType = asString(link.cableType)
    const serialText = `${sourceInterface} ${targetInterface} ${cableType}`.toLowerCase()

    result.push({
      id: `ai-link-${index + 1}`,
      sourceId,
      targetId,
      sourceInterface,
      targetInterface,
      cableType,
      isSerial: Boolean(link.isSerial) || serialText.includes('serial') || serialText.includes('ser') || serialText.includes('串'),
    })
    return result
  }, [])

  return {
    parseStatus: 'ai',
    nodes: applyReadableLayout(safeNodes, links),
    links,
    warnings: [],
  }
}

function buildPrompt(lab: LabProject): string {
  return [
    '你是华为 eNSP 网络实验拓扑设计助手。请根据实验名称和已有扫描摘要，生成一张更适合卡片预览的逻辑拓扑。',
    '只输出 JSON，不要 Markdown，不要解释。',
    'JSON 格式：{"nodes":[{"id":"r1","name":"AR1","type":"router","model":"AR2220"}],"links":[{"sourceId":"r1","targetId":"sw1","sourceInterface":"GE0/0/0","targetInterface":"GE0/0/1","cableType":"Ethernet","isSerial":false}]}',
    'type 只能是 router/switch/pc/server/cloud/firewall/unknown。',
    '如果实验名包含 OSPF/BGP/静态路由，优先使用 2-4 台 router；如果包含 VLAN/Trunk/STP，优先使用 switch + PC；如果包含 NAT/ACL/出口，加入 cloud/firewall/router/server。',
    'Serial/串行链路请设置 isSerial=true。',
    `实验名称：${lab.name}`,
    `协议推断：${lab.protocol}`,
    `已有设备：${lab.preview?.nodes.map(node => `${node.name}(${node.type})`).join(', ') || '无'}`,
    `已有链路数量：${lab.preview?.links.length ?? 0}`,
  ].join('\n')
}

async function requestChatCompletion(settings: AppSettings, lab: LabProject): Promise<string> {
  const baseUrl = settings.aiBaseUrl.replace(/\/+$/, '')
  const model = await resolveModel(baseUrl, settings)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You output strict JSON for network topology previews.',
          },
          {
            role: 'user',
            content: buildPrompt(lab),
          },
        ],
      }),
    })
  }
  finally {
    clearTimeout(timeout)
  }

  if (!response.ok)
    throw new Error(`AI request failed: ${response.status} ${await response.text()}`)

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content
  if (!content)
    throw new Error('AI response did not include message content.')
  return content
}

async function resolveModel(baseUrl: string, settings: AppSettings): Promise<string> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
    })
    if (!response.ok)
      return settings.aiModel

    const payload = await response.json() as { data?: Array<{ id?: string }> }
    return payload.data?.find(model => model.id)?.id ?? settings.aiModel
  }
  catch {
    return settings.aiModel
  }
}

export async function buildAiTopologyPreview(settings: AppSettings, lab: LabProject): Promise<TopologyPreview> {
  const content = await requestChatCompletion(settings, lab)
  return normalizeAiTopology(extractJson(content), lab)
}
