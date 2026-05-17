import { useNavigate } from 'react-router-dom'

const SECOES = [
  { caminho: '/configuracoes/contratos',          icone: '📄', titulo: 'Contratos',             descricao: 'Cadastro de contratos e obras' },
  { caminho: '/configuracoes/tipos-equipe',        icone: '🏷️', titulo: 'Tipos de Equipe',       descricao: 'Categorias de equipes de produção' },
  { caminho: '/configuracoes/equipes',             icone: '👷', titulo: 'Equipes',               descricao: 'Equipes e suas vinculações' },
  { caminho: '/configuracoes/colaboradores',       icone: '👤', titulo: 'Colaboradores',         descricao: 'Cadastro de colaboradores' },
  { caminho: '/configuracoes/config-campos',       icone: '🔧', titulo: 'Campos',                descricao: 'Definição dos campos dinâmicos' },
  { caminho: '/configuracoes/config-campos-contrato', icone: '⚙️', titulo: 'Campos por Contrato', descricao: 'Quais campos aparecem em cada contrato/equipe' },
]

export default function Configuracoes() {
  const navegar = useNavigate()
  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Configurações</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {SECOES.map(s => (
          <div
            key={s.caminho}
            className="card"
            onClick={() => navegar(s.caminho)}
            style={{ cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s', border: '1px solid #e5e7eb' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,86,219,0.12)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>{s.icone}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e2a3b', marginBottom: 4 }}>{s.titulo}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{s.descricao}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
