import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import SelectPesquisavel from '../../components/SelectPesquisavel'

const POR_PAGINA = 30
const FILTROS_KEY = 'lista-registros-filtros'

function lerFiltrosSalvos() {
  try { return JSON.parse(sessionStorage.getItem(FILTROS_KEY) || '{}') } catch { return {} }
}

export default function ListaRegistros() {
  const navegar = useNavigate()
  const [registrosRaw, setRegistrosRaw] = useState([])
  const [encMap, setEncMap] = useState({})
  const [totalMap, setTotalMap] = useState({})
  const [equipeColabMap, setEquipeColabMap] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)

  const saved = lerFiltrosSalvos()
  const [filtroContrato, setFiltroContrato] = useState(saved.contrato || '')
  const [filtroData, setFiltroData] = useState(saved.data || '')
  const [filtroId, setFiltroId] = useState(saved.id || '')
  const [filtroEquipe, setFiltroEquipe] = useState(saved.equipe || '')
  const [filtroObservacoes, setFiltroObservacoes] = useState(saved.observacoes || '')
  const [filtroOrigem, setFiltroOrigem] = useState(saved.origem || '')

  useEffect(() => {
    sessionStorage.setItem(FILTROS_KEY, JSON.stringify({
      contrato: filtroContrato, data: filtroData, id: filtroId,
      equipe: filtroEquipe, observacoes: filtroObservacoes, origem: filtroOrigem,
    }))
  }, [filtroContrato, filtroData, filtroId, filtroEquipe, filtroObservacoes, filtroOrigem])

  const [contratos, setContratos] = useState([])
  const [tiposEquipe, setTiposEquipe] = useState([])
  const [equipes, setEquipes] = useState([])

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao, logica_contrato').order('descricao').then(({ data }) => setContratos(data || []))
    supabase.from('d_tipo_equipe').select('id, descricao').then(({ data }) => setTiposEquipe(data || []))
    supabase.from('d_equipes').select('id, equipe, sistema_producao, contrato_id').order('equipe').then(({ data }) => setEquipes(data || []))
  }, [])

  useEffect(() => {
    buscar(pagina)
  }, [pagina])

  const registros = useMemo(() => registrosRaw.map(r => ({
    ...r,
    descricao_equipe: (() => {
      const contrato = contratos.find(c => String(c.id) === String(r.contrato_id))
      if (contrato?.logica_contrato) {
        return [...(equipeColabMap[r.id] || [])].map(eid => equipes.find(e => String(e.id) === String(eid))?.sistema_producao).filter(Boolean).join(', ') || null
      }
      return equipes.find(e => String(e.id) === String(r.equipe_id))?.sistema_producao || null
    })(),
    _encarregado_nome: encMap[r.encarregado_id] || null,
    valor_total: totalMap[r.id] || 0,
  })), [registrosRaw, encMap, totalMap, equipeColabMap, equipes, contratos])

  function aplicarFiltros(q) {
    if (filtroContrato)    q = q.eq('contrato_id', filtroContrato)
    if (filtroData)        q = q.eq('data_producao', filtroData)
    if (filtroId)          q = q.eq('id', Number(filtroId))
    if (filtroEquipe)      q = q.eq('equipe_id', filtroEquipe)
    if (filtroObservacoes) q = q.ilike('metadata_registro->>observacoes', `%${filtroObservacoes}%`)
    if (filtroOrigem)      q = q.eq('origem', filtroOrigem)
    return q
  }

  async function buscar(pag = 1) {
    setCarregando(true)
    const from = (pag - 1) * POR_PAGINA
    const to = from + POR_PAGINA - 1

    let q = aplicarFiltros(
      supabase.from('f_prod_registro').select('id, data_producao, contrato_id, tipo_equipe_id, equipe_id, encarregado_id, metadata_registro', { count: 'exact' })
        .order('data_producao', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    )

    const { data, count } = await q
    const rows = data || []
    setTotal(count || 0)

    const ids = rows.map(r => r.id)

    const [encResult, atividadesResult, colaboradoresResult] = await Promise.all([
      (() => {
        const encIds = [...new Set(rows.map(r => r.encarregado_id).filter(Boolean))]
        if (encIds.length === 0) return Promise.resolve({ data: [] })
        return supabase.from('d_colaboradores').select('id, matricula_nome').in('id', encIds)
      })(),
      ids.length > 0
        ? supabase.from('f_prod_atividades').select('registro_id, valor_total').in('registro_id', ids)
        : Promise.resolve({ data: [] }),
      ids.length > 0
        ? supabase.from('f_prod_colaboradores').select('registro_id, equipe_id').in('registro_id', ids)
        : Promise.resolve({ data: [] }),
    ])

    const encMap = {}
    ;(encResult.data || []).forEach(e => { encMap[e.id] = e.matricula_nome })

    const totalMap = {}
    ;(atividadesResult.data || []).forEach(a => {
      totalMap[a.registro_id] = (totalMap[a.registro_id] || 0) + Number(a.valor_total || 0)
    })

    const newEquipeColabMap = {}
    ;(colaboradoresResult.data || []).forEach(c => {
      if (!newEquipeColabMap[c.registro_id]) newEquipeColabMap[c.registro_id] = new Set()
      if (c.equipe_id) newEquipeColabMap[c.registro_id].add(c.equipe_id)
    })

    setRegistrosRaw(rows)
    setEncMap(encMap)
    setTotalMap(totalMap)
    setEquipeColabMap(newEquipeColabMap)
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
    setRegistrosRaw(prev => prev.filter(r => r.id !== id))
    setTotal(prev => prev - 1)
  }

  function limpar() {
    setFiltroContrato('')
    setFiltroData('')
    setFiltroId('')
    setFiltroEquipe('')
    setFiltroObservacoes('')
    setFiltroOrigem('')
    sessionStorage.removeItem(FILTROS_KEY)
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
            <select className="campo-select" value={filtroContrato} onChange={e => { setFiltroContrato(e.target.value); setFiltroEquipe('') }}>
              <option value="">Todos</option>
              {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Data</label>
            <input type="date" className="campo-input" value={filtroData} onChange={e => setFiltroData(e.target.value)} />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 180 }}>
            <label className="campo-label">Equipe</label>
            <SelectPesquisavel
              opcoes={(filtroContrato ? equipes.filter(e => String(e.contrato_id) === String(filtroContrato)) : equipes)
                .map(e => ({ valor: e.id, label: e.equipe }))}
              valor={filtroEquipe}
              onChange={v => setFiltroEquipe(v)}
              placeholder="Todas"
            />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 160 }}>
            <label className="campo-label">Observações</label>
            <input type="text" className="campo-input" value={filtroObservacoes}
              onChange={e => setFiltroObservacoes(e.target.value)} placeholder="Pesquisar..." />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 140 }}>
            <label className="campo-label">Origem</label>
            <select className="campo-select" value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)}>
              <option value="">Todas</option>
              <option value="Coletum">Coletum</option>
              <option value="sistema-claude">Sistema</option>
              <option value="sistema-weweb">WeWeb</option>
            </select>
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
                        <MenuAcoes
                          onVisualizar={() => navegar(`/producao/${r.id}/editar?modo=visualizar`)}
                          onEditar={() => navegar(`/producao/${r.id}/editar`)}
                          onExcluir={() => excluir(r.id)}
                        />
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

function MenuAcoes({ onVisualizar, onEditar, onExcluir }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    function fechar(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-secundario"
        style={{ padding: '4px 10px', fontSize: 12 }}
        onClick={() => setAberto(p => !p)}
      >
        Ações ▾
      </button>
      {aberto && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 100,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 140, overflow: 'hidden',
        }}>
          {[
            { label: 'Visualizar', onClick: onVisualizar, cor: '#374151' },
            { label: 'Editar',     onClick: onEditar,     cor: '#374151' },
            { label: 'Excluir',    onClick: onExcluir,    cor: '#dc2626' },
          ].map(({ label, onClick, cor }) => (
            <button key={label} onClick={() => { setAberto(false); onClick() }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 14px', fontSize: 13, background: 'none', border: 'none',
              cursor: 'pointer', color: cor,
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
