import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KnowledgeBase } from '../src/main/retrieval'

const document = readFileSync(resolve('DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md'), 'utf8')
const knowledge = new KnowledgeBase(document)
const searchText = (question: string): string => knowledge.search(question).map((source) => source.text).join('\n')

describe('Ricerca sulla guida reale', () => {
  it('recupera listino, quota e totale annuale per il pianoforte', () => {
    const text = searchText('Quanto costa un anno di pianoforte individuale da 30 minuti, inclusa iscrizione?')
    expect(text).toContain('€800')
    expect(text).toContain('€60')
    expect(text).toContain('€860')
  })

  it('recupera il vincolo del martedì alle 18:00 e non solo i posti di piano', () => {
    const text = searchText('Posso iniziare pianoforte il martedì alle 18:00?')
    expect(text).toMatch(/17:00–19:00/)
    expect(text).toContain('Ada Ricci')
  })

  it('include lo stato completo di batteria e la data della fotografia', () => {
    const text = searchText('Ci sono posti liberi per batteria?')
    expect(text).toContain('Completo; lista d’attesa')
    expect(text).toContain('15 ottobre 2026')
  })

  it('trova la non cumulabilità degli sconti sulla stessa retta', () => {
    expect(searchText('Posso sommare sconto famiglia e secondo corso?')).toContain('non si sommano')
  })

  it('non confonde informazioni personali con dati generali', () => {
    const text = searchText('Il mio pagamento non compare nell’area allievi: devo pagare di nuovo?')
    expect(text).toContain('Non effettuare un secondo pagamento')
  })

  it('mantiene il tema in una domanda successiva breve', () => {
    const sources = knowledge.search('E per 45 minuti?', [{ role: 'user', content: 'Quanto costa il pianoforte?' }])
    expect(sources.map((source) => source.text).join('\n')).toContain('IND-45')
  })

  it('non usa la cronologia per rispondere a una domanda estranea', () => {
    expect(knowledge.search('Astrofisica quantistica', [{ role: 'user', content: 'Quanto costa pianoforte?' }])).toEqual([])
  })

  it('restituisce citazioni con righe fedeli al documento e rispetta il budget', () => {
    const sources = knowledge.search('Quali corsi ci sono e quanto costano?', [], 8000)
    const lines = document.split(/\r?\n/)
    expect(sources.length).toBeGreaterThan(1)
    expect(sources.reduce((total, source) => total + source.text.length, 0)).toBeLessThanOrEqual(8000)
    for (const source of sources) {
      expect(lines.slice(source.startLine - 1, source.endLine).join('\n')).toContain(source.text)
      expect(source.id).toMatch(/^S\d+$/)
    }
  })
})
