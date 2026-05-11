import { execFile } from 'node:child_process'
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
