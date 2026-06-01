import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import SelectPesquisavel from '../../components/SelectPesquisavel'

const POR_PAGINA = 30
const FILTROS_KEY = 'lista-registros-filtros-v4'

// ── Definição das colunas do datagrid ─────────────────────────────────────────
// Para adicionar uma nova coluna:
//   1. Adicionar aqui (key deve coincidir com o case em renderCelula)
//   2. Adicionar o case em renderCelula()
//   3. Se precisar de lookup (ex: nome por ID), adicionar a query em buscar() e o campo no useMemo de registros
//   4. Se a coluna deve ser visível por padrão, adicionar em COLUNAS_PADRAO
const COLUNAS_DEF = [
  { key: 'id',           label: 'ID'          },
  { key: 'data_producao', label: 'Data'       },
  { key: 'contrato',     label: 'Contrato'    },
  { key: 'tipo_equipe',  label: 'Tipo Equipe' },
  { key: 'equipe',       label: 'Equipe'      },
  { key: 'observacoes',  label: 'Observações' },
  { key: 'valor_total',  label: 'Valor Total' },
  { key: 'criado_em',    label: 'Criado em'   },
  { key: 'encarregado',  label: 'Encarregado' }, // oculta por padrão
  { key: 'obra',         label: 'Nr. Obra'    }, // oculta por padrão
  { key: 'criado_por',   label: 'Criado por'  }, // oculta por padrão — lookup em d_auth_user via criado_por_id
]

// Colunas exibidas na primeira visita (sem localStorage)
const COLUNAS_PADRAO = new Set(['id','data_producao','contrato','tipo_equipe','equipe','observacoes','valor_total'])
// Incrementar versão ao adicionar/remover colunas para limpar cache antigo
const COLUNAS_KEY   = 'lista-registros-colunas-v2'
const ORDEM_KEY     = 'lista-registros-ordem-v2'

function lerColunasVisiveis() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUNAS_KEY) || 'null')
    if (Array.isArray(saved)) return new Set(saved)
  } catch {}
  return new Set(COLUNAS_PADRAO)
}

function lerOrdem() {
  const allKeys = COLUNAS_DEF.map(c => c.key)
  try {
    const saved = JSON.parse(localStorage.getItem(ORDEM_KEY) || 'null')
    if (Array.isArray(saved) && saved.length > 0) {
      // mantém a ordem salva e acrescenta colunas novas ao final
      return [...saved.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !saved.includes(k))]
    }
  } catch {}
  return allKeys
}

// ── Definição dos filtros ─────────────────────────────────────────────────────
// Para adicionar um novo filtro:
//   1. Adicionar aqui com o tipo correto:
//      sel_*  → dropdown (Selecionado/Não Selecionado) — ver o bloco de valor no JSX
//      data   → input date (Igual/Maior/Menor)
//      texto  → input text (Contém/Não Contém/Igual)
//      sel_num → input number (Selecionado/Não Selecionado)
//   2. Se o campo não mapeia diretamente para uma coluna de f_prod_registro,
//      tratar em aplicarFiltros() ou em buscar() como subquery (ex: criado_por, obs)
const CAMPOS_DEF = [
  { key: 'id',             label: 'ID',             tipo: 'sel_num'      },
  { key: 'data_producao',  label: 'Data',           tipo: 'data'         },
  { key: 'contrato_id',    label: 'Contrato',       tipo: 'sel_contrato' },
  { key: 'tipo_equipe_id', label: 'Tipo de Equipe', tipo: 'sel_tequipe'  },
  { key: 'equipe_id',      label: 'Equipe',         tipo: 'sel_equipe'   },
  { key: 'origem',         label: 'Origem',         tipo: 'sel_origem'   },
  { key: 'encarregado_id', label: 'Encarregado',    tipo: 'sel_enc'      },
  { key: 'obra_id',        label: 'Nr. Obra',       tipo: 'texto'        },
  { key: 'obs',            label: 'Observações',    tipo: 'texto'        }, // filtra em metadata_registro->>observacoes
  { key: 'criado_em',      label: 'Criado em',      tipo: 'data'         }, // usa gte/lte para cobrir o dia inteiro
  { key: 'criado_por',     label: 'Criado por',     tipo: 'texto'        }, // subquery em d_auth_user — ver buscar()
]

