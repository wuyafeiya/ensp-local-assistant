import { randomInt, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import type { FaultInjectionResult, LabProject } from '@ensp-assistant/shared'
import { ensureDataDir, faultLogFile } from './paths.js'
import { executeConsoleCommands, scanSerialConsoles, type SerialConsoleSnapshot } from './serialScanner.js'

interface FaultCandidate {
  console: SerialConsoleSnapshot
  interfaceName: string
  kind: string
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
  kind: string
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

function hasMeaningfulInterfaceConfig(body: string) {
  return [
    /^\s*ip address\s+/im,
    /^\s*link-protocol\s+/im,
    /^\s*port link-type\s+/im,
    /^\s*port default vlan\s+/im,
    /^\s*port trunk allow-pass vlan\s+/im,
    /^\s*ospf cost\s+/im,
    /^\s*isis enable\s+/im,
  ].some(pattern => pattern.test(body))
}

function buildInterfaceCandidates(console: SerialConsoleSnapshot): FaultCandidate[] {
  return parseInterfaceBlocks(console.config)
    .filter(item => isInjectableInterface(item.name, item.body))
    .filter(item => hasMeaningfulInterfaceConfig(item.body))
    .flatMap((item) => {
      const candidates: FaultCandidate[] = [{
        console,
        interfaceName: item.name,
        kind: 'interface-shutdown',
        commands: [
          'system-view',
          `interface ${item.name}`,
          'shutdown',
          'return',
        ],
      }]

      if (/^\s*ip address\s+/im.test(item.body)) {
        candidates.push({
          console,
          interfaceName: item.name,
          kind: 'interface-ip-removed',
          commands: [
            'system-view',
            `interface ${item.name}`,
            'undo ip address',
            'return',
          ],
        })
      }

      const defaultVlan = /^\s*port default vlan\s+(\d+)/im.exec(item.body)?.[1]
      if (defaultVlan && defaultVlan !== '1') {
        candidates.push({
          console,
          interfaceName: item.name,
          kind: 'access-vlan-changed',
          commands: [
            'system-view',
            `interface ${item.name}`,
            'port default vlan 1',
            'return',
          ],
        })
      }

      const trunkVlan = /^\s*port trunk allow-pass vlan\s+([0-9,\s-]+)/im.exec(item.body)?.[1]?.trim().split(/[\s,]+/).find(Boolean)
      if (trunkVlan) {
        candidates.push({
          console,
          interfaceName: item.name,
          kind: 'trunk-vlan-removed',
          commands: [
            'system-view',
            `interface ${item.name}`,
            `undo port trunk allow-pass vlan ${trunkVlan}`,
            'return',
          ],
        })
      }

      return candidates
    })
}

function buildStaticRouteCandidates(console: SerialConsoleSnapshot): FaultCandidate[] {
  return [...console.config.matchAll(/^ip route-static\s+(.+)$/gim)]
    .map((match): FaultCandidate => ({
      console,
      interfaceName: 'static-route',
      kind: 'static-route-removed',
      commands: [
        'system-view',
        `undo ip route-static ${match[1].trim()}`,
        'return',
      ],
    }))
}

function buildOspfCandidates(console: SerialConsoleSnapshot): FaultCandidate[] {
  const blocks = console.config
    .split(/\n#\n?/g)
    .map(block => block.trim())
    .filter(block => /^ospf\b/im.test(block))

  return blocks.flatMap((block) => {
    const lines = block.split('\n').map(line => line.trim())
    const processId = /^ospf\s+(\S+)/i.exec(lines[0])?.[1] ?? '1'
    let areaId = ''
    const candidates: FaultCandidate[] = []

    for (const line of lines.slice(1)) {
      const areaMatch = /^area\s+(\S+)/i.exec(line)
      if (areaMatch) {
        areaId = areaMatch[1]
        continue
      }

      const networkMatch = /^network\s+(.+)$/i.exec(line)
      if (areaId && networkMatch) {
        candidates.push({
          console,
          interfaceName: `ospf-${processId}-area-${areaId}`,
          kind: 'ospf-network-removed',
          commands: [
            'system-view',
            `ospf ${processId}`,
            `area ${areaId}`,
            `undo network ${networkMatch[1].trim()}`,
            'return',
          ],
        })
      }
    }

    return candidates
  })
}

function buildCandidates(console: SerialConsoleSnapshot): FaultCandidate[] {
  return [
    ...buildInterfaceCandidates(console),
    ...buildStaticRouteCandidates(console),
    ...buildOspfCandidates(console),
  ]
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
    kind: candidate.kind,
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
