import type { AppSettings, ChatMessage, CloseLabResult, FaultInjectionResult, LabChatResult, LabChatStatus, LabProject, OpenLabResult, RuntimeState, TopologyLayoutNode } from '@ensp-assistant/shared'

interface ChatStreamHandlers {
  onModel?: (model: string) => void
  onDelta?: (delta: string) => void
  onDone?: (result: LabChatResult) => void
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  const payload = await response.json()
  if (!response.ok)
    throw new Error(payload.error ?? 'Request failed')

  return payload.data
}

export function getSettings() {
  return request<AppSettings>('/api/settings')
}

export function updateSettings(settings: AppSettings) {
  return request<AppSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export function getLabs() {
  return request<LabProject[]>('/api/labs')
}

export function getRuntimeState() {
  return request<RuntimeState>('/api/runtime-state')
}

export function clearRuntimeState() {
  return request<RuntimeState>('/api/runtime-state', {
    method: 'DELETE',
  })
}

export function openLab(labId: string) {
  return request<OpenLabResult>(`/api/labs/${labId}/open`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function closeLab(labId: string) {
  return request<CloseLabResult>(`/api/labs/${labId}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function openLabConfigs(labId: string) {
  return request<{ opened: boolean, message: string }>(`/api/labs/${labId}/open-configs`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function saveLabLayout(labId: string, nodes: TopologyLayoutNode[]) {
  return request<LabProject>(`/api/labs/${labId}/layout`, {
    method: 'POST',
    body: JSON.stringify({ nodes }),
  })
}

export function chatWithLab(labId: string, messages: ChatMessage[]) {
  return request<LabChatResult>(`/api/labs/${labId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages }),
  })
}

function handleStreamEvent(event: string, data: string, handlers: ChatStreamHandlers): LabChatResult | null {
  if (!data)
    return null
  const payload = JSON.parse(data)
  if (event === 'model' && typeof payload.model === 'string')
    handlers.onModel?.(payload.model)
  if (event === 'delta' && typeof payload.delta === 'string')
    handlers.onDelta?.(payload.delta)
  if (event === 'done') {
    const result = payload as LabChatResult
    handlers.onDone?.(result)
    return result
  }
  if (event === 'error')
    throw new Error(payload.error ?? 'AI stream failed')
  return null
}

export async function streamChatWithLab(labId: string, messages: ChatMessage[], handlers: ChatStreamHandlers = {}): Promise<LabChatResult> {
  const response = await fetch(`/api/labs/${labId}/chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok) {
    const payload = await response.json()
    throw new Error(payload.error ?? 'AI stream failed')
  }

  if (!response.body)
    throw new Error('AI stream did not include a response body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let doneResult: LabChatResult | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split(/\n\n/)
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      const event = /^event:\s*(.+)$/m.exec(chunk)?.[1]?.trim() ?? 'message'
      const data = chunk
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('\n')

      doneResult = handleStreamEvent(event, data, handlers) ?? doneResult
    }
  }

  if (!doneResult)
    throw new Error('AI stream ended before completion.')

  return doneResult
}

export function getLabChatStatus(labId: string) {
  return request<LabChatStatus>(`/api/labs/${labId}/chat-status`)
}

export function injectFault(labId: string) {
  return request<FaultInjectionResult>(`/api/labs/${labId}/inject-fault`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
