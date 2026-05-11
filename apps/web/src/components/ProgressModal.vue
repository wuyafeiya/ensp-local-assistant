<script setup lang="ts">
import { CheckCircle2, Circle, LoaderCircle, X, XCircle } from 'lucide-vue-next'

export type ProgressStepStatus = 'pending' | 'running' | 'done' | 'failed'

export interface ProgressStep {
  id: string
  label: string
  detail: string
  status: ProgressStepStatus
}

defineProps<{
  open: boolean
  title: string
  subtitle: string
  result: 'running' | 'success' | 'failed'
  steps: ProgressStep[]
  primaryLabel?: string
  primaryDisabled?: boolean
}>()

const emit = defineEmits<{
  close: []
  primary: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="progress-modal-backdrop" @click.self="emit('close')">
      <section class="progress-modal" role="dialog" aria-modal="true" :aria-label="title">
        <header class="progress-modal-header">
          <div class="progress-orb" :class="result">
            <LoaderCircle v-if="result === 'running'" :size="24" />
            <CheckCircle2 v-else-if="result === 'success'" :size="24" />
            <XCircle v-else :size="24" />
          </div>
          <div>
            <span>{{ subtitle }}</span>
            <strong>{{ title }}</strong>
          </div>
          <button class="modal-icon-button" type="button" title="关闭" @click="emit('close')">
            <X :size="19" />
          </button>
        </header>

        <div class="progress-step-list">
          <div v-for="step in steps" :key="step.id" class="progress-step" :class="step.status">
            <div class="progress-step-icon">
              <LoaderCircle v-if="step.status === 'running'" :size="18" />
              <CheckCircle2 v-else-if="step.status === 'done'" :size="18" />
              <XCircle v-else-if="step.status === 'failed'" :size="18" />
              <Circle v-else :size="18" />
            </div>
            <div>
              <strong>{{ step.label }}</strong>
              <span>{{ step.detail }}</span>
            </div>
          </div>
        </div>

        <footer class="progress-modal-footer">
          <button
            v-if="primaryLabel"
            class="modal-save-button"
            type="button"
            :disabled="primaryDisabled"
            @click="emit('primary')"
          >
            {{ primaryLabel }}
          </button>
          <button class="modal-secondary-button" type="button" @click="emit('close')">
            {{ result === 'running' ? '后台等待' : '关闭' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
