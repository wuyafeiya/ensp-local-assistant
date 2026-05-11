<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { TopologyDeviceType, TopologyPreview } from '@ensp-assistant/shared'

const props = defineProps<{
  preview: TopologyPreview | null
  title: string
  uid: string
  editable?: boolean
}>()

const emit = defineEmits<{
  moveNode: [node: { id: string, x: number, y: number }]
}>()

const svgRef = ref<SVGSVGElement | null>(null)
const draggingNodeId = ref('')
const safeUid = computed(() => props.uid.replace(/[^a-zA-Z0-9_-]/g, ''))

const nodeMap = computed(() => {
  const map = new Map<string, NonNullable<TopologyPreview['nodes']>[number]>()
  for (const node of props.preview?.nodes ?? [])
    map.set(node.id, node)
  return map
})

const drawableLinks = computed(() => {
  return (props.preview?.links ?? []).map((link) => {
    const source = nodeMap.value.get(link.sourceId)
    const target = nodeMap.value.get(link.targetId)
    return source && target ? { ...link, source, target } : null
  }).filter((item): item is NonNullable<typeof item> => item !== null)
})

function iconClass(type: TopologyDeviceType) {
  return ['preview-node', `preview-node-${type}`]
}

function gradientFor(type: TopologyDeviceType) {
  const key = type === 'unknown' ? 'router' : type
  return `url(#${safeUid.value}-${key})`
}

function linkPath(link: NonNullable<typeof drawableLinks.value>[number]) {
  const { source, target } = link
  const dx = target.x - source.x
  const dy = target.y - source.y

  if (Math.abs(dx) < 8 || Math.abs(dy) < 8)
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`

  const curve = Math.min(110, Math.max(48, Math.abs(dx) * 0.42))
  return `M ${source.x} ${source.y} C ${source.x + Math.sign(dx) * curve} ${source.y}, ${target.x - Math.sign(dx) * curve} ${target.y}, ${target.x} ${target.y}`
}

function pointFromEvent(event: PointerEvent) {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect)
    return null
  return {
    x: Math.round(Math.max(36, Math.min(564, ((event.clientX - rect.left) / rect.width) * 600))),
    y: Math.round(Math.max(44, Math.min(296, ((event.clientY - rect.top) / rect.height) * 340))),
  }
}

function onNodePointerDown(nodeId: string, event: PointerEvent) {
  if (!props.editable)
    return
  event.preventDefault()
  event.stopPropagation()
  draggingNodeId.value = nodeId
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function onPointerMove(event: PointerEvent) {
  if (!draggingNodeId.value)
    return
  const point = pointFromEvent(event)
  if (point)
    emit('moveNode', { id: draggingNodeId.value, ...point })
}

function onPointerUp() {
  draggingNodeId.value = ''
  window.removeEventListener('pointermove', onPointerMove)
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div class="topology-preview" :class="{ empty: !preview || preview.parseStatus === 'failed', editable }">
    <svg ref="svgRef" viewBox="0 0 600 340" role="img" :aria-label="`${title} 拓扑预览`">
      <defs>
        <radialGradient :id="`${safeUid}-mesh`" cx="20%" cy="12%" r="90%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="46%" stop-color="#F4F1FA" stop-opacity="0.94" />
          <stop offset="100%" stop-color="#E7E0F1" stop-opacity="0.9" />
        </radialGradient>
        <linearGradient :id="`${safeUid}-router`" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#A78BFA" />
          <stop offset="100%" stop-color="#7C3AED" />
        </linearGradient>
        <linearGradient :id="`${safeUid}-switch`" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#0EA5E9" />
        </linearGradient>
        <linearGradient :id="`${safeUid}-pc`" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#F472B6" />
          <stop offset="100%" stop-color="#DB2777" />
        </linearGradient>
        <linearGradient :id="`${safeUid}-server`" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#34D399" />
          <stop offset="100%" stop-color="#10B981" />
        </linearGradient>
        <linearGradient :id="`${safeUid}-cloud`" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#FBBF24" />
          <stop offset="100%" stop-color="#F59E0B" />
        </linearGradient>
        <linearGradient :id="`${safeUid}-firewall`" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#FB7185" />
          <stop offset="100%" stop-color="#E11D48" />
        </linearGradient>
        <filter :id="`${safeUid}-soft-shadow`" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="8" dy="10" stdDeviation="9" flood-color="#A096B4" flood-opacity="0.25" />
          <feDropShadow dx="-4" dy="-4" stdDeviation="7" flood-color="#FFFFFF" flood-opacity="0.86" />
        </filter>
      </defs>

      <rect width="600" height="340" rx="32" :fill="`url(#${safeUid}-mesh)`" />
      <circle class="preview-blob violet" cx="60" cy="46" r="80" />
      <circle class="preview-blob pink" cx="540" cy="270" r="110" />
      <path class="preview-grid" d="M58 72 H542 M58 128 H542 M58 184 H542 M58 240 H542 M118 42 V292 M238 42 V292 M358 42 V292 M478 42 V292" />

      <template v-if="preview && preview.parseStatus !== 'failed' && preview.nodes.length">
        <g v-for="link in drawableLinks" :key="link.id" class="preview-link" :class="{ serial: link.isSerial }">
          <path :d="linkPath(link)" />
        </g>

        <g
          v-for="node in preview.nodes"
          :key="node.id"
          :class="iconClass(node.type)"
          :transform="`translate(${node.x}, ${node.y})`"
          @pointerdown="onNodePointerDown(node.id, $event)"
        >
          <rect x="-35" y="-25" width="70" height="50" rx="18" :fill="gradientFor(node.type)" :filter="`url(#${safeUid}-soft-shadow)`" />
          <path v-if="node.type === 'router'" d="M-18 -2 H18 M-8 -12 L-18 -2 L-8 8 M8 -12 L18 -2 L8 8" />
          <path v-else-if="node.type === 'switch'" d="M-20 -8 H20 M-20 8 H20 M-12 -16 V16 M0 -16 V16 M12 -16 V16" />
          <path v-else-if="node.type === 'pc'" d="M-17 -12 H17 V9 H-17 Z M-8 17 H8 M0 9 V17" />
          <path v-else-if="node.type === 'server'" d="M-18 -16 H18 V16 H-18 Z M-8 -6 H10 M-8 6 H10 M-12 -6 H-10 M-12 6 H-10" />
          <path v-else-if="node.type === 'cloud'" d="M-21 7 C-28 5 -28 -8 -17 -9 C-13 -22 7 -20 9 -8 C22 -9 26 8 13 10 H-18 C-19 10 -20 9 -21 7 Z" />
          <path v-else-if="node.type === 'firewall'" d="M0 -19 L19 -11 V2 C19 14 9 20 0 23 C-9 20 -19 14 -19 2 V-11 Z M-9 -2 H9 M0 -10 V11" />
          <path v-else d="M-16 -12 H16 V12 H-16 Z M-6 -2 H6" />
          <text x="0" y="42">{{ node.name }}</text>
        </g>
      </template>

      <g v-else class="preview-empty-state">
        <circle cx="300" cy="150" r="54" />
        <path d="M274 151 C289 128 311 128 326 151 M260 188 H340 M300 96 V120 M242 132 L264 142 M358 132 L336 142" />
        <text x="300" y="238">等待拓扑预览</text>
      </g>
    </svg>
  </div>
</template>
