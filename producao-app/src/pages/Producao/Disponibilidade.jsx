import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDias(n) {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function hojeISO() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// 'YYYY-MM' deslocado em n meses
function deslocarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export default function Disponibilidade() {
  const navegar = useNavigate()
  const { usuario, perfil } = useAuth()
  const isSuperAdmin = perfil?.d_auth_roles?.name === 'Super Admin'

  const [equipes, setEquipes]     = useState([]) // [{ id, equipe, contrato_id, tipo_equipe_id }]
  const [equipeId, setEquipeId]   = useState('')
  const [mes, setMes]             = useState(hojeISO().slice(0, 7))
  const [cadastro, setCadastro]   = useState(null) // { dias_disponibilidade, valor_mensal } | null
  const [atividadeId, setAtividadeId] = useState(null)
  const [lancados, setLancados]   = useState({})   // { 'YYYY-MM-DD': { registroId, atividadeIds, valor } }
  const [marcados, setMarcados]   = useState(new Set())
  const [carregando, setCarregando] = useState(true)
  const [carregandoMes, setCarregandoMes] = useState(false)
  const [salvando, setSalvando]   = useState(false)
  const [erro, setErro]           = useState('')
  const [toast, setToast]         = useState(null)

  const hoje = hojeISO()
  const equipe = equipes.find(e => String(e.id) === String(equipeId)) || null

  useEffect(() => {
    async function carregarEquipes() {
      const { data: cads } = await supabase.from('d_equipes_disponibilidade').select('equipe_id')
      const ids = [...new Set((cads || []).map(c => c.equipe_id))]
      let lista = []
      if (ids.length) {
        const { data } = await supabase
          .from('d_equipes').select('id, equipe, contrato_id, tipo_equipe_id')
          .in('id', ids).eq('is_ativo', true).order('equipe')
        lista = data || []
      }
      setEquipes(lista)
      if (lista.length === 1) setEquipeId(String(lista[0].id))
      setCarregando(false)
    }
    carregarEquipes()
  }, [])

  useEffect(() => { if (equipe) carregarMes() }, [equipeId, mes]) // eslint-disable-line

  function mostrarToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function carregarMes() {
    setCarregandoMes(true)
    setErro('')
    const ini = `${mes}-01`
    const fim = `${deslocarMes(mes, 1)}-01`

    const [{ data: cad }, { data: atvs, error: erAtv }] = await Promise.all([
      supabase.from('d_equipes_disponibilidade')
        .select('dias_disponibilidade, valor_mensal')
        .eq('equipe_id', equipe.id).eq('mes', ini).maybeSingle(),
      supabase.from('d_atividades').select('id')
        .eq('is_disponibilidade', true).eq('contrato_id', equipe.contrato_id).order('id'),
    ])
    if (erAtv) { setErro(erAtv.message); setCarregandoMes(false); return }
    setCadastro(cad || null)
    const idsAtv = (atvs || []).map(a => a.id)
    setAtividadeId(idsAtv[0] ?? null)

    const mapa = {}
    if (idsAtv.length) {
      const { data: ats, error: erAts } = await supabase
        .from('f_prod_atividades')
        .select('id, registro_id, valor_total, f_prod_registro!inner(data_producao, equipe_id)')
        .in('atividade_id', idsAtv)
        .eq('f_prod_registro.equipe_id', equipe.id)
        .gte('f_prod_registro.data_producao', ini)
        .lt('f_prod_registro.data_producao', fim)
      if (erAts) { setErro(erAts.message); setCarregandoMes(false); return }
      ;(ats || []).forEach(a => {
        const dia = a.f_prod_registro.data_producao
        if (!mapa[dia]) mapa[dia] = { registroId: a.registro_id, atividadeIds: [], valor: 0 }
        mapa[dia].atividadeIds.push(a.id)
        mapa[dia].valor += Number(a.valor_total) || 0
      })
    }
    setLancados(mapa)
    setMarcados(new Set(Object.keys(mapa)))
    setCarregandoMes(false)
  }

  const pendentesAdicionar = [...marcados].filter(d => !lancados[d])
  const pendentesRemover   = Object.keys(lancados).filter(d => !marcados.has(d))
  const alterado = pendentesAdicionar.length > 0 || pendentesRemover.length > 0

  function confirmarDescarte() {
    return !alterado || window.confirm('Há marcações não salvas. Descartar e continuar?')
  }

  function trocarEquipe(v) {
    if (!confirmarDescarte()) return
    setEquipeId(v)
  }

  function trocarMes(n) {
    if (!confirmarDescarte()) return
    setMes(m => deslocarMes(m, n))
  }

  function alternarDia(iso) {
    setMarcados(prev => {
      const novo = new Set(prev)
      if (novo.has(iso)) novo.delete(iso)
      else novo.add(iso)
      return novo
    })
  }

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      if (pendentesAdicionar.length) {
        if (!atividadeId) {
          throw new Error('Este contrato não tem atividade marcada como "Pago por disponibilidade". Marque em Configurações › Atividades.')
        }
        const { data: regs, error: erReg } = await supabase.from('f_prod_registro').insert(
          pendentesAdicionar.sort().map(d => ({
            data_producao: d,
            contrato_id: equipe.contrato_id,
            tipo_equipe_id: equipe.tipo_equipe_id,
            equipe_id: equipe.id,
            metadata_registro: {},
            criado_por_id: usuario.id,
            origem: 'sistema-claude',
          }))
        ).select('id, data_producao')
        if (erReg) throw erReg

        const idsNovos = regs.map(r => r.id)
        const desfazer = async () => { await supabase.from('f_prod_registro').delete().in('id', idsNovos) }

        const { error: erAt } = await supabase.from('f_prod_atividades').insert(
          regs.map(r => ({
            registro_id: r.id,
            atividade_id: atividadeId,
            quantidade: 1,
            metadata_atividades: {},
            origem: 'sistema-claude',
          }))
        )
        if (erAt) { await desfazer(); throw erAt }

        // Presença: colaboradores ativos da equipe, como no lançamento normal
        const { data: colabs } = await supabase
          .from('d_colaboradores').select('id').eq('equipe_id', equipe.id).eq('is_ativo', true)
        if (colabs?.length) {
          const { error: erCol } = await supabase.from('f_prod_colaboradores').insert(
            regs.flatMap(r => colabs.map(c => ({
              registro_id: r.id, colaborador_id: c.id, equipe_id: equipe.id, origem: 'sistema-claude',
            })))
          )
          if (erCol) { await desfazer(); throw erCol }
        }
      }

      if (pendentesRemover.length) {
        const atividadeIds = pendentesRemover.flatMap(d => lancados[d].atividadeIds)
        const registroIds  = pendentesRemover.map(d => lancados[d].registroId)
        const { error: erDelAt } = await supabase.from('f_prod_atividades').delete().in('id', atividadeIds)
        if (erDelAt) throw erDelAt
        // Só apaga o registro se não sobrou nenhuma outra atividade nele
        const { data: sobras } = await supabase
          .from('f_prod_atividades').select('registro_id').in('registro_id', registroIds)
        const comOutras = new Set((sobras || []).map(s => s.registro_id))
        const apagar = registroIds.filter(id => !comOutras.has(id))
        if (apagar.length) {
          const { error: erDelReg } = await supabase.from('f_prod_registro').delete().in('id', apagar)
          if (erDelReg) throw erDelReg
        }
      }

      mostrarToast('Disponibilidade salva')
    } catch (e) {
      setErro(e.message || 'Erro ao salvar. Tente novamente.')
    } finally {
      setSalvando(false)
      carregarMes()
    }
  }

  // Calendário do mês
  const [anoMes, mesNum] = mes.split('-').map(Number)
  const totalDias = new Date(anoMes, mesNum, 0).getDate()
  const offset = new Date(anoMes, mesNum - 1, 1).getDay()
  const celulas = [
    ...Array(offset).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => `${mes}-${pad(i + 1)}`),
  ]

  const n = marcados.size
  const dias = cadastro ? Number(cadastro.dias_disponibilidade) : null
  const valorMensal = cadastro ? Number(cadastro.valor_mensal) : null
  const faturamentoLancado = Object.values(lancados).reduce((s, l) => s + l.valor, 0)
  const faturamento = !cadastro
    ? 0
    : alterado
      ? Math.round((valorMensal * n / dias) * 100) / 100
      : faturamentoLancado

  return (
    <div className="pagina">
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: '#166534', color: '#dcfce7', fontSize: 13, fontWeight: 500,
          padding: '10px 18px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          ✓ {toast}
        </div>
      )}

      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar('/producao')}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Disponibilidade</h1>
        </div>
      </div>

      {carregando ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
      ) : equipes.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          Nenhuma equipe com disponibilidade cadastrada.
          {isSuperAdmin && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primario" onClick={() => navegar('/configuracoes/atividades-disponibilidade')}>
                Cadastrar em Configurações
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="campo-grupo" style={{ marginBottom: 0, width: 260, maxWidth: '100%' }}>
              <label className="campo-label">Equipe</label>
              <select className="campo-select" value={equipeId} onChange={e => trocarEquipe(e.target.value)}>
                <option value="">Selecione...</option>
                {equipes.map(e => <option key={e.id} value={e.id}>{e.equipe}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-secundario" onClick={() => trocarMes(-1)} aria-label="Mês anterior">‹</button>
              <div style={{ minWidth: 150, textAlign: 'center', fontWeight: 600, color: '#1e2a3b' }}>
                {MESES[mesNum - 1]} de {anoMes}
              </div>
              <button className="btn btn-secundario" onClick={() => trocarMes(1)} aria-label="Próximo mês">›</button>
            </div>
          </div>

          {!equipe ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Selecione a equipe.
            </div>
          ) : (
            <>
              {erro && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                  {erro}
                </div>
              )}

              {!carregandoMes && !cadastro && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '10px 14px', color: '#92400e', fontSize: 13, marginBottom: 16 }}>
                  ⚠ A disponibilidade de {MESES[mesNum - 1]} de {anoMes} ainda não foi cadastrada. Você pode marcar os dias,
                  mas eles ficam com valor R$ 0,00 até o mês ser cadastrado (Configurações › Atividades › Disponibilidade).
                  {isSuperAdmin && (
                    <button className="btn btn-secundario" style={{ marginLeft: 10, padding: '3px 10px', fontSize: 12 }}
                      onClick={() => navegar('/configuracoes/atividades-disponibilidade')}>Cadastrar agora</button>
                  )}
                </div>
              )}

              {!carregandoMes && cadastro && n > dias && (
                <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 6, padding: '10px 14px', color: '#9a3412', fontSize: 13, marginBottom: 16 }}>
                  ⚠ {n} dias marcados, mas a disponibilidade do mês é de {fmtDias(dias)} dias. Cada dia a mais soma R$ {fmt(valorMensal / dias)}
                  e o faturamento passa do valor mensal.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { rotulo: 'Dias de disponibilidade', valor: cadastro ? fmtDias(dias) : '—' },
                  { rotulo: 'Valor mensal', valor: cadastro ? `R$ ${fmt(valorMensal)}` : '—' },
                  { rotulo: 'Valor do dia', valor: cadastro ? `R$ ${fmt(valorMensal / dias)}` : '—' },
                  { rotulo: 'Dias marcados', valor: n },
                  { rotulo: alterado ? 'Faturamento previsto' : 'Faturamento', valor: `R$ ${fmt(faturamento)}`, destaque: true },
                ].map(c => (
                  <div key={c.rotulo} className="card" style={{ padding: '10px 14px', marginBottom: 0 }}>
                    <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{c.rotulo}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c.destaque ? '#15803d' : '#1e2a3b', marginTop: 2 }}>{c.valor}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ opacity: carregandoMes ? 0.5 : 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
                  {DIAS_SEMANA.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', paddingBottom: 4 }}>{d}</div>
                  ))}
                  {celulas.map((iso, i) => {
                    if (!iso) return <div key={`v${i}`} />
                    const dia = Number(iso.slice(8))
                    const marcado = marcados.has(iso)
                    const lancado = lancados[iso]
                    const futuro = iso > hoje
                    const novo = marcado && !lancado
                    const removendo = !marcado && !!lancado
                    let fundo = 'white', borda = '#e5e7eb', cor = '#374151'
                    if (marcado && lancado) { fundo = '#dcfce7'; borda = '#86efac'; cor = '#166534' }
                    if (novo) { fundo = '#dbeafe'; borda = '#60a5fa'; cor = '#1d4ed8' }
                    if (removendo) { fundo = '#fef2f2'; borda = '#fca5a5'; cor = '#dc2626' }
                    if (futuro && !marcado) { fundo = '#f9fafb'; cor = '#d1d5db' }
                    return (
                      <button key={iso} type="button" disabled={(futuro && !marcado) || carregandoMes || salvando}
                        onClick={() => alternarDia(iso)}
                        title={futuro ? 'Dia ainda não chegou' : marcado ? 'Desmarcar' : 'Marcar como trabalhado'}
                        style={{
                          minHeight: 62, borderRadius: 8, border: `1px solid ${borda}`, background: fundo, color: cor,
                          cursor: futuro && !marcado ? 'not-allowed' : 'pointer', padding: 4,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                          fontWeight: 600, fontSize: 15,
                          textDecoration: removendo ? 'line-through' : 'none',
                        }}>
                        <span>{marcado ? '✓ ' : ''}{dia}</span>
                        {lancado && marcado && (
                          <span style={{ fontSize: 10, fontWeight: 500 }}>R$ {fmt(lancado.valor)}</span>
                        )}
                        {novo && <span style={{ fontSize: 10, fontWeight: 500 }}>novo</span>}
                        {removendo && <span style={{ fontSize: 10, fontWeight: 500 }}>remover</span>}
                      </button>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {alterado
                      ? `${pendentesAdicionar.length} dia(s) a lançar · ${pendentesRemover.length} a remover`
                      : 'Clique nos dias trabalhados e salve.'}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secundario" disabled={!alterado || salvando}
                      onClick={() => setMarcados(new Set(Object.keys(lancados)))}>Desfazer</button>
                    <button className="btn btn-primario" disabled={!alterado || salvando} onClick={salvar}>
                      {salvando ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
