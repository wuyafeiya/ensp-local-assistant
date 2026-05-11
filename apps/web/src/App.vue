<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Bot,
  Boxes,
  Cpu,
  Layers3,
  LibraryBig,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  SendHorizontal,
  Server,
  UserRound,
  X,
} from 'lucide-vue-next'
import type { TopologyLayoutNode } from '@ensp-assistant/shared'
import ChatMessageContent from './components/ChatMessageContent.vue'
import ChatProgressMessage from './components/ChatProgressMessage.vue'
import ProgressModal from './components/ProgressModal.vue'
import TemplateCard from './components/TemplateCard.vue'
import TopologyEditorPage from './components/TopologyEditorPage.vue'
import { useWorkbench } from './composables/useWorkbench'

type ProgressStepStatus = 'pending' | 'running' | 'done' | 'failed'

interface ProgressStep {
  id: string
  label: string
  detail: string
  status: ProgressStepStatus
}

const workbench = useWorkbench()
const chatInput = ref('')
const activeView = ref<'templates' | 'editor'>('templates')
const isSavingLayout = ref(false)
const isChatExpanded = ref(false)
const faultModalLabId = ref('')
const faultModalResult = ref<'running' | 'success' | 'failed'>('running')
const faultModalSubtitle = ref('投放故障')
const faultSteps = ref<ProgressStep[]>([])

const activeChatLab = computed(() => {
  return workbench.labs.value.find(lab => lab.id === workbench.chatLabId.value) ?? null
})

const activeFaultLab = computed(() => {
  return workbench.labs.value.find(lab => lab.id === faultModalLabId.value) ?? null
})

