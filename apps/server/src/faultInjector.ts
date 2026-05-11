import { randomInt, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import type { FaultInjectionResult, LabProject } from '@ensp-assistant/shared'
import { ensureDataDir, faultLogFile } from './paths.js'
import { executeConsoleCommands, scanSerialConsoles, type SerialConsoleSnapshot } from './serialScanner.js'

interface FaultCandidate {
  console: SerialConsoleSnapshot
  interfaceName: string
  commands: string[]
}

interface FaultLogEntry {
  id: string
  labId: string
  labName: string
  createdAt: string
  port: number
  prompt: string
  interfaceName: string
  commands: string[]
  output: string
}

const physicalInterfacePattern = /^(?:Eth|Ethernet|GigabitEthernet|GE|Serial|Serial|Pos|XGigabitEthernet|Ten-GigabitEthernet|40GE)/i

function parseInterfaceBlocks(config: string) {
  const blocks = config
    .split(/\n#\n?/g)
    .map(block => block.trim())
    .filter(Boolean)

  return blocks.flatMap((block) => {
    const [firstLine, ...lines] = block.split('\n').map(line => line.trim())
    const match = /^interface\s+(.+)$/i.exec(firstLine)
    if (!match)
      return []
    return [{
      name: match[1],
      body: lines.join('\n'),
    }]
  })
}

function isInjectableInterface(name: string, body: string) {
  if (!physicalInterfacePattern.test(name))
    return false

  const text = `${name}\n${body}`.toLowerCase()
  return ![
    'null',
    'loopback',
    'vlanif',
    'meth',
    'already shutdown',
  ].some(keyword => text.includes(keyword)) && !/^\s*shutdown\s*$/im.test(body)
}

function buildCandidates(console: SerialConsoleSnapshot): FaultCandidate[] {
  return parseInterfaceBlocks(console.config)
    .filter(item => isInjectableInterface(item.name, item.body))
    .map(item => ({
      console,
      interfaceName: item.name,
      commands: [
        'system-view',
        `interface ${item.name}`,
        'shutdown',
        'return',
      ],
    }))
}

function labDeviceNames(lab: LabProject) {
  return new Set((lab.preview?.nodes ?? [])
    .map(node => node.name.trim().toLowerCase())
    .filter(Boolean))
}

function consoleNames(console: SerialConsoleSnapshot) {
  const sysname = /^sysname\s+(.+)$/im.exec(console.config)?.[1]?.trim() ?? ''
  return [console.prompt, sysname]
    .map(name => name.trim().toLowerCase())
    .filter(Boolean)
}

function consoleMatchesLab(console: SerialConsoleSnapshot, expectedNames: Set<string>) {
  if (expectedNames.size === 0)
    return true
  return consoleNames(console).some(name => expectedNames.has(name))
}

async function readFaultLog(): Promise<FaultLogEntry[]> {
  try {
    return JSON.parse(await readFile(faultLogFile, 'utf8')) as FaultLogEntry[]
  }
  catch {
    return []
  }
}

async function appendFaultLog(entry: FaultLogEntry) {
  await ensureDataDir()
  const entries = await readFaultLog()
  entries.push(entry)
  await writeFile(faultLogFile, JSON.stringify(entries.slice(-200), null, 2))
}

export async function injectRandomFault(lab: LabProject): Promise<FaultInjectionResult> {
  const scan = await scanSerialConsoles()
  const onlineConsoles = scan.consoles.filter(console => !console.error)
  if (onlineConsoles.length === 0) {
    throw new Error('当前没有检测到已开机设备，不能投放故障。请先启动 eNSP 设备并确认串口可连接。')
  }

  const expectedNames = labDeviceNames(lab)
  const matchedConsoles = onlineConsoles.filter(console => consoleMatchesLab(console, expectedNames))
  if (matchedConsoles.length === 0) {
    throw new Error('检测到有设备在线，但设备名和当前拓扑不匹配。为避免误投到其它拓扑，请确认当前拓扑已启动并完成 sysname 配置。')
  }

  const candidates = matchedConsoles.flatMap(buildCandidates)

  if (candidates.length === 0) {
    throw new Error('已检测到设备开机，但没有发现可投放故障的接口。请确认串口可以读取当前配置。')
  }

  const candidate = candidates[randomInt(candidates.length)]
  const commandResult = await executeConsoleCommands(candidate.console.port, candidate.commands)
  const faultId = randomUUID()

  await appendFaultLog({
    id: faultId,
    labId: lab.id,
    labName: lab.name,
    createdAt: new Date().toISOString(),
    port: candidate.console.port,
    prompt: candidate.console.prompt,
    interfaceName: candidate.interfaceName,
    commands: candidate.commands,
    output: commandResult.output,
  })

  return {
    injected: true,
    message: '已随机投放 1 个隐蔽故障。现在可以开始排查了，AI 不会主动透露具体错点。',
    faultId,
    affectedConsoleCount: 1,
  }
}
