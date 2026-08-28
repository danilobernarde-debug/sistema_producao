import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

// ── Utilitários ───────────────────────────────────────────────────────────────
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

// Contratos TO (17=SUL, 18=CENTRO, 19=NORTE) agrupados como "Faixa Tocantins"
const IDS_FAIXA_TO = new Set([17, 18, 19])
const CHAVE_FAIXA_TO = 'faixa-tocantins'
const NOME_FAIXA_TO = 'Faixa Tocantins'
function chaveContrato(id) { return IDS_FAIXA_TO.has(Number(id)) ? CHAVE_FAIXA_TO : String(id) }
function nomeContrato(id, desc) { return IDS_FAIXA_TO.has(Number(id)) ? NOME_FAIXA_TO : (desc || `Contrato ${id}`) }
function matchFiltro(contrato_id, filtro) {
  if (filtro === 'todos') return true
  if (filtro === CHAVE_FAIXA_TO) return IDS_FAIXA_TO.has(Number(contrato_id))
  return String(contrato_id) === filtro
}

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
    const { data } = await supabase
      .from('d_metas_diarias')
      .select('tipo_equipe_id, data, meta_diaria')
      .gte('data', `${ano}-01-01`)
      .lte('data', `${ano}-12-31`)
    const mapa = {}
    ;(data || []).forEach(row => {
      const tid = String(row.tipo_equipe_id)
      const mes = Number(row.data.split('-')[1])
      if (!mapa[tid]) mapa[tid] = {}
      mapa[tid][mes] = (mapa[tid][mes] || 0) + Number(row.meta_diaria)
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
  let offset = 0
  while (true) {
    const { data, error } = await buildQuery(offset, pageSize)
    if (error) throw new Error(error.message || JSON.stringify(error))
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

const CACHE_VER = 'v7' // incrementar quando mudar estrutura do cache
const CACHE_DB = 'producao_dashboard_cache'
const CACHE_STORE = 'anos'
const _cacheAnos = {} // fallback em memória se IndexedDB falhar

// IndexedDB em vez de localStorage: o cache de um ano inteiro (todas as
// equipes/atividades) facilmente passa da cota de 5-10MB do localStorage,
// o que fazia o cacheSet falhar silenciosamente e o cache nunca pegar.
function abrirCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function cacheGet(ano) {
  try {
    const db = await abrirCacheDB()
    const valor = await new Promise((resolve, reject) => {
      const req = db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(`${CACHE_VER}_${ano}`)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    if (valor) valor.carregadoEm = new Date(valor.carregadoEm)
    return valor
  } catch {
    return _cacheAnos[ano] || null
  }
}

async function cacheSet(ano, valor) {
  _cacheAnos[ano] = valor
  try {
    const db = await abrirCacheDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).put({ ...valor, carregadoEm: valor.carregadoEm.toISOString() }, `${CACHE_VER}_${ano}`)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch {}
}

async function cacheDel(ano) {
  delete _cacheAnos[ano]
  try {
    const db = await abrirCacheDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).delete(`${CACHE_VER}_${ano}`)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch {}
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AnaliseDashboard() {
  const navegar = useNavigate()
  const anoAtual = new Date().getFullYear()

  const [aba, setAba]               = useState(0)
  const [ano, setAno]               = useState(anoAtual)
  const [filtrosPorAba, setFiltrosPorAba] = useState({
    0: { contrato: 'todos', mes: 0, equipe: null },
    1: { contrato: 'todos', mes: 0 },
    2: { contrato: 'todos', mes: 0 },
  })
  function setFiltroAba(abaIdx, chave, valor) {
    setFiltrosPorAba(prev => ({ ...prev, [abaIdx]: { ...prev[abaIdx], [chave]: valor } }))
  }
  const { contrato: f0Contrato, mes: f0Mes, equipe: f0Equipe } = filtrosPorAba[0]
  const { contrato: f1Contrato, mes: f1Mes } = filtrosPorAba[1]
  const { contrato: f2Contrato, mes: f2Mes } = filtrosPorAba[2]

  const [viewRows, setViewRows]       = useState([])
  const [colabRows, setColabRows]     = useState([])
  const [metas, setMetas]             = useState({}) // tid -> { mes: valor }
  const [carregando, setCarregando]   = useState(false)
  const [erroCarregar, setErroCarregar] = useState('')
  const [cacheInfo, setCacheInfo]     = useState(null) // { de: Date } quando veio do cache

  // Para drill-down de equipe (aba 3)
  const [drillEquipe, setDrillEquipe] = useState(null) // { equipeNome, mes }
  const [colaboradoresDrill, setColabsDrill] = useState({ lista: [], porDia: {} })
  const [metadataDrill, setMetadataDrill] = useState({}) // registro_id -> metadata_registro (carregado sob demanda)
  const [telaCheia, setTelaCheia] = useState(false)
  const [anoMinimo, setAnoMinimo] = useState(anoAtual - 1)
  const containerRef = useRef(null)

  useEffect(() => {
    supabase.from('f_prod_registro').select('data_producao').order('data_producao', { ascending: true }).limit(1)
      .then(({ data }) => {
        if (data?.[0]?.data_producao) setAnoMinimo(new Date(data[0].data_producao).getFullYear())
      })
  }, [])

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
    const cached = await cacheGet(ano)

    if (!forcar && cached) {
      setViewRows(cached.viewRows)
      setColabRows(cached.colabRows || [])
      setMetas(cached.metas)
      setCacheInfo({ de: cached.carregadoEm })
      return
    }

    setCarregando(true)
    setCacheInfo(null)
    setErroCarregar('')
    if (forcar) await cacheDel(ano)

    const ini = `${ano}-01-01`
    const fim = `${ano}-12-31`
    try {
      const [viewData, colabData, resMetas] = await Promise.all([
        fetchAllPages((offset, limit) =>
          supabase.rpc('fn_prod_relatorio_equipes', { p_inicio: ini, p_fim: fim, p_limit: limit, p_offset: offset })
            .order('registro_id', { ascending: true })
            .order('f_prod_atividade_id', { ascending: true })
            .order('equipe_id', { ascending: true })
        ),
        fetchAllPages((offset, limit) =>
          supabase.rpc('fn_prod_relatorio_colaboradores', { p_inicio: ini, p_fim: fim, p_limit: limit, p_offset: offset })
        ),
        lerMetasAnuais(ano),
      ])
      cacheSet(ano, { viewRows: viewData, colabRows: colabData, metas: resMetas, carregadoEm: new Date() })
      setViewRows(viewData)
      setColabRows(colabData)
      setMetas(resMetas)
    } catch (e) {
      setErroCarregar(`Erro ao carregar dados: ${e?.message || e}`)
    } finally {
      setCarregando(false)
    }
  }

  // Contratos únicos derivados da view (17/18/19 agrupados como "Faixa Tocantins")
  const contratos = useMemo(() => {
    const map = {}
    viewRows.forEach(v => {
      if (!v.contrato_id) return
      const chave = chaveContrato(v.contrato_id)
      if (!map[chave]) map[chave] = { id: chave, descricao: nomeContrato(v.contrato_id, v.desc_contrato) }
    })
    return Object.values(map).sort((a, b) => a.descricao?.localeCompare(b.descricao))
  }, [viewRows])

  // Reconstrói registros a partir de viewRows (uma linha por atividade → agrupa por registro_id)
  // Agrupa por registro_id + equipe_id: em contratos com logica_contrato = true
  // um mesmo registro pode ter a produção dividida entre várias equipes
  const registros = useMemo(() => {
    const map = {}
    viewRows.forEach(v => {
      const chave = `${v.registro_id}::${v.equipe_id}`
      if (!map[chave]) {
        map[chave] = {
          id: v.registro_id,
          contrato_id: v.contrato_id,
          tipo_equipe_id: v.tipo_equipe_id,
          data_producao: v.data_producao_original ?? v.data_producao?.split('T')[0],
          equipe_id: v.equipe_id,
          desc_equipe: v.desc_equipe,
          f_prod_atividades: [],
        }
      }
      if (v.atividade_id) {
        map[chave].f_prod_atividades.push({
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

  useEffect(() => {
    if (!drillEquipe) {
      setColabsDrill({ lista: [], porDia: {} })
      setMetadataDrill({})
      return
    }
    const { equipeNome, mes } = drillEquipe
    const regIds = registros
      .filter(r => {
        if (r.desc_equipe !== equipeNome) return false
        if (mes && Number(r.data_producao?.split('-')[1]) !== mes) return false
        return true
      })
      .map(r => r.id)
    if (!regIds.length) {
      setColabsDrill({ lista: [], porDia: {} })
      setMetadataDrill({})
      return
    }
    const regDatas = {}
    registros.forEach(r => { if (regIds.includes(r.id)) regDatas[r.id] = r.data_producao })

    Promise.all([
      supabase.from('f_prod_colaboradores')
        .select('registro_id, colaborador_id, d_colaboradores(nome, matricula_nome)')
        .in('registro_id', regIds),
      supabase.from('f_prod_registro')
        .select('id, metadata_registro')
        .in('id', regIds),
    ]).then(([{ data: colabData }, { data: metaData }]) => {
      const vistos = new Set()
      const lista = []
      const porDia = {}
      const vistosPorDia = {}
      const diasPorColab = {}
      ;(colabData || []).forEach(({ registro_id, colaborador_id, d_colaboradores: c }) => {
        if (!c) return
        const colab = { id: colaborador_id, nome: c.nome, matricula: c.matricula_nome }
        if (!vistos.has(colaborador_id)) { vistos.add(colaborador_id); lista.push(colab) }
        const dia = regDatas[registro_id]
        if (dia) {
          if (!diasPorColab[colaborador_id]) diasPorColab[colaborador_id] = new Set()
          diasPorColab[colaborador_id].add(dia)
          if (!vistosPorDia[dia]) vistosPorDia[dia] = new Set()
          if (!vistosPorDia[dia].has(colaborador_id)) {
            vistosPorDia[dia].add(colaborador_id)
            if (!porDia[dia]) porDia[dia] = []
            porDia[dia].push(colab)
          }
        }
      })
      lista.forEach(c => { c.diasTrabalhados = diasPorColab[c.id]?.size || 0 })
      lista.sort((a, b) => a.nome.localeCompare(b.nome))
      Object.values(porDia).forEach(arr => arr.sort((a, b) => a.nome.localeCompare(b.nome)))
      setColabsDrill({ lista, porDia })

      const newMeta = {}
      ;(metaData || []).forEach(r => { newMeta[r.id] = r.metadata_registro })
      setMetadataDrill(newMeta)
    })
  }, [drillEquipe, registros])

  // Registros filtrados — aba 0 (Painel Principal)
  const regsFiltrados = useMemo(() => {
    return registros.filter(r => {
      if (!matchFiltro(r.contrato_id, f0Contrato)) return false
      if (f0Mes !== 0 && Number(r.data_producao?.split('-')[1]) !== f0Mes) return false
      if (f0Equipe && r.desc_equipe !== f0Equipe) return false
      return true
    })
  }, [registros, f0Contrato, f0Mes, f0Equipe])

  // Filtros parciais para gráficos do Painel Principal (aba 0)
  const regsExclContrato = useMemo(() => registros.filter(r => {
    if (f0Mes !== 0 && Number(r.data_producao?.split('-')[1]) !== f0Mes) return false
    if (f0Equipe && r.desc_equipe !== f0Equipe) return false
    return true
  }), [registros, f0Mes, f0Equipe])

  const regsExclMes = useMemo(() => registros.filter(r => {
    if (!matchFiltro(r.contrato_id, f0Contrato)) return false
    if (f0Equipe && r.desc_equipe !== f0Equipe) return false
    return true
  }), [registros, f0Contrato, f0Equipe])

  const regsExclEquipe = useMemo(() => registros.filter(r => {
    if (!matchFiltro(r.contrato_id, f0Contrato)) return false
    if (f0Mes !== 0 && Number(r.data_producao?.split('-')[1]) !== f0Mes) return false
    return true
  }), [registros, f0Contrato, f0Mes])

  // Filtro para aba 2 (Produção Detalhada) — independente do aba 0
  const regsExclMes2 = useMemo(() => registros.filter(r =>
    matchFiltro(r.contrato_id, f2Contrato)
  ), [registros, f2Contrato])

  // ── Dados para Aba 0: Painel Principal ──────────────────────────────────────
  const dadosPizza = useMemo(() => {
    const map = {}
    regsExclContrato.forEach(r => {
      const v = valorReg(r)
      if (!v) return
      const chave = chaveContrato(r.contrato_id)
      const nome = nomeContrato(r.contrato_id, contratos.find(c => c.id === chave)?.descricao)
      if (!map[chave]) map[chave] = { name: nome, value: 0, id: chave }
      map[chave].value += v
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

  const dadosBarMes2 = useMemo(() => {
    const map = {}
    regsExclMes2.forEach(r => {
      const mes = Number(r.data_producao?.split('-')[1])
      if (!mes) return
      map[mes] = (map[mes] || 0) + valorReg(r)
    })
    return Array.from({ length: 12 }, (_, i) => ({ mes: MESES[i], valor: map[i + 1] || 0, mesNum: i + 1 }))
  }, [regsExclMes2])

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
      const nome = r.desc_equipe
      if (!nome) return
      map[nome] = (map[nome] || 0) + valorReg(r)
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [regsExclEquipe])

  // ── Dados para Aba 1: Análise Mensal ─────────────────────────────────────────
  const dadosAnaliseMensal = useMemo(() => {
    // meta por equipe_id por mes
    const metaPorTidMes = metas // tid -> { mes: valor }

    // produção por equipe por mês
    const prodMap = {} // equipeNome -> { mes: valor }
    registros.forEach(r => {
      const cid = String(r.contrato_id)
      if (!matchFiltro(r.contrato_id, f1Contrato)) return
      const nome = r.desc_equipe
      if (!nome) return
      const mes = Number(r.data_producao?.split('-')[1])
      if (!mes) return
      if (!prodMap[nome]) prodMap[nome] = { cid, tid: String(r.tipo_equipe_id) }
      prodMap[nome][mes] = (prodMap[nome][mes] || 0) + valorReg(r)
    })

    const encPorEquipe = {}
    viewRows.forEach(v => {
      if (!v.encarregado || !v.desc_equipe || encPorEquipe[v.desc_equipe]) return
      if (!matchFiltro(v.contrato_id, f1Contrato)) return
      encPorEquipe[v.desc_equipe] = v.encarregado.split(' ')[0]
    })

    // agrupar por contrato
    const contratoMap = {}
    Object.entries(prodMap).forEach(([nome, dados]) => {
      const cid = chaveContrato(dados.cid)
      const cnome = nomeContrato(dados.cid, contratos.find(c => c.id === cid)?.descricao)
      if (!contratoMap[cnome]) contratoMap[cnome] = { cid, equipes: [] }
      const tid = dados.tid
      const mesesValores = {}
      Array.from({ length: 12 }, (_, i) => i + 1).forEach(m => {
        mesesValores[m] = dados[m] || 0
      })
      const metaTid = metaPorTidMes[tid] || {}
      contratoMap[cnome].equipes.push({ nome, encarregado: encPorEquipe[nome] || null, mesesValores, metaTid })
    })

    return Object.entries(contratoMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cnome, { cid, equipes: eqs }]) => ({
        contrato: cnome, cid,
        equipes: eqs.sort((a, b) => a.nome.localeCompare(b.nome)),
      }))
  }, [registros, contratos, metas, f1Contrato])

  // ── Dados para Aba 2: Produção Detalhada ─────────────────────────────────────
  const dadosDetalhada = useMemo(() => {
    const mesAtivo = f2Mes || null


    const atividadeMap = {} // equipeNome -> { [descAtiv]: { qtd, valor } }
    const prodEquipe = {}   // equipeNome -> { prod, tid, cid }
    const diasPorEquipe = {} // equipeNome -> Set de datas
    const encPorEquipe = {}  // equipeNome -> primeiro nome do encarregado

    registros.forEach(r => {
      if (!matchFiltro(r.contrato_id, f2Contrato)) return
      if (mesAtivo && Number(r.data_producao?.split('-')[1]) !== mesAtivo) return
      const nome = r.desc_equipe
      if (!nome) return
      const val = valorReg(r)
      if (!prodEquipe[nome]) {
        prodEquipe[nome] = { prod: 0, tid: String(r.tipo_equipe_id), cid: String(r.contrato_id) }
        diasPorEquipe[nome] = new Set()
      }
      prodEquipe[nome].prod += val
      if (r.data_producao && val > 0) diasPorEquipe[nome].add(r.data_producao)

      ;(r.f_prod_atividades || []).forEach(a => {
        const desc = a.d_atividades?.DESCRICAO_BASICA_SISTEMA || 'Sem descrição'
        if (!atividadeMap[nome]) atividadeMap[nome] = {}
        if (!atividadeMap[nome][desc]) atividadeMap[nome][desc] = { qtd: 0, upe: 0, valor: 0 }
        atividadeMap[nome][desc].qtd   += Number(a.quantidade || 0)
        atividadeMap[nome][desc].upe   += Number(a.upe || 0)
        atividadeMap[nome][desc].valor += Number(a.upe || 0) * Number(a.preco_upe || 0) * Number(a.quantidade || 0)
      })
    })

    viewRows.forEach(v => {
      if (!v.encarregado || !v.desc_equipe) return
      if (!matchFiltro(v.contrato_id, f2Contrato)) return
      if (mesAtivo && Number(v.data_producao?.split('-')[1]) !== mesAtivo) return
      if (!encPorEquipe[v.desc_equipe]) encPorEquipe[v.desc_equipe] = v.encarregado.split(' ')[0]
    })

    // Colaboradores por equipe: produção, dias trabalhados e média
    const colabPorEquipe = {}
    colabRows.forEach(c => {
      if (!matchFiltro(c.contrato_id, f2Contrato)) return
      if (mesAtivo && Number(c.data_producao?.split('-')[1]) !== mesAtivo) return
      if (!c.desc_equipe) return
      if (!colabPorEquipe[c.desc_equipe]) colabPorEquipe[c.desc_equipe] = new Map()
      const val = Number(c.valor_por_colaborador || 0)
      const data = c.data_producao?.split('T')[0]
      if (!colabPorEquipe[c.desc_equipe].has(c.colaborador_id)) {
        colabPorEquipe[c.desc_equipe].set(c.colaborador_id, { id: c.colaborador_id, nome: c.nome_colaborador, prod: 0, dias: new Set() })
      }
      const entry = colabPorEquipe[c.desc_equipe].get(c.colaborador_id)
      entry.prod += val
      if (val > 0 && data) entry.dias.add(data)
    })

    const contratoMap = {}
    Object.entries(prodEquipe).forEach(([nome, { prod, tid, cid }]) => {
      const chave = chaveContrato(cid)
      const cnome = nomeContrato(cid, contratos.find(c => c.id === chave)?.descricao)
      if (!contratoMap[cnome]) contratoMap[cnome] = { equipes: [] }
      contratoMap[cnome].equipes.push({
        nome, prod, tid, cid,
        encarregado: encPorEquipe[nome] || null,
        diasTrabalhados: diasPorEquipe[nome]?.size || 0,
        colaboradores: colabPorEquipe[nome]
          ? [...colabPorEquipe[nome].values()]
              .map(c => ({ id: c.id, nome: c.nome, prod: c.prod, diasTrabalhados: c.dias.size, media: c.dias.size > 0 ? c.prod / c.dias.size : 0 }))
              .sort((a, b) => b.prod - a.prod)
          : [],
        atividades: Object.entries(atividadeMap[nome] || {})
          .map(([desc, d]) => ({ desc, ...d }))
          .sort((a, b) => b.valor - a.valor),
      })
    })

    return Object.entries(contratoMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([contrato, { equipes }]) => ({ contrato, equipes }))
  }, [registros, colabRows, contratos, f2Contrato, f2Mes])

  // ── Dados para Aba 3: Detalhe Equipe ─────────────────────────────────────────
  const dadosDetalheEquipe = useMemo(() => {
    if (!drillEquipe) return null
    const { equipeNome, mes } = drillEquipe

    const regsEquipe = registros.filter(r => {
      if (r.desc_equipe !== equipeNome) return false
      if (mes && Number(r.data_producao?.split('-')[1]) !== mes) return false
      return true
    })

    // produção por dia
    const porDia = {}
    regsEquipe.forEach(r => {
      porDia[r.data_producao] = (porDia[r.data_producao] || 0) + valorReg(r)
    })

    // notas e horários por dia (metadata carregado sob demanda via metadataDrill)
    const regIds = new Set(regsEquipe.map(r => r.id))
    const notasDia = {}
    const horaInicioDia = {}
    const horaFimDia = {}
    viewRows.filter(v => regIds.has(v.registro_id)).forEach(v => {
      const meta = metadataDrill[v.registro_id]
      const txt = [v.justificativa, meta?.observacoes].filter(Boolean).join(' | ')
      if (txt.trim()) {
        if (!notasDia[v.data_producao_original]) notasDia[v.data_producao_original] = new Set()
        notasDia[v.data_producao_original].add(txt.trim())
      }
      const hi = meta?.horario_inicio
      const hf = meta?.horario_fim
      if (hi && (!horaInicioDia[v.data_producao_original] || hi < horaInicioDia[v.data_producao_original]))
        horaInicioDia[v.data_producao_original] = hi
      if (hf && (!horaFimDia[v.data_producao_original] || hf > horaFimDia[v.data_producao_original]))
        horaFimDia[v.data_producao_original] = hf
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

    const encSet = new Set()
    viewRows.filter(v => regIds.has(v.registro_id) && v.encarregado)
      .forEach(v => encSet.add(v.encarregado))
    const encarregados = [...encSet]

    return {
      equipeNome, mes, encarregados,
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
  }, [drillEquipe, registros, viewRows, metas, metadataDrill])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function clicarCelulaAnaliseMensal(equipeNome, mes) {
    setDrillEquipe({ equipeNome, mes })
    setAba(3)
  }

  function clicarBarMes(mesNum) {
    const abaIdx = aba === 2 ? 2 : 0
    setFiltroAba(abaIdx, 'mes', filtrosPorAba[abaIdx].mes === mesNum ? 0 : mesNum)
  }

  function clicarPizza(contratoId) {
    setFiltroAba(0, 'contrato', f0Contrato === contratoId ? 'todos' : contratoId)
  }

  function clicarEquipePainel(equipeNome) {
    setFiltroAba(0, 'equipe', f0Equipe === equipeNome ? null : equipeNome)
  }

  // ── Render abas (tab 3 oculta, acessada só via drill-down) ───────────────────
  const ABAS_VISIVEIS = ['Painel Principal', 'Análise Mensal', 'Produção Detalhada']

  return (
    <div ref={containerRef} className="pagina"
      style={telaCheia ? { background: '#f8fafc', overflowY: 'auto', padding: 24 } : {}}>
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => aba === 3 ? setAba(1) : navegar(-1)}
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
                  Cache de {cacheInfo.de.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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

      {/* Filtros por aba — independentes entre abas */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Ano</label>
            <select className="campo-input" value={ano} onChange={e => setAno(Number(e.target.value))} style={{ width: 100 }}>
              {Array.from({ length: anoAtual + 1 - anoMinimo + 1 }, (_, i) => anoMinimo + i).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {aba !== 3 && <>
            <div className="campo-grupo" style={{ marginBottom: 0 }}>
              <label className="campo-label">Contrato</label>
              <select className="campo-input" value={filtrosPorAba[aba].contrato} onChange={e => setFiltroAba(aba, 'contrato', e.target.value)} style={{ width: 200 }}>
                <option value="todos">Todos</option>
                {contratos.map(c => <option key={c.id} value={String(c.id)}>{c.descricao}</option>)}
              </select>
            </div>
            <div className="campo-grupo" style={{ marginBottom: 0 }}>
              <label className="campo-label">Mês</label>
              <select className="campo-input" value={filtrosPorAba[aba].mes} onChange={e => setFiltroAba(aba, 'mes', Number(e.target.value))} style={{ width: 140 }}>
                <option value={0}>Todos</option>
                {MESES_FULL.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            {(filtrosPorAba[aba].contrato !== 'todos' || filtrosPorAba[aba].mes !== 0 || (aba === 0 && f0Equipe)) && (
              <button className="btn btn-secundario"
                onClick={() => setFiltrosPorAba(prev => ({
                  ...prev,
                  [aba]: aba === 0 ? { contrato: 'todos', mes: 0, equipe: null } : { contrato: 'todos', mes: 0 },
                }))}
                style={{ alignSelf: 'flex-end', fontSize: 12 }}>
                Limpar filtros
              </button>
            )}
          </>}
        </div>
      </div>

      {/* Abas visíveis (tab 3 só aparece após drill-down) */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e5e7eb', overflowX: 'auto' }}>
        {ABAS_VISIVEIS.map((label, i) => (
          <button key={i} onClick={() => setAba(i)} style={{
            padding: '10px 18px', fontSize: 13, fontWeight: aba === i ? 700 : 500,
            color: aba === i ? '#1a56db' : '#6b7280', background: 'none', border: 'none',
            borderBottom: aba === i ? '3px solid #1a56db' : '3px solid transparent',
            cursor: 'pointer', marginBottom: -2, transition: 'color .15s', whiteSpace: 'nowrap', flexShrink: 0,
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
          filtroMes={f0Mes} onClickMes={clicarBarMes}
          filtroContrato={f0Contrato} onClickPizza={clicarPizza}
          filtroEquipe={f0Equipe} onClickEquipe={clicarEquipePainel}
        />}
        {aba === 1 && <AnaliseMensal
          dados={dadosAnaliseMensal} filtroMes={f1Mes}
          onClickCelula={clicarCelulaAnaliseMensal}
        />}
        {aba === 2 && <ProducaoDetalhada
          dados={dadosDetalhada} dadosBarMes={dadosBarMes2}
          filtroMes={f2Mes} onClickMes={clicarBarMes}
          regsExclMes={regsExclMes2}
          metas={metas} ano={ano}
        />}
        {aba === 3 && <DetalheEquipe
          dados={dadosDetalheEquipe}
          colaboradores={colaboradoresDrill.lista}
          colaboradoresPorDia={colaboradoresDrill.porDia}
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
      <div className="graficos-grid" style={{ marginBottom: 16 }}>
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

      <div className="graficos-grid">
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
  const [tooltip, setTooltip] = useState(null) // { meta, perc, val, x, y }
  const mesesCols = filtroMes ? [filtroMes] : Array.from({ length: 12 }, (_, i) => i + 1)

  function toggle(cnome) {
    setExpandidos(p => ({ ...p, [cnome]: !p[cnome] }))
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      {tooltip && (
        <div style={{
          position: 'fixed', zIndex: 9999, pointerEvents: 'none',
          left: tooltip.x, top: tooltip.y - 8,
          transform: 'translate(-50%, -100%)',
          background: '#1e2a3b', color: 'white',
          padding: '8px 14px', borderRadius: 8,
          fontSize: 12, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          lineHeight: 1.6,
        }}>
          {tooltip.meta > 0 ? (<>
            <div style={{ color: '#94a3b8' }}>Meta: <span style={{ color: 'white', fontWeight: 600 }}>R$ {fmt(tooltip.meta)}</span></div>
            <div style={{ color: '#94a3b8' }}>Alcançado: <span style={{
              fontWeight: 700, fontSize: 13,
              color: tooltip.perc >= 100 ? '#4ade80' : tooltip.perc >= 70 ? '#fbbf24' : '#f87171'
            }}>{tooltip.perc !== null ? `${tooltip.perc.toFixed(1)}%` : '—'}</span></div>
          </>) : (
            <div style={{ color: '#94a3b8' }}>Sem meta cadastrada</div>
          )}
        </div>
      )}
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
                      title={eq.encarregado ? `${eq.nome} - ${eq.encarregado}` : eq.nome}>
                      {eq.nome}{eq.encarregado && <span style={{ fontWeight: 400, color: '#9ca3af' }}>-{eq.encarregado}</span>}
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
                            position: 'relative',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.filter = 'brightness(0.94)'
                            if (val > 0) {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setTooltip({ meta, perc, val, x: rect.left + rect.width / 2, y: rect.top })
                            }
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.filter = ''
                            setTooltip(null)
                          }}>
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
function ProducaoDetalhada({ dados, dadosBarMes, filtroMes, onClickMes, regsExclMes, metas, ano }) {
  const [equipeSelecionada, setEquipeSelecionada] = useState(null)
  const [expandidos, setExpandidos] = useState({})
  const [sortCol, setSortCol] = useState('prod')
  const [sortDir, setSortDir] = useState('desc')
  const [expandidosColab, setExpandidosColab] = useState({})

  function toggleColab(e, equipeNome) {
    e.stopPropagation()
    setExpandidosColab(p => ({ ...p, [equipeNome]: !p[equipeNome] }))
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'nome' ? 'asc' : 'desc') }
  }

  function toggle(cnome) {
    setExpandidos(p => ({ ...p, [cnome]: p[cnome] === false ? true : false }))
  }

  const todasEquipes = useMemo(() => dados.flatMap(g => g.equipes), [dados])
  const totalGeral = todasEquipes.reduce((s, d) => s + d.prod, 0)

  const hoje = new Date()
  const mesLimite = (!filtroMes && ano === hoje.getFullYear()) ? hoje.getMonth() + 1 : 12
  const totalDiasPeriodo = filtroMes
    ? new Date(ano, filtroMes, 0).getDate()
    : ano < hoje.getFullYear()
      ? (ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0) ? 366 : 365)
      : ano > hoje.getFullYear()
        ? (ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0) ? 366 : 365)
        : Math.floor((hoje - new Date(ano, 0, 1)) / 86400000) + 1

  function getMeta(tid) {
    return filtroMes
      ? (metas?.[tid]?.[filtroMes] || 0)
      : Object.entries(metas?.[tid] || {})
          .filter(([m]) => Number(m) <= mesLimite)
          .reduce((s, [, v]) => s + v, 0)
  }

  function sortEquipes(equipes) {
    return [...equipes].sort((a, b) => {
      let va, vb
      const metaA = getMeta(a.tid), metaB = getMeta(b.tid)
      switch (sortCol) {
        case 'nome':     va = a.nome; vb = b.nome; break
        case 'prod':     va = a.prod; vb = b.prod; break
        case 'diasT':    va = a.diasTrabalhados; vb = b.diasTrabalhados; break
        case 'media':    va = a.diasTrabalhados > 0 ? a.prod / a.diasTrabalhados : 0
                         vb = b.diasTrabalhados > 0 ? b.prod / b.diasTrabalhados : 0; break
        case 'meta':     va = metaA; vb = metaB; break
        case 'metaPerc': va = metaA > 0 ? a.prod / metaA : -1
                         vb = metaB > 0 ? b.prod / metaB : -1; break
        default:         va = a.prod; vb = b.prod
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }

  const dadosBarMesLocal = useMemo(() => {
    if (!equipeSelecionada) return dadosBarMes
    const map = {}
    regsExclMes.forEach(r => {
      if (r.desc_equipe !== equipeSelecionada) return
      const mes = Number(r.data_producao?.split('-')[1])
      if (!mes) return
      map[mes] = (map[mes] || 0) + valorReg(r)
    })
    return Array.from({ length: 12 }, (_, i) => ({ mes: MESES[i], valor: map[i + 1] || 0, mesNum: i + 1 }))
  }, [equipeSelecionada, dadosBarMes, regsExclMes])

  const COLS = [
    { h: 'Equipe',      col: 'nome',     align: 'left',  w: 160 },
    { h: 'Produção',    col: 'prod',     align: 'right', w: null },
    { h: 'Dias T./Total', col: 'diasT', align: 'center', w: 90 },
    { h: 'Média/Dia',   col: 'media',    align: 'right', w: 100 },
    { h: 'Meta',        col: 'meta',     align: 'right', w: 110 },
    { h: 'Atingimento', col: 'metaPerc', align: 'center', w: 90 },
  ]

  const thStyle = (col, align) => ({
    padding: '9px 12px', textAlign: align, fontWeight: 600, fontSize: 11,
    letterSpacing: .3, textTransform: 'uppercase',
    color: sortCol === col ? '#1a56db' : '#6b7280',
    borderBottom: sortCol === col ? '2px solid #1a56db' : '2px solid #e2e8f0',
    position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1,
    whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none',
  })

  return (
    <div>
      {/* Gráfico */}
      <div className="card" style={{ padding: '16px 16px 12px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e2a3b' }}>
            Produção por Mês
            {equipeSelecionada && <span style={{ fontWeight: 400, color: '#1a56db', marginLeft: 8 }}>— {equipeSelecionada}</span>}
          </div>
          {equipeSelecionada && (
            <button onClick={() => setEquipeSelecionada(null)}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1px solid #bfdbfe',
                background: '#eff6ff', color: '#1a56db', cursor: 'pointer', fontWeight: 600 }}>
              ✕ limpar filtro
            </button>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dadosBarMesLocal} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => fmtMi(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} width={65} axisLine={false} tickLine={false} />
            <Tooltip formatter={v => [`R$ ${fmt(v)}`, 'Produção']} cursor={{ fill: '#f1f5f9' }} />
            <Bar dataKey="valor" name="Produção" cursor="pointer" radius={[4, 4, 0, 0]}
              onClick={d => onClickMes(d.mesNum)}>
              {dadosBarMesLocal.map((d, i) => (
                <Cell key={i} fill={filtroMes === d.mesNum ? '#1a56db' : '#60a5fa'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(90deg, #1e2a3b, #1a3a6b)', color: 'white',
          padding: '10px 16px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          Análise de Produção Detalhada
          <span style={{ fontSize: 11, opacity: .6, fontWeight: 400 }}>· Clique na equipe para filtrar o gráfico</span>
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 480 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {COLS.map(({ h, col, align, w }) => (
                  <th key={h} onClick={() => col && toggleSort(col)}
                    style={{ ...thStyle(col, align), ...(w ? { minWidth: w } : {}) }}>
                    {h}{col && sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.map(({ contrato, equipes }) => {
                const aberto = expandidos[contrato] !== false
                const totalContrato = equipes.reduce((s, e) => s + e.prod, 0)
                const metaContrato = equipes.reduce((s, e) => s + getMeta(e.tid), 0)
                const percContrato = metaContrato > 0 ? (totalContrato / metaContrato) * 100 : null
                const bgPerc = percContrato === null ? null : percContrato >= 100 ? '#dcfce7' : percContrato >= 70 ? '#fef9c3' : '#fee2e2'
                const txPerc = percContrato === null ? '#9ca3af' : percContrato >= 100 ? '#15803d' : percContrato >= 70 ? '#92400e' : '#b91c1c'
                return [
                  <tr key={contrato} onClick={() => toggle(contrato)}
                    style={{ background: '#1e2a3b', cursor: 'pointer', borderBottom: '2px solid #0f172a' }}>
                    <td style={{ padding: '9px 14px', color: 'white', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ opacity: .6, marginRight: 6 }}>{aberto ? '▾' : '▸'}</span>{contrato}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#93c5fd', fontWeight: 700 }}>
                      R$ {fmt(totalContrato)}
                    </td>
                    <td colSpan={2} />
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>
                      {metaContrato > 0 ? `R$ ${fmt(metaContrato)}` : ''}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      {percContrato !== null && (
                        <span style={{ background: bgPerc, color: txPerc, fontWeight: 700, fontSize: 11,
                          padding: '2px 8px', borderRadius: 20 }}>
                          {percContrato.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>,
                  ...(aberto ? sortEquipes(equipes).flatMap(({ nome, prod, tid, diasTrabalhados, encarregado, colaboradores }) => {
                    const selecionada = equipeSelecionada === nome
                    const meta = getMeta(tid)
                    const metaPerc = prod > 0 && meta > 0 ? (prod / meta) * 100 : null
                    const mediaDia = diasTrabalhados > 0 ? prod / diasTrabalhados : 0
                    const bgBadge = metaPerc === null ? '#f3f4f6' : metaPerc >= 100 ? '#dcfce7' : metaPerc >= 70 ? '#fef9c3' : '#fee2e2'
                    const txBadge = metaPerc === null ? '#9ca3af' : metaPerc >= 100 ? '#15803d' : metaPerc >= 70 ? '#92400e' : '#b91c1c'
                    const accentColor = metaPerc === null ? '#e5e7eb' : metaPerc >= 100 ? '#16a34a' : metaPerc >= 70 ? '#d97706' : '#dc2626'
                    const bgRow = selecionada ? '#eff6ff' : equipeSelecionada ? '#f9fafb' : 'white'
                    const colabAberto = expandidosColab[nome]

                    const equipeRow = (
                      <tr key={nome}
                        style={{ borderBottom: colabAberto ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', background: bgRow }}
                        onClick={() => setEquipeSelecionada(prev => prev === nome ? null : nome)}
                        onMouseEnter={e => { if (!selecionada) e.currentTarget.style.background = '#f0f9ff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = bgRow }}>
                        <td style={{ padding: '8px 12px 8px 0', borderLeft: `3px solid ${accentColor}` }}>
                          {colaboradores.length > 0 && (
                            <button
                              onClick={e => toggleColab(e, nome)}
                              style={{ marginLeft: 8, marginRight: 4, width: 18, height: 18, fontSize: 10,
                                lineHeight: 1, background: 'none', border: '1px solid #d1d5db',
                                borderRadius: 4, cursor: 'pointer', color: '#6b7280', padding: 0,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {colabAberto ? '▾' : '▸'}
                            </button>
                          )}
                          <span style={{ paddingLeft: colaboradores.length > 0 ? 0 : 28, color: selecionada ? '#1a56db' : '#1e2a3b', fontWeight: 600 }}>
                            {nome}
                          </span>
                          {encarregado && (
                            <span style={{ fontWeight: 400, color: selecionada ? '#3b82f6' : '#9ca3af' }}>-{encarregado}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700,
                          color: selecionada ? '#1a56db' : '#1e2a3b' }}>
                          R$ {fmt(prod)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>
                          <span style={{ fontWeight: 700 }}>{diasTrabalhados}</span>
                          <span style={{ color: '#9ca3af' }}>/{totalDiasPeriodo}</span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151' }}>
                          {mediaDia > 0 ? `R$ ${fmt(mediaDia)}` : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151' }}>
                          {meta > 0 ? `R$ ${fmt(meta)}` : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{ background: bgBadge, color: txBadge, fontWeight: 700, fontSize: 11,
                            padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                            {metaPerc !== null ? `${metaPerc.toFixed(1)}%` : '—'}
                          </span>
                        </td>
                      </tr>
                    )

                    const colabSubRows = colabAberto
                      ? colaboradores.map((c, i) => (
                          <tr key={c.id} style={{ background: i % 2 === 0 ? '#f8fafc' : '#f1f5f9', borderBottom: i === colaboradores.length - 1 ? '1px solid #e5e7eb' : '1px solid #f1f5f9' }}>
                            <td style={{ padding: '5px 12px 5px 46px', fontSize: 11, color: '#374151', fontWeight: 500 }}>
                              {c.nome}
                            </td>
                            <td style={{ padding: '5px 12px', textAlign: 'right', fontSize: 11, color: '#374151' }}>
                              R$ {fmt(c.prod)}
                            </td>
                            <td style={{ padding: '5px 12px', textAlign: 'center', fontSize: 11, color: '#374151' }}>
                              <span style={{ fontWeight: 600 }}>{c.diasTrabalhados}</span>
                              <span style={{ color: '#9ca3af' }}>/{totalDiasPeriodo}</span>
                            </td>
                            <td style={{ padding: '5px 12px', textAlign: 'right', fontSize: 11, color: '#374151' }}>
                              {c.media > 0 ? `R$ ${fmt(c.media)}` : <span style={{ color: '#d1d5db' }}>—</span>}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        ))
                      : []

                    return [equipeRow, ...colabSubRows]
                  }) : []),
                ]
              })}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 1 }}>
              {(() => {
                const totalMeta = todasEquipes.reduce((s, d) => s + getMeta(d.tid), 0)
                const totalPerc = totalMeta > 0 ? (totalGeral / totalMeta) * 100 : null
                const bgTotalPerc = totalPerc === null ? null : totalPerc >= 100 ? '#dcfce7' : totalPerc >= 70 ? '#fef9c3' : '#fee2e2'
                const txTotalPerc = totalPerc === null ? 'white' : totalPerc >= 100 ? '#15803d' : totalPerc >= 70 ? '#92400e' : '#b91c1c'
                return (
                  <tr style={{ background: '#1e2a3b', color: 'white', borderTop: '2px solid #0f172a' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 700 }}>Total Geral</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#93c5fd' }}>R$ {fmt(totalGeral)}</td>
                    <td colSpan={2} />
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#94a3b8' }}>
                      {totalMeta > 0 ? `R$ ${fmt(totalMeta)}` : ''}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      {totalPerc !== null && (
                        <span style={{ background: bgTotalPerc, color: txTotalPerc, fontWeight: 700, fontSize: 11,
                          padding: '2px 8px', borderRadius: 20 }}>
                          {totalPerc.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })()}
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Aba 3: Detalhe Equipe (Drill-Down) ────────────────────────────────────────
function DetalheEquipe({ dados, colaboradores, colaboradoresPorDia }) {
  const [diaSelecionado, setDiaSelecionado] = useState(null)

  if (!dados) {
    return (
      <div className="card" style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 40 }}>
        Clique em uma equipe nas outras abas para ver o detalhe diário.
      </div>
    )
  }

  const { equipeNome, mes, encarregados, totalProd, metaEquipe, perc, dias, atividades, atividadesPorDia } = dados
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
      <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden',
        background: 'linear-gradient(135deg, #1e2a3b 0%, #1a3a6b 100%)', color: 'white' }}>

        {/* Linha superior: identidade da equipe */}
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.3 }}>{equipeNome}</div>
            <div style={{ fontSize: 13, opacity: .65, fontWeight: 400 }}>{mesLabel}</div>
          </div>
          {encarregados?.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: .8, opacity: .55, textTransform: 'uppercase' }}>
                Encarregado{encarregados.length > 1 ? 's' : ''}
              </span>
              {encarregados.map(enc => (
                <span key={enc} style={{
                  fontSize: 12, fontWeight: 600,
                  background: 'rgba(255,255,255,.15)',
                  border: '1px solid rgba(255,255,255,.2)',
                  borderRadius: 20, padding: '2px 10px',
                }}>
                  {enc}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Linha inferior: métricas */}
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <div style={{ padding: '12px 24px', borderRight: '1px solid rgba(255,255,255,.1)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: .8, opacity: .55, textTransform: 'uppercase', marginBottom: 4 }}>Produção</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>R$ {fmt(totalProd)}</div>
          </div>
          {metaEquipe > 0 && <>
            <div style={{ padding: '12px 24px', borderRight: '1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: .8, opacity: .55, textTransform: 'uppercase', marginBottom: 4 }}>Meta</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>R$ {fmt(metaEquipe)}</div>
            </div>
            <div style={{ padding: '12px 24px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: .8, opacity: .55, textTransform: 'uppercase', marginBottom: 4 }}>Atingimento</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: corP }}>{perc?.toFixed(1)}%</div>
            </div>
          </>}
        </div>
      </div>

      <div className="graficos-grid">
        {/* Coluna esquerda: Tabela diária */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#374151', color: 'white', padding: '8px 14px', fontSize: 12, fontWeight: 700 }}>
            Acompanhamento de Produção Diária
            <span style={{ fontSize: 11, opacity: .7, marginLeft: 8 }}>· Clique para filtrar atividades</span>
          </div>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400 }}>
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
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 360 }}>
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
                    {!diaSelecionado && (
                      <th style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, background: '#f1f5f9', whiteSpace: 'nowrap' }}>Dias Trab.</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {colaboradoresFiltrados.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '6px 12px', color: '#9ca3af' }}>{i + 1}</td>
                      <td style={{ padding: '6px 12px', color: '#374151', fontWeight: 500 }}>{c.matricula || c.nome}</td>
                      {!diaSelecionado && (
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>{c.diasTrabalhados ?? '—'}</td>
                      )}
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
