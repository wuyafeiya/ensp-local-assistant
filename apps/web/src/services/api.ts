import type { AppSettings, LabProject } from '@ensp-assistant/shared'

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

export function openLab(labId: string) {
  return request<{ opened: boolean, message: string }>(`/api/labs/${labId}/open`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
