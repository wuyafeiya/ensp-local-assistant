import { execFile } from 'node:child_process'
import { basename, extname } from 'node:path'
import { platform } from 'node:os'
import { promisify } from 'node:util'
import type { OpenLabResult } from '@ensp-assistant/shared'

const execFileAsync = promisify(execFile)

export async function openLocalPath(path: string) {
  if (platform() === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', path])
  }
  else if (platform() === 'darwin') {
    await execFileAsync('open', [path])
  }
  else {
    await execFileAsync('xdg-open', [path])
  }

  return { opened: true, message: 'Local path opened with system file association.' }
}

export async function openTopology(topologyFile: string, enspExecutable: string): Promise<OpenLabResult> {
  if (topologyFile.startsWith('demo://'))
    return { opened: false, message: 'Demo labs cannot be opened in eNSP.' }

  if (enspExecutable) {
    await execFileAsync(enspExecutable, [topologyFile])
    return { opened: true, message: 'Topology opened with configured eNSP executable.' }
  }

  await openLocalPath(topologyFile)
  return { opened: true, message: 'Topology opened with system file association.' }
}

function candidateProcessNames(enspExecutable: string) {
  const configured = enspExecutable ? basename(enspExecutable) : ''
  const configuredExe = configured && extname(configured) ? configured : configured ? `${configured}.exe` : ''
  return [...new Set([
    configuredExe,
    'eNSP_Client.exe',
    'eNSP.exe',
  ].filter(Boolean))]
}

export async function closeEnsp(enspExecutable: string) {
  if (platform() !== 'win32') {
    return {
      closed: false,
      message: '当前系统不支持自动关闭 eNSP，请在 eNSP 窗口手动关闭。',
    }
  }

  const errors: string[] = []
  for (const processName of candidateProcessNames(enspExecutable)) {
    try {
      await execFileAsync('taskkill', ['/IM', processName, '/T', '/F'])
      return {
        closed: true,
        message: `已关闭 eNSP 进程：${processName}`,
      }
    }
    catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    closed: false,
    message: `没有找到可关闭的 eNSP 进程。${errors.at(-1) ?? ''}`.trim(),
  }
}
