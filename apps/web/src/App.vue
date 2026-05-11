<script setup lang="ts">
import { onMounted } from 'vue'
import { FolderOpen, RefreshCcw, Save, Search, ServerCog, Sparkles } from 'lucide-vue-next'
import TemplateCard from './components/TemplateCard.vue'
import { useWorkbench } from './composables/useWorkbench'

const workbench = useWorkbench()

onMounted(() => {
  void workbench.loadInitialData()
})
</script>

<template>
  <div class="template-app">
    <main class="template-workspace">
      <section class="template-hero">
        <div>
          <p class="eyebrow">eNSP Local Templates</p>
          <h1>本地拓扑模板启动台</h1>
          <p class="hero-copy">
            扫描你的实验目录，把保存过的 eNSP `.topo` 拓扑整理成卡片，点击即可调用本机 eNSP 打开。
          </p>
        </div>
        <div class="hero-status" :class="{ loading: workbench.isLoading.value }">
          <span />
          {{ workbench.status.value }}
        </div>
      </section>

      <section class="template-toolbar">
        <label class="template-input wide">
          <FolderOpen :size="18" />
          <input
            v-model="workbench.settings.value.labRoot"
            placeholder="实验根目录，例如 D:\\eNSP-Labs"
            spellcheck="false"
          >
        </label>
        <label class="template-input">
          <ServerCog :size="18" />
          <input
            v-model="workbench.settings.value.enspExecutable"
            placeholder="eNSP.exe 路径，可选"
            spellcheck="false"
          >
        </label>
        <button class="tool-button" type="button" title="保存目录设置" @click="workbench.saveSettings(workbench.settings.value)">
          <Save :size="18" />
        </button>
        <button class="tool-button strong" type="button" title="重新扫描模板" @click="workbench.scanLabs">
          <RefreshCcw :size="18" />
          <span>扫描模板</span>
        </button>
      </section>

      <section class="template-filter">
        <label>
          <Search :size="18" />
          <input v-model="workbench.query.value" type="search" placeholder="搜索实验名称、协议、路径">
        </label>
        <div>
          <Sparkles :size="17" />
          <span>{{ workbench.filteredLabs.value.length }} 个模板</span>
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
        />
      </section>
    </main>
  </div>
</template>
