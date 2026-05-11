import net from 'node:net'

export interface SerialConsoleSnapshot {
  port: number
  prompt: string
  output: string
  config: string
  error: string | null
}

export interface SerialScanResult {
  scannedPorts: number[]
  consoles: SerialConsoleSnapshot[]
}

export interface SerialCommandResult {
  port: number
  output: string
}

const defaultPortRanges = [
  [2000, 2099],
  [20000, 20150],
] as const

function envPorts() {
  return (process.env.ENSP_SERIAL_PORTS ?? '')
    .split(',')
    .map(port => Number(port.trim()))
    .filter(port => Number.isInteger(port) && port > 0 && port < 65536)
}

function portsFromRanges() {
  const configured = process.env.ENSP_SERIAL_PORT_RANGES
  const ranges = configured
    ? configured.split(',').map((range) => {
        const [start, end] = range.split('-').map(value => Number(value.trim()))
        return [start, end] as const
      })
    : defaultPortRanges

  const ports: number[] = []
  for (const [start, end] of ranges) {
    if (!Number.isInteger(start) || !Number.isInteger(end))
      continue
    for (let port = Math.max(1, start); port <= Math.min(65535, end); port += 1)
      ports.push(port)
  }
  return ports
}

function uniquePorts() {
  return [...new Set([...envPorts(), ...portsFromRanges()])].sort((a, b) => a - b)
}

function cleanOutput(output: string) {
  return output
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function clip(text: string, max = 7000) {
  return text.length > max ? `${text.slice(0, max)}\n...输出已截断...` : text
}

function detectPrompt(output: string) {
  const matches = [...output.matchAll(/[<[]([A-Za-z0-9_.-]{1,64})[>\]]/g)]
  return matches.at(-1)?.[1] ?? ''
}

function extractConfig(output: string) {
  const marker = /display\s+current-configuration/i
  const index = output.search(marker)
  const config = index >= 0 ? output.slice(index) : output
  return clip(cleanOutput(config), 9000)
}

async function canConnect(port: number, timeoutMs = 180) {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const finish = (value: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function mapConcurrent<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = []
  let cursor = 0

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  }))

  return results
}

async function probeConsole(port: number): Promise<SerialConsoleSnapshot> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let output = ''
    let settled = false

    const finish = (error: string | null = null) => {
      if (settled)
        return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      const clean = clip(cleanOutput(output))
      resolve({
        port,
        prompt: detectPrompt(clean),
        output: clean,
        config: error ? '' : extractConfig(clean),
        error,
      })
    }

    socket.setEncoding('utf8')
    socket.setTimeout(3600)
    socket.on('data', (chunk) => {
      output += chunk
      if (output.length > 22000)
        output = output.slice(-22000)
    })
    socket.once('connect', () => {
      socket.write('\r\n')
      setTimeout(() => {
        socket.write('screen-length 0 temporary\r\n')
        socket.write('display current-configuration\r\n')
      }, 250)
      setTimeout(() => finish(null), 2600)
    })
    socket.once('timeout', () => finish('串口读取超时'))
    socket.once('error', error => finish(error.message))
  })
}

export async function executeConsoleCommands(port: number, commands: string[], timeoutMs = 8000): Promise<SerialCommandResult> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let output = ''
    let settled = false

    const finish = (error: Error | null = null) => {
      if (settled)
        return
      settled = true
      socket.removeAllListeners()
      socket.destroy()

      if (error) {
        reject(error)
        return
      }

      resolve({
        port,
        output: clip(cleanOutput(output), 9000),
      })
    }

    socket.setEncoding('utf8')
    socket.setTimeout(timeoutMs)
    socket.on('data', (chunk) => {
      output += chunk
      if (output.length > 24000)
        output = output.slice(-24000)
    })
    socket.once('connect', () => {
      socket.write('\r\n')
      commands.forEach((command, index) => {
        setTimeout(() => {
          socket.write(`${command}\r\n`)
        }, 180 + index * 180)
      })
      setTimeout(() => finish(null), Math.min(timeoutMs - 300, Math.max(2600, 900 + commands.length * 900)))
    })
    socket.once('timeout', () => finish(new Error('串口执行命令超时')))
    socket.once('error', error => finish(error))
  })
}

export async function scanSerialConsoles(maxProbe = 12): Promise<SerialScanResult> {
  const scannedPorts = uniquePorts()
  const openFlags = await mapConcurrent(scannedPorts, 72, port => canConnect(port))
  const openPorts = scannedPorts.filter((_port, index) => openFlags[index]).slice(0, maxProbe)
  const consoles = await mapConcurrent(openPorts, 4, port => probeConsole(port))

  return {
    scannedPorts,
    consoles: consoles.filter(Boolean),
  }
}
