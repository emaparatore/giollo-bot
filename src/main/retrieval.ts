import type { DocumentInfo, Source, Turn } from '../shared/types'

interface Section {
  title: string
  text: string
  startLine: number
  endLine: number
  terms: Map<string, number>
  titleTerms: Set<string>
  length: number
}

const STOP = new Set(`a ad al alla alle allo ai agli anche ancora avere che chi ci cio come con cosa da dal dalla dalle dei del della delle dello di dove e ed è era essere fa fare fra gli ha hai hanno ho i il in io la le lo ma mi mia mio ne nei nel nella nelle no non o ogni per piu poi posso può quale quali quando quanto quanti quante questa queste questo questi se sei si sia siamo sono su sul sulla tra tu un una uno va vi vorrei voglio sapere informazioni grazie invece allora dimmi`.split(/\s+/))

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function stem(word: string): string {
  return word.length > 4 ? word.replace(/[aeio]$/, '') : word
}

export function tokenize(text: string): string[] {
  return (normalize(text).match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map(stem)
}

const SYNONYMS = [
  ['costo', 'costa', 'costano', 'prezzo', 'tariffa', 'retta', 'pagare'],
  ['piano', 'pianoforte'],
  ['bambino', 'bambina', 'figlio', 'figlia', 'minore'],
  ['lezione', 'incontro'],
  ['posto', 'libero', 'disponibilità', 'completo'],
  ['iscrivere', 'iscrivermi', 'iscrizione'],
  ['rinuncia', 'disdire', 'disdetta', 'interrompere', 'smettere'],
  ['assenza', 'manco', 'mancare', 'malato', 'malattia'],
  ['attestato', 'diploma', 'certificato'],
  ['sconto', 'agevolazione'],
  ['affitto', 'noleggio', 'noleggiare'],
  ['online', 'distanza', 'remoto']
].map((group) => group.flatMap(tokenize))

function queryTerms(text: string): Map<string, number> {
  const terms = new Map(tokenize(text).map((term) => [term, 1]))
  for (const group of SYNONYMS) {
    if (group.some((term) => terms.has(term))) {
      for (const term of group) if (!terms.has(term)) terms.set(term, 0.32)
    }
  }
  return terms
}

export class KnowledgeBase {
  private sections: Section[] = []
  private frequencies = new Map<string, number>()
  private averageLength = 1
  readonly info: DocumentInfo

  constructor(markdown: string, name = 'DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md') {
    const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/)
    let parent = ''
    let title = ''
    let start = 0
    const add = (end: number): void => {
      if (!title || title === 'Indice') return
      // Split at empty lines, so table headers and rows stay together.
      let chunkStart = start
      for (let i = start; i <= end; i++) {
        const tooLong = lines.slice(chunkStart, i + 1).join('\n').length > 5500
        if ((tooLong && lines[i]?.trim() === '') || i === end) {
          const text = lines.slice(chunkStart, i + 1).join('\n').replace(/\n---\s*$/, '').trim()
          if (text && !/^#{1,3}[^\n]+$/.test(text)) {
            const tokens = tokenize(text)
            const terms = new Map<string, number>()
            for (const term of tokens) terms.set(term, (terms.get(term) ?? 0) + 1)
            this.sections.push({ title, text, startLine: chunkStart + 1, endLine: i + 1,
              terms, titleTerms: new Set(tokenize(title)), length: tokens.length })
          }
          chunkStart = i + 1
        }
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const heading = /^(#{2,3})\s+(.+)$/.exec(lines[i])
      if (!heading) continue
      add(i - 1)
      if (heading[1] === '##') {
        parent = heading[2]
        title = parent
      } else title = `${parent} › ${heading[2]}`
      start = i
    }
    add(lines.length - 1)
    for (const section of this.sections) {
      for (const term of section.terms.keys()) this.frequencies.set(term, (this.frequencies.get(term) ?? 0) + 1)
    }
    this.averageLength = this.sections.reduce((total, section) => total + section.length, 0) / Math.max(1, this.sections.length)
    this.info = {
      name,
      updated: /\*\*Ultimo aggiornamento:\*\*\s*([^\n]+)/.exec(markdown)?.[1]?.trim() ?? 'Non specificato',
      sectionCount: this.sections.length
    }
    if (this.sections.length === 0) throw new Error('La documentazione non contiene sezioni Markdown leggibili.')
  }

  search(question: string, history: Turn[] = [], budget = 16000): Source[] {
    const current = queryTerms(question)
    if (!current.size) return []
    const terms = new Map(current)
    // Recover the topic in short follow-ups, giving the current question more weight.
    if (tokenize(question).length < 9 && history.length) {
      const previous = history.filter((turn) => turn.role === 'user').slice(-2)
      previous.forEach((turn, index) => {
        for (const [term, weight] of queryTerms(turn.content)) {
          if (!terms.has(term)) terms.set(term, weight * (index === previous.length - 1 ? 0.55 : 0.2))
        }
      })
    }
    const score = (section: Section, query: Map<string, number>): number => {
      let result = 0
      for (const [term, weight] of query) {
        const tf = section.terms.get(term) ?? 0
        if (!tf) continue
        const df = this.frequencies.get(term) ?? 0
        const idf = Math.log(1 + (this.sections.length - df + 0.5) / (df + 0.5))
        const bm25 = (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * section.length / this.averageLength))
        result += weight * idf * (bm25 + (section.titleTerms.has(term) ? 1.7 : 0))
      }
      return result
    }
    const ranked = this.sections.map((section) => ({ section, score: score(section, terms), current: score(section, current) }))
      .sort((a, b) => b.score - a.score)
    // A completely unrelated question must not inherit an answer from earlier turns.
    if (!ranked.some((item) => item.current > 0)) return []
    const selected: Section[] = []
    let chars = 0
    const append = (section: Section): void => {
      if (selected.includes(section) || chars + section.text.length > budget || selected.length >= 7) return
      selected.push(section)
      chars += section.text.length
    }
    // Include the tariff table and enrollment fee together for pricing questions.
    const pricing = tokenize('costo costa costano prezzo tariffa retta pagare preventivo').some((term) => current.has(term))
    if (pricing) {
      for (const heading of ['9.2 Retta', '9.1 Quota']) {
        const section = this.sections.find((item) => item.title.includes(heading))
        if (section) append(section)
      }
    }
    for (const item of ranked) {
      if (item.score > 0 && item.score >= ranked[0].score * 0.16) append(item.section)
    }
    // Preserve useful reading order instead of presenting a random list of fragments.
    return selected.sort((a, b) => a.startLine - b.startLine).map((section, index) => ({
      id: `S${index + 1}`, title: section.title, text: section.text,
      startLine: section.startLine, endLine: section.endLine
    }))
  }
}
