import { useState } from 'react'
import Pastas from './Pastas'
import Busca from './Busca'
import { useCadastros } from './comum'

const MODO_KEY = 'anexos-modo'

// Anexos dos lançamentos de produção (fotos, PDFs, planilhas) guardados no SharePoint.
// Duas formas de achar: navegando por pastas (como no Explorer) ou buscando por filtros.
export default function Anexos() {
  const [modo, setModo] = useState(() => { try { return sessionStorage.getItem(MODO_KEY) || 'pastas' } catch { return 'pastas' } })
  const cad = useCadastros(true)

  function escolher(m) { setModo(m); try { sessionStorage.setItem(MODO_KEY, m) } catch {} }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Anexos</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn ${modo === 'pastas' ? 'btn-primario' : 'btn-secundario'}`} onClick={() => escolher('pastas')}>📁 Pastas</button>
          <button className={`btn ${modo === 'busca' ? 'btn-primario' : 'btn-secundario'}`} onClick={() => escolher('busca')}>🔎 Busca</button>
        </div>
      </div>
      {modo === 'pastas' ? <Pastas cad={cad} /> : <Busca cad={cad} />}
    </div>
  )
}
