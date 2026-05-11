<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

type Segment =
  | { type: 'text', content: string }
  | { type: 'code', language: string, content: string }

const segments = computed<Segment[]>(() => {
  const result: Segment[] = []
  const pattern = /```(\w+)?\n([\s\S]*?)```/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(props.content)) !== null) {
    if (match.index > cursor)
      result.push({ type: 'text', content: props.content.slice(cursor, match.index).trim() })

    result.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trim(),
    })
    cursor = match.index + match[0].length
  }

  if (cursor < props.content.length)
    result.push({ type: 'text', content: props.content.slice(cursor).trim() })

  return result.filter(segment => segment.content)
})

function textLines(content: string) {
  return content.split('\n').map(line => line.trim()).filter(Boolean)
}
</script>

<template>
  <div class="markdown-message">
    <template v-for="(segment, index) in segments" :key="index">
      <pre v-if="segment.type === 'code'" class="message-code"><code>{{ segment.content }}</code></pre>
      <template v-else>
        <p v-for="(line, lineIndex) in textLines(segment.content)" :key="`${index}-${lineIndex}`">
          {{ line }}
        </p>
      </template>
    </template>
  </div>
</template>
