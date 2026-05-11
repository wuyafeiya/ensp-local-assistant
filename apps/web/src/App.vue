<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Bot,
  Boxes,
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
import TemplateCard from './components/TemplateCard.vue'
import TopologyEditorPage from './components/TopologyEditorPage.vue'
import { useWorkbench } from './composables/useWorkbench'

const workbench = useWorkbench()
const chatInput = ref('')
const activeView = ref<'templates' | 'editor'>('templates')
const isSavingLayout = ref(false)
const isChatExpanded = ref(false)

const activeChatLab = computed(() => {
  return workbench.labs.value.find(lab => lab.id === workbench.chatLabId.value) ?? null
})

const chatStatusTime = computed(() => {
  if (!workbench.chatStatus.value?.updatedAt)
    return '未检测'
  return new Date(workbench.chatStatus.value.updatedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
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
          :is-faulting="workbench.isInjectingFault.value"
          @launch="workbench.launchLab"
          @open-configs="workbench.openConfigs"
          @edit-layout="openLayoutEditor"
          @open-chat="openChat"
          @inject-fault="workbench.injectLabFault"
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

    <aside v-if="workbench.chatLabId.value" class="ai-chat-panel" :class="{ expanded: isChatExpanded }" aria-label="实验 AI 助手">
      <div class="ai-chat-header">
        <div class="chat-avatar">
          <Bot :size="22" />
        </div>
        <div>
          <span>AI 排错助手</span>
          <strong>{{ activeChatLab?.name ?? '当前实验' }}</strong>
        </div>
        <button class="chat-icon-button" type="button" :title="isChatExpanded ? '缩小 AI 助手' : '展开 AI 助手'" @click="isChatExpanded = !isChatExpanded">
          <Minimize2 v-if="isChatExpanded" :size="18" />
          <Maximize2 v-else :size="18" />
        </button>
        <button class="chat-icon-button" type="button" title="关闭 AI 助手" @click="workbench.closeLabChat(); isChatExpanded = false">
          <X :size="18" />
        </button>
      </div>

      <div class="chat-status-strip">
        <div class="chat-status-pill">
          <Server :size="15" />
          <span>总设备</span>
          <strong>{{ workbench.chatStatus.value?.totalDevices || activeChatLab?.deviceCount || '-' }}</strong>
        </div>
        <div class="chat-status-pill online">
          <Radio :size="15" />
          <span>已开机</span>
          <strong>{{ workbench.chatStatus.value?.onlineDevices ?? '-' }}</strong>
        </div>
        <button
          class="chat-status-refresh"
          type="button"
          :disabled="workbench.isChatStatusLoading.value"
          :title="`刷新状态，当前 ${chatStatusTime}`"
          @click="workbench.refreshLabChatStatus()"
        >
          <RefreshCw :size="15" />
          <span>{{ workbench.isChatStatusLoading.value ? '检测中' : chatStatusTime }}</span>
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

        <div v-if="workbench.isChatLoading.value" class="chat-message assistant loading">
          <div class="message-avatar">
            <Bot :size="16" />
          </div>
          <ChatMessageContent content="正在扫描串口、执行可用诊断命令并分析..." />
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
