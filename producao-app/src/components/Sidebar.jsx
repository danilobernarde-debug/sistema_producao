import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const itensMenu = [
  { caminho: '/',          icone: '📊', label: 'Dashboard' },
  { caminho: '/producao',  icone: '📋', label: 'Produção' },
]

export default function Sidebar() {
  const { perfil, sair } = useAuth()
  const navegar = useNavigate()

  async function handleSair() {
    await sair()
    navegar('/login')
  }

  return (
    <aside style={estilos.sidebar}>
      {/* Logo */}
      <div style={estilos.logoArea}>
        <span style={estilos.logoIcone}>⚡</span>
        <div>
          <div style={estilos.logoNome}>Produção</div>
          <div style={estilos.logoSub}>D B Machado</div>
        </div>
      </div>

      {/* Menu */}
      <nav style={estilos.nav}>
        <div style={estilos.secao}>MENU</div>
        {itensMenu.map(item => (
          <NavLink
            key={item.caminho}
            to={item.caminho}
            end={item.caminho === '/'}
            style={({ isActive }) => ({
              ...estilos.item,
              ...(isActive ? estilos.itemAtivo : {}),
            })}
          >
            <span style={estilos.icone}>{item.icone}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Rodapé: usuário + sair */}
      <div style={estilos.rodape}>
        <div style={estilos.usuario}>
          <div style={estilos.usuarioAvatar}>
            {(perfil?.nome || 'U')[0].toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={estilos.usuarioNome}>{perfil?.nome || 'Usuário'}</div>
            <div style={estilos.usuarioRole}>{perfil?.d_auth_roles?.name || ''}</div>
          </div>
        </div>
        <button onClick={handleSair} style={estilos.btnSair} title="Sair">
          🚪
        </button>
      </div>
    </aside>
  )
}

const estilos = {
  sidebar: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: 240,
    height: '100vh',
    background: '#1e2a3b',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
    overflowY: 'auto',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  logoIcone: { fontSize: 28 },
  logoNome: { fontSize: 16, fontWeight: 700, color: 'white' },
  logoSub: { fontSize: 11, color: '#94a3b8' },
  nav: {
    flex: 1,
    padding: '12px 8px',
  },
  secao: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: '#475569',
    padding: '8px 8px 4px',
    marginBottom: 2,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 6,
    color: '#94a3b8',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    transition: 'background 0.15s, color 0.15s',
    marginBottom: 2,
  },
  itemAtivo: {
    background: 'rgba(26,86,219,0.2)',
    color: '#60a5fa',
  },
  icone: { fontSize: 16 },
  rodape: {
    padding: '12px 12px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  usuario: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  usuarioAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#1a56db',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  usuarioNome: {
    fontSize: 13,
    color: '#e2e8f0',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  usuarioRole: {
    fontSize: 11,
    color: '#64748b',
  },
  btnSair: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    padding: 4,
    borderRadius: 4,
    flexShrink: 0,
  },
}
