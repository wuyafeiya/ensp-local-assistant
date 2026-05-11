<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

type Segment =
  | { type: 'text', content: string }
  | { type: 'code', language: string, content: string }

type MarkdownBlock =
  | { type: 'heading', level: number, content: string }
  | { type: 'paragraph', content: string }
  | { type: 'list', ordered: boolean, items: string[] }
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

const blocks = computed<MarkdownBlock[]>(() => {
  return segments.value.flatMap((segment) => {
    if (segment.type === 'code')
      return [{ type: 'code', language: segment.language, content: segment.content } satisfies MarkdownBlock]

    return parseTextBlocks(segment.content)
  })
})

function parseTextBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = content.split('\n')
  let paragraph: string[] = []
  let list: { ordered: boolean, items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', content: paragraph.join(' ') })
      paragraph = []
    }
  }

  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items })
      list = null
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', level: heading[1].length, content: heading[2] })
      continue
    }

    const unordered = line.match(/^[-*]\s+(.+)$/)
    const ordered = line.match(/^\d+\.\s+(.+)$/)
    const listItem = unordered?.[1] ?? ordered?.[1]
    if (listItem) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      if (!list || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [] }
      }
      list.items.push(listItem)
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return blocks
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}
</script>

<template>
  <div class="markdown-message">
    <template v-for="(block, index) in blocks" :key="index">
      <component
        :is="`h${Math.min(block.level, 3)}`"
        v-if="block.type === 'heading'"
        class="message-heading"
        :class="`level-${block.level}`"
        v-html="renderInline(block.content)"
      />
      <p v-else-if="block.type === 'paragraph'" v-html="renderInline(block.content)" />
      <ol v-else-if="block.type === 'list' && block.ordered" class="message-list">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex" v-html="renderInline(item)" />
      </ol>
      <ul v-else-if="block.type === 'list'" class="message-list">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex" v-html="renderInline(item)" />
      </ul>
      <pre v-else class="message-code"><code>{{ block.content }}</code></pre>
    </template>
  </div>
</template>
