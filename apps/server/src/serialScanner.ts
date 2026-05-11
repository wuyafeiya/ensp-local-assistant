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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function hasPager(output: string) {
  return /[-\s]+More[-\s]+/i.test(output)
}

function hasRecentPager(output: string) {
  return hasPager(output.slice(-800))
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
      const text = String(chunk)
      output += text
      if (hasPager(text))
        socket.write('q')
      if (output.length > 22000)
        output = output.slice(-22000)
    })
    socket.once('connect', async () => {
      try {
        socket.write('\r\n')
        await sleep(300)
        if (hasRecentPager(output)) {
          socket.write('q')
          await sleep(240)
        }
        socket.write('\u0003')
        await sleep(160)
        socket.write('\r\n')
        await sleep(180)
        socket.write('screen-length 0 temporary\r\n')
        await sleep(260)
        socket.write('display current-configuration\r\n')
        await sleep(2600)
        finish(null)
      }
      catch {
        finish('串口读取失败')
      }
    })
    socket.once('timeout', () => finish('串口读取超时'))
    socket.once('error', error => finish(error.message))
  })
}

function expandInteractiveCommands(commands: string[]) {
  const expanded: string[] = []
  commands.forEach((command, index) => {
    expanded.push(command)
    if (/^save(?:\s|$)/i.test(command) && !/^(?:y|yes)$/i.test(commands[index + 1] ?? ''))
      expanded.push('y')
  })
  return expanded
}

export async function executeConsoleCommands(port: number, commands: string[], timeoutMs = 25000): Promise<SerialCommandResult> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let output = ''
    let settled = false
    let timeoutHandle: NodeJS.Timeout | null = null

    const finish = (error: Error | null = null) => {
      if (settled)
        return
      settled = true
      if (timeoutHandle)
        clearTimeout(timeoutHandle)
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
      const text = String(chunk)
      output += text
      if (hasPager(text))
        socket.write('q')
      if (output.length > 24000)
        output = output.slice(-24000)
    })
    socket.once('connect', async () => {
      timeoutHandle = setTimeout(() => finish(new Error('串口执行命令超时')), timeoutMs)

      try {
        socket.write('\r\n')
        await sleep(320)
        if (hasRecentPager(output)) {
          socket.write('q')
          await sleep(280)
        }

        socket.write('\u0003')
        await sleep(180)
        socket.write('\r\n')
        await sleep(180)
        socket.write('return\r\n')
        await sleep(360)
        socket.write('screen-length 0 temporary\r\n')
        await sleep(420)

        for (const command of expandInteractiveCommands(commands)) {
          socket.write(`${command}\r\n`)
          await sleep(/^(?:y|yes)$/i.test(command) ? 900 : 640)
          if (hasRecentPager(output)) {
            socket.write('q')
            await sleep(260)
          }
        }

        await sleep(900)
        finish(null)
      }
      catch (error) {
        finish(error instanceof Error ? error : new Error('串口执行命令失败'))
      }
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
