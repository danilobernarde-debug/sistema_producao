import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
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
import Atividades from './pages/Configuracoes/Atividades'
import FormBuilder from './pages/Configuracoes/FormBuilder'
import Planejamento from './pages/Planejamento'

function RotaProtegida({ children }) {
  const { usuario, perfil, carregando } = useAuth()
  const { pathname } = useLocation()
  const [sidebarAberta, setSidebarAberta] = useState(false)

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
        {children}
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <RotaProtegida>
            <Dashboard />
          </RotaProtegida>
        } />

        <Route path="/producao" element={
          <RotaProtegida>
            <ListaRegistros />
          </RotaProtegida>
        } />

        <Route path="/producao/novo" element={
          <RotaProtegida>
            <NovoRegistro />
          </RotaProtegida>
        } />

        <Route path="/producao/:id/editar" element={
          <RotaProtegida>
            <EditarRegistro />
          </RotaProtegida>
        } />

        <Route path="/relatorios" element={
          <RotaProtegida>
            <Relatorios />
          </RotaProtegida>
        } />

<Route path="/relatorios/exportacao" element={
          <RotaProtegida>
            <Exportacao />
          </RotaProtegida>
        } />

        <Route path="/relatorios/bonificacoes" element={
          <RotaProtegida>
            <Bonificacoes />
          </RotaProtegida>
        } />

        <Route path="/relatorios/equipes" element={
          <RotaProtegida>
            <RelatorioEquipes />
          </RotaProtegida>
        } />

        <Route path="/relatorios/dashboard" element={
          <RotaProtegida>
            <AnaliseDashboard />
          </RotaProtegida>
        } />

<Route path="/configuracoes" element={<RotaProtegida><Configuracoes /></RotaProtegida>} />
        <Route path="/configuracoes/contratos" element={<RotaProtegida><RotaSuperAdmin><Contratos /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/tipos-equipe" element={<RotaProtegida><RotaSuperAdmin><TiposEquipe /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/equipes" element={<RotaProtegida><Equipes /></RotaProtegida>} />
        <Route path="/configuracoes/colaboradores" element={<RotaProtegida><Colaboradores /></RotaProtegida>} />
        <Route path="/configuracoes/config-campos" element={<RotaProtegida><RotaSuperAdmin><ConfigCampos /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/obras" element={<RotaProtegida><Obras /></RotaProtegida>} />
        <Route path="/configuracoes/contratos-preco-upe" element={<RotaProtegida><RotaSuperAdmin><ContratosPrecoUpe /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/usuarios" element={<RotaProtegida><RotaSuperAdmin><GerenciarUsuarios /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/atividades" element={<RotaProtegida><RotaSuperAdmin><Atividades /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/form-builder" element={<RotaProtegida><RotaSuperAdmin><FormBuilder /></RotaSuperAdmin></RotaProtegida>} />

        <Route path="/planejamento" element={
          <RotaProtegida>
            <Planejamento />
          </RotaProtegida>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
