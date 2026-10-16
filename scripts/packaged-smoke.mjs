import { _electron as electron } from 'playwright-core'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: resolve('release/win-unpacked/Armonia Assistente.exe'), env })
try {
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'La musica inizia con una domanda.' }).waitFor()
  const packaged = await app.evaluate(({ app }) => app.isPackaged)
  const result = await page.evaluate(() => window.armonia.initialize())
  assert(packaged, 'L’app non risulta un pacchetto di produzione')
  assert(result.ok, result.error)
  assert(result.value.document.sectionCount > 80, 'Documentazione inclusa nel pacchetto non indicizzata')
  assert(result.value.document.updated.includes('15 ottobre 2026'))
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  console.log(`Pacchetto Windows OK: avvio eseguibile, preload isolato, guida inclusa (${result.value.document.sectionCount} sezioni).`)
} finally { await app.close() }
