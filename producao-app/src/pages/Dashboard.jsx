import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function Dashboard() {
  const navegar = useNavigate()
  const { perfil } = useAuth()
  const [stats, setStats] = useState({ total: 0, hoje: 0, semana: 0 })
  const [ultimos, setUltimos] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    const agora = new Date()
    const dataHoje = agora.toISOString().split('T')[0]
    const iniciSemana = new Date(agora)
    iniciSemana.setDate(agora.getDate() - 7)
    const dataIniSemana = iniciSemana.toISOString().split('T')[0]

    const [{ count: total }, { count: hoje }, { count: semana }, { data: ultReg }] = await Promise.all([
      supabase.from('f_prod_registro').select('*', { count: 'exact', head: true }),
      supabase.from('f_prod_registro').select('*', { count: 'exact', head: true }).eq('data_producao', dataHoje),
      supabase.from('f_prod_registro').select('*', { count: 'exact', head: true }).gte('data_producao', dataIniSemana),
      supabase.from('f_prod_registro').select('id, data_producao, d_contratos(descricao), d_tipo_equipe(descricao), d_equipes(equipe)').order('data_producao', { ascending: false }).limit(5),
    ])

    setStats({ total: total || 0, hoje: hoje || 0, semana: semana || 0 })
    setUltimos(ultReg || [])
    setCarregando(false)
  }

  function formatarData(d) {
    if (!d) return '-'
    const [ano, mes, dia] = d.split('-')
    return `${dia}/${mes}/${ano}`
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
        <StatCard icone="📅" titulo="Lançamentos Hoje" valor={stats.hoje} cor="#16a34a" />
        <StatCard icone="📆" titulo="Últimos 7 Dias" valor={stats.semana} cor="#d97706" />
      </div>

      {/* Últimos registros */}
      <div className="card">
        <div className="card-titulo">Últimos Lançamentos</div>
        {ultimos.length === 0 ? (
          <div className="vazio">
            <div className="vazio-icone">📋</div>
            Nenhum lançamento ainda.{' '}
            <button className="btn btn-primario" style={{ marginTop: 12 }} onClick={() => navegar('/producao/novo')}>
              Criar o primeiro
            </button>
          </div>
        ) : (
          <div className="tabela-container">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Contrato</th>
                  <th>Tipo Equipe</th>
                  <th>Equipe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ultimos.map(r => (
                  <tr key={r.id}>
                    <td>{formatarData(r.data_producao)}</td>
                    <td>{r.d_contratos?.descricao || '-'}</td>
                    <td>{r.d_tipo_equipe?.descricao || '-'}</td>
                    <td>{r.d_equipes?.equipe || <span className="badge badge-cinza">Proporcional</span>}</td>
                    <td>
                      <button className="btn btn-secundario" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => navegar(`/producao/${r.id}/editar`)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
