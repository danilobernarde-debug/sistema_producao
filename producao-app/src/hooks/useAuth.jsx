import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)

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
    if (data && data.ativo === false) {
      await supabase.auth.signOut()
      setUsuario(null)
      setPerfil(null)
      setCarregando(false)
      return
    }
    setPerfil(data)
    setCarregando(false)
  }

  async function entrar(email, senha) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      if (error.code === 'user_banned') {
        return { code: 'user_disabled', message: 'Usuário desativado. Contate o administrador.' }
      }
      return error
    }

    const { data: perfilData } = await supabase
      .from('d_auth_user').select('ativo').eq('uuid', data.user.id).single()
    if (perfilData && perfilData.ativo === false) {
      await supabase.auth.signOut()
      return { code: 'user_disabled', message: 'Usuário desativado. Contate o administrador.' }
    }
    return null
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  function atualizarPerfil(dados) {
    setPerfil(prev => ({ ...prev, ...dados }))
  }

  return (
    <AuthContext.Provider value={{ usuario, perfil, carregando, entrar, sair, atualizarPerfil }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
