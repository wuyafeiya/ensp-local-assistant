import { readFile } from 'node:fs/promises'
import type { AppSettings, ChatMessage, LabChatResult, LabChatStatus, LabProject } from '@ensp-assistant/shared'
import { executeConsoleCommands, scanSerialConsoles, type SerialConsoleSnapshot, type SerialScanResult } from './serialScanner.js'

interface DiagnosticCommandPlan {
  commands: string[]
  targetNames: string[]
  runOnAll: boolean
}

interface CommandAction {
  target: string
  commands: string[]
}

interface AiCommandPlan {
  actions: CommandAction[]
  note: string
}

function asChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value))
    return []

  return value
    .filter((item): item is ChatMessage => {
      return Boolean(
        item
        && typeof item === 'object'
        && ['user', 'assistant'].includes((item as ChatMessage).role)
        && typeof (item as ChatMessage).content === 'string',
      )
    })
    .slice(-12)
}

async function readConfigContext(lab: LabProject): Promise<string> {
  const chunks: string[] = []
  let budget = 12000

  for (const file of lab.configFiles.slice(0, 5)) {
    if (budget <= 0)
      break

    try {
      const content = await readFile(file.path, 'utf8')
      const clipped = content.slice(0, budget)
      budget -= clipped.length
      chunks.push(`## ${file.name}\n${clipped}`)
    }
    catch {
      chunks.push(`## ${file.name}\n读取失败`)
    }
  }

  return chunks.join('\n\n') || '未发现配置文件。'
}

function buildSerialContext(scan: SerialScanResult): string {
  if (!scan.consoles.length) {
    return [
      `已扫描串口端口数量：${scan.scannedPorts.length}`,
      '未检测到已连接的 eNSP 串口控制台。可能原因：设备未启动、串口端口不在默认范围、或 eNSP 未开放本机 Telnet 控制台。',
      '默认扫描范围：2000-2099, 20000-20150。可用 ENSP_SERIAL_PORTS 或 ENSP_SERIAL_PORT_RANGES 覆盖。',
    ].join('\n')
  }

  return scan.consoles.map((console) => {
    return [
      `## 串口 127.0.0.1:${console.port}`,
      `提示符/设备名：${console.prompt || '未识别'}`,
      console.error ? `读取状态：${console.error}` : '读取状态：已连接并尝试读取配置',
      '```text',
      console.config || console.output || '未读取到输出',
      '```',
    ].join('\n')
  }).join('\n\n')
}

function detectSysname(config: string) {
  return /^sysname\s+(.+)$/im.exec(config)?.[1]?.trim() ?? ''
}

function buildLabChatStatus(lab: LabProject, scan: SerialScanResult): LabChatStatus {
  const consoles = scan.consoles.map((console) => {
    return {
      port: console.port,
      prompt: console.prompt,
      sysname: detectSysname(console.config),
      hasConfig: Boolean(console.config),
      error: console.error,
    }
  })

  return {
    totalDevices: lab.deviceCount || lab.preview?.nodes.length || 0,
    onlineDevices: consoles.filter(console => !console.error).length,
    scannedPorts: scan.scannedPorts.length,
    consoles,
    updatedAt: new Date().toISOString(),
  }
}

function buildStatusSummary(status: LabChatStatus) {
  const onlineNames = status.consoles
    .map(console => console.sysname || console.prompt || `127.0.0.1:${console.port}`)
    .filter(Boolean)
    .join(', ') || '无'

  return [
    `总设备量：${status.totalDevices || '未知'}`,
    `已连接串口设备：${status.onlineDevices}`,
    `已扫描端口数：${status.scannedPorts}`,
    `可识别设备：${onlineNames}`,
  ].join('\n')
}

