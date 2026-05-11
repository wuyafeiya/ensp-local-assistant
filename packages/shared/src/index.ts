export type LabStatus = 'ready' | 'missing-topology' | 'demo'
export type TopologyDeviceType = 'router' | 'switch' | 'pc' | 'server' | 'cloud' | 'firewall' | 'unknown'
export type TopologyParseStatus = 'ready' | 'partial' | 'failed' | 'demo'

export interface AppSettings {
  labRoot: string
  enspExecutable: string
}

export interface TopologyPreviewNode {
  id: string
  name: string
  type: TopologyDeviceType
  model: string
  x: number
  y: number
}

export interface TopologyPreviewLink {
  id: string
  sourceId: string
  targetId: string
  sourceInterface: string
  targetInterface: string
}

export interface TopologyPreview {
  parseStatus: TopologyParseStatus
  nodes: TopologyPreviewNode[]
  links: TopologyPreviewLink[]
  warnings: string[]
}

export interface LabProject {
  id: string
  name: string
  path: string
  topologyFile: string | null
  readmeFile: string | null
  configCount: number
  tags: string[]
  difficulty: 'starter' | 'intermediate' | 'advanced' | 'unknown'
  protocol: string
  deviceCount: number
  linkCount: number
  modifiedAt: string | null
  status: LabStatus
  preview: TopologyPreview | null
}

export interface ApiEnvelope<T> {
  data: T
}
