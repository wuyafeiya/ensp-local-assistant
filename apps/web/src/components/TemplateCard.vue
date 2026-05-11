<script setup lang="ts">
import { ExternalLink, FileCheck2, FileTerminal, Play, Route, TriangleAlert } from 'lucide-vue-next'
import type { LabProject } from '@ensp-assistant/shared'
import TopologyPreview from './TopologyPreview.vue'

defineProps<{
  lab: LabProject
}>()

const emit = defineEmits<{
  launch: [labId: string]
  openConfigs: [labId: string]
}>()

function previewLabel(lab: LabProject) {
  if (!lab.preview)
    return '未生成预览'
  if (lab.preview.parseStatus === 'failed')
    return '解析失败'
  if (lab.preview.parseStatus === 'partial')
    return '预览不完整'
  return '拓扑预览'
}
</script>

<template>
  <article class="template-card">
    <div class="template-preview-wrap">
      <TopologyPreview :preview="lab.preview" :title="lab.name" :uid="lab.id" />
      <div class="preview-badge" :class="lab.preview?.parseStatus">
        <TriangleAlert v-if="lab.preview?.parseStatus === 'failed' || lab.preview?.parseStatus === 'partial'" :size="14" />
        <Route v-else :size="14" />
        <span>{{ previewLabel(lab) }}</span>
      </div>
    </div>

    <div class="template-card-top">
      <span class="template-protocol">{{ lab.protocol }}</span>
      <span class="template-count">{{ lab.deviceCount || '-' }} 设备 / {{ lab.linkCount || '-' }} 链路</span>
    </div>

    <div class="template-content">
      <h2>{{ lab.name }}</h2>
      <p :title="lab.path">{{ lab.path }}</p>
    </div>

    <div class="template-signals">
      <span :class="{ muted: !lab.topologyFile }">
        <FileCheck2 :size="15" />
        {{ lab.topologyFile ? '.topo' : '缺少拓扑' }}
      </span>
      <button
        class="signal-button"
        type="button"
        :disabled="lab.configCount === 0"
        :title="lab.configCount ? `打开 ${lab.configFiles[0]?.name ?? '配置文件'}` : '未发现配置文件'"
        @click="emit('openConfigs', lab.id)"
      >
        <FileTerminal :size="15" />
        {{ lab.configCount }} 配置
      </button>
    </div>

    <div class="template-footer">
      <span class="template-date">{{ lab.modifiedAt ? new Date(lab.modifiedAt).toLocaleDateString('zh-CN') : '未记录' }}</span>
      <button class="launch-button" type="button" :disabled="!lab.topologyFile" @click="emit('launch', lab.id)">
        <Play :size="16" />
        <span>启动拓扑</span>
        <ExternalLink :size="14" />
      </button>
    </div>
  </article>
</template>
