import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const SECOES = [
  { caminho: '/configuracoes/tipos-equipe',             icone: '🏷️', titulo: 'Tipos de Equipe',       descricao: 'Categorias de equipes de produção',                       superAdmin: true },
  { caminho: '/configuracoes/equipes',                  icone: '👷', titulo: 'Equipes',               descricao: 'Equipes e suas vinculações' },
  { caminho: '/configuracoes/colaboradores',            icone: '👤', titulo: 'Colaboradores',         descricao: 'Cadastro de colaboradores' },
  { caminho: '/configuracoes/obras',                    icone: '🏗️', titulo: 'Obras',                 descricao: 'Obras vinculadas aos contratos' },
  { caminho: '/configuracoes/atividades',               icone: '⚡', titulo: 'Atividades',             descricao: 'Cadastro de atividades e vinculação por contrato',         superAdmin: true },
  { caminho: '/configuracoes/contratos',                icone: '📄', titulo: 'Contratos',             descricao: 'Cadastro de contratos e obras',                            superAdmin: true },
  { caminho: '/configuracoes/contratos-preco-upe',      icone: '💰', titulo: 'Preço UPE',             descricao: 'Preço da UPE por contrato e período',                      superAdmin: true },
  { caminho: '/configuracoes/config-campos',            icone: '🔧', titulo: 'Campos',                descricao: 'Definição dos campos dinâmicos',                           superAdmin: true },
  { caminho: '/configuracoes/form-builder',             icone: '🧩', titulo: 'Editor de Formulário',  descricao: 'Configure os campos do formulário por contrato e equipe',  superAdmin: true },
  { caminho: '/configuracoes/usuarios',                 icone: '🔐', titulo: 'Usuários',              descricao: 'Criar usuários, perfis e acessos por contrato',            superAdmin: true },
  { caminho: '/configuracoes/logins',                   icone: '🕐', titulo: 'Últimos Logins',        descricao: 'Histórico de acessos ao sistema',                          soDanilo: true },
]

export default function Configuracoes() {
  const navegar = useNavigate()
  const { perfil, usuario } = useAuth()
  const isSuperAdmin = perfil?.d_auth_roles?.name === 'Super Admin'
  const isDanilo = usuario?.email === 'danilobernarde@gmail.com'
  const secoesFiltradas = SECOES.filter(s =>
    (!s.superAdmin || isSuperAdmin) && (!s.soDanilo || isDanilo)
  )

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Configurações</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {secoesFiltradas.map(s => (
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
