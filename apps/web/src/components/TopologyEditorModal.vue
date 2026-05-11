<script setup lang="ts">
import { Save, X } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import type { LabProject, TopologyLayoutNode, TopologyPreview as TopologyPreviewData } from '@ensp-assistant/shared'
import TopologyPreview from './TopologyPreview.vue'

const props = defineProps<{
  lab: LabProject
  saving: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [nodes: TopologyLayoutNode[]]
}>()

const draftPreview = ref<TopologyPreviewData | null>(clonePreview(props.lab.preview))

watch(() => props.lab.preview, (preview) => {
  draftPreview.value = clonePreview(preview)
}, { deep: true })

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
  if (!draftPreview.value || props.saving)
    return

  emit('save', draftPreview.value.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })))
}
</script>

<template>
  <Teleport to="body">
    <div class="topology-modal-backdrop" @click.self="emit('close')">
      <section class="topology-modal" role="dialog" aria-modal="true" :aria-label="`${lab.name} 拓扑布局编辑`">
        <header class="topology-modal-header">
          <div>
            <span>拓扑布局编辑</span>
            <strong>{{ lab.name }}</strong>
          </div>
          <button class="modal-icon-button" type="button" title="关闭" @click="emit('close')">
            <X :size="19" />
          </button>
        </header>

        <div class="topology-editor-surface">
          <TopologyPreview
            :preview="draftPreview"
            :title="lab.name"
            :uid="`${lab.id}-editor`"
            editable
            @move-node="moveNode"
          />
        </div>

        <footer class="topology-modal-footer">
          <span>拖动设备调整位置，保存后首页卡片会使用这套布局。</span>
          <div class="modal-actions">
            <button class="modal-secondary-button" type="button" @click="emit('close')">
              取消
            </button>
            <button class="modal-save-button" type="button" :disabled="!draftPreview || saving" @click="saveLayout">
              <Save :size="17" />
              <span>{{ saving ? '保存中' : '保存布局' }}</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
