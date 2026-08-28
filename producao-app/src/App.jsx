import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { supabase } from './supabaseClient'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ListaRegistros from './pages/Producao/ListaRegistros'
import NovoRegistro from './pages/Producao/NovoRegistro'
import EditarRegistro from './pages/Producao/EditarRegistro'
import Relatorios from './pages/Relatorios/index'
import Exportacao from './pages/Relatorios/Exportacao'
import Bonificacoes from './pages/Relatorios/Bonificacoes'
import RelatorioEquipes from './pages/Relatorios/RelatorioEquipes'
import AnaliseDashboard from './pages/Relatorios/AnaliseDashboard'
import Configuracoes from './pages/Configuracoes/index'
import Contratos from './pages/Configuracoes/Contratos'
import TiposEquipe from './pages/Configuracoes/TiposEquipe'
import Equipes from './pages/Configuracoes/Equipes'
import Colaboradores from './pages/Configuracoes/Colaboradores'
import ConfigCampos from './pages/Configuracoes/ConfigCampos'
import Obras from './pages/Configuracoes/Obras'
import ContratosPrecoUpe from './pages/Configuracoes/ContratosPrecoUpe'
import GerenciarUsuarios from './pages/Configuracoes/GerenciarUsuarios'
import UltimosLogins from './pages/Configuracoes/UltimosLogins'
import Atividades from './pages/Configuracoes/Atividades'
import Subestacoes from './pages/Configuracoes/Subestacoes'
import AtividadesPrecoFixa from './pages/Configuracoes/AtividadesPrecoFixa'
import FormBuilder from './pages/Configuracoes/FormBuilder'
import Metas from './pages/Configuracoes/Metas'
import Feriados from './pages/Configuracoes/Feriados'
import Atualizacoes from './pages/Configuracoes/Atualizacoes'
import Planejamento from './pages/Planejamento'

function RotaProtegida() {
  const { usuario, perfil, carregando } = useAuth()
  const { pathname } = useLocation()
  const [sidebarAberta, setSidebarAberta] = useState(false)

  useEffect(() => {
    if (!usuario) return
    supabase.from('d_pageview_log').insert({
      user_uuid: usuario.id,
      nome: perfil?.nome ?? null,
      email: usuario.email,
      caminho: pathname,
    }).then(({ error }) => {
      if (error) console.error('Falha ao gravar pageview_log:', error)
    })
  }, [pathname, usuario?.id])

  if (carregando) {
    return (
      <div className="loading" style={{ height: '100vh' }}>
        <div className="spinner" />
        Carregando...
      </div>
    )
  }

  if (!usuario) {
    return <Navigate to="/login" replace />
  }

  if (perfil?.d_auth_roles?.name === 'Planejamento' && !pathname.startsWith('/planejamento')) {
    return <Navigate to="/planejamento" replace />
  }

  return (
    <div className="layout">
      <Sidebar aberta={sidebarAberta} onFechar={() => setSidebarAberta(false)} />
      {sidebarAberta && (
        <div className="sidebar-overlay" onClick={() => setSidebarAberta(false)} />
      )}
      <div className="layout-conteudo">
        <button className="btn-menu-mobile" onClick={() => setSidebarAberta(true)}>☰</button>
        <Outlet />
      </div>
    </div>
  )
}

function RotaSuperAdmin({ children }) {
  const { perfil, carregando } = useAuth()
  if (carregando) return null
  if (perfil?.d_auth_roles?.name !== 'Super Admin') return <Navigate to="/configuracoes" replace />
  return children
}

function RotaDanilo({ children }) {
  const { usuario, carregando } = useAuth()
  if (carregando) return null
  if (usuario?.email !== 'danilo@dbmachado.com') return <Navigate to="/configuracoes" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<RotaProtegida />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/producao" element={<ListaRegistros />} />
          <Route path="/producao/novo" element={<NovoRegistro />} />
          <Route path="/producao/:id/editar" element={<EditarRegistro />} />

          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/relatorios/exportacao" element={<Exportacao />} />
          <Route path="/relatorios/bonificacoes" element={<Bonificacoes />} />
          <Route path="/relatorios/equipes" element={<RelatorioEquipes />} />
          <Route path="/relatorios/dashboard" element={<AnaliseDashboard />} />

          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/configuracoes/contratos" element={<RotaSuperAdmin><Contratos /></RotaSuperAdmin>} />
          <Route path="/configuracoes/tipos-equipe" element={<RotaSuperAdmin><TiposEquipe /></RotaSuperAdmin>} />
          <Route path="/configuracoes/equipes" element={<Equipes />} />
          <Route path="/configuracoes/colaboradores" element={<Colaboradores />} />
          <Route path="/configuracoes/config-campos" element={<RotaSuperAdmin><ConfigCampos /></RotaSuperAdmin>} />
          <Route path="/configuracoes/obras" element={<Obras />} />
          <Route path="/configuracoes/contratos-preco-upe" element={<RotaSuperAdmin><ContratosPrecoUpe /></RotaSuperAdmin>} />
          <Route path="/configuracoes/usuarios" element={<RotaSuperAdmin><GerenciarUsuarios /></RotaSuperAdmin>} />
          <Route path="/configuracoes/logins" element={<RotaDanilo><UltimosLogins /></RotaDanilo>} />
          <Route path="/configuracoes/atividades" element={<RotaSuperAdmin><Atividades /></RotaSuperAdmin>} />
          <Route path="/configuracoes/subestacoes" element={<RotaSuperAdmin><Subestacoes /></RotaSuperAdmin>} />
          <Route path="/configuracoes/atividades-preco-fixa" element={<RotaSuperAdmin><AtividadesPrecoFixa /></RotaSuperAdmin>} />
          <Route path="/configuracoes/form-builder" element={<RotaSuperAdmin><FormBuilder /></RotaSuperAdmin>} />
          <Route path="/configuracoes/metas" element={<RotaSuperAdmin><Metas /></RotaSuperAdmin>} />
          <Route path="/configuracoes/feriados" element={<RotaSuperAdmin><Feriados /></RotaSuperAdmin>} />
          <Route path="/configuracoes/atualizacoes" element={<RotaDanilo><Atualizacoes /></RotaDanilo>} />

          <Route path="/planejamento" element={<Planejamento />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
