<template>
  <div class="chat-progress-card" role="status" aria-live="polite">
    <div class="chat-progress-copy">
      <strong>正在执行现场任务</strong>
      <span>先解析你的意图，再匹配设备和接口，最后读取串口回显。</span>
    </div>
    <div class="chat-progress-track" aria-hidden="true">
      <span />
    </div>
    <div class="chat-progress-steps" aria-hidden="true">
      <span style="--delay: 0ms">解析请求</span>
      <span style="--delay: 450ms">扫描串口</span>
      <span style="--delay: 900ms">下发命令</span>
      <span style="--delay: 1350ms">整理回显</span>
    </div>
    <ul class="chat-progress-log" aria-hidden="true">
      <li>检测在线设备与 sysname</li>
      <li>处理分页、关闭 More 输出</li>
      <li>执行后自动校验关键回显</li>
    </ul>
  </div>
</template>