function buildSystemPrompt(lab: LabProject, configContext: string, serialContext: string): string {
  const devices = lab.preview?.nodes
    .map(node => `${node.name}(${node.type}, ${node.model})`)
    .join(', ') || '未识别'
  const links = lab.preview?.links
    .map(link => `${link.sourceId}:${link.sourceInterface || '-'} -> ${link.targetId}:${link.targetInterface || '-'}${link.isSerial ? ' [Serial]' : ''}`)
    .join('\n') || '未识别'

  return [
    '你是一个本地实验助手。用户可能问 eNSP/网络排错，也可能问完全无关的问题；如果无关，就按普通助手直接回答。',
    '回答要简洁、工程化、可执行。涉及实验时优先基于“串口现场快照”回答，其次参考本地配置文件和拓扑摘要。',
    '不要以“你好，我是……”开头。不要在正文开头复述实验名称、拓扑设备列表、串口检测结果或“当前检测结果”。这些状态已由界面单独展示。',
    '只有当用户明确询问连接状态、设备是否启动、当前检测到什么设备时，才简短引用串口状态；否则直接回答用户问题。',
    '如果“现场命令执行结果”里有内容，说明系统已经通过本机 127.0.0.1 串口端口执行了用户请求的命令；回答时优先解释这些输出，不要说你无法登录或无法执行。',
    '如果串口未连接或未读到配置，要明确告诉用户“当前没有检测到可用串口/配置”，不要假装已经看到设备配置。',
    '输出必须使用 Markdown：标题必须独占一行；命令、配置片段、设备输出必须放进 fenced code block，例如 ```text ... ```；步骤用有序列表或短标题。',
    `实验名称：${lab.name}`,
    `协议推断：${lab.protocol}`,
    `拓扑文件：${lab.topologyFile ?? '无'}`,
    `设备摘要：${devices}`,
    `链路摘要：\n${links}`,
    `串口现场快照：\n${serialContext}`,
    `配置内容：\n${configContext}`,
  ].join('\n\n')
}

function latestUserText(messages: ChatMessage[]) {
  return [...messages].reverse().find(message => message.role === 'user')?.content ?? ''
}

function normalizeCommand(command: string) {
  return command
    .replace(/\s+[\u4E00-\u9FFF].*$/u, '')
    .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, '')
    .replace(/[。；;，,]+$/g, '')
    .trim()
}

function isSafeDiagnosticCommand(command: string) {
  return command.length > 0 && command.length <= 180 && !/[|&><]/.test(command)
}

function extractDiagnosticCommands(text: string) {
  const candidates: string[] = []

  for (const match of text.matchAll(/```(?:text|shell|cmd|huawei|vrp)?\n([\s\S]*?)```/gi)) {
    candidates.push(...match[1].split('\n'))
  }

  const commandPattern = /\b(?:display|dis|ping|tracert|trace)\s+[^\n。；;，,]+/gi
  for (const match of text.matchAll(commandPattern))
    candidates.push(match[0])

  if (/screen-length|terminal length/i.test(text)) {
    const linePattern = /\b(?:screen-length|terminal)\s+[^\n。；;，,]+/gi
    for (const match of text.matchAll(linePattern))
      candidates.push(match[0])
  }

  return [...new Set(candidates
    .map(normalizeCommand)
    .filter(command => command.length > 0 && command.length <= 160)
    .filter(isSafeDiagnosticCommand))]
    .slice(0, 5)
}

function extractTargetNames(text: string, lab: LabProject, scan: SerialScanResult) {
  const names = [
    ...(lab.preview?.nodes.map(node => node.name) ?? []),
    ...scan.consoles.flatMap(console => [console.prompt, detectSysname(console.config)]),
  ]
    .map(name => name.trim())
    .filter(Boolean)

  return [...new Set(names.filter(name => new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(name)}([^A-Za-z0-9_-]|$)`, 'i').test(text)))]
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildDiagnosticCommandPlan(text: string, lab: LabProject, scan: SerialScanResult): DiagnosticCommandPlan | null {
  const commands = extractDiagnosticCommands(text)
  if (!commands.length)
    return null

  return {
    commands,
    targetNames: extractTargetNames(text, lab, scan),
    runOnAll: /所有|全部|每台|全网|all devices|every device/i.test(text),
  }
}

function consoleMatchesTarget(console: SerialConsoleSnapshot, targetName: string) {
  const names = [console.prompt, detectSysname(console.config)]
    .map(name => name.trim().toLowerCase())
    .filter(Boolean)
  return names.includes(targetName.trim().toLowerCase())
}

function selectCommandConsoles(plan: DiagnosticCommandPlan, scan: SerialScanResult) {
  const healthyConsoles = scan.consoles.filter(console => !console.error)
  if (plan.runOnAll)
    return healthyConsoles

  if (plan.targetNames.length > 0)
    return healthyConsoles.filter(console => plan.targetNames.some(name => consoleMatchesTarget(console, name)))

  return healthyConsoles.length === 1 ? healthyConsoles : []
}

async function buildCommandExecutionContext(plan: DiagnosticCommandPlan | null, scan: SerialScanResult) {
  if (!plan)
    return ''

  const consoles = selectCommandConsoles(plan, scan).slice(0, 8)
  if (!consoles.length) {
    return [
      '用户请求了现场执行诊断命令，但没有找到明确可执行的目标设备。',
      plan.targetNames.length ? `用户指定目标：${plan.targetNames.join(', ')}` : '用户未指定设备，且当前可连接设备不止一台。',
      `已识别命令：${plan.commands.join(' ; ')}`,
      '请让用户指定设备名，例如“在 R1 执行 display ip interface brief”。',
    ].join('\n')
  }

  const results = await Promise.all(consoles.map(async (console) => {
    const commands = ['screen-length 0 temporary', ...plan.commands]
    const result = await executeConsoleCommands(console.port, commands)
    const deviceName = detectSysname(console.config) || console.prompt || `127.0.0.1:${console.port}`
    return [
      `## ${deviceName} / 127.0.0.1:${console.port}`,
      `执行命令：${plan.commands.join(' ; ')}`,
      '```text',
      result.output || '命令执行完成，但未读取到输出。',
      '```',
    ].join('\n')
  }))

  return results.join('\n\n')
}

