import { readFile } from 'node:fs/promises'
import type { AppSettings, ChatMessage, LabProject } from '@ensp-assistant/shared'

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

function buildSystemPrompt(lab: LabProject, configContext: string): string {
  const devices = lab.preview?.nodes
    .map(node => `${node.name}(${node.type}, ${node.model})`)
    .join(', ') || '未识别'
  const links = lab.preview?.links
    .map(link => `${link.sourceId}:${link.sourceInterface || '-'} -> ${link.targetId}:${link.targetInterface || '-'}${link.isSerial ? ' [Serial]' : ''}`)
    .join('\n') || '未识别'

  return [
    '你是华为 eNSP 实验助手，负责解释拓扑、读取配置、辅助排错。',
    '回答要简洁、工程化、可执行。用户问配置时，优先基于提供的配置内容回答；用户问排错时，给检查命令、判断依据和修复建议。',
    `实验名称：${lab.name}`,
    `协议推断：${lab.protocol}`,
    `拓扑文件：${lab.topologyFile ?? '无'}`,
    `设备摘要：${devices}`,
    `链路摘要：\n${links}`,
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

export async function chatWithLab(settings: AppSettings, lab: LabProject, rawMessages: unknown): Promise<string> {
  const baseUrl = settings.aiBaseUrl.replace(/\/+$/, '')
  const model = await resolveModel(baseUrl, settings)
  const configContext = await readConfigContext(lab)
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
            content: buildSystemPrompt(lab, configContext),
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

  return content
}
