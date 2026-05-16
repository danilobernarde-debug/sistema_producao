import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

export default function ListaRegistros() {
  const navegar = useNavigate()
  const [registros, setRegistros] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [filtroContrato, setFiltroContrato] = useState('')
  const [filtroData, setFiltroData] = useState('')
  const [contratos, setContratos] = useState([])

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao').then(({ data }) => setContratos(data || []))
    buscar()
  }, [])

  async function buscar() {
    setCarregando(true)
    let q = supabase
      .from('f_prod_registro')
      .select(`
        id, data_producao, criado_em,
        d_contratos(descricao),
        d_tipo_equipe(descricao),
        d_equipes(equipe),
        encarregado:d_colaboradores(matricula_nome)
      `)
      .order('data_producao', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(100)

    if (filtroContrato) q = q.eq('contrato_id', filtroContrato)
    if (filtroData) q = q.eq('data_producao', filtroData)

    const { data } = await q
    setRegistros(data || [])
    setCarregando(false)
  }

  function formatarData(d) {
    if (!d) return '-'
    const [ano, mes, dia] = d.split('-')
    return `${dia}/${mes}/${ano}`
  }

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
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 200 }}>
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
          <button className="btn btn-primario" onClick={buscar}>
            Filtrar
          </button>
          <button className="btn btn-secundario" onClick={() => { setFiltroContrato(''); setFiltroData(''); }}>
            Limpar
          </button>
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
          <div className="tabela-container">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Contrato</th>
                  <th>Tipo Equipe</th>
                  <th>Equipe</th>
                  <th>Encarregado</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.id}>
                    <td>{formatarData(r.data_producao)}</td>
                    <td>{r.d_contratos?.descricao || '-'}</td>
                    <td>{r.d_tipo_equipe?.descricao || '-'}</td>
                    <td>{r.d_equipes?.equipe || <span className="badge badge-cinza">Proporcional</span>}</td>
                    <td>{r.encarregado?.matricula_nome || '-'}</td>
                    <td>
                      <button
                        className="btn btn-secundario"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => navegar(`/producao/${r.id}/editar`)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
