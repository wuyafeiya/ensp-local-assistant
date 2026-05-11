import { readFile, writeFile } from 'node:fs/promises'
import type { RuntimeState } from '@ensp-assistant/shared'
import { ensureDataDir, runtimeStateFile } from './paths.js'

const defaults: RuntimeState = {
  activeOpenedLabId: '',
  activeOpenedAt: null,
}

function normalizeRuntimeState(value: Partial<RuntimeState>): RuntimeState {
  return {
    activeOpenedLabId: typeof value.activeOpenedLabId === 'string' ? value.activeOpenedLabId : '',
    activeOpenedAt: typeof value.activeOpenedAt === 'string' ? value.activeOpenedAt : null,
  }
}

export async function readRuntimeState(): Promise<RuntimeState> {
  try {
    const raw = await readFile(runtimeStateFile, 'utf8')
    return normalizeRuntimeState(JSON.parse(raw) as Partial<RuntimeState>)
  }
  catch {
    return { ...defaults }
  }
}

export async function writeRuntimeState(state: RuntimeState): Promise<RuntimeState> {
  await ensureDataDir()
  const next = normalizeRuntimeState(state)
  await writeFile(runtimeStateFile, JSON.stringify(next, null, 2))
  return next
}

export async function setActiveOpenedLab(labId: string): Promise<RuntimeState> {
  return await writeRuntimeState({
    activeOpenedLabId: labId,
    activeOpenedAt: new Date().toISOString(),
  })
}
