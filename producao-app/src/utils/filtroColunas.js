// Regras compartilhadas do menu de botão direito nas colunas (filtro rápido + ordenação).
// Usado por src/hooks/useMenuColunas.jsx. Dois jeitos de aplicar o resultado:
//   - tabela carregada inteira na tela  → filtrarEOrdenar(linhas, ...)
//   - tabela paginada no servidor (Supabase) → aplicarNoQuery(query, ...)
//
// Tipos de coluna: 'texto' | 'numero' | 'data' | 'lista' | 'pesquisavel' (lista com busca)

export const OP_TEXTO = [{ value: 'contem', label: 'Contém' }, { value: 'nao_contem', label: 'Não Contém' }, { value: 'igual', label: 'Igual a' }]
export const OP_COMPARA = [{ value: 'igual', label: 'Igual a' }, { value: 'maior', label: 'Maior que' }, { value: 'menor', label: 'Menor que' }]
export const OP_LISTA = [{ value: 'igual', label: 'Selecionado' }]

export const operadoresDoTipo = tipo => (tipo === 'texto' ? OP_TEXTO : tipo === 'numero' || tipo === 'data' ? OP_COMPARA : OP_LISTA)

const R_TEXTO = ['Crescente (A → Z)', 'Decrescente (Z → A)']
const R_DATA = ['Crescente (mais antigas primeiro)', 'Decrescente (mais recentes primeiro)']
const R_NUM = ['Crescente (menor → maior)', 'Decrescente (maior → menor)']
export const rotulosDoTipo = tipo => (tipo === 'texto' ? R_TEXTO : tipo === 'data' ? R_DATA : tipo === 'numero' ? R_NUM : ['Crescente', 'Decrescente'])

const vazio = v => v === null || v === undefined || v === ''

// ── Tabela carregada inteira ─────────────────────────────────────────────────
// filtros: { chave: { operador, valor } }   ordem: { chave, asc } | null
// colunas: { chave: { tipo } }              getValor(linha, chave): valor cru da célula
export function filtrarEOrdenar(linhas, filtros, ordem, colunas, getValor = (l, k) => l[k]) {
  const comparavel = (tipo, v) => (tipo === 'numero' ? Number(v) : tipo === 'data' ? String(v).slice(0, 10) : String(v).toLowerCase())
  let res = linhas
  for (const [chave, { operador, valor }] of Object.entries(filtros || {})) {
    const tipo = colunas[chave]?.tipo || 'texto'
    const alvo = comparavel(tipo, valor)
    res = res.filter(l => {
      const bruto = getValor(l, chave)
      if (vazio(bruto)) return operador === 'nao_contem' || operador === 'diferente'
      const v = comparavel(tipo, bruto)
      switch (operador) {
        case 'contem': return String(v).includes(alvo)
        case 'nao_contem': return !String(v).includes(alvo)
        case 'maior': return v > alvo
        case 'menor': return v < alvo
        default: return v === alvo
      }
    })
  }
  if (ordem && colunas[ordem.chave]) {
    const tipo = colunas[ordem.chave].tipo
    const sinal = ordem.asc ? 1 : -1
    res = [...res].sort((a, b) => {
      const x = getValor(a, ordem.chave), y = getValor(b, ordem.chave)
      if (vazio(x) && vazio(y)) return 0
      if (vazio(x)) return 1 // vazios sempre no fim
      if (vazio(y)) return -1
      if (tipo === 'numero') return sinal * (Number(x) - Number(y))
      return sinal * String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' })
    })
  }
  return res
}

// ── Tabela paginada no servidor ──────────────────────────────────────────────
// Aplica um filtro do menu na query do Supabase. `booleano`: valor 'true'/'false' vira boolean.
// `comoTexto`: filtra a coluna convertida para texto (ex.: colunas que não são text).
export function aplicarNoQuery(q, nome, tipo, operador, valor, { booleano = false, comoTexto = false } = {}) {
  if (vazio(valor)) return q
  if (tipo === 'texto') {
    const col = comoTexto ? `${nome}::text` : nome
    if (operador === 'igual') return comoTexto ? q.filter(col, 'eq', valor) : q.ilike(col, String(valor).replace(/[%_]/g, '\\$&'))
    if (operador === 'nao_contem') return q.not(col, 'ilike', `%${valor}%`)
    return q.ilike(col, `%${valor}%`)
  }
  const v = booleano ? valor === 'true' : tipo === 'numero' ? Number(valor) : valor
  if (tipo === 'numero' && Number.isNaN(v)) return q
  if (operador === 'maior') return q.gt(nome, v)
  if (operador === 'menor') return q.lt(nome, v)
  return q.eq(nome, v)
}
