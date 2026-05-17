import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ListaRegistros from './pages/Producao/ListaRegistros'
import NovoRegistro from './pages/Producao/NovoRegistro'
import EditarRegistro from './pages/Producao/EditarRegistro'
import ProducaoMensal from './pages/Relatorios/ProducaoMensal'
import JustificativasObservacoes from './pages/Relatorios/JustificativasObservacoes'
import Configuracoes from './pages/Configuracoes/index'
import Contratos from './pages/Configuracoes/Contratos'
import TiposEquipe from './pages/Configuracoes/TiposEquipe'
import Equipes from './pages/Configuracoes/Equipes'
import Colaboradores from './pages/Configuracoes/Colaboradores'
import ConfigCampos from './pages/Configuracoes/ConfigCampos'
import ConfigCamposContrato from './pages/Configuracoes/ConfigCamposContrato'

function RotaProtegida({ children }) {
  const { usuario, carregando } = useAuth()

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
      <Sidebar />
      <div className="layout-conteudo">
        {children}
      </div>
    </div>
  )
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

        <Route path="/configuracoes" element={<RotaProtegida><Configuracoes /></RotaProtegida>} />
        <Route path="/configuracoes/contratos" element={<RotaProtegida><Contratos /></RotaProtegida>} />
        <Route path="/configuracoes/tipos-equipe" element={<RotaProtegida><TiposEquipe /></RotaProtegida>} />
        <Route path="/configuracoes/equipes" element={<RotaProtegida><Equipes /></RotaProtegida>} />
        <Route path="/configuracoes/colaboradores" element={<RotaProtegida><Colaboradores /></RotaProtegida>} />
        <Route path="/configuracoes/config-campos" element={<RotaProtegida><ConfigCampos /></RotaProtegida>} />
        <Route path="/configuracoes/config-campos-contrato" element={<RotaProtegida><ConfigCamposContrato /></RotaProtegida>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
