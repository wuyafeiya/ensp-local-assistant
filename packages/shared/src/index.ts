export type LabStatus = 'ready' | 'missing-topology' | 'demo'

export interface AppSettings {
  labRoot: string
  enspExecutable: string
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
}

export interface ApiEnvelope<T> {
  data: T
}
