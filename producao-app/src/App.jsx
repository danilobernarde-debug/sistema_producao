import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ListaRegistros from './pages/Producao/ListaRegistros'
import NovoRegistro from './pages/Producao/NovoRegistro'
import EditarRegistro from './pages/Producao/EditarRegistro'
import ProducaoMensal from './pages/Relatorios/ProducaoMensal'
import JustificativasObservacoes from './pages/Relatorios/JustificativasObservacoes'
import Exportacao from './pages/Relatorios/Exportacao'
import Bonificacoes from './pages/Relatorios/Bonificacoes'
import Configuracoes from './pages/Configuracoes/index'
import Contratos from './pages/Configuracoes/Contratos'
import TiposEquipe from './pages/Configuracoes/TiposEquipe'
import Equipes from './pages/Configuracoes/Equipes'
import Colaboradores from './pages/Configuracoes/Colaboradores'
import ConfigCampos from './pages/Configuracoes/ConfigCampos'
import ConfigCamposContrato from './pages/Configuracoes/ConfigCamposContrato'
import Obras from './pages/Configuracoes/Obras'
import ContratosPrecoUpe from './pages/Configuracoes/ContratosPrecoUpe'
import GerenciarUsuarios from './pages/Configuracoes/GerenciarUsuarios'
import Atividades from './pages/Configuracoes/Atividades'
import PlanejamentoRmb from './pages/PlanejamentoRMB'

function RotaProtegida({ children }) {
  const { usuario, carregando } = useAuth()
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

        <Route path="/relatorios/producao" element={
          <RotaProtegida>
            <ProducaoMensal />
          </RotaProtegida>
        } />

        <Route path="/relatorios/justificativas" element={
          <RotaProtegida>
            <JustificativasObservacoes />
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

<Route path="/configuracoes" element={<RotaProtegida><Configuracoes /></RotaProtegida>} />
        <Route path="/configuracoes/contratos" element={<RotaProtegida><RotaSuperAdmin><Contratos /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/tipos-equipe" element={<RotaProtegida><RotaSuperAdmin><TiposEquipe /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/equipes" element={<RotaProtegida><Equipes /></RotaProtegida>} />
        <Route path="/configuracoes/colaboradores" element={<RotaProtegida><Colaboradores /></RotaProtegida>} />
        <Route path="/configuracoes/config-campos" element={<RotaProtegida><RotaSuperAdmin><ConfigCampos /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/config-campos-contrato" element={<RotaProtegida><RotaSuperAdmin><ConfigCamposContrato /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/obras" element={<RotaProtegida><Obras /></RotaProtegida>} />
        <Route path="/configuracoes/contratos-preco-upe" element={<RotaProtegida><RotaSuperAdmin><ContratosPrecoUpe /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/usuarios" element={<RotaProtegida><RotaSuperAdmin><GerenciarUsuarios /></RotaSuperAdmin></RotaProtegida>} />
        <Route path="/configuracoes/atividades" element={<RotaProtegida><RotaSuperAdmin><Atividades /></RotaSuperAdmin></RotaProtegida>} />

        <Route path="/planejamento-rip" element={
          <RotaProtegida>
            <PlanejamentoRmb />
          </RotaProtegida>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
