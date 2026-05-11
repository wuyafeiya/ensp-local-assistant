import { execFile } from 'node:child_process'
import { platform } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function openTopology(topologyFile: string, enspExecutable: string) {
  if (topologyFile.startsWith('demo://'))
    return { opened: false, message: 'Demo labs cannot be opened in eNSP.' }

  if (enspExecutable) {
    await execFileAsync(enspExecutable, [topologyFile])
    return { opened: true, message: 'Topology opened with configured eNSP executable.' }
  }

  if (platform() === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', topologyFile])
  }
  else if (platform() === 'darwin') {
    await execFileAsync('open', [topologyFile])
  }
  else {
    await execFileAsync('xdg-open', [topologyFile])
  }

  return { opened: true, message: 'Topology opened with system file association.' }
}
