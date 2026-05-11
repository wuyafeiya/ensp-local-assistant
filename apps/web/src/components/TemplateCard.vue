<script setup lang="ts">
import { BookOpenText, ExternalLink, FileCheck2, FileTerminal, FolderTree, Play } from 'lucide-vue-next'
import type { LabProject } from '@ensp-assistant/shared'

defineProps<{
  lab: LabProject
}>()

const emit = defineEmits<{
  launch: [labId: string]
}>()
</script>

<template>
  <article class="template-card">
    <div class="template-card-top">
      <div class="template-icon">
        <FolderTree :size="24" />
      </div>
      <span class="template-protocol">{{ lab.protocol }}</span>
    </div>

    <div class="template-content">
      <h2>{{ lab.name }}</h2>
      <p>{{ lab.path }}</p>
    </div>

    <div class="template-signals">
      <span :class="{ muted: !lab.topologyFile }">
        <FileCheck2 :size="15" />
        {{ lab.topologyFile ? '.topo' : '缺少拓扑' }}
      </span>
      <span :class="{ muted: !lab.readmeFile }">
        <BookOpenText :size="15" />
        {{ lab.readmeFile ? '说明' : '无说明' }}
      </span>
      <span :class="{ muted: lab.configCount === 0 }">
        <FileTerminal :size="15" />
        {{ lab.configCount }} 配置
      </span>
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
