import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import * as XLSX from 'xlsx'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

// ── Utilitários ───────────────────────────────────────────────────────────────
function excelParaData(serial) {
  const d = new Date(Math.round((Number(serial) - 25569) * 86400000))
  return d.toISOString().split('T')[0]
}
function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtMi(n) {
  const v = Number(n || 0)
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(2)} Mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(1)} Mil`
  return `R$ ${fmt(v)}`
}
function fmtData(d) {
  if (!d) return '—'
  const [ano, mes, dia] = d.split('-')
  return `${dia}/${mes}/${ano}`
}
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function corPerc(perc) {
  if (perc === null || perc === undefined) return { bg: '#f3f4f6', text: '#6b7280' }
  if (perc >= 150) return { bg: '#14532d', text: '#ffffff' }
  if (perc >= 100) return { bg: '#dcfce7', text: '#15803d' }
  if (perc >= 70)  return { bg: '#fef9c3', text: '#92400e' }
  return              { bg: '#fee2e2', text: '#b91c1c' }
}

const CORES_PIE = ['#1a56db','#7e3af2','#0e9f6e','#f05252','#ff5a1f','#c27803','#6366f1','#ec4899']

async function lerMetasAnuais(ano) {
  try {
    const resp = await fetch('/Metas_por_tipo_equipe_id.xlsm')
    const buffer = await resp.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets['Metas']
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
    const mapa = {} // tid -> { [mes1]: meta, [mes2]: meta }
    rows.forEach(row => {
      const id   = row['tipo_equipe_id']
      const data = row['data']
      const meta = row[' meta ']
      if (!id || !data || meta == null || Number(meta) === 0) return
      const dataStr = excelParaData(Number(data))
      if (!dataStr.startsWith(String(ano))) return
      const mes = Number(dataStr.split('-')[1])
      if (!mapa[id]) mapa[id] = {}
      mapa[id][mes] = (mapa[id][mes] || 0) + Number(meta)
    })
    return mapa
  } catch { return {} }
}

function valorReg(r) {
  return (r.f_prod_atividades || []).reduce(
    (s, a) => s + Number(a.upe || 0) * Number(a.preco_upe || 0) * Number(a.quantidade || 0), 0
  )
}

async function fetchAllPages(buildQuery, pageSize = 1000) {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error || !data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

const CACHE_TTL_MS = 3 * 60 * 60 * 1000 // 3 horas
const _cacheAnos = {} // fallback em memória se sessionStorage estourar

function cacheGet(ano) {
  // tenta sessionStorage primeiro
  try {
    const raw = sessionStorage.getItem(`dash_cache_${ano}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      parsed.carregadoEm = new Date(parsed.carregadoEm)
      return parsed
    }
  } catch {}
  return _cacheAnos[ano] || null
}

function cacheSet(ano, valor) {
  _cacheAnos[ano] = valor
  try {
    sessionStorage.setItem(`dash_cache_${ano}`, JSON.stringify({
      ...valor,
      carregadoEm: valor.carregadoEm.toISOString(),
    }))
  } catch {} // quota excedida — mantém só em memória
}

