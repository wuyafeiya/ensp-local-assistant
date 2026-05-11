import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFile = fileURLToPath(import.meta.url)
export const repoRoot = resolve(dirname(currentFile), '../../..')
export const dataDir = resolve(repoRoot, 'data')
export const settingsFile = resolve(dataDir, 'settings.json')
export const faultLogFile = resolve(dataDir, 'fault-injections.json')
export const runtimeStateFile = resolve(dataDir, 'runtime-state.json')

export async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true })
}
