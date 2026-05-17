import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const MESES = [
  { v: '01', l: 'Janeiro' }, { v: '02', l: 'Fevereiro' }, { v: '03', l: 'Março' },
  { v: '04', l: 'Abril' },   { v: '05', l: 'Maio' },      { v: '06', l: 'Junho' },
  { v: '07', l: 'Julho' },   { v: '08', l: 'Agosto' },    { v: '09', l: 'Setembro' },
  { v: '10', l: 'Outubro' }, { v: '11', l: 'Novembro' },  { v: '12', l: 'Dezembro' },
]

const COR_PRINCIPAL = '#1a56db'
const COR_ATIVIDADE = '#7e3af2'
const COR_INATIVO   = '#d1d5db'

function fmtBRL(v) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtK(v) {
  if (v >= 1000000) return `R$${(v / 1000000).toFixed(1)}M`
  if (v >= 1000)    return `R$${(v / 1000).toFixed(0)}k`
  return `R$${Number(v).toFixed(0)}`
}

export default function ProducaoMensal() {
  const hoje = new Date()
  const [mes, setMes]                   = useState(String(hoje.getMonth() + 1).padStart(2, '0'))
  const [ano, setAno]                   = useState(String(hoje.getFullYear()))
  const [filtroContratoId, setFiltroContratoId] = useState('')
  const [contratos, setContratos]       = useState([])   // { id, descricao }
  const [resumoContratos, setResumoContratos] = useState([]) // { contrato_id, total }
  const [dados, setDados]               = useState([])
  const [carregando, setCarregando]     = useState(false)
  const [equipeAtiva, setEquipeAtiva]   = useState('')
  const [diaAtivo, setDiaAtivo]         = useState('')

  const anos = useMemo(() => {
    const r = []
    for (let y = 2023; y <= hoje.getFullYear() + 1; y++) r.push(String(y))
    return r
  }, [])

  // Carrega lista de contratos uma vez
  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao')
      .then(({ data }) => setContratos(data || []))
  }, [])

  // Resumo por contrato — roda só quando mês/ano muda (sem filtro de contrato)
  useEffect(() => {
    async function buscarResumo() {
      const inicio = `${ano}-${mes}-01`
      const fim = mes === '12'
        ? `${Number(ano) + 1}-01-01`
        : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}-01`

      const { data } = await supabase.from('view_powerbi_producao')
        .select('contrato_id, valor_producao, justificativa')
        .gte('data_producao', inicio)
        .lt('data_producao', fim)
        .limit(10000)

      const map = {}
      ;(data || []).filter(r => !r.justificativa).forEach(r => {
        if (!r.contrato_id) return
        map[r.contrato_id] = (map[r.contrato_id] || 0) + (Number(r.valor_producao) || 0)
      })
      setResumoContratos(Object.entries(map).map(([id, total]) => ({ contrato_id: Number(id), total })))
    }
    buscarResumo()
  }, [mes, ano])

  // Dados completos — roda quando mês/ano/contrato muda
  useEffect(() => {
    setEquipeAtiva('')
    setDiaAtivo('')
    async function buscar() {
      setCarregando(true)
      const inicio = `${ano}-${mes}-01`
      const fim = mes === '12'
        ? `${Number(ano) + 1}-01-01`
        : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}-01`

      let q = supabase.from('view_powerbi_producao')
        .select('registro_id, data_producao, contrato_id, desc_equipe, atividade_id, desc_atividade, unidade, quantidade, valor_producao, justificativa')
        .gte('data_producao', inicio)
        .lt('data_producao', fim)
        .limit(5000)

      if (filtroContratoId) q = q.eq('contrato_id', filtroContratoId)

      const { data } = await q
      setDados((data || []).filter(r => !r.justificativa))
      setCarregando(false)
    }
    buscar()
  }, [mes, ano, filtroContratoId])

  // Cards de contrato: cruza contratos com resumo do período
  const contratoCards = useMemo(() =>
    contratos
      .map(c => ({ ...c, total: resumoContratos.find(r => r.contrato_id === c.id)?.total || 0 }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total),
    [contratos, resumoContratos]
  )

  // Evolução diária: só filtra por equipe (dia selecionado não altera o gráfico de linha)
  const dadosPorEquipe = useMemo(
    () => equipeAtiva ? dados.filter(r => r.desc_equipe === equipeAtiva) : dados,
    [dados, equipeAtiva]
  )

  // Ranking de equipes: só filtra por dia (equipe selecionada não se auto-exclui)
  const dadosPorDia = useMemo(
    () => diaAtivo ? dados.filter(r => r.data_producao === diaAtivo) : dados,
    [dados, diaAtivo]
  )

  // Cards e atividades: filtram por equipe e dia simultaneamente
  const dadosFiltrados = useMemo(() => {
    let d = dados
    if (equipeAtiva) d = d.filter(r => r.desc_equipe === equipeAtiva)
    if (diaAtivo)    d = d.filter(r => r.data_producao === diaAtivo)
    return d
  }, [dados, equipeAtiva, diaAtivo])

  const totalValor = useMemo(
    () => dadosFiltrados.reduce((s, r) => s + (Number(r.valor_producao) || 0), 0),
    [dadosFiltrados]
  )
  const nEquipes = useMemo(
    () => new Set(dadosFiltrados.map(r => r.desc_equipe).filter(Boolean)).size,
    [dadosFiltrados]
  )
  const nRegistros = useMemo(
    () => new Set(dadosFiltrados.map(r => r.registro_id).filter(Boolean)).size,
    [dadosFiltrados]
  )

  const evolucaoDiaria = useMemo(() => {
    const map = {}
    dadosPorEquipe.forEach(r => {
      if (!r.data_producao) return
      const key = r.data_producao
      const label = `${key.slice(8, 10)}/${key.slice(5, 7)}`
      if (!map[key]) map[key] = { dia: label, dataKey: key, valor: 0 }
      map[key].valor += Number(r.valor_producao) || 0
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  }, [dadosPorEquipe])

  const porEquipe = useMemo(() => {
    const map = {}
    dadosPorDia.forEach(r => {
      const eq = r.desc_equipe || 'Sem equipe'
      map[eq] = (map[eq] || 0) + (Number(r.valor_producao) || 0)
    })
    return Object.entries(map)
      .map(([equipe, valor]) => ({ equipe, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 15)
  }, [dadosPorDia])

  const topAtividades = useMemo(() => {
    const map = {}
    dadosFiltrados.forEach(r => {
      const at = r.desc_atividade || 'Sem atividade'
      if (!map[at]) map[at] = { valor: 0, quantidade: 0, unidade: r.unidade || '' }
      map[at].valor      += Number(r.valor_producao) || 0
      map[at].quantidade += Number(r.quantidade)     || 0
    })
    return Object.entries(map)
      .map(([atividade, v]) => ({ atividade, ...v }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10)
  }, [dadosFiltrados])

  const nomeMes = MESES.find(m => m.v === mes)?.l || ''

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Produção Mensal</h1>
      </div>

      {/* Período */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 150 }}>
            <label className="campo-label">Mês</label>
            <select className="campo-select" value={mes} onChange={e => { setMes(e.target.value); setFiltroContratoId('') }}>
              {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, width: 90 }}>
            <label className="campo-label">Ano</label>
            <select className="campo-select" value={ano} onChange={e => { setAno(e.target.value); setFiltroContratoId('') }}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Cards de contrato */}
      {contratoCards.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {contratoCards.map(c => {
            const ativo = String(filtroContratoId) === String(c.id)
            return (
              <div
                key={c.id}
                onClick={() => setFiltroContratoId(prev => String(prev) === String(c.id) ? '' : c.id)}
                style={{
                  padding: '10px 16px', borderRadius: 8, cursor: 'pointer', minWidth: 160,
                  border: `2px solid ${ativo ? COR_PRINCIPAL : '#e5e7eb'}`,
                  background: ativo ? '#eff6ff' : 'white',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{ fontSize: 11, color: ativo ? COR_PRINCIPAL : '#6b7280', fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                  {c.descricao}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: ativo ? COR_PRINCIPAL : '#1e2a3b' }}>
                  {fmtBRL(c.total)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {carregando ? (
        <div className="loading"><div className="spinner" /> Carregando...</div>
      ) : (
        <>
          {equipeAtiva && (
            <div style={{
              marginBottom: 12, padding: '8px 14px', background: '#eff6ff',
              border: '1px solid #bfdbfe', borderRadius: 6,
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
            }}>
              <span style={{ color: COR_PRINCIPAL, fontWeight: 600 }}>Equipe:</span>
              <span style={{ color: '#1e40af' }}>{equipeAtiva}</span>
              <button onClick={() => setEquipeAtiva('')}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 16, lineHeight: 1 }}
              >×</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <CardResumo titulo="Valor Produzido" valor={fmtBRL(totalValor)} cor={COR_PRINCIPAL} />
            <CardResumo titulo="Equipes Ativas"  valor={nEquipes}           cor="#057a55" />
            <CardResumo titulo="Registros"        valor={nRegistros}         cor="#7e3af2" />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e2a3b', flex: 1 }}>
                Evolução Diária — {nomeMes} {ano}
                {equipeAtiva && <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13, marginLeft: 8 }}>({equipeAtiva})</span>}
              </h3>
              {diaAtivo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                  <span style={{ color: COR_PRINCIPAL, fontWeight: 600 }}>
                    {`${diaAtivo.slice(8, 10)}/${diaAtivo.slice(5, 7)}/${diaAtivo.slice(0, 4)}`}
                  </span>
                  <button onClick={() => setDiaAtivo('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              )}
            </div>
            {evolucaoDiaria.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Nenhum dado para o período selecionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={evolucaoDiaria}
                  margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
                  style={{ cursor: 'pointer' }}
                  onClick={chartData => {
                    const key = chartData?.activePayload?.[0]?.payload?.dataKey
                    if (key) setDiaAtivo(prev => prev === key ? '' : key)
                  }}
                >
                  <defs>
                    <linearGradient id="gradProducao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={COR_PRINCIPAL} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={COR_PRINCIPAL} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={68} />
                  <Tooltip formatter={v => [fmtBRL(v), 'Valor produzido']} labelStyle={{ fontWeight: 600 }} />
                  <Area
                    type="monotone" dataKey="valor" stroke={COR_PRINCIPAL} strokeWidth={2}
                    fill="url(#gradProducao)"
                    activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
                    dot={props => {
                      if (props.payload.dataKey !== diaAtivo) return null
                      return <circle key={props.payload.dia} cx={props.cx} cy={props.cy} r={5} fill={COR_PRINCIPAL} stroke="white" strokeWidth={2} />
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#1e2a3b' }}>Ranking de Equipes</h3>
              <p style={{ margin: '0 0 12px', fontSize: 11, color: '#9ca3af' }}>Clique para filtrar os demais gráficos</p>
              {porEquipe.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>Nenhum dado.</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(240, porEquipe.length * 36)}>
                  <BarChart data={porEquipe} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="equipe" width={130} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={v => [fmtBRL(v), 'Valor']} />
                    <Bar dataKey="valor" radius={[0, 3, 3, 0]} cursor="pointer"
                      onClick={entry => setEquipeAtiva(prev => prev === entry.equipe ? '' : entry.equipe)}>
                      {porEquipe.map(entry => (
                        <Cell key={entry.equipe} fill={
                          !equipeAtiva ? COR_PRINCIPAL
                          : equipeAtiva === entry.equipe ? COR_PRINCIPAL
                          : COR_INATIVO
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#1e2a3b' }}>
                Top 10 Atividades
                {equipeAtiva && <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13, marginLeft: 8 }}>({equipeAtiva})</span>}
              </h3>
              {topAtividades.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>Nenhum dado.</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(240, topAtividades.length * 36)}>
                  <BarChart data={topAtividades} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="atividade" width={170} tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipAtividade />} />
                    <Bar dataKey="valor" fill={COR_ATIVIDADE} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TooltipAtividade({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 600, color: '#1e2a3b', marginBottom: 6, maxWidth: 220 }}>{d.atividade}</div>
      <div style={{ color: '#374151' }}>Valor: <strong style={{ color: COR_ATIVIDADE }}>{fmtBRL(d.valor)}</strong></div>
      <div style={{ color: '#374151' }}>Quantidade: <strong>{Number(d.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}{d.unidade ? ` ${d.unidade}` : ''}</strong></div>
    </div>
  )
}

function CardResumo({ titulo, valor, cor }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${cor}` }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {titulo}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  )
}
