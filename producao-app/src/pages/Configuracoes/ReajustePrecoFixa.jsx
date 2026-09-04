import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function arredondar(n) {
  return Math.round(Number(n) * 100) / 100
}

export default function ReajustePrecoFixa() {
  const navegar = useNavigate()
  const [contratos, setContratos] = useState([])
  const [contratoId, setContratoId] = useState('')
  const [linhas, setLinhas] = useState([])          // [{ atividade_id, codigo_op, descricao, precoAtualId, valorAtual, vigenciaInicioAtual, novoValor }]
  const [carregando, setCarregando] = useState(false)
  const [dataReajuste, setDataReajuste] = useState('')
  const [percentualGeral, setPercentualGeral] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao').then(({ data }) => setContratos(data || []))
  }, [])

  useEffect(() => {
    setLinhas([])
    setErro('')
    if (!contratoId) return
    carregarAtividades()
  }, [contratoId])

  function mostrarToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function carregarAtividades() {
    setCarregando(true)
    const { data: atividades } = await supabase
      .from('d_atividades')
      .select('id, codigo_op, descricao')
      .eq('contrato_id', Number(contratoId))
      .eq('tipo_preco', 'fixo')
      .order('codigo_op')

    const ids = (atividades || []).map(a => a.id)
    let precos = []
    if (ids.length > 0) {
      const { data } = await supabase
        .from('d_atividades_preco_fixo')
        .select('atividade_id, valor, vigencia_inicio')
        .in('atividade_id', ids)
        .order('vigencia_inicio', { ascending: false })
      precos = data || []
    }
    // Preço vigente = o de maior vigencia_inicio por atividade (não depende de vigencia_fim)
    const precoPorAtividade = {}
    precos.forEach(p => {
      if (!precoPorAtividade[p.atividade_id]) precoPorAtividade[p.atividade_id] = p
    })

    setLinhas((atividades || []).map(a => {
      const p = precoPorAtividade[a.id]
      return {
        atividade_id: a.id,
        codigo_op: a.codigo_op,
        descricao: a.descricao,
        valorAtual: p?.valor ?? null,
        vigenciaInicioAtual: p?.vigencia_inicio ?? null,
        novoValor: '',
      }
    }))
    setCarregando(false)
  }

  function aplicarPercentualGeral() {
    const pct = Number(String(percentualGeral).replace(',', '.'))
    if (!pct && pct !== 0) return
    setLinhas(prev => prev.map(l =>
      l.valorAtual != null ? { ...l, novoValor: String(arredondar(l.valorAtual * (1 + pct / 100))) } : l
    ))
  }

  function alterarNovoValor(atividadeId, valor) {
    setLinhas(prev => prev.map(l => l.atividade_id === atividadeId ? { ...l, novoValor: valor } : l))
  }

  const linhasAlteradas = useMemo(() =>
    linhas.filter(l => {
      if (l.novoValor === '' || l.novoValor == null) return false
      const novo = Number(String(l.novoValor).replace(',', '.'))
      if (Number.isNaN(novo)) return false
      return l.valorAtual == null || arredondar(novo) !== arredondar(l.valorAtual)
    }),
    [linhas]
  )

  async function salvarReajuste() {
    setErro('')
    if (!dataReajuste) { setErro('Informe a data do reajuste.'); return }
    if (linhasAlteradas.length === 0) { setErro('Nenhuma atividade com valor novo diferente do atual.'); return }

    const invalida = linhasAlteradas.find(l => l.vigenciaInicioAtual && l.vigenciaInicioAtual >= dataReajuste)
    if (invalida) {
      setErro(`A atividade ${invalida.codigo_op} já tem um preço vigente a partir de ${invalida.vigenciaInicioAtual.split('-').reverse().join('/')} — a data do reajuste precisa ser depois disso.`)
      return
    }

    setSalvando(true)
    let erros = 0
    for (const l of linhasAlteradas) {
      const novoValor = arredondar(Number(String(l.novoValor).replace(',', '.')))
      const { error } = await supabase
        .from('d_atividades_preco_fixo')
        .insert({ atividade_id: l.atividade_id, valor: novoValor, vigencia_inicio: dataReajuste })
      if (error) erros++
    }
    setSalvando(false)

    if (erros > 0) {
      setErro(`${erros} atividade(s) não foram salvas — confira e tente de novo.`)
    } else {
      mostrarToast(`Reajuste aplicado em ${linhasAlteradas.length} atividade(s)`)
    }
    carregarAtividades()
  }

  return (
    <div className="pagina">
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: '#166534', color: '#dcfce7', fontSize: 13, fontWeight: 500,
          padding: '10px 18px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ✓ {toast}
        </div>
      )}

      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar(-1)}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Reajuste de Preço Fixo</h1>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
          Só mostra atividades do tipo <strong>Fixo</strong> (preço fixo unitário) do contrato selecionado.
          Atividades do tipo <strong>UPE</strong> (Unidade Padrão de Execução) usam a tela de Preço UPE, não esta aqui.
          Ao salvar, um novo preço passa a valer a partir da data do reajuste — o preço anterior fica registrado no histórico automaticamente, não precisa fechar vigência manualmente.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 240 }}>
            <label className="campo-label">Contrato</label>
            <select className="campo-select" value={contratoId} onChange={e => setContratoId(e.target.value)}>
              <option value="">Selecione...</option>
              {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 160 }}>
            <label className="campo-label">Data do reajuste <span className="obrigatorio">*</span></label>
            <input type="date" className="campo-input" value={dataReajuste}
              onChange={e => setDataReajuste(e.target.value)} />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 140 }}>
            <label className="campo-label">% de reajuste geral</label>
            <input type="text" className="campo-input" placeholder="Ex: 5.5" value={percentualGeral}
              onChange={e => setPercentualGeral(e.target.value)} disabled={!contratoId} />
          </div>
          <button className="btn btn-secundario" onClick={aplicarPercentualGeral}
            disabled={!contratoId || linhas.length === 0}>
            Aplicar % a todas
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>{erro}</div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!contratoId ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Selecione um contrato para ver as atividades do tipo Fixo.
          </div>
        ) : carregando ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
        ) : linhas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Nenhuma atividade do tipo Fixo cadastrada para este contrato.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['Código', 'Descrição', 'Valor Atual', 'Novo Valor', 'Variação'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', fontWeight: 600, color: '#374151',
                      borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
                      textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, idx) => {
                  const novo = l.novoValor !== '' ? Number(String(l.novoValor).replace(',', '.')) : null
                  const variacao = novo != null && l.valorAtual ? ((novo - l.valorAtual) / l.valorAtual) * 100 : null
                  const alterada = linhasAlteradas.some(a => a.atividade_id === l.atividade_id)
                  return (
                    <tr key={l.atividade_id} style={{ borderBottom: '1px solid #f3f4f6',
                      background: alterada ? '#fefce8' : idx % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e2a3b', whiteSpace: 'nowrap' }}>{l.codigo_op}</td>
                      <td style={{ padding: '10px 14px', color: '#374151' }}>{l.descricao}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {l.valorAtual != null ? `R$ ${fmt(l.valorAtual)}` : <span style={{ color: '#d1d5db' }}>sem preço</span>}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <input type="text" className="campo-input" style={{ width: 110, textAlign: 'right' }}
                          value={l.novoValor} placeholder={l.valorAtual != null ? fmt(l.valorAtual) : '0,00'}
                          onChange={e => alterarNovoValor(l.atividade_id, e.target.value)} />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap',
                        color: variacao == null ? '#d1d5db' : variacao >= 0 ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                        {variacao != null ? `${variacao >= 0 ? '+' : ''}${variacao.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {linhas.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-primario" onClick={salvarReajuste} disabled={salvando || linhasAlteradas.length === 0}>
            {salvando ? 'Salvando...' : `Salvar reajuste (${linhasAlteradas.length} atividade${linhasAlteradas.length === 1 ? '' : 's'})`}
          </button>
        </div>
      )}
    </div>
  )
}
