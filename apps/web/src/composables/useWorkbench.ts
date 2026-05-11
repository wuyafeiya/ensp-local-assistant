import { computed, ref, shallowRef } from 'vue'
import type { AppSettings, ChatMessage, FaultInjectionResult, LabChatStatus, LabProject, TopologyLayoutNode } from '@ensp-assistant/shared'
import { closeLab, clearRuntimeState, getLabChatStatus, getLabs, getRuntimeState, getSettings, injectFault, openLab, openLabConfigs, saveLabLayout, streamChatWithLab, updateSettings } from '../services/api'

const defaultSettings: AppSettings = {
  labRoot: '',
  enspExecutable: '',
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
}

const chatStoragePrefix = 'ensp-chat-history:'

interface StoredChatHistory {
  openedAt: string
  wasOnline: boolean
  messages: ChatMessage[]
}

function chatStorageKey(labId: string) {
  return `${chatStoragePrefix}${labId}`
}

function readStoredChatHistory(labId: string): StoredChatHistory | null {
  try {
    const raw = localStorage.getItem(chatStorageKey(labId))
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as Partial<StoredChatHistory> | ChatMessage[]
    const messages = Array.isArray(parsed) ? parsed : parsed.messages
    if (!Array.isArray(messages))
      return null
    return {
      openedAt: Array.isArray(parsed) ? '' : typeof parsed.openedAt === 'string' ? parsed.openedAt : '',
      wasOnline: !Array.isArray(parsed) && parsed.wasOnline === true,
      messages: messages.filter(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string').slice(-80),
    }
  }
  catch {
    return null
  }
}

function loadStoredChatMessages(labId: string, openedAt: string): ChatMessage[] {
  const history = readStoredChatHistory(labId)
  if (!history)
    return []
  if (!openedAt || history.openedAt !== openedAt) {
    clearStoredChatMessages(labId)
    return []
  }
  return history.messages
}

function saveStoredChatMessages(labId: string, openedAt: string, messages: ChatMessage[], wasOnline = false) {
  if (!openedAt)
    return
  try {
    const previous = readStoredChatHistory(labId)
    localStorage.setItem(chatStorageKey(labId), JSON.stringify({
      openedAt,
      wasOnline: wasOnline || previous?.wasOnline === true,
      messages: messages.slice(-80),
    }))
  }
  catch {
    // Ignore storage quota/privacy mode errors; chat still works for this session.
  }
}

function markStoredChatWasOnline(labId: string, openedAt: string) {
  const history = readStoredChatHistory(labId)
  if (!history || history.openedAt !== openedAt || history.wasOnline)
    return
  saveStoredChatMessages(labId, openedAt, history.messages, true)
}

function clearStoredChatMessages(labId: string) {
  try {
    localStorage.removeItem(chatStorageKey(labId))
  }
  catch {
    // Ignore storage failures.
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
  const activeChatModel = ref('')
  const isChatLoading = ref(false)
  const isChatPreparing = ref(false)
  const isChatStatusLoading = ref(false)
  const injectingFaultLabId = ref('')
  const closingLabId = ref('')
  const lastOpenedLabId = ref('')
  const activeOpenedAt = ref('')
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
      const [nextSettings, nextLabs, runtimeState] = await Promise.all([
        getSettings(),
        getLabs(),
        getRuntimeState(),
      ])
      settings.value = nextSettings
      activeChatModel.value = nextSettings.aiModel
      labs.value = nextLabs
      selectedLabId.value = labs.value[0]?.id ?? ''
      lastOpenedLabId.value = labs.value.some(lab => lab.id === runtimeState.activeOpenedLabId)
        ? runtimeState.activeOpenedLabId
        : ''
      activeOpenedAt.value = lastOpenedLabId.value ? runtimeState.activeOpenedAt ?? '' : ''
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
    if (closingLabId.value)
      return

    selectedLabId.value = labId
    error.value = ''
    try {
      const previousLabId = lastOpenedLabId.value
      const previousOpenedAt = activeOpenedAt.value
      if (previousLabId && previousLabId !== labId) {
        closingLabId.value = previousLabId
        status.value = '正在保存并关闭上一个拓扑'
        const closeResult = await closeLab(previousLabId)
        if (!closeResult.closed)
          throw new Error(closeResult.message)
        clearStoredChatMessages(previousLabId)
        if (chatLabId.value === previousLabId)
          closeLabChat()
        status.value = closeResult.message
        closingLabId.value = ''
        lastOpenedLabId.value = ''
        activeOpenedAt.value = ''
      }

      const result = await openLab(labId)
      const runtimeState = await getRuntimeState()
      if (previousLabId === labId && previousOpenedAt && previousOpenedAt !== runtimeState.activeOpenedAt) {
        clearStoredChatMessages(labId)
        if (chatLabId.value === labId)
          chatMessages.value = []
      }
      lastOpenedLabId.value = labId
      activeOpenedAt.value = runtimeState.activeOpenedAt ?? ''
      status.value = result.message
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '打开 eNSP 失败'
    }
    finally {
      closingLabId.value = ''
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
    activeChatModel.value = settings.value.aiModel
    const openedAt = labId === lastOpenedLabId.value ? activeOpenedAt.value : ''
    chatMessages.value = loadStoredChatMessages(labId, openedAt)
    chatStatus.value = null
    void refreshLabChatStatus(labId)
  }

  function closeLabChat() {
    chatLabId.value = ''
    chatMessages.value = []
    chatStatus.value = null
  }

  async function closeOpenedLab(labId: string) {
    if (closingLabId.value)
      return

    if (lastOpenedLabId.value !== labId)
      return

    error.value = ''
    closingLabId.value = labId
    try {
      status.value = '正在保存设备并关闭拓扑'
      const closeResult = await closeLab(labId)
      if (!closeResult.closed) {
        status.value = closeResult.message
        return
      }
      clearStoredChatMessages(labId)
      lastOpenedLabId.value = ''
      activeOpenedAt.value = ''
      status.value = closeResult.message
      if (chatLabId.value === labId)
        closeLabChat()
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '关闭拓扑状态失败'
    }
    finally {
      closingLabId.value = ''
    }
  }

  async function refreshLabChatStatus(labId = chatLabId.value) {
    if (!labId || isChatStatusLoading.value)
      return

    isChatStatusLoading.value = true
    try {
      const nextStatus = await getLabChatStatus(labId)
      chatStatus.value = nextStatus
      await syncChatHistoryWithRuntime(labId, nextStatus)
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

    const targetLabId = chatLabId.value
    error.value = ''
    let currentStatus = chatStatus.value
    if (!currentStatus || currentStatus.onlineDevices <= 0) {
      isChatStatusLoading.value = true
      try {
        currentStatus = await getLabChatStatus(targetLabId)
        chatStatus.value = currentStatus
        await syncChatHistoryWithRuntime(targetLabId, currentStatus)
      }
      catch {
        currentStatus = null
      }
      finally {
        isChatStatusLoading.value = false
      }
    }

    if ((currentStatus?.onlineDevices ?? 0) <= 0) {
      error.value = '至少启动一台设备后才能发送 AI 对话。'
      return
    }

    const nextMessages: ChatMessage[] = [...chatMessages.value, { role: 'user', content: text }]
    chatMessages.value = nextMessages
    const openedAt = targetLabId === lastOpenedLabId.value ? activeOpenedAt.value : ''
    saveStoredChatMessages(targetLabId, openedAt, nextMessages, true)
    isChatLoading.value = true
    isChatPreparing.value = true
    let assistantContent = ''
    try {
      const result = await streamChatWithLab(targetLabId, nextMessages, {
        onModel: (model) => {
          activeChatModel.value = model
        },
        onDelta: (delta) => {
          assistantContent += delta
          isChatPreparing.value = false
          chatMessages.value = [...nextMessages, { role: 'assistant', content: assistantContent }]
        },
      })
      activeChatModel.value = result.model
      chatStatus.value = result.status
      chatMessages.value = [...nextMessages, { role: 'assistant', content: result.message || assistantContent }]
      await syncChatHistoryWithRuntime(targetLabId, result.status)
      const currentOpenedAt = targetLabId === lastOpenedLabId.value ? activeOpenedAt.value : ''
      saveStoredChatMessages(targetLabId, currentOpenedAt, chatMessages.value, result.status.onlineDevices > 0)
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'AI 对话失败'
    }
    finally {
      isChatLoading.value = false
      isChatPreparing.value = false
    }
  }

  async function checkLabRuntimeStatus(labId: string) {
    return await getLabChatStatus(labId)
  }

  async function syncChatHistoryWithRuntime(labId: string, nextStatus: LabChatStatus) {
    if (labId !== lastOpenedLabId.value || !activeOpenedAt.value)
      return

    if (nextStatus.onlineDevices > 0) {
      markStoredChatWasOnline(labId, activeOpenedAt.value)
      return
    }

    const history = readStoredChatHistory(labId)
    if (!history?.wasOnline || history.openedAt !== activeOpenedAt.value)
      return

    clearStoredChatMessages(labId)
    if (chatLabId.value === labId) {
      chatMessages.value = []
      chatStatus.value = nextStatus
    }
    lastOpenedLabId.value = ''
    activeOpenedAt.value = ''
    await clearRuntimeState()
  }

  async function injectLabFault(labId: string): Promise<FaultInjectionResult> {
    selectedLabId.value = labId
    injectingFaultLabId.value = labId
    error.value = ''
    try {
      const result = await injectFault(labId)
      status.value = result.message
      return result
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : '投放故障失败'
      throw caught
    }
    finally {
      injectingFaultLabId.value = ''
    }
  }

  return {
    settings,
    labs,
    selectedLabId,
    chatLabId,
    chatMessages,
    chatStatus,
    activeChatModel,
    lastOpenedLabId,
    activeOpenedAt,
    query,
    status,
    isLoading,
    isChatLoading,
    isChatPreparing,
    isChatStatusLoading,
    injectingFaultLabId,
    closingLabId,
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
    closeOpenedLab,
    refreshLabChatStatus,
    sendChatMessage,
    checkLabRuntimeStatus,
    injectLabFault,
  }
}