function cacheDel(ano) {
  delete _cacheAnos[ano]
  try { sessionStorage.removeItem(`dash_cache_${ano}`) } catch {}
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AnaliseDashboard() {
  const navegar = useNavigate()
  const anoAtual = new Date().getFullYear()

  const [aba, setAba]               = useState(0)
  const [ano, setAno]               = useState(anoAtual)
  const [filtroContrato, setFiltroContrato] = useState('todos')
  const [filtroMes, setFiltroMes]   = useState(0)      // 0 = todos
  const [filtroEquipe, setFiltroEquipe] = useState(null) // null = todas

  const [viewRows, setViewRows]       = useState([])
  const [metas, setMetas]             = useState({}) // tid -> { mes: valor }
  const [carregando, setCarregando]   = useState(false)
  const [erroCarregar, setErroCarregar] = useState('')
  const [cacheInfo, setCacheInfo]     = useState(null) // { de: Date } quando veio do cache

  // Para drill-down de equipe (aba 3)
  const [drillEquipe, setDrillEquipe] = useState(null) // { equipeNome, mes }
  const [colaboradoresDrill, setColabsDrill] = useState({ lista: [], porDia: {} })
  const [telaCheia, setTelaCheia] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function onChange() { setTelaCheia(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function alternarTelaCheia() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }


  useEffect(() => { carregarDados() }, [ano])

  async function carregarDados(forcar = false) {
    const cached = cacheGet(ano)
    const cacheValido = cached && (Date.now() - cached.carregadoEm.getTime() < CACHE_TTL_MS)

    if (!forcar && cacheValido) {
      setViewRows(cached.viewRows)
      setMetas(cached.metas)
      setCacheInfo({ de: cached.carregadoEm })
      return
    }

    setCarregando(true)
    setCacheInfo(null)
    setErroCarregar('')
    if (forcar) cacheDel(ano)

    const ini = `${ano}-01-01`
    const fim = `${ano}-12-31`
    try {
      const [viewData, resMetas] = await Promise.all([
        fetchAllPages(() =>
          supabase.from('view_r07_weweb')
            .select('registro_id, contrato_id, tipo_equipe_id, data_producao_original, equipe_id, desc_equipe, desc_atividade, atividade_id, quantidade, upe, preco_upe, valor_producao, justificativa, metadata_registro')
            .gte('data_producao_original', ini).lte('data_producao_original', fim)
            .order('data_producao_original', { ascending: true })
        ),
        lerMetasAnuais(ano),
      ])
      cacheSet(ano, { viewRows: viewData, metas: resMetas, carregadoEm: new Date() })
      setViewRows(viewData)
      setMetas(resMetas)
    } catch (e) {
      setErroCarregar(`Erro ao carregar dados: ${e?.message || e}`)
    } finally {
      setCarregando(false)
    }
  }

  // Contratos únicos derivados da view
  const contratos = useMemo(() => {
    const map = {}
    viewRows.forEach(v => { if (v.contrato_id && !map[v.contrato_id]) map[v.contrato_id] = v.desc_contrato })
    return Object.entries(map)
      .map(([id, descricao]) => ({ id: Number(id), descricao }))
      .sort((a, b) => a.descricao?.localeCompare(b.descricao))
  }, [viewRows])

  // Reconstrói registros a partir de viewRows (uma linha por atividade → agrupa por registro_id)
  const registros = useMemo(() => {
    const map = {}
    viewRows.forEach(v => {
      if (!map[v.registro_id]) {
        map[v.registro_id] = {
          id: v.registro_id,
          contrato_id: v.contrato_id,
          tipo_equipe_id: v.tipo_equipe_id,
          data_producao: v.data_producao_original,
          equipe_id: v.equipe_id,
          f_prod_atividades: [],
        }
      }
      if (v.atividade_id) {
        map[v.registro_id].f_prod_atividades.push({
          atividade_id: v.atividade_id,
          upe: v.upe,
          preco_upe: v.preco_upe,
          quantidade: v.quantidade,
          d_atividades: { DESCRICAO_BASICA_SISTEMA: v.desc_atividade },
        })
      }
    })
    return Object.values(map)
  }, [viewRows])

  // Mapa equipe por registro_id
  const equipeByReg = useMemo(() => {
    const map = {}
    viewRows.forEach(v => { if (v.desc_equipe && !map[v.registro_id]) map[v.registro_id] = v.desc_equipe })
    return map
  }, [viewRows])

  useEffect(() => {
    if (!drillEquipe) { setColabsDrill({ lista: [], porDia: {} }); return }
    const { equipeNome, mes } = drillEquipe
    const regIds = registros
      .filter(r => {
        if (equipeByReg[r.id] !== equipeNome) return false
        if (mes && Number(r.data_producao?.split('-')[1]) !== mes) return false
        return true
      })
      .map(r => r.id)
    if (!regIds.length) { setColabsDrill({ lista: [], porDia: {} }); return }
    const regDatas = {}
    registros.forEach(r => { if (regIds.includes(r.id)) regDatas[r.id] = r.data_producao })
    supabase.from('f_prod_colaboradores')
      .select('registro_id, colaborador_id, d_colaboradores(nome, matricula_nome)')
      .in('registro_id', regIds)
      .then(({ data }) => {
        const vistos = new Set()
        const lista = []
        const porDia = {}
        const vistosPorDia = {}
        ;(data || []).forEach(({ registro_id, colaborador_id, d_colaboradores: c }) => {
          if (!c) return
          const colab = { id: colaborador_id, nome: c.nome, matricula: c.matricula_nome }
          if (!vistos.has(colaborador_id)) { vistos.add(colaborador_id); lista.push(colab) }
          const dia = regDatas[registro_id]
          if (dia) {
            if (!vistosPorDia[dia]) vistosPorDia[dia] = new Set()
            if (!vistosPorDia[dia].has(colaborador_id)) {
              vistosPorDia[dia].add(colaborador_id)
              if (!porDia[dia]) porDia[dia] = []
              porDia[dia].push(colab)
            }
          }
        })
        lista.sort((a, b) => a.nome.localeCompare(b.nome))
        Object.values(porDia).forEach(arr => arr.sort((a, b) => a.nome.localeCompare(b.nome)))
        setColabsDrill({ lista, porDia })
      })
  }, [drillEquipe, registros, equipeByReg])

  // Registros filtrados (todos os filtros — usado em abas 1, 2, 3 e tabela do painel)
  const regsFiltrados = useMemo(() => {
    return registros.filter(r => {
      if (filtroContrato !== 'todos' && String(r.contrato_id) !== filtroContrato) return false
      if (filtroMes !== 0 && Number(r.data_producao?.split('-')[1]) !== filtroMes) return false
      if (filtroEquipe && equipeByReg[r.id] !== filtroEquipe) return false
      return true
    })
  }, [registros, filtroContrato, filtroMes, filtroEquipe, equipeByReg])

  // Filtros parciais para cada gráfico do Painel Principal
  // (cada gráfico exclui seu próprio filtro para continuar mostrando todos os itens)
  const regsExclContrato = useMemo(() => registros.filter(r => {
    if (filtroMes !== 0 && Number(r.data_producao?.split('-')[1]) !== filtroMes) return false
    if (filtroEquipe && equipeByReg[r.id] !== filtroEquipe) return false
    return true
  }), [registros, filtroMes, filtroEquipe, equipeByReg])

  const regsExclMes = useMemo(() => registros.filter(r => {
    if (filtroContrato !== 'todos' && String(r.contrato_id) !== filtroContrato) return false
    if (filtroEquipe && equipeByReg[r.id] !== filtroEquipe) return false
    return true
  }), [registros, filtroContrato, filtroEquipe, equipeByReg])

  const regsExclEquipe = useMemo(() => registros.filter(r => {
    if (filtroContrato !== 'todos' && String(r.contrato_id) !== filtroContrato) return false
    if (filtroMes !== 0 && Number(r.data_producao?.split('-')[1]) !== filtroMes) return false
    return true
  }), [registros, filtroContrato, filtroMes])

  // ── Dados para Aba 0: Painel Principal ──────────────────────────────────────
  const dadosPizza = useMemo(() => {
    const map = {}
    regsExclContrato.forEach(r => {
      const v = valorReg(r)
      if (!v) return
      const c = contratos.find(c => String(c.id) === String(r.contrato_id))
      const nome = c?.descricao || `Contrato ${r.contrato_id}`
      const id = String(r.contrato_id)
      if (!map[id]) map[id] = { name: nome, value: 0, id }
      map[id].value += v
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [regsExclContrato, contratos])

  const dadosBarMes = useMemo(() => {
    const map = {}
    regsExclMes.forEach(r => {
      const mes = Number(r.data_producao?.split('-')[1])
      if (!mes) return
      map[mes] = (map[mes] || 0) + valorReg(r)
    })
    return Array.from({ length: 12 }, (_, i) => ({ mes: MESES[i], valor: map[i + 1] || 0, mesNum: i + 1 }))
  }, [regsExclMes])

  const dadosTabelaMes = useMemo(() => {
    const map = {}
    regsFiltrados.forEach(r => {
      const mes = Number(r.data_producao?.split('-')[1])
      if (!mes) return
      map[mes] = (map[mes] || 0) + valorReg(r)
    })
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const atual = map[m] || 0
      const anterior = map[m - 1] || 0
      const flutuacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : null
      return { mes: MESES_FULL[i], mesNum: m, valor: atual, flutuacao }
    }).filter(m => m.valor > 0)
  }, [regsFiltrados])

  const dadosBarEquipe = useMemo(() => {
    const map = {}
    regsExclEquipe.forEach(r => {
      const nome = equipeByReg[r.id]
      if (!nome) return
      map[nome] = (map[nome] || 0) + valorReg(r)
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [regsExclEquipe, equipeByReg])

  // ── Dados para Aba 1: Análise Mensal ─────────────────────────────────────────
  const dadosAnaliseMensal = useMemo(() => {
    // meta por equipe_id por mes
    const metaPorTidMes = metas // tid -> { mes: valor }

    // produção por equipe por mês
    const prodMap = {} // equipeNome -> { mes: valor }
    registros.forEach(r => {
      const cid = String(r.contrato_id)
      if (filtroContrato !== 'todos' && cid !== filtroContrato) return
      const nome = equipeByReg[r.id]
      if (!nome) return
      const mes = Number(r.data_producao?.split('-')[1])
      if (!mes) return
      if (!prodMap[nome]) prodMap[nome] = { cid, tid: String(r.tipo_equipe_id) }
      prodMap[nome][mes] = (prodMap[nome][mes] || 0) + valorReg(r)
    })

    // agrupar por contrato
    const contratoMap = {}
    Object.entries(prodMap).forEach(([nome, dados]) => {
      const cid = dados.cid
      const cnome = contratos.find(c => String(c.id) === cid)?.descricao || `Contrato ${cid}`
      if (!contratoMap[cnome]) contratoMap[cnome] = { cid, equipes: [] }
      const tid = dados.tid
      const mesesValores = {}
      Array.from({ length: 12 }, (_, i) => i + 1).forEach(m => {
        mesesValores[m] = dados[m] || 0
      })
      const metaTid = metaPorTidMes[tid] || {}
      contratoMap[cnome].equipes.push({ nome, mesesValores, metaTid })
    })

    return Object.entries(contratoMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cnome, { cid, equipes: eqs }]) => ({
        contrato: cnome, cid,
        equipes: eqs.sort((a, b) => a.nome.localeCompare(b.nome)),
      }))
  }, [registros, equipes, contratos, metas, filtroContrato, equipeByReg])

  // ── Dados para Aba 2: Produção Detalhada ─────────────────────────────────────
  const dadosDetalhada = useMemo(() => {
    const mesAtivo = filtroMes || null


    const atividadeMap = {} // equipeNome -> { [descAtiv]: { qtd, valor } }
    const prodEquipe = {}   // equipeNome -> { prod, tid, cid }

    registros.forEach(r => {
      if (filtroContrato !== 'todos' && String(r.contrato_id) !== filtroContrato) return
      if (mesAtivo && Number(r.data_producao?.split('-')[1]) !== mesAtivo) return
      const nome = equipeByReg[r.id]
      if (!nome) return
      const val = valorReg(r)
      if (!prodEquipe[nome]) prodEquipe[nome] = { prod: 0, tid: String(r.tipo_equipe_id), cid: String(r.contrato_id) }
      prodEquipe[nome].prod += val

      ;(r.f_prod_atividades || []).forEach(a => {
        const desc = a.d_atividades?.DESCRICAO_BASICA_SISTEMA || 'Sem descrição'
        if (!atividadeMap[nome]) atividadeMap[nome] = {}
        if (!atividadeMap[nome][desc]) atividadeMap[nome][desc] = { qtd: 0, upe: 0, valor: 0 }
        atividadeMap[nome][desc].qtd   += Number(a.quantidade || 0)
        atividadeMap[nome][desc].upe   += Number(a.upe || 0)
        atividadeMap[nome][desc].valor += Number(a.upe || 0) * Number(a.preco_upe || 0) * Number(a.quantidade || 0)
      })
    })

    return Object.entries(prodEquipe)
      .map(([nome, { prod, tid, cid }]) => ({
        nome, prod, tid, cid,
        atividades: Object.entries(atividadeMap[nome] || {})
          .map(([desc, d]) => ({ desc, ...d }))
          .sort((a, b) => b.valor - a.valor),
      }))
      .sort((a, b) => b.prod - a.prod)
  }, [registros, equipeByReg, filtroContrato, filtroMes])

  // ── Dados para Aba 3: Detalhe Equipe ─────────────────────────────────────────
  const dadosDetalheEquipe = useMemo(() => {
    if (!drillEquipe) return null
    const { equipeNome, mes } = drillEquipe

    const regsEquipe = registros.filter(r => {
      if (equipeByReg[r.id] !== equipeNome) return false
      if (mes && Number(r.data_producao?.split('-')[1]) !== mes) return false
      return true
    })

    // produção por dia
    const porDia = {}
    regsEquipe.forEach(r => {
      porDia[r.data_producao] = (porDia[r.data_producao] || 0) + valorReg(r)
    })

    // notas e horários por dia (via viewRows que já tem metadata_registro)
    const regIds = new Set(regsEquipe.map(r => r.id))
    const notasDia = {}
    const horaInicioDia = {}
    const horaFimDia = {}
    viewRows.filter(v => regIds.has(v.registro_id)).forEach(v => {
      const txt = [v.justificativa, v.metadata_registro?.observacoes].filter(Boolean).join(' | ')
      if (txt.trim()) {
        if (!notasDia[v.data_producao]) notasDia[v.data_producao] = new Set()
        notasDia[v.data_producao].add(txt.trim())
      }
      const hi = v.metadata_registro?.horario_inicio
      const hf = v.metadata_registro?.horario_fim
      if (hi && (!horaInicioDia[v.data_producao] || hi < horaInicioDia[v.data_producao]))
        horaInicioDia[v.data_producao] = hi
      if (hf && (!horaFimDia[v.data_producao] || hf > horaFimDia[v.data_producao]))
        horaFimDia[v.data_producao] = hf
    })

    // atividades (total + por dia)

    const atividadeMap = {}
    const atividadesPorDia = {}
    regsEquipe.forEach(r => {
      ;(r.f_prod_atividades || []).forEach(a => {
        const desc = a.d_atividades?.DESCRICAO_BASICA_SISTEMA || 'Sem descrição'
        const qtd = Number(a.quantidade || 0)
        const upe = Number(a.upe || 0)
        const valor = upe * Number(a.preco_upe || 0) * qtd
        if (!atividadeMap[desc]) atividadeMap[desc] = { qtd: 0, upe: 0, valor: 0 }
        atividadeMap[desc].qtd += qtd; atividadeMap[desc].upe += upe; atividadeMap[desc].valor += valor
        if (!atividadesPorDia[r.data_producao]) atividadesPorDia[r.data_producao] = {}
        if (!atividadesPorDia[r.data_producao][desc]) atividadesPorDia[r.data_producao][desc] = { qtd: 0, upe: 0, valor: 0 }
        atividadesPorDia[r.data_producao][desc].qtd += qtd
        atividadesPorDia[r.data_producao][desc].upe += upe
        atividadesPorDia[r.data_producao][desc].valor += valor
      })
    })

    const dias = [...new Set([...Object.keys(porDia), ...Object.keys(notasDia)])].sort()
    const totalProd = dias.reduce((s, d) => s + (porDia[d] || 0), 0)

    const r0 = regsEquipe[0]
    const tid = r0 ? String(r0.tipo_equipe_id) : null
    const mesNum = mes || (r0 ? Number(r0.data_producao?.split('-')[1]) : null)
    const metaEquipe = tid && mesNum ? (metas[tid]?.[mesNum] || 0) : 0
    const perc = metaEquipe > 0 ? (totalProd / metaEquipe) * 100 : null

    return {
      equipeNome, mes,
      totalProd, metaEquipe, perc,
      dias: dias.map(d => ({
        data: d,
        valor: porDia[d] || 0,
        nota: notasDia[d] ? [...notasDia[d]].join(' · ') : '',
        horaInicio: horaInicioDia[d] || null,
        horaFim: horaFimDia[d] || null,
      })),
      atividades: Object.entries(atividadeMap)
        .map(([desc, d]) => ({ desc, ...d }))
        .sort((a, b) => b.valor - a.valor),
      atividadesPorDia: Object.fromEntries(
        Object.entries(atividadesPorDia).map(([data, map]) => [
          data,
          Object.entries(map).map(([desc, d]) => ({ desc, ...d })).sort((a, b) => b.valor - a.valor),
        ])
      ),
    }
  }, [drillEquipe, registros, viewRows, equipeByReg, metas])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function clicarCelulaAnaliseMensal(equipeNome, mes) {
    setDrillEquipe({ equipeNome, mes })
    setAba(3)
  }

  function clicarBarMes(mesNum) {
    setFiltroMes(prev => prev === mesNum ? 0 : mesNum)
  }

  function clicarPizza(contratoId) {
    setFiltroContrato(prev => prev === contratoId ? 'todos' : contratoId)
  }

  function clicarEquipePainel(equipeNome) {
    setFiltroEquipe(prev => prev === equipeNome ? null : equipeNome)
  }

  // ── Render abas (tab 3 oculta, acessada só via drill-down) ───────────────────
  const ABAS_VISIVEIS = ['Painel Principal', 'Análise Mensal', 'Produção Detalhada']

  return (
    <div ref={containerRef} className="pagina"
      style={telaCheia ? { background: '#f8fafc', overflowY: 'auto', padding: 24 } : {}}>
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar(-1)}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Dashboard de Produção</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {carregando ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, border: '2px solid #e2e8f0', borderTopColor: '#1a56db',
                borderRadius: '50%', animation: 'dashSpin 0.7s linear infinite' }} />
              <span style={{ fontSize: 13, color: '#6b7280' }}>Carregando...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {cacheInfo && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                  Cache de {cacheInfo.de.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button onClick={() => carregarDados(true)} title="Forçar atualização dos dados"
                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6,
                  padding: '5px 8px', cursor: 'pointer', color: '#374151', display: 'flex',
                  alignItems: 'center', gap: 4, fontSize: 12 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Atualizar
              </button>
            </div>
          )}
          <button onClick={alternarTelaCheia} title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6,
              padding: '5px 8px', cursor: 'pointer', color: '#374151', display: 'flex',
              alignItems: 'center', gap: 4, fontSize: 12 }}>
            {telaCheia ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            )}
            {telaCheia ? 'Sair' : 'Tela cheia'}
          </button>
        </div>
      </div>

      {/* Filtros globais */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Ano</label>
            <select className="campo-input" value={ano} onChange={e => setAno(Number(e.target.value))} style={{ width: 100 }}>
              {[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Contrato</label>
            <select className="campo-input" value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)} style={{ width: 200 }}>
              <option value="todos">Todos</option>
              {contratos.map(c => <option key={c.id} value={String(c.id)}>{c.descricao}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Mês</label>
            <select className="campo-input" value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))} style={{ width: 140 }}>
              <option value={0}>Todos</option>
              {MESES_FULL.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          {(filtroContrato !== 'todos' || filtroMes !== 0 || filtroEquipe) && (
            <button className="btn btn-secundario"
              onClick={() => { setFiltroContrato('todos'); setFiltroMes(0); setFiltroEquipe(null) }}
              style={{ alignSelf: 'flex-end', fontSize: 12 }}>
              Limpar filtros
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: '#9ca3af', alignSelf: 'flex-end', paddingBottom: 2 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Dados atualizados a cada 3 horas
          </div>
        </div>
      </div>

      {/* Abas visíveis (tab 3 só aparece após drill-down) */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        {ABAS_VISIVEIS.map((label, i) => (
          <button key={i} onClick={() => setAba(i)} style={{
            padding: '10px 18px', fontSize: 13, fontWeight: aba === i ? 700 : 500,
            color: aba === i ? '#1a56db' : '#6b7280', background: 'none', border: 'none',
            borderBottom: aba === i ? '3px solid #1a56db' : '3px solid transparent',
            cursor: 'pointer', marginBottom: -2, transition: 'color .15s',
          }}>{label}</button>
        ))}
      </div>

      <style>{`@keyframes dashSpin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ position: 'relative' }}>
        {carregando && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20, minHeight: 200,
            background: 'rgba(248,250,252,0.82)', backdropFilter: 'blur(2px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, gap: 12 }}>
            <div style={{ width: 44, height: 44, border: '4px solid #e2e8f0', borderTopColor: '#1a56db',
              borderRadius: '50%', animation: 'dashSpin 0.7s linear infinite' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e2a3b' }}>Carregando dados...</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Buscando todos os registros do período</div>
          </div>
        )}
        {erroCarregar && (
          <div style={{ margin: '16px 0', padding: '12px 16px', background: '#fef2f2',
            border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
            {erroCarregar}
            <button onClick={() => carregarDados(true)}
              style={{ marginLeft: 12, fontSize: 12, padding: '2px 10px', borderRadius: 4,
                border: '1px solid #fca5a5', background: 'white', color: '#dc2626', cursor: 'pointer' }}>
              Tentar novamente
            </button>
          </div>
        )}

        {aba === 0 && <PainelPrincipal
          dadosPizza={dadosPizza} dadosBarMes={dadosBarMes}
          dadosTabelaMes={dadosTabelaMes} dadosBarEquipe={dadosBarEquipe}
          filtroMes={filtroMes} onClickMes={clicarBarMes}
          filtroContrato={filtroContrato} onClickPizza={clicarPizza}
          filtroEquipe={filtroEquipe} onClickEquipe={clicarEquipePainel}
        />}
        {aba === 1 && <AnaliseMensal
          dados={dadosAnaliseMensal} filtroMes={filtroMes}
          onClickCelula={clicarCelulaAnaliseMensal}
        />}
        {aba === 2 && <ProducaoDetalhada
          dados={dadosDetalhada} dadosBarMes={dadosBarMes}
          filtroMes={filtroMes} onClickMes={clicarBarMes}
          regsExclMes={regsExclMes} equipeByReg={equipeByReg}
        />}
        {aba === 3 && <DetalheEquipe
          dados={dadosDetalheEquipe}
          colaboradores={colaboradoresDrill.lista}
          colaboradoresPorDia={colaboradoresDrill.porDia}
          onVoltar={() => setAba(1)}
        />}
      </div>
    </div>
  )
}

// ── Aba 0: Painel Principal ───────────────────────────────────────────────────
function PainelPrincipal({ dadosPizza, dadosBarMes, dadosTabelaMes, dadosBarEquipe,
  filtroMes, onClickMes, filtroContrato, onClickPizza, filtroEquipe, onClickEquipe }) {

  const totalGeral = dadosPizza.reduce((s, d) => s + d.value, 0)
  const temFiltroContrato = filtroContrato !== 'todos'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Pizza - produção por contrato */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Produção por Contrato</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>Clique para filtrar</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={dadosPizza} cx="50%" cy="50%" dataKey="value"
                outerRadius={80}
                onClick={d => onClickPizza(d.id)}
                style={{ cursor: 'pointer' }}>
                {dadosPizza.map((d, i) => (
                  <Cell key={i}
                    fill={CORES_PIE[i % CORES_PIE.length]}
                    opacity={temFiltroContrato && filtroContrato !== d.id ? 0.35 : 1}
                    stroke={filtroContrato === d.id ? '#1e2a3b' : 'none'}
                    strokeWidth={filtroContrato === d.id ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip formatter={v => `R$ ${fmt(v)}`} />
              <Legend formatter={v => v.length > 18 ? v.slice(0, 18) + '…' : v} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#1e2a3b', marginTop: 4 }}>
            Total: {fmtMi(totalGeral)}
          </div>
        </div>

        {/* Barras - produção por mês */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Produção por Mês</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>Clique para filtrar</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosBarMes}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => fmtMi(v)} tick={{ fontSize: 10 }} width={70} />
              <Tooltip formatter={v => `R$ ${fmt(v)}`} />
              <Bar dataKey="valor" name="Produção" cursor="pointer"
                onClick={d => onClickMes(d.mesNum)}>
                {dadosBarMes.map((d, i) => (
                  <Cell key={i}
                    fill={filtroMes === d.mesNum ? '#1a56db' : (filtroMes !== 0 ? '#bfdbfe' : '#60a5fa')}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Tabela mensal com flutuação */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#1e2a3b', color: 'white', padding: '10px 16px', fontSize: 13, fontWeight: 700 }}>
            Produção x Flutuação Mensal
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0' }}>Mês</th>
                <th style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0' }}>Produção R$</th>
                <th style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0' }}>Flutuação %</th>
              </tr>
            </thead>
            <tbody>
              {dadosTabelaMes.map(({ mes, mesNum, valor, flutuacao }) => (
                <tr key={mes} style={{ borderBottom: '1px solid #f3f4f6',
                  background: filtroMes === mesNum ? '#eff6ff' : 'white', cursor: 'pointer' }}
                  onClick={() => onClickMes(mesNum)}>
                  <td style={{ padding: '7px 12px', color: '#374151', fontWeight: filtroMes === mesNum ? 700 : 400 }}>{mes}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#1e2a3b' }}>R$ {fmt(valor)}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                    {flutuacao !== null ? (
                      <span style={{ color: flutuacao >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {flutuacao >= 0 ? '↑' : '↓'} {Math.abs(flutuacao).toFixed(2)}%
                      </span>
                    ) : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Barras - produção por equipe */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Produção por Equipe</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>Clique para filtrar</div>
          <div style={{ overflowY: 'auto', maxHeight: 360 }}>
            <div style={{ height: Math.max(dadosBarEquipe.length * 32 + 30, 120) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosBarEquipe} layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtMi(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip formatter={v => `R$ ${fmt(v)}`} />
                  <Bar dataKey="value" name="Produção" cursor="pointer" barSize={20}
                    onClick={d => onClickEquipe(d.name)}>
                    {dadosBarEquipe.map((d, i) => (
                      <Cell key={i}
                        fill={filtroEquipe === d.name ? '#1a56db' : (filtroEquipe ? '#bfdbfe' : '#60a5fa')}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Aba 1: Análise Mensal ─────────────────────────────────────────────────────
function AnaliseMensal({ dados, filtroMes, onClickCelula }) {
  const [expandidos, setExpandidos] = useState({})
  const mesesCols = filtroMes ? [filtroMes] : Array.from({ length: 12 }, (_, i) => i + 1)

  function toggle(cnome) {
    setExpandidos(p => ({ ...p, [cnome]: !p[cnome] }))
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ background: '#1e2a3b', color: 'white', padding: '10px 16px', fontSize: 13, fontWeight: 700, borderRadius: '8px 8px 0 0' }}>
        Análise de Produção Mensal
        <span style={{ fontSize: 11, opacity: .7, marginLeft: 8 }}>· Clique em uma célula para ver o detalhe</span>
      </div>
      <div style={{ fontSize: 11, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[['#fee2e2','#b91c1c','0–69%'],['#fef9c3','#92400e','70–99%'],['#dcfce7','#15803d','100–150%'],['#14532d','#ffffff','>150%']].map(([bg, tx, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 12, background: bg, border: `1px solid ${tx}20`, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ color: '#6b7280' }}>{label} da meta</span>
          </span>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', left: 0, background: '#f1f5f9', whiteSpace: 'nowrap', width: 160, minWidth: 160, maxWidth: 160 }}>Equipe</th>
              {mesesCols.map(m => (
                <th key={m} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', width: 120, minWidth: 120 }}>
                  {MESES[m - 1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.map(({ contrato, equipes: eqs }) => {
              const aberto = expandidos[contrato] !== false
              const totalContrato = {}
              eqs.forEach(e => mesesCols.forEach(m => { totalContrato[m] = (totalContrato[m] || 0) + (e.mesesValores[m] || 0) }))
              return [
                <tr key={contrato} style={{ background: '#1e2a3b', cursor: 'pointer' }} onClick={() => toggle(contrato)}>
                  <td style={{ padding: '8px 12px', color: 'white', fontWeight: 700, fontSize: 12, position: 'sticky', left: 0, background: '#1e2a3b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: 160, minWidth: 160, maxWidth: 160 }}
                    title={contrato}>
                    {aberto ? '⊟' : '⊞'} {contrato}
                  </td>
                  {mesesCols.map(m => (
                    <td key={m} style={{ padding: '8px 10px', textAlign: 'right', color: 'white', fontWeight: 600 }}>
                      {totalContrato[m] > 0 ? `R$ ${fmt(totalContrato[m])}` : ''}
                    </td>
                  ))}
                </tr>,
                ...(aberto ? eqs.map(eq => (
                  <tr key={eq.nome} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 12px 7px 24px', color: '#374151', fontWeight: 600, position: 'sticky', left: 0, background: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: 160, minWidth: 160, maxWidth: 160 }}
                      title={eq.nome}>
                      {eq.nome}
                    </td>
                    {mesesCols.map(m => {
                      const val = eq.mesesValores[m] || 0
                      const meta = eq.metaTid[m] || 0
                      const perc = val > 0 && meta > 0 ? (val / meta) * 100 : null
                      const cor = val > 0 ? corPerc(perc) : { bg: 'white', text: '#d1d5db' }
                      return (
                        <td key={m}
                          onClick={() => val > 0 && onClickCelula(eq.nome, m)}
                          style={{
                            padding: '7px 10px', textAlign: 'right',
                            background: cor.bg, color: cor.text,
                            fontWeight: val > 0 ? 600 : 400,
                            cursor: val > 0 ? 'pointer' : 'default',
                          }}
                          onMouseEnter={e => { if (val > 0) e.currentTarget.style.filter = 'brightness(0.94)' }}
                          onMouseLeave={e => { e.currentTarget.style.filter = '' }}>
                          {val > 0 ? `R$ ${fmt(val)}` : ''}
                        </td>
                      )
                    })}
                  </tr>
                )) : []),
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Aba 2: Produção Detalhada ─────────────────────────────────────────────────
function ProducaoDetalhada({ dados, dadosBarMes, filtroMes, onClickMes, regsExclMes, equipeByReg }) {
  const [equipeSelecionada, setEquipeSelecionada] = useState(null)

  const totalGeral = dados.reduce((s, d) => s + d.prod, 0)

  const dadosBarMesLocal = useMemo(() => {
    if (!equipeSelecionada) return dadosBarMes
    const map = {}
    regsExclMes.forEach(r => {
      if (equipeByReg[r.id] !== equipeSelecionada) return
      const mes = Number(r.data_producao?.split('-')[1])
      if (!mes) return
      map[mes] = (map[mes] || 0) + valorReg(r)
    })
    return Array.from({ length: 12 }, (_, i) => ({ mes: MESES[i], valor: map[i + 1] || 0, mesNum: i + 1 }))
  }, [equipeSelecionada, dadosBarMes, regsExclMes, equipeByReg])

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
            Produção por Mês{equipeSelecionada ? ` — ${equipeSelecionada}` : ''}
          </div>
          {equipeSelecionada && (
            <button onClick={() => setEquipeSelecionada(null)}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb',
                background: '#f3f4f6', color: '#6b7280', cursor: 'pointer' }}>
              ✕ limpar
            </button>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dadosBarMesLocal}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => fmtMi(v)} tick={{ fontSize: 10 }} width={70} />
            <Tooltip formatter={v => `R$ ${fmt(v)}`} />
            <Bar dataKey="valor" name="Produção" cursor="pointer"
              onClick={d => onClickMes(d.mesNum)}>
              {dadosBarMesLocal.map((d, i) => (
                <Cell key={i} fill={filtroMes === d.mesNum ? '#1a56db' : '#93c5fd'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ background: '#1e2a3b', color: 'white', padding: '10px 16px', fontSize: 13, fontWeight: 700 }}>
          Análise de Produção Detalhada
          <span style={{ fontSize: 11, opacity: .7, marginLeft: 8 }}>· Clique em uma equipe para filtrar o gráfico</span>
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 360 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', minWidth: 140, position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>Equipe</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>Produção R$</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>Qtd. Serviço</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>UPEs</th>
              </tr>
            </thead>
            <tbody>
              {dados.map(({ nome, prod, atividades }) => {
                const selecionada = equipeSelecionada === nome
                const totalQtd = atividades.reduce((s, a) => s + a.qtd, 0)
                const totalUpe = atividades.reduce((s, a) => s + a.upe, 0)
                return (
                  <tr key={nome} style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer',
                    background: selecionada ? '#eff6ff' : (equipeSelecionada ? '#f9fafb' : 'white') }}
                    onClick={() => setEquipeSelecionada(prev => prev === nome ? null : nome)}
                    onMouseEnter={e => { if (!selecionada) e.currentTarget.style.background = '#f0f9ff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = selecionada ? '#eff6ff' : (equipeSelecionada ? '#f9fafb' : 'white') }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: selecionada ? '#1a56db' : '#374151' }}>
                      {nome}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600,
                      color: selecionada ? '#1a56db' : '#1e2a3b' }}>
                      R$ {fmt(prod)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151' }}>
                      {totalQtd.toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151' }}>
                      {totalUpe.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 1 }}>
              <tr style={{ background: '#1e2a3b', color: 'white' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>R$ {fmt(totalGeral)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Aba 3: Detalhe Equipe (Drill-Down) ────────────────────────────────────────
function DetalheEquipe({ dados, colaboradores, colaboradoresPorDia, onVoltar }) {
  const [diaSelecionado, setDiaSelecionado] = useState(null)

  if (!dados) {
    return (
      <div className="card" style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 40 }}>
        Clique em uma equipe nas outras abas para ver o detalhe diário.
      </div>
    )
  }

  const { equipeNome, mes, totalProd, metaEquipe, perc, dias, atividades, atividadesPorDia } = dados
  const corP = perc !== null ? (perc >= 100 ? '#16a34a' : perc >= 80 ? '#d97706' : '#dc2626') : '#6b7280'
  const mesLabel = mes ? MESES_FULL[mes - 1] : 'Período completo'

  const atividadesFiltradas = diaSelecionado
    ? (atividadesPorDia[diaSelecionado] || [])
    : atividades
  const totalAtiv = atividadesFiltradas.reduce((s, a) => s + a.valor, 0)

  const colaboradoresFiltrados = diaSelecionado
    ? (colaboradoresPorDia?.[diaSelecionado] || [])
    : colaboradores

  return (
    <div>
      {/* Cabeçalho */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16,
        background: 'linear-gradient(135deg, #1e2a3b, #1a56db)', color: 'white' }}>
        <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,.15)', border: 'none',
          color: 'white', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, marginBottom: 12 }}>
          ← Voltar
        </button>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, opacity: .7 }}>Equipe</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{equipeNome}</div>
            <div style={{ fontSize: 13, opacity: .75 }}>{mesLabel}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: .7 }}>Produção</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>R$ {fmt(totalProd)}</div>
          </div>
          {metaEquipe > 0 && <>
            <div>
              <div style={{ fontSize: 11, opacity: .7 }}>Meta</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>R$ {fmt(metaEquipe)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: .7 }}>%</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: corP }}>{perc?.toFixed(2)}%</div>
            </div>
          </>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Coluna esquerda: Tabela diária */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#374151', color: 'white', padding: '8px 14px', fontSize: 12, fontWeight: 700 }}>
            Acompanhamento de Produção Diária
            <span style={{ fontSize: 11, opacity: .7, marginLeft: 8 }}>· Clique para filtrar atividades</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Data</th>
                <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Início</th>
                <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Fim</th>
                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Produção R$</th>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Justificativa / Obs.</th>
              </tr>
            </thead>
            <tbody>
              {dias.map(({ data, valor, nota, horaInicio, horaFim }) => {
                const ativo = diaSelecionado === data
                return (
                  <tr key={data}
                    onClick={() => setDiaSelecionado(prev => prev === data ? null : data)}
                    onMouseDown={e => e.preventDefault()}
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                      background: ativo ? '#eff6ff' : (diaSelecionado ? '#f9fafb' : 'white') }}
                    onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = '#f0f9ff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = ativo ? '#eff6ff' : (diaSelecionado ? '#f9fafb' : 'white') }}>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: ativo ? 700 : 400,
                      color: ativo ? '#1a56db' : '#374151' }}>{fmtData(data)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap', color: '#374151' }}>
                      {horaInicio ? horaInicio.slice(0, 5) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap', color: '#374151' }}>
                      {horaFim ? horaFim.slice(0, 5) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap',
                      color: valor > 0 ? (ativo ? '#1a56db' : '#1e2a3b') : '#d1d5db', fontWeight: valor > 0 ? 600 : 400 }}>
                      {valor > 0 ? `R$ ${fmt(valor)}` : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 10, color: '#4b5563', maxWidth: 200 }}>
                      {nota ? (
                        <span style={{ background: '#fffbeb', borderLeft: '3px solid #d97706',
                          padding: '2px 6px', borderRadius: '0 3px 3px 0', display: 'inline-block' }}>
                          {nota}
                        </span>
                      ) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 1 }}>
              <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                <td style={{ padding: '7px 10px', color: '#374151' }} colSpan={3}>Total</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#1e2a3b' }}>R$ {fmt(totalProd)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

        {/* Coluna direita: Atividades + Colaboradores */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 700 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#374151', color: 'white', padding: '8px 14px', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Acompanhamento por Atividade</span>
            {diaSelecionado && (
              <>
                <span style={{ fontSize: 11, opacity: .8 }}>— {fmtData(diaSelecionado)}</span>
                <button onClick={() => setDiaSelecionado(null)}
                  style={{ marginLeft: 'auto', fontSize: 11, padding: '1px 8px', borderRadius: 4,
                    border: 'none', background: 'rgba(255,255,255,.2)', color: 'white', cursor: 'pointer' }}>
                  ✕ limpar
                </button>
              </>
            )}
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 360 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Descrição</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Quantidade</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Produção R$</th>
                </tr>
              </thead>
              <tbody>
                {atividadesFiltradas.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding: '20px 10px', textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
                    Nenhuma atividade neste dia.
                  </td></tr>
                ) : atividadesFiltradas.map(({ desc, qtd, valor }) => (
                  <tr key={desc} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 10px', color: '#374151' }}>{desc}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{qtd.toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#1e2a3b', fontWeight: 600 }}>R$ {fmt(valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 1 }}>
                <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                  <td style={{ padding: '7px 10px', color: '#374151' }}>Total</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>
                    {atividadesFiltradas.reduce((s, a) => s + a.qtd, 0).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#1e2a3b' }}>R$ {fmt(totalAtiv)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Tabela de colaboradores — dentro da coluna direita */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#374151', color: 'white', padding: '8px 14px', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Colaboradores no Período</span>
            {diaSelecionado
              ? <span style={{ fontSize: 11, opacity: .8 }}>— {fmtData(diaSelecionado)}</span>
              : colaboradores.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: .8 }}>
                    · {colaboradores.length} colaborador{colaboradores.length !== 1 ? 'es' : ''}
                  </span>
                )
            }
          </div>
          {colaboradoresFiltrados.length === 0 ? (
            <div style={{ padding: '20px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              {diaSelecionado ? 'Nenhum colaborador neste dia.' : 'Nenhum colaborador encontrado.'}
            </div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: 240 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9', width: 36 }}>#</th>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9' }}>Matrícula / Nome</th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradoresFiltrados.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '6px 12px', color: '#9ca3af' }}>{i + 1}</td>
                      <td style={{ padding: '6px 12px', color: '#374151', fontWeight: 500 }}>{c.matricula || c.nome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>{/* fim coluna direita */}
      </div>
    </div>
  )
}
