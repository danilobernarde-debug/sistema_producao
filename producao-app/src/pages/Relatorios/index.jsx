import { useNavigate } from 'react-router-dom'

const RELATORIOS = [
{ caminho: '/relatorios/exportacao',     icone: '⬇️', titulo: 'Exportação',       descricao: 'Exportar dados de produção' },
  { caminho: '/relatorios/bonificacoes',   icone: '🏆', titulo: 'Bonificações',     descricao: 'Relatório de bonificações por equipe' },
  { caminho: '/relatorios/equipes',        icone: '📊', titulo: 'Relatório WhatsApp', descricao: 'Produção por contrato e equipe com meta' },
  { caminho: '/relatorios/dashboard',      icone: '📉', titulo: 'Dashboard',           descricao: 'Gráficos, análise mensal e detalhe por equipe' },
]

export default function Relatorios() {
  const navegar = useNavigate()

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Relatórios</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {RELATORIOS.map(r => (
          <div
            key={r.caminho}
            className="card"
            onClick={() => navegar(r.caminho)}
            style={{ cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s', border: '1px solid #e5e7eb' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,86,219,0.12)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>{r.icone}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e2a3b', marginBottom: 4 }}>{r.titulo}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{r.descricao}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
