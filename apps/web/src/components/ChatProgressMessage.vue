<template>
  <div class="chat-progress-card" role="status" aria-live="polite">
    <div class="chat-progress-copy">
      <strong>正在处理请求</strong>
      <span>分析意图、匹配设备、连接串口并整理执行结果</span>
    </div>
    <div class="chat-progress-track" aria-hidden="true">
      <span />
    </div>
    <div class="chat-progress-steps" aria-hidden="true">
      <span class="active">分析</span>
      <span>连接</span>
      <span>执行</span>
      <span>汇总</span>
    </div>
  </div>
</template>
