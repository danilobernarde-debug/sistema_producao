import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

const NOMES_TABELA = {
  f_prod_registro: 'Produção',
  d_equipes: 'Equipes',
  d_colaboradores: 'Colaboradores',
  d_contratos: 'Contratos',
  d_obras: 'Obras',
  d_auth_user: 'Usuários',
  d_atividades: 'Atividades',
  d_tipos_equipe: 'Tipos de Equipe',
}

const COR_OP = {
  INSERT: { bg: '#dcfce7', color: '#166534', label: 'Criação' },
  UPDATE: { bg: '#dbeafe', color: '#1e40af', label: 'Edição' },
  DELETE: { bg: '#fee2e2', color: '#991b1b', label: 'Exclusão' },
}

function fmtDataHora(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function BadgeOp({ op }) {
  const c = COR_OP[op] || { bg: '#f3f4f6', color: '#374151', label: op }
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

function DiffView({ oldData, newData, op }) {
  if (op === 'INSERT') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {Object.entries(newData || {}).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#6b7280', minWidth: 160, flexShrink: 0 }}>{k}</span>
            <span style={{ color: '#166534', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, wordBreak: 'break-all' }}>{String(v ?? '')}</span>
          </div>
        ))}
      </div>
    )
  }
  if (op === 'DELETE') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {Object.entries(oldData || {}).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#6b7280', minWidth: 160, flexShrink: 0 }}>{k}</span>
            <span style={{ color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: 4, wordBreak: 'break-all' }}>{String(v ?? '')}</span>
          </div>
        ))}
      </div>
    )
  }
  // UPDATE — mostra só campos que mudaram
  const todasChaves = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])
  const mudancas = [...todasChaves].filter(k => String((oldData || {})[k] ?? '') !== String((newData || {})[k] ?? ''))
  if (mudancas.length === 0) return <span style={{ fontSize: 12, color: '#9ca3af' }}>Sem diferenças detectadas.</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {mudancas.map(k => (
        <div key={k} style={{ fontSize: 12 }}>
          <span style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>{k}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: 4, wordBreak: 'break-all' }}>{String((oldData || {})[k] ?? '')}</span>
            <span style={{ color: '#9ca3af' }}>→</span>
            <span style={{ color: '#166534', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, wordBreak: 'break-all' }}>{String((newData || {})[k] ?? '')}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LogAlteracoes() {
  const navegar = useNavigate()
  const [logs, setLogs]           = useState([])
  const [usuarios, setUsuarios]   = useState({})
  const [contratos, setContratos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [expandido, setExpandido] = useState(null)

  const [filtroOp, setFiltroOp]         = useState('')
  const [filtroTabela, setFiltroTabela] = useState('')
  const [filtroContrato, setFiltroContrato] = useState('')
  const [filtroData, setFiltroData]     = useState('')
  const [busca, setBusca]               = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const [{ data: logData }, { data: usersData }, { data: contratosData }] = await Promise.all([
      supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(1000),
      supabase.from('d_auth_user').select('uuid, nome, email'),
      supabase.from('d_contratos').select('id, descricao').order('descricao'),
    ])
    const mapa = {}
    ;(usersData || []).forEach(u => { mapa[u.uuid] = u.nome || u.email })
    setUsuarios(mapa)
    setContratos(contratosData || [])
    setLogs(logData || [])
    setCarregando(false)
  }

  const tabelasDisponiveis = useMemo(() => [...new Set(logs.map(l => l.table_name))].sort(), [logs])

  const logsFiltrados = useMemo(() => {
    return logs.filter(l => {
      if (filtroOp && l.operation_type !== filtroOp) return false
      if (filtroTabela && l.table_name !== filtroTabela) return false
      if (filtroContrato && String(l.contrato) !== filtroContrato) return false
      if (filtroData && !l.changed_at?.startsWith(filtroData)) return false
      if (busca) {
        const nome = usuarios[l.changed_by] || ''
        const termo = busca.toLowerCase()
        if (!nome.toLowerCase().includes(termo) && !l.table_name.toLowerCase().includes(termo)) return false
      }
      return true
    })
  }, [logs, filtroOp, filtroTabela, filtroContrato, filtroData, busca, usuarios])

  function toggleExpandido(id) {
    setExpandido(prev => prev === id ? null : id)
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar(-1)} style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo">Log de Alterações</h1>
        </div>
        <button className="btn btn-secundario" onClick={carregar} style={{ fontSize: 13 }}>↻ Atualizar</button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Buscar usuário ou tabela..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', minWidth: 200 }}
        />
        <select value={filtroOp} onChange={e => setFiltroOp(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }}>
          <option value="">Todas operações</option>
          <option value="INSERT">Criação</option>
          <option value="UPDATE">Edição</option>
          <option value="DELETE">Exclusão</option>
        </select>
        <select value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }}>
          <option value="">Todas tabelas</option>
          {tabelasDisponiveis.map(t => (
            <option key={t} value={t}>{NOMES_TABELA[t] || t}</option>
          ))}
        </select>
        <select value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }}>
          <option value="">Todos contratos</option>
          {contratos.map(c => (
            <option key={c.id} value={String(c.id)}>{c.descricao}</option>
          ))}
        </select>
        <input
          type="date"
          value={filtroData}
          onChange={e => setFiltroData(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }}
        />
        {(filtroOp || filtroTabela || filtroContrato || filtroData || busca) && (
          <button onClick={() => { setFiltroOp(''); setFiltroTabela(''); setFiltroContrato(''); setFiltroData(''); setBusca('') }}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#6b7280' }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {carregando ? (
        <div className="loading"><div className="spinner" />Carregando...</div>
      ) : logsFiltrados.length === 0 ? (
        <div className="vazio">Nenhum registro encontrado.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Operação</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Tabela</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Usuário</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Data / Hora</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Obs.</th>
                <th style={{ padding: '10px 16px' }} />
              </tr>
            </thead>
            <tbody>
              {logsFiltrados.map((l, i) => (
                <>
                  <tr
                    key={l.id}
                    onClick={() => toggleExpandido(l.id)}
                    style={{ borderBottom: expandido === l.id ? 'none' : '1px solid #f3f4f6', background: expandido === l.id ? '#f0f9ff' : i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '9px 16px' }}><BadgeOp op={l.operation_type} /></td>
                    <td style={{ padding: '9px 16px', color: '#374151', fontWeight: 500 }}>{NOMES_TABELA[l.table_name] || l.table_name}</td>
                    <td style={{ padding: '9px 16px', color: '#4b5563' }}>{usuarios[l.changed_by] || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td style={{ padding: '9px 16px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDataHora(l.changed_at)}</td>
                    <td style={{ padding: '9px 16px', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.observation || ''}</td>
                    <td style={{ padding: '9px 16px', textAlign: 'right', color: '#9ca3af', fontSize: 11 }}>{expandido === l.id ? '▲ fechar' : '▼ detalhes'}</td>
                  </tr>
                  {expandido === l.id && (
                    <tr key={`${l.id}-det`} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td colSpan={6} style={{ padding: '12px 24px 16px', background: '#f8fafc' }}>
                        <DiffView oldData={l.old_data} newData={l.new_data} op={l.operation_type} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '8px 16px', borderTop: '1px solid #f3f4f6', fontSize: 12, color: '#9ca3af' }}>
            {logsFiltrados.length} registro{logsFiltrados.length !== 1 ? 's' : ''}
            {logsFiltrados.length < logs.length ? ` (de ${logs.length} total)` : ''}
          </div>
        </div>
      )}
    </div>
  )
}
