import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'

const MESES = [
  { v: '01', l: 'Janeiro' }, { v: '02', l: 'Fevereiro' }, { v: '03', l: 'Março' },
  { v: '04', l: 'Abril' },   { v: '05', l: 'Maio' },      { v: '06', l: 'Junho' },
  { v: '07', l: 'Julho' },   { v: '08', l: 'Agosto' },    { v: '09', l: 'Setembro' },
  { v: '10', l: 'Outubro' }, { v: '11', l: 'Novembro' },  { v: '12', l: 'Dezembro' },
]

function formatarData(d) {
  if (!d) return '-'
  const [ano, mes, dia] = d.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function JustificativasObservacoes() {
  const hoje = new Date()
  const [mes, setMes]               = useState(String(hoje.getMonth() + 1).padStart(2, '0'))
  const [ano, setAno]               = useState(String(hoje.getFullYear()))
  const [filtroContratoId, setFiltroContratoId] = useState('')
  const [filtroEquipe, setFiltroEquipe]         = useState('')
  const [contratos, setContratos]   = useState([])
  const [dados, setDados]           = useState([])
  const [carregando, setCarregando] = useState(false)
  const [aba, setAba]               = useState('justificativas') // 'justificativas' | 'observacoes'

  const anos = useMemo(() => {
    const r = []
    for (let y = 2023; y <= hoje.getFullYear() + 1; y++) r.push(String(y))
    return r
  }, [])

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao, nr_obra').order('descricao')
      .then(({ data, error }) => {
        if (error) {
          supabase.from('d_contratos').select('id, descricao').order('descricao')
            .then(({ data: d2 }) => setContratos(d2 || []))
        } else {
          setContratos(data || [])
        }
      })
  }, [])

  useEffect(() => {
    async function buscar() {
      setCarregando(true)
      const inicio = `${ano}-${mes}-01`
      const fim = mes === '12'
        ? `${Number(ano) + 1}-01-01`
        : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}-01`

      let q = supabase.from('view_powerbi_producao')
        .select('registro_id, data_producao, contrato_id, desc_equipe, desc_atividade, justificativa, metadata_registro')
        .gte('data_producao', inicio)
        .lt('data_producao', fim)
        .limit(5000)

      if (filtroContratoId) q = q.eq('contrato_id', filtroContratoId)

      const { data } = await q
      setDados(data || [])
      setFiltroEquipe('')
      setCarregando(false)
    }
    buscar()
  }, [mes, ano, filtroContratoId])

  const equipesDisponiveis = useMemo(() => {
    const nomes = [...new Set(dados.map(r => r.desc_equipe).filter(Boolean))].sort()
    return nomes
  }, [dados])

  const dadosFiltrados = useMemo(
    () => filtroEquipe ? dados.filter(r => r.desc_equipe === filtroEquipe) : dados,
    [dados, filtroEquipe]
  )

  // Justificativas: linhas onde justificativa é verdadeiro
  const justificativas = useMemo(
    () => dadosFiltrados.filter(r => r.justificativa),
    [dadosFiltrados]
  )

  // Observações: uma linha por registro, apenas os que têm observação
  const observacoes = useMemo(() => {
    const map = {}
    dadosFiltrados.forEach(r => {
      if (!r.registro_id || map[r.registro_id]) return
      const obs = r.metadata_registro?.observacoes
      if (obs && String(obs).trim()) {
        map[r.registro_id] = {
          registro_id: r.registro_id,
          data_producao: r.data_producao,
          contrato_id: r.contrato_id,
          desc_equipe: r.desc_equipe,
          observacoes: String(obs).trim(),
        }
      }
    })
    return Object.values(map).sort((a, b) => (b.data_producao || '').localeCompare(a.data_producao || ''))
  }, [dadosFiltrados])

  const estiloAba = (ativo) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: 'none', borderBottom: ativo ? '2px solid #1a56db' : '2px solid transparent',
    background: 'none', color: ativo ? '#1a56db' : '#6b7280',
  })

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Justificativas e Observações</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 150 }}>
            <label className="campo-label">Mês</label>
            <select className="campo-select" value={mes} onChange={e => setMes(e.target.value)}>
              {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, width: 90 }}>
            <label className="campo-label">Ano</label>
            <select className="campo-select" value={ano} onChange={e => setAno(e.target.value)}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 220 }}>
            <label className="campo-label">Contrato</label>
            <select className="campo-select" value={filtroContratoId} onChange={e => setFiltroContratoId(e.target.value)}>
              <option value="">Todos</option>
              {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 200 }}>
            <label className="campo-label">Equipe</label>
            <select className="campo-select" value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)}>
              <option value="">Todas</option>
              {equipesDisponiveis.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {/* Abas */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
          <button style={estiloAba(aba === 'justificativas')} onClick={() => setAba('justificativas')}>
            Justificativas
            <span style={{
              marginLeft: 6, background: aba === 'justificativas' ? '#eff6ff' : '#f3f4f6',
              color: aba === 'justificativas' ? '#1a56db' : '#6b7280',
              borderRadius: 10, padding: '1px 7px', fontSize: 11,
            }}>{justificativas.length}</span>
          </button>
          <button style={estiloAba(aba === 'observacoes')} onClick={() => setAba('observacoes')}>
            Observações
            <span style={{
              marginLeft: 6, background: aba === 'observacoes' ? '#eff6ff' : '#f3f4f6',
              color: aba === 'observacoes' ? '#1a56db' : '#6b7280',
              borderRadius: 10, padding: '1px 7px', fontSize: 11,
            }}>{observacoes.length}</span>
          </button>
        </div>

        {carregando ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : aba === 'justificativas' ? (
          justificativas.length === 0 ? (
            <div className="vazio">
              <div className="vazio-icone">📝</div>
              Nenhuma justificativa encontrada no período.
            </div>
          ) : (
            <div className="tabela-container">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Contrato</th>
                    <th>Equipe</th>
                    <th>Justificativa</th>
                  </tr>
                </thead>
                <tbody>
                  {justificativas.map((r, i) => (
                    <tr key={`${r.registro_id}-${i}`}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatarData(r.data_producao)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{contratos.find(c => c.id === r.contrato_id)?.descricao || '-'}</td>
                      <td>{r.desc_equipe || '-'}</td>
                      <td>{r.desc_atividade || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          observacoes.length === 0 ? (
            <div className="vazio">
              <div className="vazio-icone">💬</div>
              Nenhuma observação encontrada no período.
            </div>
          ) : (
            <div className="tabela-container">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Contrato</th>
                    <th>Equipe</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {observacoes.map(r => (
                    <tr key={r.registro_id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatarData(r.data_producao)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{contratos.find(c => c.id === r.contrato_id)?.descricao || '-'}</td>
                      <td>{r.desc_equipe || '-'}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{r.observacoes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
