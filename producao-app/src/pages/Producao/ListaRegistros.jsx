import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

const POR_PAGINA = 30

export default function ListaRegistros() {
  const navegar = useNavigate()
  const [registros, setRegistros] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)

  const [filtroContrato, setFiltroContrato] = useState('')
  const [filtroData, setFiltroData] = useState('')
  const [filtroId, setFiltroId] = useState('')
  const [filtroEquipe, setFiltroEquipe] = useState('')
  const [filtroObservacoes, setFiltroObservacoes] = useState('')

  const [contratos, setContratos] = useState([])
  const [tiposEquipe, setTiposEquipe] = useState([])

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao').then(({ data }) => setContratos(data || []))
    supabase.from('d_tipo_equipe').select('id, descricao').then(({ data }) => setTiposEquipe(data || []))
  }, [])

  useEffect(() => {
    buscar(pagina)
  }, [pagina])

  function aplicarFiltros(q) {
    if (filtroContrato) q = q.eq('contrato_id', filtroContrato)
    if (filtroData)     q = q.eq('data_producao', filtroData)
    if (filtroId)       q = q.eq('id', Number(filtroId))
    if (filtroEquipe)      q = q.ilike('descricao_equipe', `%${filtroEquipe}%`)
    if (filtroObservacoes) q = q.ilike('metadata_registro->>observacoes', `%${filtroObservacoes}%`)
    return q
  }

  async function buscar(pag = 1) {
    setCarregando(true)
    const from = (pag - 1) * POR_PAGINA
    const to = from + POR_PAGINA - 1

    let q = aplicarFiltros(
      supabase.from('view_f_prod_id_editar').select('*', { count: 'exact' })
        .order('data_producao', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    )

    const { data, count } = await q
    const rows = data || []
    setTotal(count || 0)

    const encIds = [...new Set(rows.map(r => r.encarregado_id).filter(Boolean))]
    let encMap = {}
    if (encIds.length > 0) {
      const { data: encs } = await supabase
        .from('d_colaboradores').select('id, matricula_nome').in('id', encIds)
      ;(encs || []).forEach(e => { encMap[e.id] = e.matricula_nome })
    }

    let resultado = rows.map(r => ({ ...r, _encarregado_nome: encMap[r.encarregado_id] || null }))

    setRegistros(resultado)
    setCarregando(false)
  }

  function filtrar() {
    if (pagina === 1) buscar(1)
    else setPagina(1)
  }

  async function excluir(id) {
    if (!window.confirm(`Excluir o registro #${id}? Esta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('f_prod_registro').delete().eq('id', id)
    if (error) { alert(`Erro ao excluir: ${error.message}`); return }
    setRegistros(prev => prev.filter(r => r.id !== id))
    setTotal(prev => prev - 1)
  }

  function limpar() {
    setFiltroContrato('')
    setFiltroData('')
    setFiltroId('')
    setFiltroEquipe('')
    setFiltroObservacoes('')
    if (pagina === 1) buscar(1)
    else setPagina(1)
  }

  function formatarData(d) {
    if (!d) return '-'
    const [ano, mes, dia] = d.split('-')
    return `${dia}/${mes}/${ano}`
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)
  const contratoMap = Object.fromEntries(contratos.map(c => [c.id, c.descricao]))
  const tipoEquipeMap = Object.fromEntries(tiposEquipe.map(t => [t.id, t.descricao]))

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Registros de Produção</h1>
        <button className="btn btn-primario" onClick={() => navegar('/producao/novo')}>
          + Novo Lançamento
        </button>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0, width: 80 }}>
            <label className="campo-label">ID</label>
            <input type="number" className="campo-input" value={filtroId}
              onChange={e => setFiltroId(e.target.value)} placeholder="ID" />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 180 }}>
            <label className="campo-label">Contrato</label>
            <select className="campo-select" value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)}>
              <option value="">Todos</option>
              {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Data</label>
            <input type="date" className="campo-input" value={filtroData} onChange={e => setFiltroData(e.target.value)} />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 140 }}>
            <label className="campo-label">Equipe</label>
            <input type="text" className="campo-input" value={filtroEquipe}
              onChange={e => setFiltroEquipe(e.target.value)} placeholder="Pesquisar..." />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 160 }}>
            <label className="campo-label">Observações</label>
            <input type="text" className="campo-input" value={filtroObservacoes}
              onChange={e => setFiltroObservacoes(e.target.value)} placeholder="Pesquisar..." />
          </div>
          <button className="btn btn-primario" onClick={filtrar}>Filtrar</button>
          <button className="btn btn-secundario" onClick={limpar}>Limpar</button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        {carregando ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : registros.length === 0 ? (
          <div className="vazio">
            <div className="vazio-icone">📋</div>
            Nenhum registro encontrado.
          </div>
        ) : (
          <>
            <div className="tabela-container">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Data</th>
                    <th>Contrato</th>
                    <th>Tipo Equipe</th>
                    <th>Equipe</th>
                      <th>Observações</th>
                  <th style={{ textAlign: 'right' }}>Valor Total</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{formatarData(r.data_producao)}</td>
                      <td>{contratoMap[r.contrato_id] || '-'}</td>
                      <td>{tipoEquipeMap[r.tipo_equipe_id] || '-'}</td>
                      <td>{r.descricao_equipe || '-'}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.metadata_registro?.observacoes || ''}>
                        {r.metadata_registro?.observacoes || '-'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        {r.valor_total > 0
                          ? `R$ ${Number(r.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '-'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secundario" style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => navegar(`/producao/${r.id}/editar`)}>
                            Editar
                          </button>
                          <button
                            onClick={() => excluir(r.id)}
                            style={{ padding: '4px 10px', fontSize: 12, background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, cursor: 'pointer' }}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {total} registro{total !== 1 ? 's' : ''} — página {pagina} de {totalPaginas}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }}
                  onClick={() => setPagina(1)} disabled={pagina === 1}>
                  «
                </button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }}
                  onClick={() => setPagina(p => p - 1)} disabled={pagina === 1}>
                  ‹
                </button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }}
                  onClick={() => setPagina(p => p + 1)} disabled={pagina >= totalPaginas}>
                  ›
                </button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }}
                  onClick={() => setPagina(totalPaginas)} disabled={pagina >= totalPaginas}>
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
