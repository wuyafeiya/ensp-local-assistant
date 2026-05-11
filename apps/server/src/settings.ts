import { readFile, writeFile } from 'node:fs/promises'
import type { AppSettings } from '@ensp-assistant/shared'
import { ensureDataDir, settingsFile } from './paths.js'

const defaults: AppSettings = {
  labRoot: 'D:\\实验记录',
  enspExecutable: '',
  aiBaseUrl: process.env.ENSP_AI_BASE_URL ?? 'http://127.0.0.1:8080/v1',
  aiApiKey: process.env.ENSP_AI_API_KEY ?? 'pwd',
  aiModel: process.env.ENSP_AI_MODEL ?? 'gpt-4o-mini',
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return {
    labRoot: settings.labRoot?.trim() || defaults.labRoot,
    enspExecutable: settings.enspExecutable?.trim() || defaults.enspExecutable,
    aiBaseUrl: settings.aiBaseUrl?.trim() || defaults.aiBaseUrl,
    aiApiKey: settings.aiApiKey?.trim() || defaults.aiApiKey,
    aiModel: settings.aiModel?.trim() || defaults.aiModel,
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
