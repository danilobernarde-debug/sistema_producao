import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../supabaseClient'

const itensMenu = [
  { secao: 'MENU' },
  { caminho: '/',                           icone: '📊', label: 'Dashboard' },
  { caminho: '/producao',                   icone: '📋', label: 'Produção' },
  { secao: 'RELATÓRIOS' },
  { caminho: '/relatorios/producao',        icone: '📈', label: 'Prod. Mensal' },
  { caminho: '/relatorios/justificativas',  icone: '📝', label: 'Justificativas' },
  { caminho: '/relatorios/exportacao',      icone: '⬇️', label: 'Exportação' },
  { caminho: '/relatorios/bonificacoes',    icone: '🏆', label: 'Bonificações' },
  { secao: 'PLANEJAMENTO' },
  { caminho: '/planejamento-rip',              icone: '🗺️', label: 'Planejamento RIP' },
  { secao: 'CONFIGURAÇÕES' },
  { caminho: '/configuracoes',              icone: '⚙️', label: 'Configurações' },
]

export default function Sidebar({ aberta, onFechar }) {
  const { usuario, perfil, sair, atualizarPerfil } = useAuth()
  const navegar = useNavigate()
  const fileInputRef = useRef(null)
  const menuRef = useRef(null)
  const [subindo, setSubindo]       = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [modalSenha, setModalSenha] = useState(false)
  const [novaSenha, setNovaSenha]   = useState('')
  const [confSenha, setConfSenha]   = useState('')
  const [erroSenha, setErroSenha]   = useState('')
  const [senhaOk, setSenhaOk]       = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  useEffect(() => {
    function handleClickFora(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAberto(false)
    }
    if (menuAberto) document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [menuAberto])

  async function handleSair() {
    await sair()
    navegar('/login')
  }

  function abrirModalSenha() {
    setMenuAberto(false)
    setNovaSenha('')
    setConfSenha('')
    setErroSenha('')
    setSenhaOk(false)
    setModalSenha(true)
  }

  async function handleAlterarSenha() {
    if (novaSenha.length < 6) { setErroSenha('A senha deve ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confSenha) { setErroSenha('As senhas não coincidem.'); return }
    setSalvandoSenha(true)
    setErroSenha('')
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvandoSenha(false)
    if (error) { setErroSenha(error.message); return }
    setSenhaOk(true)
  }

  async function handleFotoChange(e) {
    const file = e.target.files[0]
    if (!file || !usuario) return
    e.target.value = ''
    if (file.size > 3 * 1024 * 1024) return
    setSubindo(true)
    const ext = file.name.split('.').pop()
    const path = `${usuario.id}.${ext}`
    await supabase.storage.from('user_photos').upload(path, file, { upsert: true })
    const { data: urlData } = supabase.storage.from('user_photos').getPublicUrl(path)
    const foto_url = urlData.publicUrl
    await supabase.from('d_auth_user').update({ foto_url }).eq('uuid', usuario.id)
    atualizarPerfil({ foto_url })
    setSubindo(false)
  }

  return (
    <aside className={`sidebar-nav${aberta ? ' sidebar-nav-aberta' : ''}`} style={estilos.sidebar}>
      {/* Logo */}
      <div style={estilos.logoArea}>
        <img
          src="/Logo, Sem nome, Transparente.PNG"
          alt="Rede Forte"
          style={{ height: 36, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
        />
        <div style={{ fontSize: 15, fontWeight: 700, color: 'white', letterSpacing: '0.03em' }}>
          REDE FORTE
        </div>
      </div>

      {/* Menu */}
      <nav style={estilos.nav}>
        {itensMenu.map((item, i) =>
          item.secao ? (
            <div key={i} style={{ ...estilos.secao, marginTop: i === 0 ? 0 : 12 }}>{item.secao}</div>
          ) : (
            <NavLink
              key={item.caminho}
              to={item.caminho}
              end={item.caminho === '/'}
              onClick={onFechar}
              style={({ isActive }) => ({
                ...estilos.item,
                ...(isActive ? estilos.itemAtivo : {}),
              })}
            >
              <span style={estilos.icone}>{item.icone}</span>
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      {/* Rodapé: usuário + menu */}
      <div style={{ position: 'relative' }} ref={menuRef}>

        {/* Dropdown menu */}
        {menuAberto && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 8, right: 8, marginBottom: 6,
            background: '#1e2a3b', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, overflow: 'hidden', boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
          }}>
            <button onClick={() => { setMenuAberto(false); fileInputRef.current.click() }}
              style={estilos.itemMenu}>
              📷 Trocar foto de perfil
            </button>
            <button onClick={abrirModalSenha} style={estilos.itemMenu}>
              🔑 Alterar senha
            </button>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
            <button onClick={handleSair} style={{ ...estilos.itemMenu, color: '#f87171' }}>
              🚪 Sair
            </button>
          </div>
        )}

        <div style={estilos.rodape}>
          <div
            style={{ ...estilos.usuario, cursor: 'pointer' }}
            onClick={() => setMenuAberto(a => !a)}
            title="Menu do perfil"
          >
            <div style={{ ...estilos.usuarioAvatar, position: 'relative', overflow: 'hidden' }}>
              {perfil?.foto_url ? (
                <img src={perfil.foto_url} alt="avatar"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                (perfil?.nome || 'U')[0].toUpperCase()
              )}
              {subindo && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                  ⏳
                </div>
              )}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={estilos.usuarioNome}>{perfil?.nome || 'Usuário'}</div>
              <div style={estilos.usuarioRole}>{perfil?.d_auth_roles?.name || ''}</div>
            </div>
            <span style={{ color: '#475569', fontSize: 12, flexShrink: 0 }}>
              {menuAberto ? '▲' : '▼'}
            </span>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoChange} />
      </div>

      {/* Modal alterar senha */}
      {modalSenha && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 28, width: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, color: '#1e2a3b' }}>
              Alterar senha
            </div>
            {senhaOk ? (
              <>
                <div style={{ color: '#16a34a', fontSize: 14, marginBottom: 16 }}>
                  ✓ Senha alterada com sucesso!
                </div>
                <button className="btn btn-primario" style={{ width: '100%' }}
                  onClick={() => setModalSenha(false)}>
                  Fechar
                </button>
              </>
            ) : (
              <>
                <div className="campo-grupo">
                  <label className="campo-label">Nova senha</label>
                  <input type="password" className="campo-input" value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
                </div>
                <div className="campo-grupo">
                  <label className="campo-label">Confirmar nova senha</label>
                  <input type="password" className="campo-input" value={confSenha}
                    onChange={e => setConfSenha(e.target.value)} placeholder="Repita a senha" />
                </div>
                {erroSenha && <div className="campo-erro-msg" style={{ marginBottom: 12 }}>{erroSenha}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-secundario" onClick={() => setModalSenha(false)}>
                    Cancelar
                  </button>
                  <button className="btn btn-primario" onClick={handleAlterarSenha} disabled={salvandoSenha}>
                    {salvandoSenha ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
  itemMenu: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: '#cbd5e1',
    padding: '10px 14px',
    textAlign: 'left',
    transition: 'background 0.1s',
  },
}
