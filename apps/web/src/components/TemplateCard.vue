<script setup lang="ts">
import { ExternalLink, FileCheck2, FileTerminal, Play, Route, Save, TriangleAlert } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import type { LabProject, TopologyLayoutNode, TopologyPreview as TopologyPreviewData } from '@ensp-assistant/shared'
import TopologyPreview from './TopologyPreview.vue'

const props = defineProps<{
  lab: LabProject
}>()

const emit = defineEmits<{
  launch: [labId: string]
  openConfigs: [labId: string]
  saveLayout: [labId: string, nodes: TopologyLayoutNode[]]
}>()

const localPreview = ref<TopologyPreviewData | null>(clonePreview(props.lab.preview))

watch(() => props.lab.preview, (preview) => {
  localPreview.value = clonePreview(preview)
}, { deep: true })

function clonePreview(preview: TopologyPreviewData | null): TopologyPreviewData | null {
  return preview ? JSON.parse(JSON.stringify(preview)) as TopologyPreviewData : null
}

function previewLabel(lab: LabProject) {
  if (!localPreview.value)
    return '未生成预览'
  if (localPreview.value.parseStatus === 'failed')
    return '解析失败'
  if (localPreview.value.parseStatus === 'partial')
    return '预览不完整'
  return '可拖拽编辑'
}

function moveNode(node: TopologyLayoutNode) {
  if (!localPreview.value)
    return
  localPreview.value = {
    ...localPreview.value,
    nodes: localPreview.value.nodes.map(item => item.id === node.id ? { ...item, x: node.x, y: node.y } : item),
  }
}

function saveCurrentLayout() {
  if (!localPreview.value)
    return
  emit('saveLayout', props.lab.id, localPreview.value.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })))
}
</script>

<template>
  <article class="template-card">
    <div class="template-preview-wrap">
      <TopologyPreview :preview="localPreview" :title="lab.name" :uid="lab.id" editable @move-node="moveNode" />
      <div class="preview-badge" :class="localPreview?.parseStatus">
        <TriangleAlert v-if="localPreview?.parseStatus === 'failed' || localPreview?.parseStatus === 'partial'" :size="14" />
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
      <div class="template-actions">
        <button class="ai-button" type="button" :disabled="!localPreview" @click="saveCurrentLayout">
          <Save :size="16" />
          <span>保存布局</span>
        </button>
        <button class="launch-button" type="button" :disabled="!lab.topologyFile" @click="emit('launch', lab.id)">
          <Play :size="16" />
          <span>启动</span>
          <ExternalLink :size="14" />
        </button>
      </div>
    </div>
  </article>
</template>
