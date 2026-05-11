<script setup lang="ts">
import { Bot, Bug, FileTerminal, PencilLine, Play, Power } from 'lucide-vue-next'
import type { LabProject } from '@ensp-assistant/shared'
import TopologyPreview from './TopologyPreview.vue'

defineProps<{
  lab: LabProject
  isOpened: boolean
  isFaulting: boolean
}>()

const emit = defineEmits<{
  launch: [labId: string]
  openConfigs: [labId: string]
  editLayout: [labId: string]
  openChat: [labId: string]
  injectFault: [labId: string]
}>()
</script>

<template>
  <article class="template-card">
    <div class="template-preview-wrap">
      <TopologyPreview :preview="lab.preview" :title="lab.name" :uid="lab.id" />
    </div>

    <div class="template-card-top">
      <span v-if="lab.protocol !== 'General'" class="template-protocol">{{ lab.protocol }}</span>
      <span class="template-count">{{ lab.deviceCount || '-' }} 设备 / {{ lab.linkCount || '-' }} 链路</span>
    </div>

    <div class="template-content">
      <h2>{{ lab.name }}</h2>
      <p :title="lab.path">{{ lab.path }}</p>
    </div>

    <div class="template-signals">
      <span v-if="isOpened" class="opened-signal">
        <Power :size="15" />
        已打开
      </span>
      <button
        v-if="lab.configCount > 0"
        class="signal-button"
        type="button"
        :title="`打开 ${lab.configFiles[0]?.name ?? '配置文件'}`"
        @click="emit('openConfigs', lab.id)"
      >
        <FileTerminal :size="15" />
        {{ lab.configCount }} 配置
      </button>
    </div>

    <div class="template-footer">
      <span class="template-date">{{ lab.modifiedAt ? new Date(lab.modifiedAt).toLocaleDateString('zh-CN') : '未记录' }}</span>
      <div class="template-actions">
        <button class="card-icon-action ai" type="button" title="打开 AI 对话" @click="emit('openChat', lab.id)">
          <Bot :size="17" />
        </button>
        <button
          class="card-icon-action"
          type="button"
          :disabled="!lab.preview || lab.preview.parseStatus === 'failed'"
          title="编辑拓扑布局"
          @click="emit('editLayout', lab.id)"
        >
          <PencilLine :size="17" />
        </button>
        <button
          class="card-icon-action fault"
          type="button"
          :disabled="isFaulting"
          :title="isFaulting ? '正在投放故障' : '一键随机加错'"
          @click="emit('injectFault', lab.id)"
        >
          <Bug :size="17" />
        </button>
        <button class="launch-button" type="button" :disabled="!lab.topologyFile" @click="emit('launch', lab.id)">
          <Play :size="16" />
          <span>启动</span>
        </button>
      </div>
    </div>
  </article>
</template>
