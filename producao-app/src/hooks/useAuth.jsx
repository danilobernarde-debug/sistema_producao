import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export const MSG_DESATIVADO = 'Usuário desativado. Procure o administrador do sistema.'

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUsuario(session?.user ?? null)
      if (session?.user) carregarPerfil(session.user.id)
      else setCarregando(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user ?? null)
      if (session?.user) carregarPerfil(session.user.id)
      else {
        setPerfil(null)
        setCarregando(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function carregarPerfil(uuid) {
    const { data } = await supabase
      .from('d_auth_user')
      .select('*, d_auth_roles(name)')
      .eq('uuid', uuid)
      .single()
    if (data?.ativo === false) {
      setAviso(MSG_DESATIVADO)
      setPerfil(null)
      setUsuario(null)
      setCarregando(false)
      await supabase.auth.signOut()
      return
    }
    setPerfil(data)
    setCarregando(false)
  }

  async function entrar(email, senha) {
    setAviso('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    return error
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  function atualizarPerfil(dados) {
    setPerfil(prev => ({ ...prev, ...dados }))
  }

  return (
    <AuthContext.Provider value={{ usuario, perfil, carregando, aviso, entrar, sair, atualizarPerfil }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
