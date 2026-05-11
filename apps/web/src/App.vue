<script setup lang="ts">
import { onMounted } from 'vue'
import {
  Boxes,
  Gauge,
  Layers3,
  LibraryBig,
  PlayCircle,
  RefreshCcw,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-vue-next'
import TemplateCard from './components/TemplateCard.vue'
import { useWorkbench } from './composables/useWorkbench'

const workbench = useWorkbench()

const navigationItems = [
  { label: '模板库', icon: LibraryBig, active: true },
  { label: '拓扑预览', icon: Layers3, active: false },
  { label: '启动记录', icon: PlayCircle, active: false },
  { label: '本地设置', icon: Settings2, active: false },
]

onMounted(() => {
  void workbench.loadInitialData()
})
</script>

<template>
  <div class="template-app">
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
      <section class="template-control-panel">
        <div class="template-toolbar">
          <button class="tool-button strong" type="button" title="重新扫描模板" @click="workbench.scanLabs">
            <RefreshCcw :size="18" />
            <span>扫描模板</span>
          </button>

          <label class="template-search">
            <Search :size="18" />
            <input v-model="workbench.query.value" type="search" placeholder="搜索实验名称、协议、路径">
          </label>
          <div class="template-count-pill">
            <Sparkles :size="17" />
            <span>{{ workbench.filteredLabs.value.length }} 个模板</span>
          </div>
        </div>
      </section>

      <section v-if="workbench.error.value" class="template-error">
        {{ workbench.error.value }}
      </section>

      <section class="template-grid">
        <TemplateCard
          v-for="lab in workbench.filteredLabs.value"
          :key="lab.id"
          :lab="lab"
          @launch="workbench.launchLab"
          @open-configs="workbench.openConfigs"
        />
      </section>
    </main>
  </div>
</template>
