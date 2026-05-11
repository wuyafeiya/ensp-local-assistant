import { readFile, writeFile } from 'node:fs/promises'
import type { AppSettings } from '@ensp-assistant/shared'
import { ensureDataDir, settingsFile } from './paths.js'

const defaults: AppSettings = {
  labRoot: '',
  enspExecutable: '',
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsFile, 'utf8')
    return { ...defaults, ...JSON.parse(raw) }
  }
  catch {
    return defaults
  }
}

export async function writeSettings(settings: AppSettings): Promise<AppSettings> {
  await ensureDataDir()
  const next = {
    labRoot: settings.labRoot.trim(),
    enspExecutable: settings.enspExecutable.trim(),
  }
  await writeFile(settingsFile, JSON.stringify(next, null, 2), 'utf8')
  return next
}
