import cors from 'cors'
import express from 'express'
import { chatWithLab, getLabChatStatus } from './aiTopology.js'
import { injectRandomFault } from './faultInjector.js'
import { labIndex, scanLabs } from './labScanner.js'
import { saveLayout } from './layoutStore.js'
import { openLocalPath, openTopology } from './opener.js'
import { scanSerialConsoles } from './serialScanner.js'
import { readSettings, writeSettings } from './settings.js'

const app = express()
const port = Number(process.env.PORT ?? 8787)
let activeOpenedLabId = ''

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    data: {
      ok: true,
      service: 'ensp-local-assistant',
      time: new Date().toISOString(),
    },
  })
})

app.get('/api/settings', async (_req, res, next) => {
  try {
    res.json({ data: await readSettings() })
  }
  catch (error) {
    next(error)
  }
})

app.put('/api/settings', async (req, res, next) => {
  try {
    res.json({ data: await writeSettings(req.body) })
  }
  catch (error) {
    next(error)
  }
})

app.get('/api/labs', async (_req, res, next) => {
  try {
    const settings = await readSettings()
    res.json({ data: await scanLabs(settings.labRoot) })
  }
  catch (error) {
    next(error)
  }
})

app.post('/api/labs/:id/open', async (req, res, next) => {
  try {
    const settings = await readSettings()
    const lab = labIndex.get(req.params.id)

    if (!lab?.topologyFile) {
      res.status(404).json({ error: 'Topology file not found. Scan labs first.' })
      return
    }

    const result = await openTopology(lab.topologyFile, settings.enspExecutable)
    if (result.opened)
      activeOpenedLabId = lab.id
    res.json({ data: result })
  }
  catch (error) {
    next(error)
  }
})

app.post('/api/labs/:id/open-configs', async (req, res, next) => {
  try {
    const lab = labIndex.get(req.params.id)

    if (!lab) {
      res.status(404).json({ error: 'Lab not found. Scan labs first.' })
      return
    }

    const target = lab.configFiles[0]?.path ?? lab.path
    res.json({ data: await openLocalPath(target) })
  }
  catch (error) {
    next(error)
  }
})

app.post('/api/labs/:id/layout', async (req, res, next) => {
  try {
    const lab = labIndex.get(req.params.id)

    if (!lab?.preview) {
      res.status(404).json({ error: 'Topology preview not found. Scan labs first.' })
      return
    }

    const nodes = await saveLayout(req.params.id, req.body.nodes ?? [])
    const positions = new Map(nodes.map(node => [node.id, node]))
    lab.preview.nodes = lab.preview.nodes.map((node) => {
      const position = positions.get(node.id)
      return position ? { ...node, x: position.x, y: position.y } : node
    })
    res.json({ data: lab })
  }
  catch (error) {
    next(error)
  }
})

app.post('/api/labs/:id/chat', async (req, res, next) => {
  try {
    const settings = await readSettings()
    const lab = labIndex.get(req.params.id)

    if (!lab) {
      res.status(404).json({ error: 'Lab not found. Scan labs first.' })
      return
    }

    res.json({ data: await chatWithLab(settings, lab, req.body.messages ?? []) })
  }
  catch (error) {
    next(error)
  }
})

app.get('/api/labs/:id/chat-status', async (req, res, next) => {
  try {
    const lab = labIndex.get(req.params.id)

    if (!lab) {
      res.status(404).json({ error: 'Lab not found. Scan labs first.' })
      return
    }

    res.json({ data: await getLabChatStatus(lab) })
  }
  catch (error) {
    next(error)
  }
})

app.post('/api/labs/:id/inject-fault', async (req, res, next) => {
  try {
    const lab = labIndex.get(req.params.id)

    if (!lab) {
      res.status(404).json({ error: 'Lab not found. Scan labs first.' })
      return
    }

    if (activeOpenedLabId !== lab.id) {
      res.status(409).json({ error: '当前拓扑不是最近通过平台启动的拓扑。请先点击该拓扑的“启动”，再投放故障，避免误投到其它已打开拓扑。' })
      return
    }

    res.json({ data: await injectRandomFault(lab) })
  }
  catch (error) {
    next(error)
  }
})

app.get('/api/serial/scan', async (_req, res, next) => {
  try {
    res.json({ data: await scanSerialConsoles() })
  }
  catch (error) {
    next(error)
  }
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unknown server error'
  res.status(500).json({ error: message })
})

app.listen(port, () => {
  console.log(`eNSP Local Assistant API listening on http://localhost:${port}`)
})
