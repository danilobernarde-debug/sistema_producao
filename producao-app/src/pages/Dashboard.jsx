import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'


function fmtBRL(v) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtK(v) {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`
  return `R$${Number(v).toFixed(0)}`
}

function TooltipMensal({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#1e2a3b' }}>{label}</div>
      <div style={{ color: '#2563eb' }}>Valor: <strong>{fmtBRL(d.valor)}</strong></div>
      <div style={{ color: '#6b7280' }}>Registros: <strong>{d.quantidade}</strong></div>
    </div>
  )
}

function TooltipEquipe({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#1e2a3b', maxWidth: 200 }}>{d.equipe}</div>
      <div style={{ color: '#7c3aed' }}>Valor: <strong>{fmtBRL(d.valor)}</strong></div>
      <div style={{ color: '#6b7280' }}>Registros: <strong>{d.quantidade}</strong></div>
    </div>
  )
}

export default function Dashboard() {
  const navegar = useNavigate()
  const { perfil } = useAuth()
  const [stats, setStats]         = useState({ total: 0, hoje: 0, semana: 0 })
  const [dadosMes, setDadosMes]   = useState([])
  const [top10, setTop10]         = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    const agora = new Date()
    const dataHoje = agora.toISOString().split('T')[0]
    const iniciSemana = new Date(agora)
    iniciSemana.setDate(agora.getDate() - 7)
    const dataIniSemana = iniciSemana.toISOString().split('T')[0]

    const inicio30 = new Date(agora)
    inicio30.setDate(agora.getDate() - 29)
    const dataInicio30 = inicio30.toISOString().split('T')[0]

    const [{ count: total }, { count: hoje }, { count: semana }, { data: raw }] = await Promise.all([
      supabase.from('f_prod_registro').select('*', { count: 'exact', head: true }),
      supabase.from('f_prod_registro').select('*', { count: 'exact', head: true }).eq('data_producao', dataHoje),
      supabase.from('f_prod_registro').select('*', { count: 'exact', head: true }).gte('data_producao', dataIniSemana),
      supabase.from('view_f_prod_id_editar')
        .select('data_producao, valor_total, descricao_equipe')
        .gte('data_producao', dataInicio30)
        .limit(5000),
    ])

    setStats({ total: total || 0, hoje: hoje || 0, semana: semana || 0 })

    // Agrupa por dia
    const porDia = {}
    ;(raw || []).forEach(r => {
      const chave = r.data_producao
      if (!porDia[chave]) porDia[chave] = { valor: 0, quantidade: 0 }
      porDia[chave].valor      += Number(r.valor_total || 0)
      porDia[chave].quantidade += 1
    })

    const dias = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(agora)
      d.setDate(agora.getDate() - i)
      const chave = d.toISOString().split('T')[0]
      const [, mes, dia] = chave.split('-')
      dias.push({
        label: `${dia}/${mes}`,
        valor:      porDia[chave]?.valor      || 0,
        quantidade: porDia[chave]?.quantidade || 0,
      })
    }
    setDadosMes(dias)

    // Agrupa por equipe — top 10
    const porEquipe = {}
    ;(raw || []).forEach(r => {
      const equipe = r.descricao_equipe || 'Sem equipe'
      if (!porEquipe[equipe]) porEquipe[equipe] = { equipe, valor: 0, quantidade: 0 }
      porEquipe[equipe].valor      += Number(r.valor_total || 0)
      porEquipe[equipe].quantidade += 1
    })
    const ranking = Object.values(porEquipe)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10)
    setTop10(ranking)

    setCarregando(false)
  }

  if (carregando) {
    return <div className="loading" style={{ height: '60vh' }}><div className="spinner" />Carregando...</div>
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div>
          <h1 className="pagina-titulo">Dashboard</h1>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            Bem-vindo, {perfil?.nome || 'usuário'}!
          </p>
        </div>
        <button className="btn btn-primario" onClick={() => navegar('/producao/novo')}>
          + Novo Lançamento
        </button>
      </div>

      {/* Cards de estatísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icone="📋" titulo="Total de Registros" valor={stats.total} cor="#1a56db" />
        <StatCard icone="📅" titulo="Lançamentos Hoje"   valor={stats.hoje}  cor="#16a34a" />
        <StatCard icone="📆" titulo="Últimos 7 Dias"     valor={stats.semana} cor="#d97706" />
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Gráfico 1 — Valor por mês */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1e2a3b', marginBottom: 16 }}>
            Valor por Dia — últimos 30 dias
          </div>
          {dadosMes.every(d => d.valor === 0) ? (
            <div className="vazio" style={{ padding: 32 }}>Sem dados no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dadosMes} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#6b7280' }} width={56} />
                <Tooltip content={<TooltipMensal />} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                  {dadosMes.map((d, i) => (
                    <Cell key={i} fill={d.valor > 0 ? '#2563eb' : '#e5e7eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Gráfico 2 — Top 10 equipes */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1e2a3b', marginBottom: 16 }}>
            Top 10 Equipes — últimos 30 dias
          </div>
          {top10.length === 0 ? (
            <div className="vazio" style={{ padding: 32 }}>Sem dados no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis
                  type="category" dataKey="equipe" width={110}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={v => v.length > 16 ? v.slice(0, 16) + '…' : v}
                />
                <Tooltip content={<TooltipEquipe />} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {top10.map((_, i) => (
                    <Cell key={i} fill={`hsl(${260 + i * 6}, 65%, ${55 + i * 2}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>
    </div>
  )
}

function StatCard({ icone, titulo, valor, cor }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 28, width: 48, height: 48, borderRadius: 10, background: `${cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icone}
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: cor }}>{valor}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{titulo}</div>
        </div>
      </div>
    </div>
  )
}
