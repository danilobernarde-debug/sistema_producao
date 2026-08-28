import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

function fmtDataHora(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function UltimosLogins() {
  const navegar = useNavigate()
  const [usuarios, setUsuarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase
      .from('view_pageview_usuarios')
      .select('*')
    setUsuarios(data || [])
    setCarregando(false)
  }

  const usuariosFiltrados = busca.trim()
    ? usuarios.filter(u =>
        (u.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(busca.toLowerCase())
      )
    : usuarios

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar(-1)} style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo">Últimos Logins</h1>
        </div>
        <button className="btn btn-secundario" onClick={carregar} style={{ fontSize: 13 }}>↻ Atualizar</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ width: '100%', maxWidth: 360, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }}
        />
      </div>

      {carregando ? (
        <div className="loading"><div className="spinner" />Carregando...</div>
      ) : usuariosFiltrados.length === 0 ? (
        <div className="vazio">Nenhum usuário encontrado.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>#</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Nome</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>E-mail</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Último acesso</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Páginas acessadas</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map((u, i) => (
                <tr
                  key={u.email}
                  onClick={() => navegar(`/configuracoes/logins/${encodeURIComponent(u.email)}`)}
                  style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}>
                  <td style={{ padding: '9px 16px', color: '#9ca3af' }}>{i + 1}</td>
                  <td style={{ padding: '9px 16px', fontWeight: 500, color: '#1e2a3b' }}>{u.nome || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  <td style={{ padding: '9px 16px', color: '#4b5563' }}>{u.email}</td>
                  <td style={{ padding: '9px 16px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDataHora(u.ultimo_acesso)}</td>
                  <td style={{ padding: '9px 16px', color: '#6b7280' }}>{u.total_paginas}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div style={{ padding: '8px 16px', borderTop: '1px solid #f3f4f6', fontSize: 12, color: '#9ca3af' }}>
            {usuariosFiltrados.length} usuário{usuariosFiltrados.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
