import { readFile } from 'node:fs/promises'
import type { AppSettings, ChatMessage, LabChatResult, LabChatStatus, LabProject } from '@ensp-assistant/shared'
import { scanSerialConsoles, type SerialScanResult } from './serialScanner.js'

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
  const [configContext, serialSnapshot] = await Promise.all([
    readConfigContext(lab),
    scanLabSerialStatus(lab),
  ])
  const serialContext = [
    buildStatusSummary(serialSnapshot.status),
    '',
    buildSerialContext(serialSnapshot.scan),
  ].join('\n')
  const messages = asChatMessages(rawMessages)
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