const OPERADORES_TEXTO = [
  { value: 'contem',     label: 'Contém'     },
  { value: 'nao_contem', label: 'Não Contém' },
  { value: 'igual',      label: 'Igual a'    },
]
const OPERADORES_EXATO = [
  { value: 'igual',     label: 'Selecionado'     },
  { value: 'diferente', label: 'Não Selecionado' },
]
const OPERADORES_DATA = [
  { value: 'igual', label: 'Igual a'   },
  { value: 'maior', label: 'Maior que' },
  { value: 'menor', label: 'Menor que' },
]

function operadoresDoCampo(tipo) {
  if (tipo.startsWith('sel_')) return OPERADORES_EXATO
  if (tipo === 'data') return OPERADORES_DATA
  return OPERADORES_TEXTO
}

function filtroNovo(campo = 'data_producao') {
  const def = CAMPOS_DEF.find(c => c.key === campo) || CAMPOS_DEF[0]
  const ops = operadoresDoCampo(def.tipo)
  return { _id: Date.now() + Math.random(), campo, operador: ops[0].value, valor: '' }
}

function lerFiltrosSalvos() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FILTROS_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch { return [] }
}

export default function ListaRegistros() {
  const navegar = useNavigate()

  const [registrosRaw, setRegistrosRaw]     = useState([])
  const [encMap, setEncMap]                 = useState({})
  const [criadoPorMap, setCriadoPorMap]     = useState({})
  const [totalMap, setTotalMap]             = useState({})
  const [equipeColabMap, setEquipeColabMap] = useState({})
  const [carregando, setCarregando]         = useState(true)
  const [total, setTotal]                   = useState(0)
  const [confirmarExcluir, setConfirmarExcluir] = useState(null)
  const [pagina, setPagina]                 = useState(1)

  const [filtros, setFiltros] = useState(lerFiltrosSalvos)

  const [contratos, setContratos]       = useState([])
  const [tiposEquipe, setTiposEquipe]   = useState([])
  const [equipes, setEquipes]           = useState([])
  const [encarregados, setEncarregados] = useState([])

  // Colunas visíveis e ordem — salvo no localStorage
  const [colunasVisiveis, setColunasVisiveis] = useState(lerColunasVisiveis)
  const [colunasOrdem, setColunasOrdem]       = useState(lerOrdem)
  const [mostrarPainelColunas, setMostrarPainelColunas] = useState(false)
  const refPainelColunas = useRef(null)
  const draggingKey = useRef(null)
  const [dragOverKey, setDragOverKey] = useState(null)

  // Fechar painel ao clicar fora
  useEffect(() => {
    if (!mostrarPainelColunas) return
    function fechar(e) {
      if (refPainelColunas.current && !refPainelColunas.current.contains(e.target))
        setMostrarPainelColunas(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [mostrarPainelColunas])

  function toggleColuna(chave) {
    setColunasVisiveis(prev => {
      const s = new Set(prev)
      s.has(chave) ? s.delete(chave) : s.add(chave)
      localStorage.setItem(COLUNAS_KEY, JSON.stringify([...s]))
      return s
    })
  }

  function onDragStart(key) { draggingKey.current = key }

  function onDragOver(e, key) {
    e.preventDefault()
    if (draggingKey.current !== key) setDragOverKey(key)
  }

  function onDrop(targetKey) {
    const from = draggingKey.current
    if (!from || from === targetKey) { setDragOverKey(null); return }
    setColunasOrdem(prev => {
      const arr = [...prev]
      const fi = arr.indexOf(from)
      const ti = arr.indexOf(targetKey)
      arr.splice(fi, 1)
      arr.splice(ti, 0, from)
      localStorage.setItem(ORDEM_KEY, JSON.stringify(arr))
      return arr
    })
    draggingKey.current = null
    setDragOverKey(null)
  }

  function onDragEnd() { draggingKey.current = null; setDragOverKey(null) }

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao, logica_contrato').order('descricao').then(({ data }) => setContratos(data || []))
    supabase.from('d_tipo_equipe').select('id, descricao').then(({ data }) => setTiposEquipe(data || []))
    supabase.from('d_equipes').select('id, equipe, sistema_producao, contrato_id').order('equipe').then(({ data }) => setEquipes(data || []))
    supabase.from('d_colaboradores').select('id, matricula_nome').not('id', 'is', null).order('matricula_nome')
      .then(({ data }) => setEncarregados((data || []).map(e => ({ valor: e.id, label: e.matricula_nome }))))
  }, [])

  useEffect(() => { buscar(pagina) }, [pagina])

  useEffect(() => {
    sessionStorage.setItem(FILTROS_KEY, JSON.stringify(filtros))
  }, [filtros])

  // Enriquece os dados brutos com campos calculados/resolvidos.
  // Campos com prefixo _ são derivados (não vêm diretamente do banco).
  const registros = useMemo(() => registrosRaw.map(r => ({
    ...r,
    descricao_equipe: (() => {
      const contrato = contratos.find(c => String(c.id) === String(r.contrato_id))
      if (contrato?.logica_contrato) {
        return [...(equipeColabMap[r.id] || [])].map(eid => equipes.find(e => String(e.id) === String(eid))?.sistema_producao).filter(Boolean).join(', ') || null
      }
      return equipes.find(e => String(e.id) === String(r.equipe_id))?.sistema_producao || null
    })(),
    _encarregado_nome: encMap[r.encarregado_id] || null,
    _criado_por_nome: criadoPorMap[r.criado_por_id] || null,
    valor_total: totalMap[r.id] || 0,
  })), [registrosRaw, encMap, criadoPorMap, totalMap, equipeColabMap, equipes, contratos])

  // Aplica os filtros ativos na query do Supabase.
  // Campos especiais que NÃO passam por aqui: 'criado_por' (subquery) e 'obs' (JSON path).
  function aplicarFiltros(q) {
    filtros.forEach(({ campo, operador, valor }) => {
      if (!valor && valor !== 0) return
      if (campo === 'criado_por') return // resolve UUID via subquery em buscar() antes desta função
      const def = CAMPOS_DEF.find(c => c.key === campo)
      if (!def) return

      let col = campo
      if (campo === 'obs') col = 'metadata_registro->>observacoes'

      if (campo === 'criado_em') {
        if (operador === 'igual') q = q.gte(col, `${valor}T00:00:00`).lte(col, `${valor}T23:59:59`)
        else if (operador === 'maior') q = q.gt(col, `${valor}T23:59:59`)
        else if (operador === 'menor') q = q.lt(col, `${valor}T00:00:00`)
      } else if (operador === 'maior') {
        q = q.gt(col, valor)
      } else if (operador === 'menor') {
        q = q.lt(col, valor)
      } else if (operador === 'igual') {
        if (def.tipo === 'numero' || def.tipo === 'sel_num') q = q.eq(col, Number(valor))
        else q = q.eq(col, valor)
      } else if (operador === 'diferente') {
        if (def.tipo === 'numero' || def.tipo === 'sel_num') q = q.neq(col, Number(valor))
        else q = q.neq(col, valor)
      } else if (operador === 'contem') {
        q = q.ilike(col, `%${valor}%`)
      } else if (operador === 'nao_contem') {
        q = q.not(col, 'ilike', `%${valor}%`)
      }
    })
    return q
  }

  async function buscar(pag = 1) {
    setCarregando(true)
    const from = (pag - 1) * POR_PAGINA
    const to = from + POR_PAGINA - 1

    // Resolve filtro de criado_por: busca UUIDs pelo nome antes da query principal
    let uuidsCriadoPor = null
    for (const { campo, operador, valor } of filtros) {
      if (campo !== 'criado_por' || !valor) continue
      const q = operador === 'nao_contem'
        ? supabase.from('d_auth_user').select('uuid').not('nome', 'ilike', `%${valor}%`)
        : operador === 'igual'
        ? supabase.from('d_auth_user').select('uuid').ilike('nome', valor)
        : supabase.from('d_auth_user').select('uuid').ilike('nome', `%${valor}%`)
      const { data } = await q
      uuidsCriadoPor = (data || []).map(u => u.uuid)
    }

    let baseQ = supabase.from('f_prod_registro')
      .select('id, data_producao, contrato_id, tipo_equipe_id, equipe_id, encarregado_id, obra_id, metadata_registro, criado_em, criado_por_id', { count: 'exact' })
      .order('data_producao', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    if (uuidsCriadoPor !== null) {
      baseQ = uuidsCriadoPor.length > 0
        ? baseQ.in('criado_por_id', uuidsCriadoPor)
        : baseQ.eq('criado_por_id', 'sem-resultado-__')
    }

    let q = aplicarFiltros(baseQ)

    const { data, count } = await q
    const rows = data || []
    setTotal(count || 0)

    const ids = rows.map(r => r.id)
    const [encResult, atividadesResult, colaboradoresResult, criadoPorResult] = await Promise.all([
      (() => {
        const encIds = [...new Set(rows.map(r => r.encarregado_id).filter(Boolean))]
        if (encIds.length === 0) return Promise.resolve({ data: [] })
        return supabase.from('d_colaboradores').select('id, matricula_nome').in('id', encIds)
      })(),
      ids.length > 0
        ? supabase.from('f_prod_atividades').select('registro_id, valor_total').in('registro_id', ids)
        : Promise.resolve({ data: [] }),
      ids.length > 0
        ? supabase.from('f_prod_colaboradores').select('registro_id, equipe_id').in('registro_id', ids)
        : Promise.resolve({ data: [] }),
      (() => {
        const uuids = [...new Set(rows.map(r => r.criado_por_id).filter(Boolean))]
        if (uuids.length === 0) return Promise.resolve({ data: [] })
        return supabase.from('d_auth_user').select('uuid, nome').in('uuid', uuids)
      })(),
    ])

    const newEncMap = {}
    ;(encResult.data || []).forEach(e => { newEncMap[e.id] = e.matricula_nome })
    const newCriadoPorMap = {}
    ;(criadoPorResult.data || []).forEach(u => { newCriadoPorMap[u.uuid] = u.nome })
    const newTotalMap = {}
    ;(atividadesResult.data || []).forEach(a => {
      newTotalMap[a.registro_id] = (newTotalMap[a.registro_id] || 0) + Number(a.valor_total || 0)
    })
    const newEquipeColabMap = {}
    ;(colaboradoresResult.data || []).forEach(c => {
      if (!newEquipeColabMap[c.registro_id]) newEquipeColabMap[c.registro_id] = new Set()
      if (c.equipe_id) newEquipeColabMap[c.registro_id].add(c.equipe_id)
    })

    setRegistrosRaw(rows)
    setEncMap(newEncMap)
    setCriadoPorMap(newCriadoPorMap)
    setTotalMap(newTotalMap)
    setEquipeColabMap(newEquipeColabMap)
    setCarregando(false)
  }

  async function excluir(id) {
    const { error } = await supabase.from('f_prod_registro').delete().eq('id', id)
    if (error) { alert(`Erro ao excluir: ${error.message}`); return }
    setRegistrosRaw(prev => prev.filter(r => r.id !== id))
    setTotal(prev => prev - 1)
    setConfirmarExcluir(null)
  }

  function filtrar() {
    if (pagina === 1) buscar(1)
    else setPagina(1)
  }

  function limpar() {
    setFiltros([])
    sessionStorage.removeItem(FILTROS_KEY)
    if (pagina === 1) buscar(1)
    else setPagina(1)
  }

  function adicionarFiltro() {
    setFiltros(prev => [...prev, filtroNovo()])
  }

  function removerFiltro(idx) {
    setFiltros(prev => prev.filter((_, i) => i !== idx))
  }

  function alterarFiltro(idx, chave, val) {
    setFiltros(prev => prev.map((f, i) => {
      if (i !== idx) return f
      if (chave === 'campo') {
        const def = CAMPOS_DEF.find(c => c.key === val) || CAMPOS_DEF[0]
        const ops = operadoresDoCampo(def.tipo)
        return { ...f, campo: val, operador: ops[0].value, valor: '' }
      }
      return { ...f, [chave]: val }
    }))
  }

  function formatarData(d) {
    if (!d) return '-'
    const [ano, mes, dia] = d.split('-')
    return `${dia}/${mes}/${ano}`
  }

  // Retorna o conteúdo da célula para cada coluna.
  // Ao adicionar coluna em COLUNAS_DEF, adicionar o case correspondente aqui.
  function renderCelula(chave, r) {
    switch (chave) {
      case 'id':           return r.id
      case 'data_producao': return formatarData(r.data_producao)
      case 'contrato':     return contratoMap[r.contrato_id] || '-'
      case 'tipo_equipe':  return tipoEquipeMap[r.tipo_equipe_id] || '-'
      case 'equipe':       return r.descricao_equipe || '-'
      case 'encarregado':  return r._encarregado_nome || '-'
      case 'obra':         return r.obra_id || '-'
      case 'os':           return r.metadata_registro?.os || '-'
      case 'criado_por':   return r._criado_por_nome || '-'
      case 'observacoes':  return r.metadata_registro?.observacoes || '-'
      case 'valor_total':  return r.valor_total > 0
        ? `R$ ${Number(r.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '-'
      case 'criado_em':    return r.criado_em
        ? new Date(r.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '-'
      default: return '-'
    }
  }

  function estiloCelula(chave) {
    if (chave === 'valor_total') return { textAlign: 'right', fontWeight: 500 }
    if (chave === 'criado_em')   return { whiteSpace: 'nowrap', fontSize: 12, color: '#6b7280' }
    if (chave === 'observacoes') return { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
    if (chave === 'id')          return { color: '#6b7280', fontSize: 12 }
    return {}
  }

  const totalPaginas  = Math.ceil(total / POR_PAGINA)
  const contratoMap   = Object.fromEntries(contratos.map(c => [c.id, c.descricao]))
  const tipoEquipeMap = Object.fromEntries(tiposEquipe.map(t => [t.id, t.descricao]))
  const filtrosAtivos = filtros.filter(f => f.valor !== '').length
  const colunasAtivas = colunasOrdem
    .map(key => COLUNAS_DEF.find(c => c.key === key))
    .filter(c => c && colunasVisiveis.has(c.key))

  const inputStyle = {
    padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: 13, background: 'white', color: '#1e2a3b', height: 34,
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Registros de Produção</h1>
        <button className="btn btn-primario" onClick={() => navegar('/producao/novo')}>
          + Novo Lançamento
        </button>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1a56db' }}>▼ FILTROS</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            [{filtrosAtivos > 0 ? `${filtrosAtivos} filtro${filtrosAtivos > 1 ? 's' : ''} ativo${filtrosAtivos > 1 ? 's' : ''}` : 'Mostrando todos os registros'}]
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtros.map((f, idx) => {
            const def = CAMPOS_DEF.find(c => c.key === f.campo) || CAMPOS_DEF[0]
            const ops = operadoresDoCampo(def.tipo)
            return (
              <div key={f._id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={f.campo} onChange={e => alterarFiltro(idx, 'campo', e.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
                  {CAMPOS_DEF.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={f.operador} onChange={e => alterarFiltro(idx, 'operador', e.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
                  {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {def.tipo === 'sel_contrato' ? (
                  <select value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
                    <option value="">Selecione...</option>
                    {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                  </select>
                ) : def.tipo === 'sel_tequipe' ? (
                  <select value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 180 }}>
                    <option value="">Selecione...</option>
                    {tiposEquipe.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
                  </select>
                ) : def.tipo === 'sel_equipe' ? (
                  <select value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
                    <option value="">Selecione...</option>
                    {equipes.map(e => <option key={e.id} value={e.id}>{e.equipe}</option>)}
                  </select>
                ) : def.tipo === 'sel_enc' ? (
                  <div style={{ minWidth: 220 }}>
                    <SelectPesquisavel opcoes={encarregados} valor={f.valor} onChange={v => alterarFiltro(idx, 'valor', v)} placeholder="Pesquisar encarregado..." />
                  </div>
                ) : def.tipo === 'sel_origem' ? (
                  <select value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
                    <option value="">Selecione...</option>
                    <option value="sistema-claude">Sistema</option>
                    <option value="sistema-weweb">WeWeb</option>
                    <option value="Coletum">Coletum</option>
                  </select>
                ) : def.tipo === 'data' ? (
                  <input type="date" value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 160 }} />
                ) : def.tipo === 'numero' || def.tipo === 'sel_num' ? (
                  <input type="number" value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 100 }} placeholder="Digite..." />
                ) : (
                  <input type="text" value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 200 }} placeholder="Digite..." />
                )}
                <button onClick={() => removerFiltro(idx)}
                  style={{ padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer', height: 34 }}>
                  ✕ Remover filtro
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-secundario" onClick={adicionarFiltro} style={{ fontSize: 13 }}>
            + Adicionar filtro
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secundario" onClick={limpar} style={{ fontSize: 13, color: '#dc2626', borderColor: '#fca5a5' }}>
              🗑 Limpar filtros
            </button>
            <button className="btn btn-primario" onClick={filtrar} style={{ fontSize: 13 }}>
              Pesquisar
            </button>
          </div>
        </div>
      </div>

      {/* Datagrid */}
      <div className="card" style={{ padding: 0 }}>

        {/* Cabeçalho do card com contador e botão de colunas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            {carregando ? 'Carregando...' : `${total} registro${total !== 1 ? 's' : ''} — página ${pagina} de ${totalPaginas || 1}`}
          </span>
          <div ref={refPainelColunas} style={{ position: 'relative' }}>
            <button
              onClick={() => setMostrarPainelColunas(p => !p)}
              className="btn btn-secundario"
              style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
              title="Mostrar/ocultar colunas"
            >
              ⚙ Colunas ({colunasAtivas.length}/{COLUNAS_DEF.length})
            </button>
            {mostrarPainelColunas && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 200,
                background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 180, padding: '8px 0',
              }}>
                <div style={{ padding: '6px 14px 8px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>
                  Colunas visíveis
                </div>
                {COLUNAS_DEF.map(col => (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#374151' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <input
                      type="checkbox"
                      checked={colunasVisiveis.has(col.key)}
                      onChange={() => toggleColuna(col.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {carregando ? (
          <div className="loading" style={{ padding: 32 }}><div className="spinner" /> Carregando...</div>
        ) : registros.length === 0 ? (
          <div className="vazio" style={{ padding: 48 }}>
            <div className="vazio-icone">📋</div>
            Nenhum registro encontrado.
          </div>
        ) : (
          <div>
            {/* Tabela com scroll */}
            <div style={{ overflowX: 'auto', overflowY: 'auto', height: '500px', width: '100%' }}>
              <table style={{ minWidth: 'max-content', width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {colunasAtivas.map(col => (
                      <th key={col.key}
                        draggable
                        onDragStart={() => onDragStart(col.key)}
                        onDragOver={e => onDragOver(e, col.key)}
                        onDrop={() => onDrop(col.key)}
                        onDragEnd={onDragEnd}
                        style={{
                          position: 'sticky', top: 0, zIndex: 1,
                          background: dragOverKey === col.key ? '#dbeafe' : '#f9fafb',
                          padding: '10px 12px', textAlign: col.key === 'valor_total' ? 'right' : 'left',
                          fontWeight: 600, fontSize: 12, color: '#374151', whiteSpace: 'nowrap',
                          borderBottom: dragOverKey === col.key ? '2px solid #1a56db' : '2px solid #e5e7eb',
                          userSelect: 'none', cursor: 'grab',
                          transition: 'background 0.15s',
                        }}>
                        {col.label}
                      </th>
                    ))}
                    <th style={{
                      position: 'sticky', top: 0, right: 0, background: '#f9fafb', zIndex: 2,
                      padding: '10px 12px', fontWeight: 600, fontSize: 12, color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      boxShadow: '-2px 0 4px rgba(0,0,0,0.06)',
                    }}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}
                      onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.querySelector('td.acoes-sticky').style.background = '#eff6ff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.querySelector('td.acoes-sticky').style.background = 'white' }}
                    >
                      {colunasAtivas.map(col => (
                        <td key={col.key} style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid #f3f4f6',
                          whiteSpace: 'nowrap',
                          ...estiloCelula(col.key),
                        }}
                          title={col.key === 'observacoes' ? (r.metadata_registro?.observacoes || '') : undefined}
                        >
                          {renderCelula(col.key, r)}
                        </td>
                      ))}
                      <td className="acoes-sticky" style={{
                        padding: '8px 12px', borderBottom: '1px solid #f3f4f6',
                        position: 'sticky', right: 0, background: 'white',
                        boxShadow: '-2px 0 4px rgba(0,0,0,0.06)',
                      }}>
                        <MenuAcoes
                          onVisualizar={() => navegar(`/producao/${r.id}/editar?modo=visualizar`)}
                          onEditar={() => navegar(`/producao/${r.id}/editar`)}
                          onImprimir={() => navegar(`/producao/${r.id}/editar?modo=visualizar&print=1`)}
                          onExcluir={() => setConfirmarExcluir(r.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {total} registro{total !== 1 ? 's' : ''} — página {pagina} de {totalPaginas}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }} onClick={() => setPagina(1)} disabled={pagina === 1}>«</button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }} onClick={() => setPagina(p => p - 1)} disabled={pagina === 1}>‹</button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }} onClick={() => setPagina(p => p + 1)} disabled={pagina >= totalPaginas}>›</button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }} onClick={() => setPagina(totalPaginas)} disabled={pagina >= totalPaginas}>»</button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Modal confirmação de exclusão */}
      {confirmarExcluir !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#1e2a3b' }}>Confirmar exclusão</h2>
            <p style={{ margin: '0 0 20px', color: '#374151', fontSize: 14 }}>
              Excluir o registro <strong>#{confirmarExcluir}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secundario" onClick={() => setConfirmarExcluir(null)}>Cancelar</button>
              <button className="btn btn-primario" style={{ background: '#dc2626', borderColor: '#dc2626' }}
                onClick={() => excluir(confirmarExcluir)}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuAcoes({ onVisualizar, onEditar, onExcluir, onImprimir }) {
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef(null)
  const ref = useRef(null)
  const portalRef = useRef(null)

  useEffect(() => {
    if (!aberto) return
    function fechar(e) {
      const dentroBotao = ref.current?.contains(e.target)
      const dentroPortal = portalRef.current?.contains(e.target)
      if (!dentroBotao && !dentroPortal) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  function abrirMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setAberto(p => !p)
  }

  return (
    <div ref={ref} style={{ display: 'inline-block' }}>
      <button ref={btnRef} className="btn btn-secundario" style={{ padding: '4px 10px', fontSize: 12 }} onClick={abrirMenu}>
        Ações ▾
      </button>
      {aberto && createPortal(
        <div ref={portalRef} style={{
          position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 140, overflow: 'hidden',
        }}>
          {[
            { label: 'Visualizar', onClick: onVisualizar, cor: '#374151' },
            { label: 'Editar',     onClick: onEditar,     cor: '#374151' },
            { label: 'Imprimir',   onClick: onImprimir,   cor: '#374151' },
            { label: 'Excluir',    onClick: onExcluir,    cor: '#dc2626' },
          ].map(({ label, onClick, cor }) => (
            <button key={label} onClick={() => { setAberto(false); onClick() }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 14px', fontSize: 13, background: 'none', border: 'none',
              cursor: 'pointer', color: cor,
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
