import { readFile, writeFile } from 'node:fs/promises'
import type { AppSettings } from '@ensp-assistant/shared'
import { ensureDataDir, settingsFile } from './paths.js'

const defaults: AppSettings = {
  labRoot: 'D:\\实验记录',
  enspExecutable: '',
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return {
    labRoot: settings.labRoot?.trim() || defaults.labRoot,
    enspExecutable: settings.enspExecutable?.trim() || defaults.enspExecutable,
  }
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsFile, 'utf8')
    return normalizeSettings({ ...defaults, ...JSON.parse(raw) })
  }
  catch {
    return defaults
  }
}

export async function writeSettings(settings: AppSettings): Promise<AppSettings> {
  await ensureDataDir()
  const next = normalizeSettings(settings)
  await writeFile(settingsFile, JSON.stringify(next, null, 2), 'utf8')
  return next
}
