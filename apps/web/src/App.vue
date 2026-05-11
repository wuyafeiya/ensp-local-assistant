<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Bot,
  Boxes,
  Gauge,
  Layers3,
  LibraryBig,
  Maximize2,
  Minimize2,
  PlayCircle,
  SendHorizontal,
  Settings2,
  UserRound,
  X,
} from 'lucide-vue-next'
import type { TopologyLayoutNode } from '@ensp-assistant/shared'
import ChatMessageContent from './components/ChatMessageContent.vue'
import TemplateCard from './components/TemplateCard.vue'
import TopologyEditorModal from './components/TopologyEditorModal.vue'
import { useWorkbench } from './composables/useWorkbench'

const workbench = useWorkbench()
const chatInput = ref('')
const layoutEditorLabId = ref('')
const isSavingLayout = ref(false)
const isChatExpanded = ref(false)

const activeChatLab = computed(() => {
  return workbench.labs.value.find(lab => lab.id === workbench.chatLabId.value) ?? null
})

const activeLayoutLab = computed(() => {
  return workbench.labs.value.find(lab => lab.id === layoutEditorLabId.value) ?? null
})

const navigationItems = [
  { label: '模板库', icon: LibraryBig, active: true },
  { label: '拓扑预览', icon: Layers3, active: false },
  { label: '启动记录', icon: PlayCircle, active: false },
  { label: '本地设置', icon: Settings2, active: false },
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
  layoutEditorLabId.value = labId
}

function openChat(labId: string) {
  workbench.openLabChat(labId)
  isChatExpanded.value = true
}

function closeLayoutEditor() {
  if (!isSavingLayout.value)
    layoutEditorLabId.value = ''
}

async function saveEditorLayout(nodes: TopologyLayoutNode[]) {
  if (!layoutEditorLabId.value)
    return

  isSavingLayout.value = true
  const saved = await workbench.saveLayout(layoutEditorLabId.value, nodes)
  isSavingLayout.value = false
  if (saved)
    layoutEditorLabId.value = ''
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
          :class="{ active: item.active }"
          type="button"
        >
          <component :is="item.icon" :size="19" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="sidebar-status">
        <Gauge :size="22" />
        <div>
          <strong>{{ workbench.filteredLabs.value.length }}</strong>
          <span>可用模板</span>
        </div>
      </div>
    </aside>

    <main class="template-workspace">
      <section v-if="workbench.error.value" class="template-error">
        {{ workbench.error.value }}
      </section>

      <section class="template-grid">
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
    </main>

    <TopologyEditorModal
      v-if="activeLayoutLab"
      :lab="activeLayoutLab"
      :saving="isSavingLayout"
      @close="closeLayoutEditor"
      @save="saveEditorLayout"
    />

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
          <ChatMessageContent content="正在扫描本机串口、读取配置并分析..." />
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
