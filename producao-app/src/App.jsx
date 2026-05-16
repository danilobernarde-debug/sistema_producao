import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ListaRegistros from './pages/Producao/ListaRegistros'
import NovoRegistro from './pages/Producao/NovoRegistro'
import EditarRegistro from './pages/Producao/EditarRegistro'

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
