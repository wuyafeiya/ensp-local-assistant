import { computed, ref, shallowRef } from 'vue'
import type { AppSettings, ChatMessage, LabChatStatus, LabProject, TopologyLayoutNode } from '@ensp-assistant/shared'
import { chatWithLab, getLabChatStatus, getLabs, getSettings, injectFault, openLab, openLabConfigs, saveLabLayout, updateSettings } from '../services/api'

const defaultSettings: AppSettings = {
  labRoot: '',
  enspExecutable: '',
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
}

const chatStoragePrefix = 'ensp-chat-history:'

function chatStorageKey(labId: string) {
  return `${chatStoragePrefix}${labId}`
}

function loadStoredChatMessages(labId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatStorageKey(labId))
    if (!raw)
      return []
    const messages = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(messages)
      ? messages.filter(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string').slice(-80)
      : []
  }
  catch {
    return []
  }
}

function saveStoredChatMessages(labId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(chatStorageKey(labId), JSON.stringify(messages.slice(-80)))
  }
  catch {
    // Ignore storage quota/privacy mode errors; chat still works for this session.
  }
}

export function useWorkbench() {
  const settings = ref<AppSettings>({ ...defaultSettings })
  const labs = shallowRef<LabProject[]>([])
  const selectedLabId = ref('')
  const query = ref('')
  const status = ref('正在连接本地服务')
  const isLoading = ref(false)
  const chatLabId = ref('')
  const chatMessages = shallowRef<ChatMessage[]>([])
  const chatStatus = ref<LabChatStatus | null>(null)
  const isChatLoading = ref(false)
  const isChatStatusLoading = ref(false)
  const isInjectingFault = ref(false)
  const lastOpenedLabId = ref('')
  const error = ref('')

  const filteredLabs = computed(() => {
    const needle = query.value.trim().toLowerCase()
    if (!needle)
      return labs.value
    return labs.value.filter((lab) => {
      return [
        lab.name,
        lab.protocol,
        lab.path,
        ...lab.configFiles.map(file => file.name),
        ...lab.tags,
      ].some(value => value.toLowerCase().includes(needle))
    })
  })

  async function loadInitialData() {
    isLoading.value = true
    error.value = ''
    try {
      settings.value = await getSettings()
      labs.value = await getLabs()
      selectedLabId.value = labs.value[0]?.id ?? ''
      status.value = settings.value.labRoot ? '实验目录已连接' : '演示数据模式'
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '本地服务连接失败'
      status.value = '本地服务不可用'
    }
    finally {
      isLoading.value = false
    }
  }

  async function scanLabs() {
    isLoading.value = true
    error.value = ''
    try {
      labs.value = await getLabs()
      if (!labs.value.find(lab => lab.id === selectedLabId.value))
        selectedLabId.value = labs.value[0]?.id ?? ''
      status.value = `已发现 ${labs.value.length} 个实验`
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '扫描失败'
    }
    finally {
      isLoading.value = false
    }
  }

  async function saveSettings(next: AppSettings) {
    isLoading.value = true
    error.value = ''
    try {
      settings.value = await updateSettings(next)
      await scanLabs()
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '设置保存失败'
    }
    finally {
      isLoading.value = false
    }
  }

  async function launchLab(labId: string) {
    selectedLabId.value = labId
    error.value = ''
    try {
      const result = await openLab(labId)
      lastOpenedLabId.value = labId
      status.value = result.message
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '打开 eNSP 失败'
    }
  }

  async function openConfigs(labId: string) {
    selectedLabId.value = labId
    error.value = ''
    try {
      const result = await openLabConfigs(labId)
      status.value = result.message
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '打开配置失败'
    }
  }

  async function saveLayout(labId: string, nodes: TopologyLayoutNode[]) {
    selectedLabId.value = labId
    error.value = ''
    try {
      const updatedLab = await saveLabLayout(labId, nodes)
      labs.value = labs.value.map(lab => lab.id === labId ? updatedLab : lab)
      status.value = '布局已保存'
      return true
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '保存布局失败'
      return false
    }
  }

  function openLabChat(labId: string) {
    chatLabId.value = labId
    chatMessages.value = loadStoredChatMessages(labId)
    chatStatus.value = null
    void refreshLabChatStatus(labId)
  }

  function closeLabChat() {
    chatLabId.value = ''
    chatMessages.value = []
    chatStatus.value = null
  }

  async function refreshLabChatStatus(labId = chatLabId.value) {
    if (!labId || isChatStatusLoading.value)
      return

    isChatStatusLoading.value = true
    try {
      chatStatus.value = await getLabChatStatus(labId)
    }
    catch {
      chatStatus.value = null
    }
    finally {
      isChatStatusLoading.value = false
    }
  }

  async function sendChatMessage(content: string) {
    const text = content.trim()
    if (!text || !chatLabId.value || isChatLoading.value)
      return

    const nextMessages: ChatMessage[] = [...chatMessages.value, { role: 'user', content: text }]
    chatMessages.value = nextMessages
    saveStoredChatMessages(chatLabId.value, nextMessages)
    isChatLoading.value = true
    error.value = ''
    try {
      const result = await chatWithLab(chatLabId.value, nextMessages)
      chatStatus.value = result.status
      chatMessages.value = [...nextMessages, { role: 'assistant', content: result.message }]
      saveStoredChatMessages(chatLabId.value, chatMessages.value)
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'AI 对话失败'
    }
    finally {
      isChatLoading.value = false
    }
  }

  async function injectLabFault(labId: string) {
    selectedLabId.value = labId
    isInjectingFault.value = true
    error.value = ''
    try {
      const result = await injectFault(labId)
      status.value = result.message
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '投放故障失败'
    }
    finally {
      isInjectingFault.value = false
    }
  }

  return {
    settings,
    labs,
    selectedLabId,
    chatLabId,
    chatMessages,
    chatStatus,
    lastOpenedLabId,
    query,
    status,
    isLoading,
    isChatLoading,
    isChatStatusLoading,
    isInjectingFault,
    error,
    filteredLabs,
    loadInitialData,
    scanLabs,
    saveSettings,
    launchLab,
    openConfigs,
    saveLayout,
    openLabChat,
    closeLabChat,
    refreshLabChatStatus,
    sendChatMessage,
    injectLabFault,
  }
}