function shouldAskAiForCommandPlan(text: string) {
  return /执行|运行|登录|登陆|配置|修改|创建|删除|开启|关闭|查看|检查|排查|display|dis\s+|ping|tracert|undo|shutdown|ospf|bgp|isis|vlan|acl|nat|ip route|静态路由/i.test(text)
}

function consoleLabel(console: SerialConsoleSnapshot) {
  return detectSysname(console.config) || console.prompt || `127.0.0.1:${console.port}`
}

function buildConsoleInventory(scan: SerialScanResult) {
  return scan.consoles
    .filter(console => !console.error)
    .map(console => [
      `设备名：${consoleLabel(console)}`,
      `串口：127.0.0.1:${console.port}`,
      `提示符：${console.prompt || '未识别'}`,
      `sysname：${detectSysname(console.config) || '未识别'}`,
    ].join('\n'))
    .join('\n\n') || '当前没有在线串口设备。'
}

function extractJsonObject(text: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]
  const raw = fenced ?? text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start)
    return null
  return raw.slice(start, end + 1)
}

function normalizeAiCommandPlan(value: unknown): AiCommandPlan {
  if (!value || typeof value !== 'object')
    return { actions: [], note: '' }

  const plan = value as { actions?: unknown, note?: unknown }
  const actions = Array.isArray(plan.actions)
    ? plan.actions.flatMap((item): CommandAction[] => {
        if (!item || typeof item !== 'object')
          return []
        const action = item as { target?: unknown, commands?: unknown }
        const target = typeof action.target === 'string' ? action.target.trim() : ''
        const commands = Array.isArray(action.commands)
          ? action.commands.map(command => typeof command === 'string' ? normalizeCommand(command) : '').filter(Boolean)
          : []
        return target && commands.length ? [{ target, commands: commands.slice(0, 20) }] : []
      })
    : []

  return {
    actions: actions.slice(0, 12),
    note: typeof plan.note === 'string' ? plan.note : '',
  }
}