const chatStatusTime = computed(() => {
  if (!workbench.chatStatus.value?.updatedAt)
    return '未检测'
  return new Date(workbench.chatStatus.value.updatedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const chatModelLabel = computed(() => {
  return workbench.activeChatModel.value || workbench.settings.value.aiModel || '未连接'
})

const navigationItems = [
  { id: 'templates' as const, label: '模板库', icon: LibraryBig },
  { id: 'editor' as const, label: '拓扑编辑', icon: Layers3 },
]

onMounted(() => {
  void workbench.loadInitialData()
})

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text)
    return
  chatInput.value = ''
  await workbench.sendChatMessage(text)
}

function openLayoutEditor(labId: string) {
  workbench.selectedLabId.value = labId
  activeView.value = 'editor'
}

function openChat(labId: string) {
  workbench.openLabChat(labId)
  isChatExpanded.value = true
}

function selectEditorLab(labId: string) {
  workbench.selectedLabId.value = labId
}

async function saveEditorLayout(labId: string, nodes: TopologyLayoutNode[]) {
  isSavingLayout.value = true
  await workbench.saveLayout(labId, nodes)
  isSavingLayout.value = false
}

function createFaultSteps(): ProgressStep[] {
  return [
    {
      id: 'verify',
      label: '核对当前拓扑',
      detail: '确认投放目标和最近启动拓扑一致',
      status: 'running',
    },
    {
      id: 'scan',
      label: '检测设备开机状态',
      detail: '正在扫描本机串口端口',
      status: 'pending',
    },
    {
      id: 'prepare',
      label: '准备随机故障',
      detail: '等待设备检测完成',
      status: 'pending',
    },
    {
      id: 'inject',
      label: '投放隐蔽故障',
      detail: '等待故障策略生成',
      status: 'pending',
    },
  ]
}

function updateFaultStep(id: string, status: ProgressStepStatus, detail: string) {
  faultSteps.value = faultSteps.value.map(step => step.id === id ? { ...step, status, detail } : step)
}

function currentRunningFaultStep() {
  return faultSteps.value.find(step => step.status === 'running')
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function beginFaultInjection(labId: string) {
  if (workbench.injectingFaultLabId.value)
    return

  const lab = workbench.labs.value.find(item => item.id === labId)
  faultModalLabId.value = labId
  faultModalResult.value = 'running'
  faultModalSubtitle.value = lab ? `正在处理 ${lab.name}` : '正在投放故障'
  faultSteps.value = createFaultSteps()

  try {
    if (workbench.lastOpenedLabId.value !== labId) {
      updateFaultStep('verify', 'failed', '当前拓扑不是最近通过平台启动的拓扑，请先点击该卡片“启动”')
      updateFaultStep('scan', 'pending', '未检测设备开机状态')
      updateFaultStep('prepare', 'pending', '已停止投放')
      updateFaultStep('inject', 'pending', '未执行')
      faultModalResult.value = 'failed'
      faultModalSubtitle.value = '投放失败'
      return
    }

    updateFaultStep('verify', 'done', '投放目标和最近启动拓扑一致')
    updateFaultStep('scan', 'running', '正在扫描本机串口端口')
    const runtime = await workbench.checkLabRuntimeStatus(labId)
    if (runtime.onlineDevices <= 0) {
      updateFaultStep('scan', 'failed', `已扫描 ${runtime.scannedPorts} 个端口，没有检测到已开机设备`)
      updateFaultStep('prepare', 'pending', '设备未开机，已停止投放')
      updateFaultStep('inject', 'pending', '未执行')
      faultModalResult.value = 'failed'
      faultModalSubtitle.value = '投放失败'
      return
    }

    updateFaultStep('scan', 'done', `检测到 ${runtime.onlineDevices}/${runtime.totalDevices || '-'} 台设备已开机`)
    updateFaultStep('prepare', 'running', '正在选择可投放故障的接口')
    await wait(260)
    updateFaultStep('prepare', 'done', '已确认存在在线设备，开始投放')
    updateFaultStep('inject', 'running', '正在连接串口并写入故障')

    const result = await workbench.injectLabFault(labId)
    updateFaultStep('inject', 'done', result.message)
    faultModalResult.value = 'success'
    faultModalSubtitle.value = '投放完成'
  }
  catch (caught) {
    const message = caught instanceof Error ? caught.message : '投放故障失败'
    const running = currentRunningFaultStep()
    if (running)
      updateFaultStep(running.id, 'failed', message)
    else
      updateFaultStep('inject', 'failed', message)
    faultModalResult.value = 'failed'
    faultModalSubtitle.value = '投放失败'
  }
}

function closeFaultModal() {
  faultModalLabId.value = ''
}
</script>

<template>
  <div class="template-app" :class="{ 'chat-open': workbench.chatLabId.value }">
    <div class="clay-blob blob-violet" />
    <div class="clay-blob blob-pink" />
    <div class="clay-blob blob-blue" />

    <aside class="clay-sidebar" aria-label="应用导航">
      <div class="brand-panel">
        <div class="brand-orb">
          <Boxes :size="28" />
        </div>
        <div>
          <strong>eNSP Clay</strong>
          <span>Topology Launcher</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button
          v-for="item in navigationItems"
          :key="item.label"
          class="nav-button"
          :class="{ active: activeView === item.id }"
          type="button"
          @click="activeView = item.id"
        >
          <component :is="item.icon" :size="19" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <main class="template-workspace">
      <section v-if="workbench.error.value" class="template-error">
        {{ workbench.error.value }}
      </section>

      <section v-if="activeView === 'templates'" class="template-grid">
        <TemplateCard
          v-for="lab in workbench.filteredLabs.value"
          :key="lab.id"
          :lab="lab"
          :is-opened="workbench.lastOpenedLabId.value === lab.id"
          :is-faulting="workbench.injectingFaultLabId.value === lab.id"
          @launch="workbench.launchLab"
          @open-configs="workbench.openConfigs"
          @edit-layout="openLayoutEditor"
          @open-chat="openChat"
          @inject-fault="beginFaultInjection"
        />
      </section>

      <TopologyEditorPage
        v-else
        :labs="workbench.filteredLabs.value"
        :selected-lab-id="workbench.selectedLabId.value"
        :saving="isSavingLayout"
        @select-lab="selectEditorLab"
        @back="activeView = 'templates'"
        @save="saveEditorLayout"
      />
    </main>

    <ProgressModal
      :open="Boolean(faultModalLabId)"
      :title="activeFaultLab?.name ?? '随机故障投放'"
      :subtitle="faultModalSubtitle"
      :result="faultModalResult"
      :steps="faultSteps"
      @close="closeFaultModal"
    />

    <aside v-if="workbench.chatLabId.value" class="ai-chat-panel" :class="{ expanded: isChatExpanded }" aria-label="实验 AI 助手">
      <div class="ai-chat-header">
        <div class="chat-avatar">
          <Bot :size="22" />
        </div>
        <div class="chat-title-block">
          <span>AI 排错助手</span>
          <strong>{{ activeChatLab?.name ?? '当前实验' }}</strong>
        </div>
        <div class="chat-status-strip">
          <div class="chat-status-pill">
            <Server :size="13" />
            <span>设备</span>
            <strong>{{ workbench.chatStatus.value?.totalDevices || activeChatLab?.deviceCount || '-' }}</strong>
          </div>
          <div class="chat-status-pill online">
            <Radio :size="13" />
            <span>开机</span>
            <strong>{{ workbench.chatStatus.value?.onlineDevices ?? '-' }}</strong>
          </div>
          <div class="chat-status-pill model">
            <Cpu :size="13" />
            <span>模型</span>
            <strong>{{ chatModelLabel }}</strong>
          </div>
          <button
            class="chat-status-refresh"
            type="button"
            :disabled="workbench.isChatStatusLoading.value"
            :title="`刷新状态，当前 ${chatStatusTime}`"
            @click="workbench.refreshLabChatStatus()"
          >
            <RefreshCw :size="13" />
            <span>{{ workbench.isChatStatusLoading.value ? '检测' : chatStatusTime }}</span>
          </button>
        </div>
        <button class="chat-icon-button" type="button" :title="isChatExpanded ? '缩小 AI 助手' : '展开 AI 助手'" @click="isChatExpanded = !isChatExpanded">
          <Minimize2 v-if="isChatExpanded" :size="18" />
          <Maximize2 v-else :size="18" />
        </button>
        <button class="chat-icon-button" type="button" title="关闭 AI 助手" @click="workbench.closeLabChat(); isChatExpanded = false">
          <X :size="18" />
        </button>
      </div>

      <div class="ai-chat-messages">
        <div
          v-for="(message, index) in workbench.chatMessages.value"
          :key="`${message.role}-${index}`"
          class="chat-message"
          :class="message.role"
        >
          <div class="message-avatar">
            <Bot v-if="message.role === 'assistant'" :size="16" />
            <UserRound v-else :size="16" />
          </div>
          <ChatMessageContent :content="message.content" />
        </div>

        <div v-if="workbench.isChatPreparing.value" class="chat-message assistant loading">
          <div class="message-avatar">
            <Bot :size="16" />
          </div>
          <ChatProgressMessage />
        </div>
      </div>

      <form class="ai-chat-form" @submit.prevent="sendChat">
        <label class="chat-input">
          <input
            v-model="chatInput"
            type="text"
            placeholder="问配置、邻居、路由、VLAN、ACL 或故障现象"
            :disabled="workbench.isChatLoading.value"
          >
        </label>
        <button class="chat-send-button" type="submit" :disabled="!chatInput.trim() || workbench.isChatLoading.value">
          <SendHorizontal :size="18" />
        </button>
      </form>
    </aside>
  </div>
</template>
