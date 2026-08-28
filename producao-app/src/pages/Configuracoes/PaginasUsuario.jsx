import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { tituloPagina } from '../../utils/paginasMapa'

function fmtDataHora(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function PaginasUsuario() {
  const navegar = useNavigate()
  const { email } = useParams()
  const [paginas, setPaginas] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { carregar() }, [email])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase
      .from('d_pageview_log')
      .select('caminho, criado_em')
      .eq('email', email)
      .order('criado_em', { ascending: false })
      .limit(500)
    setPaginas(data || [])
    setCarregando(false)
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar(-1)} style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo">Páginas acessadas — {email}</h1>
        </div>
        <button className="btn btn-secundario" onClick={carregar} style={{ fontSize: 13 }}>↻ Atualizar</button>
      </div>

      {carregando ? (
        <div className="loading"><div className="spinner" />Carregando...</div>
      ) : paginas.length === 0 ? (
        <div className="vazio">Nenhum acesso registrado.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>#</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Página</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Data / Hora</th>
              </tr>
            </thead>
            <tbody>
              {paginas.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '9px 16px', color: '#9ca3af' }}>{i + 1}</td>
                  <td style={{ padding: '9px 16px', fontWeight: 500, color: '#1e2a3b' }}>{tituloPagina(p.caminho)}</td>
                  <td style={{ padding: '9px 16px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDataHora(p.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div style={{ padding: '8px 16px', borderTop: '1px solid #f3f4f6', fontSize: 12, color: '#9ca3af' }}>
            {paginas.length} registro{paginas.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
