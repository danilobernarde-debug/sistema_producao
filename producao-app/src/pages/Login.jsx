import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { entrar } = useAuth()
  const navegar = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const error = await entrar(email, senha)
    setCarregando(false)
    if (error) {
      setErro('E-mail ou senha incorretos.')
    } else {
      navegar('/')
    }
  }

  return (
    <div style={estilos.pagina}>
      <div style={estilos.card}>
        <div style={estilos.logo}>
          <img src="/Logo, Sem nome, Transparente.PNG" alt="Rede Forte" style={{ height: 64, objectFit: 'contain' }} />
          <div>
            <div style={estilos.logoTitulo}>Sistema de Produção</div>
            <div style={estilos.logoSubtitulo}>D B Machado LTDA</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {erro && <div className="alerta alerta-erro">{erro}</div>}

          <div className="campo-grupo">
            <label className="campo-label">E-mail</label>
            <input
              type="email"
              className="campo-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
            />
          </div>

          <div className="campo-grupo">
            <label className="campo-label">Senha</label>
            <input
              type="password"
              className="campo-input"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primario"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={carregando}
          >
            {carregando ? (
              <><div className="spinner" style={{ borderTopColor: 'white' }} /> Entrando...</>
            ) : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

const estilos = {
  pagina: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1e2a3b 0%, #1a56db 100%)',
  },
  card: {
    background: 'white',
    borderRadius: 12,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  logoTitulo: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
  },
  logoSubtitulo: {
    fontSize: 12,
    color: '#6b7280',
  },
}