async function askAiForCommandPlan(baseUrl: string, model: string, settings: AppSettings, lab: LabProject, configContext: string, scan: SerialScanResult, userText: string): Promise<AiCommandPlan> {
  if (!shouldAskAiForCommandPlan(userText))
    return { actions: [], note: '' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: [
              '你负责把用户需求转换为华为 VRP 串口命令执行计划，只输出 JSON，不要输出解释。',
              'JSON 格式：{"actions":[{"target":"设备名或 ALL 或 AUTO","commands":["命令1","命令2"]}],"note":"简短说明"}',
              '不要添加 telnet 命令，系统已经负责连接 127.0.0.1 串口端口。',
              '如果用户只是聊天、解释概念、或没有要求查看/执行/配置设备，actions 返回空数组。',
              '如果用户明确指定设备名，target 使用该设备名。若用户要求所有设备，target 用 ALL。若当前只有一台在线设备且用户未指定设备，target 用 AUTO。',
              '可以生成配置命令，例如 system-view、interface、ospf、undo、shutdown、save 等；这是本地模拟器环境。',
              '如果目标设备不明确且在线设备超过一台，actions 返回空数组，并在 note 里要求用户指定设备。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `实验名称：${lab.name}`,
              `拓扑设备：${lab.preview?.nodes.map(node => node.name).join(', ') || '未识别'}`,
              `在线串口设备：\n${buildConsoleInventory(scan)}`,
              `本地配置摘要：\n${configContext.slice(0, 6000)}`,
              `用户请求：${userText}`,
            ].join('\n\n'),
          },
        ],
      }),
    })

    if (!response.ok)
      return { actions: [], note: `命令规划失败：${response.status}` }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const json = extractJsonObject(payload.choices?.[0]?.message?.content ?? '')
    if (!json)
      return { actions: [], note: '未生成可执行命令计划。' }
    return normalizeAiCommandPlan(JSON.parse(json))
  }
  catch (error) {
    return {
      actions: [],
      note: error instanceof Error ? `命令规划失败：${error.message}` : '命令规划失败。',
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

function resolveActionConsoles(action: CommandAction, scan: SerialScanResult) {
  const healthyConsoles = scan.consoles.filter(console => !console.error)
  const target = action.target.trim()
  if (/^all$/i.test(target))
    return healthyConsoles
  if (/^auto$/i.test(target))
    return healthyConsoles.length === 1 ? healthyConsoles : []
  return healthyConsoles.filter(console => consoleMatchesTarget(console, target))
}

async function buildAiCommandExecutionContext(plan: AiCommandPlan, scan: SerialScanResult) {
  if (!plan.actions.length)
    return plan.note ? `命令规划说明：${plan.note}` : ''

  const chunks: string[] = []
  for (const action of plan.actions) {
    const consoles = resolveActionConsoles(action, scan).slice(0, 8)
    if (!consoles.length) {
      chunks.push([
        `## ${action.target}`,
        '未执行：没有匹配到已连接且可用的串口设备。',
        `计划命令：${action.commands.join(' ; ')}`,
      ].join('\n'))
      continue
    }

    const results = await Promise.all(consoles.map(async (console) => {
      const result = await executeConsoleCommands(console.port, action.commands)
      return [
        `## ${consoleLabel(console)} / 127.0.0.1:${console.port}`,
        `执行命令：${action.commands.join(' ; ')}`,
        '```text',
        result.output || '命令执行完成，但未读取到输出。',
        '```',
      ].join('\n')
    }))
    chunks.push(...results)
  }

  return chunks.join('\n\n')
}

async function resolveModel(baseUrl: string, settings: AppSettings): Promise<string> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
    })
    if (!response.ok)
      return settings.aiModel

    const payload = await response.json() as { data?: Array<{ id?: string }> }
    return payload.data?.find(model => model.id)?.id ?? settings.aiModel
  }
  catch {
    return settings.aiModel
  }
}

function normalizeAssistantContent(content: string) {
  return content
    .replace(/^你好[，,！!。\s]*我是[^\n]{0,80}(?:助手|实验助手)[。\n\s]*/i, '')
    .replace(/^当前已检测到串口现场快照[:：]?\s*/i, '')
    .trim()
}

async function scanLabSerialStatus(lab: LabProject) {
  const scan = await scanSerialConsoles(Math.max(6, Math.min(16, (lab.deviceCount || 6) + 4)))
  return {
    scan,
    status: buildLabChatStatus(lab, scan),
  }
}

export async function getLabChatStatus(lab: LabProject): Promise<LabChatStatus> {
  return (await scanLabSerialStatus(lab)).status
}

export async function chatWithLab(settings: AppSettings, lab: LabProject, rawMessages: unknown): Promise<LabChatResult> {
  const baseUrl = settings.aiBaseUrl.replace(/\/+$/, '')
  const model = await resolveModel(baseUrl, settings)
  const messages = asChatMessages(rawMessages)
  const [configContext, serialSnapshot] = await Promise.all([
    readConfigContext(lab),
    scanLabSerialStatus(lab),
  ])
  const userText = latestUserText(messages)
  const aiCommandPlan = await askAiForCommandPlan(baseUrl, model, settings, lab, configContext, serialSnapshot.scan, userText)
  const commandPlan = aiCommandPlan.actions.length ? null : buildDiagnosticCommandPlan(userText, lab, serialSnapshot.scan)
  const commandExecutionContext = aiCommandPlan.actions.length
    ? await buildAiCommandExecutionContext(aiCommandPlan, serialSnapshot.scan)
    : await buildCommandExecutionContext(commandPlan, serialSnapshot.scan)
  const serialContext = [
    buildStatusSummary(serialSnapshot.status),
    '',
    buildSerialContext(serialSnapshot.scan),
    commandExecutionContext ? `\n现场命令执行结果：\n${commandExecutionContext}` : '',
  ].join('\n')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(lab, configContext, serialContext),
          },
          ...messages,
        ],
      }),
    })
  }
  finally {
    clearTimeout(timeout)
  }

  if (!response.ok)
    throw new Error(`AI request failed: ${response.status} ${await response.text()}`)

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content
  if (!content)
    throw new Error('AI response did not include message content.')

  return {
    message: normalizeAssistantContent(content),
    status: serialSnapshot.status,
  }
}
