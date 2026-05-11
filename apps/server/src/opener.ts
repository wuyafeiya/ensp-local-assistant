import { execFile } from 'node:child_process'
import { platform } from 'node:os'
import { promisify } from 'node:util'
import type { OpenLabResult } from '@ensp-assistant/shared'

const execFileAsync = promisify(execFile)
const deviceStartDelayMs = 4500

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

function tokenizeCommand(command: string): string[] {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, '')) ?? []
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function runAutoStartHook(command: string, topologyFile: string): Promise<boolean> {
  const parts = tokenizeCommand(command).map(part => part.replaceAll('{topology}', topologyFile))
  const [executable, ...args] = parts
  if (!executable)
    return false

  await wait(deviceStartDelayMs)
  await execFileAsync(executable, args)
  return true
}

export async function openTopology(
  topologyFile: string,
  enspExecutable: string,
  options: { autoStartDevices: boolean, autoStartCommand: string },
): Promise<OpenLabResult> {
  if (topologyFile.startsWith('demo://'))
    return { opened: false, autoStartAttempted: false, autoStartStarted: false, message: 'Demo labs cannot be opened in eNSP.' }

  if (enspExecutable) {
    await execFileAsync(enspExecutable, [topologyFile])
  }
  else {
    await openLocalPath(topologyFile)
  }

  if (!options.autoStartDevices) {
    return {
      opened: true,
      autoStartAttempted: false,
      autoStartStarted: false,
      message: 'Topology opened.',
    }
  }

  if (!options.autoStartCommand) {
    return {
      opened: true,
      autoStartAttempted: true,
      autoStartStarted: false,
      message: 'Topology opened. Auto-start needs ENSP_AUTO_START_COMMAND or an auto-start script configured on this machine.',
    }
  }

  await runAutoStartHook(options.autoStartCommand, topologyFile)
  return {
    opened: true,
    autoStartAttempted: true,
    autoStartStarted: true,
    message: 'Topology opened and auto-start hook was triggered.',
  }
}
