<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, Save } from 'lucide-vue-next'
import type { LabProject, TopologyLayoutNode, TopologyPreview as TopologyPreviewData } from '@ensp-assistant/shared'
import TopologyPreview from './TopologyPreview.vue'

const props = defineProps<{
  labs: LabProject[]
  selectedLabId: string
  saving: boolean
}>()

const emit = defineEmits<{
  selectLab: [labId: string]
  back: []
  save: [labId: string, nodes: TopologyLayoutNode[]]
}>()

const draftPreview = ref<TopologyPreviewData | null>(null)

const selectedLab = computed(() => {
  return props.labs.find(lab => lab.id === props.selectedLabId) ?? props.labs.find(lab => lab.preview) ?? null
})

watch(selectedLab, (lab) => {
  draftPreview.value = clonePreview(lab?.preview ?? null)
}, { immediate: true })

function clonePreview(preview: TopologyPreviewData | null): TopologyPreviewData | null {
  return preview ? JSON.parse(JSON.stringify(preview)) as TopologyPreviewData : null
}

function moveNode(node: TopologyLayoutNode) {
  if (!draftPreview.value)
    return

  draftPreview.value = {
    ...draftPreview.value,
    nodes: draftPreview.value.nodes.map(item => item.id === node.id ? { ...item, x: node.x, y: node.y } : item),
  }
}

function saveLayout() {
  if (!selectedLab.value || !draftPreview.value || props.saving)
    return

  emit('save', selectedLab.value.id, draftPreview.value.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })))
}
</script>

<template>
  <section class="editor-page">
    <header class="editor-page-header">
      <button class="editor-back-button" type="button" title="返回模板库" @click="emit('back')">
        <ArrowLeft :size="18" />
      </button>
      <div>
        <span>拓扑编辑</span>
        <strong>{{ selectedLab?.name ?? '选择一个拓扑' }}</strong>
      </div>
      <button class="modal-save-button editor-save-button" type="button" :disabled="!draftPreview || saving" @click="saveLayout">
        <Save :size="17" />
        <span>{{ saving ? '保存中' : '保存布局' }}</span>
      </button>
    </header>

    <div class="editor-page-body">
      <aside class="editor-lab-rail" aria-label="可编辑拓扑">
        <button
          v-for="lab in labs"
          :key="lab.id"
          class="editor-lab-item"
          :class="{ active: selectedLab?.id === lab.id }"
          type="button"
          :disabled="!lab.preview || lab.preview.parseStatus === 'failed'"
          @click="emit('selectLab', lab.id)"
        >
          <strong>{{ lab.name }}</strong>
          <span>{{ lab.deviceCount || '-' }} 设备 / {{ lab.linkCount || '-' }} 链路</span>
        </button>
      </aside>

      <div class="editor-canvas-shell">
        <div v-if="selectedLab && draftPreview" class="editor-canvas">
          <TopologyPreview
            :preview="draftPreview"
            :title="selectedLab.name"
            :uid="`${selectedLab.id}-page-editor`"
            editable
            @move-node="moveNode"
          />
        </div>
        <div v-else class="editor-empty-state">
          <strong>暂无可编辑拓扑</strong>
          <span>请先扫描到包含 `.topo` 的实验模板。</span>
        </div>
      </div>
    </div>
  </section>
</template>
