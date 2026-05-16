import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { useCamposDinamicos } from '../../hooks/useCamposDinamicos'
import CampoDinamico from '../../components/CampoDinamico'
import SelectPesquisavel from '../../components/SelectPesquisavel'

export default function NovoRegistro() {
  const navegar = useNavigate()
  const { usuario } = useAuth()

  const [contratos, setContratos] = useState([])
  const [tiposEquipe, setTiposEquipe] = useState([])
  const [equipes, setEquipes] = useState([])
  const [obras, setObras] = useState([])
  const [atividades, setAtividades] = useState([])
  const [colaboradores, setColaboradores] = useState([])
  const [equipesContrato, setEquipesContrato] = useState([])
  const [regionais, setRegionais] = useState([])

  const [contratoId, setContratoId] = useState('')
  const [contrato, setContrato] = useState(null)
  const [tipoEquipeId, setTipoEquipeId] = useState('')
  const [equipeId, setEquipeId] = useState('')
  const [obraId, setObraId] = useState('')
  const [encarregadoId, setEncarregadoId] = useState('')
  const [regionalId, setRegionalId] = useState('')
  const [dataProducao, setDataProducao] = useState(new Date().toISOString().split('T')[0])
  const [metaRegistro, setMetaRegistro] = useState({})

  const [itens, setItens] = useState([{ atividade_id: '', quantidade: '', adicional: '', meta: {} }])

  // logica_contrato = false: lista da equipe (auto-preenchida) + externos adicionados
  const [presentesList, setPresentesList] = useState([])
  const [adicionados, setAdicionados] = useState([])
  const [selectExternoId, setSelectExternoId] = useState('')

  // logica_contrato = true: lista de presentes com override de equipe + adição por equipe
  const [equipeParaAdicionar, setEquipeParaAdicionar] = useState('')
  const [dialogTroca, setDialogTroca] = useState(null) // { colabId, novaEquipeId, nomeColab, nomeEquipe }

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [errosCampos, setErrosCampos] = useState({})

  const { campos: camposRegistro } = useCamposDinamicos(contratoId, tipoEquipeId, 'registro')
  const { campos: camposAtividade } = useCamposDinamicos(contratoId, tipoEquipeId, 'atividade')

  // logica=false: colabs de outras equipes disponíveis para adicionar
  const colaboradoresDisponiveis = colaboradores
    .filter(c => String(c.equipe_id) !== String(equipeId))
    .filter(c => !adicionados.some(a => String(a.id) === String(c.id)))
    .filter(c => !presentesList.some(p => String(p.id) === String(c.id)))

  // logica=true: todos os colabs do contrato ainda não adicionados
  const colaboradoresNaoAdicionados = colaboradores
    .filter(c => !adicionados.some(a => String(a.id) === String(c.id)))

  useEffect(() => {
    supabase.from('d_contratos').select('*').order('descricao').then(({ data }) => setContratos(data || []))
    supabase.from('d_regional').select('*').order('regional').then(({ data }) => setRegionais(data || []))
  }, [])

  useEffect(() => {
    if (!contratoId) {
      setContrato(null); setTiposEquipe([]); setEquipes([])
      setAtividades([]); setColaboradores([]); setEquipesContrato([])
      setTipoEquipeId(''); setEquipeId('')
      setPresentesList([]); setAdicionados([]); setSelectExternoId(''); setEquipeParaAdicionar('')
      return
    }
    const c = contratos.find(c => String(c.id) === String(contratoId))
    setContrato(c || null)
    setTipoEquipeId(''); setEquipeId(''); setObraId('')
    setAtividades([]); setObras([]); setColaboradores([]); setEquipesContrato([])
    setPresentesList([]); setAdicionados([]); setSelectExternoId(''); setEquipeParaAdicionar('')

    supabase
      .from('d_obras').select('obra, localidade')
      .eq('contrato_id', contratoId).order('obra')
      .then(({ data }) => setObras(data || []))

    supabase
      .from('d_equipes').select('tipo_equipe_id, d_tipo_equipe(id, descricao)')
      .eq('contrato_id', contratoId).eq('is_ativo', true)
      .then(({ data }) => {
        const vistos = new Set()
        const tipos = (data || [])
          .filter(e => { if (vistos.has(e.tipo_equipe_id)) return false; vistos.add(e.tipo_equipe_id); return true })
          .map(e => e.d_tipo_equipe).filter(Boolean)
        setTiposEquipe(tipos)
      })
  }, [contratoId, contratos])

  useEffect(() => {
    if (!tipoEquipeId || !contratoId) { setEquipes([]); setAtividades([]); return }

    supabase.from('d_equipes').select('id, equipe')
      .eq('contrato_id', contratoId).eq('tipo_equipe_id', tipoEquipeId).eq('is_ativo', true).order('equipe')
      .then(({ data }) => setEquipes(data || []))

    async function carregarAtividades() {
      const referenciaContrato = contrato?.referencia_codigo
      const { data: te } = await supabase
        .from('d_tipo_equipe').select('grupo_atividades').eq('id', tipoEquipeId).single()
      const grupoAtiv = te?.grupo_atividades

      const campos = 'id, codigo_op, DESCRICAO_BASICA_SISTEMA, unidade, tipo_upe_fixa'

      // Atividades de justificativa aparecem sempre
      const qJustif = supabase.from('d_atividades').select(campos)
        .eq('referencia_codigo', 'justificativa').order('DESCRICAO_BASICA_SISTEMA')

      // Atividades normais: filtro por referencia_codigo do contrato + tipo_equipe_id
      const qNormais = (() => {
        if (!referenciaContrato) return Promise.resolve({ data: [] })
        let q = supabase.from('d_atividades').select(campos)
          .eq('referencia_codigo', referenciaContrato)
          .order('DESCRICAO_BASICA_SISTEMA')
        q = grupoAtiv != null
          ? q.or(`tipo_equipe_id.eq.0,tipo_equipe_id.eq.${grupoAtiv}`)
          : q.eq('tipo_equipe_id', 0)
        return q
      })()

      const [{ data: justif }, { data: normais }] = await Promise.all([qJustif, qNormais])
      const todos = [...(justif || []), ...(normais || [])]
      const vistos = new Set()
      const unicos = todos.filter(a => { if (vistos.has(a.id)) return false; vistos.add(a.id); return true })
      unicos.sort((a, b) => a.DESCRICAO_BASICA_SISTEMA.localeCompare(b.DESCRICAO_BASICA_SISTEMA, 'pt-BR'))
      setAtividades(unicos)
    }
    carregarAtividades()
  }, [tipoEquipeId, contratoId])

  // Todos colaboradores ativos do contrato
  useEffect(() => {
    if (!contratoId || !tipoEquipeId) { setColaboradores([]); setEquipesContrato([]); return }
    async function carregar() {
      const { data: eqs } = await supabase
        .from('d_equipes').select('id, equipe').eq('contrato_id', contratoId).eq('is_ativo', true)

      setEquipesContrato(eqs || [])
      const eqMap = {}
      const equipeIds = (eqs || []).map(e => { eqMap[e.id] = e.equipe; return e.id })
      if (!equipeIds.length) { setColaboradores([]); return }

      const { data: colabs } = await supabase
        .from('d_colaboradores').select('id, matricula_nome, equipe_id')
        .in('equipe_id', equipeIds).eq('is_ativo', true).order('matricula_nome')

      // Equipe selecionada primeiro
      const sorted = [...(colabs || [])].sort((a, b) => {
        const aHome = equipeId && String(a.equipe_id) === String(equipeId)
        const bHome = equipeId && String(b.equipe_id) === String(equipeId)
        return aHome === bHome ? 0 : aHome ? -1 : 1
      })
      const todosColabs = sorted.map(c => ({ ...c, equipeNome: eqMap[c.equipe_id] || '' }))
      setColaboradores(todosColabs)

      // logica=false: auto-preencher com os da equipe selecionada
      if (equipeId && !contrato?.logica_contrato) {
        setPresentesList(todosColabs.filter(c => String(c.equipe_id) === String(equipeId)))
      }
    }
    carregar()
  }, [contratoId, tipoEquipeId, equipeId])

  function handleEquipeChange(v) {
    setEquipeId(v)
    setAdicionados([])
    setSelectExternoId('')
    setPresentesList([]) // preenchida pelo useEffect de colaboradores
  }

  function alterarMetaRegistro(nome, valor) {
    setMetaRegistro(prev => ({ ...prev, [nome]: valor }))
  }

  function alterarItemAtividade(idx, campo, valor) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it))
  }

  function alterarMetaAtividade(idx, nome, valor) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, meta: { ...it.meta, [nome]: valor } } : it))
  }

  function adicionarAtividade() {
    setItens(prev => [...prev, { atividade_id: '', quantidade: '', adicional: '', meta: {} }])
  }

  function removerAtividade(idx) {
    setItens(prev => prev.filter((_, i) => i !== idx))
  }

  // logica=false
  function removerPresente(colabId) {
    setPresentesList(prev => prev.filter(c => String(c.id) !== String(colabId)))
  }

  function adicionarExterno() {
    if (!selectExternoId) return
    const colab = colaboradores.find(c => String(c.id) === String(selectExternoId))
    if (!colab) return
    setAdicionados(prev => [...prev, colab])
    setSelectExternoId('')
  }

  function removerAdicionado(colabId) {
    setAdicionados(prev => prev.filter(c => String(c.id) !== String(colabId)))
  }

  // logica=true
  function adicionarIndividual() {
    if (!selectExternoId) return
    const colab = colaboradores.find(c => String(c.id) === String(selectExternoId))
    if (!colab) return
    setAdicionados(prev => [...prev, { ...colab, overrideEquipeId: null }])
    setSelectExternoId('')
  }

  function adicionarPorEquipe() {
    if (!equipeParaAdicionar) return
    const novos = colaboradores
      .filter(c => String(c.equipe_id) === String(equipeParaAdicionar))
      .filter(c => !adicionados.some(a => String(a.id) === String(c.id)))
      .map(c => ({ ...c, overrideEquipeId: null }))
    setAdicionados(prev => [...prev, ...novos])
    setEquipeParaAdicionar('')
  }

  function atualizarOverride(colabId, novaEquipeId) {
    setAdicionados(prev => prev.map(c =>
      String(c.id) === String(colabId) ? { ...c, overrideEquipeId: novaEquipeId } : c
    ))
  }

  function solicitarTrocaEquipe(c, novaEquipeId) {
    const nomeEquipe = equipesContrato.find(e => String(e.id) === String(novaEquipeId))?.equipe || ''
    setDialogTroca({ colabId: c.id, novaEquipeId, nomeColab: c.matricula_nome, nomeEquipe })
  }

  async function confirmarTrocaEquipe(permanente) {
    if (!dialogTroca) return
    const { colabId, novaEquipeId } = dialogTroca
    atualizarOverride(colabId, novaEquipeId)
    if (permanente) {
      await supabase.from('d_colaboradores').update({ equipe_id: Number(novaEquipeId) }).eq('id', Number(colabId))
      setColaboradores(prev => prev.map(c => String(c.id) === String(colabId) ? { ...c, equipe_id: Number(novaEquipeId) } : c))
      setAdicionados(prev => prev.map(c => String(c.id) === String(colabId) ? { ...c, equipe_id: Number(novaEquipeId) } : c))
    }
    setDialogTroca(null)
  }

  function validar() {
    const erros = {}
    if (!contratoId) erros.contrato = 'Obrigatório'
    if (!tipoEquipeId) erros.tipoEquipe = 'Obrigatório'
    if (!contrato?.logica_contrato && camposRegistro.some(c => ['equipe', 'equipe_id'].includes(c.config_campos.nome)) && !equipeId) erros.equipe = 'Obrigatório'
    if (!dataProducao) erros.data = 'Obrigatório'
    camposRegistro.forEach(c => {
      if (c.obrigatorio && !metaRegistro[c.config_campos.nome])
        erros[`reg_${c.config_campos.nome}`] = 'Obrigatório'
    })
    itens.forEach((it, idx) => {
      if (!it.atividade_id) erros[`at_${idx}_atividade`] = 'Obrigatório'
      if (!it.quantidade || Number(it.quantidade) <= 0) erros[`at_${idx}_qtd`] = 'Informe a quantidade'
      camposAtividade.forEach(c => {
        if (c.obrigatorio && !it.meta[c.config_campos.nome])
          erros[`at_${idx}_${c.config_campos.nome}`] = 'Obrigatório'
      })
    })
    setErrosCampos(erros)
    return Object.keys(erros).length === 0
  }

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    if (!validar()) { setErro('Preencha todos os campos obrigatórios.'); window.scrollTo({ top: 0, behavior: 'smooth' }); return }

    setSalvando(true)
    try {
      const { data: reg, error: erReg } = await supabase
        .from('f_prod_registro').insert({
          data_producao: dataProducao,
          contrato_id: Number(contratoId),
          tipo_equipe_id: Number(tipoEquipeId),
          equipe_id: contrato?.logica_contrato ? null : Number(equipeId),
          obra_id: obraId ? Number(obraId) : null,
          encarregado_id: encarregadoId ? Number(encarregadoId) : null,
          regional_id: regionalId ? Number(regionalId) : null,
          metadata_registro: metaRegistro,
          criado_por_id: usuario.id,
        }).select('id').single()
      if (erReg) throw erReg

      await supabase.from('f_prod_atividades').insert(
        itens.map(it => ({
          registro_id: reg.id,
          atividade_id: Number(it.atividade_id),
          quantidade: Number(it.quantidade),
          adicional: it.adicional ? Number(it.adicional) : 0,
          metadata_atividades: it.meta,
        }))
      )

      let presenca = []
      if (contrato?.logica_contrato) {
        presenca = adicionados.map(c => ({
          registro_id: reg.id,
          colaborador_id: Number(c.id),
          equipe_id: c.overrideEquipeId ? Number(c.overrideEquipeId) : (c.equipe_id ? Number(c.equipe_id) : null),
        }))
      } else {
        presenca = [
          ...presentesList.map(c => ({ registro_id: reg.id, colaborador_id: Number(c.id), equipe_id: c.equipe_id ? Number(c.equipe_id) : null })),
          ...adicionados.map(c => ({ registro_id: reg.id, colaborador_id: Number(c.id), equipe_id: c.equipe_id ? Number(c.equipe_id) : null })),
        ]
      }
      if (presenca.length > 0) await supabase.from('f_prod_colaboradores').insert(presenca)

      navegar('/producao')
    } catch (e) {
      setErro(e.message || 'Erro ao salvar. Tente novamente.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSalvando(false)
    }
  }

  const logicaContrato = contrato?.logica_contrato
  const opcoesContratos = contratos.map(c => ({ valor: c.id, label: c.descricao }))
  const opcoesTipos = tiposEquipe.map(t => ({ valor: t.id, label: t.descricao }))
  const opcoesEquipes = equipes.map(e => ({ valor: e.id, label: e.equipe }))
  const opcoesObras = obras.map(o => ({ valor: o.obra, label: o.localidade ? `${o.obra} — ${o.localidade}` : String(o.obra) }))
  const opcoesEncarregados = colaboradores.map(c => ({ valor: c.id, label: c.matricula_nome, sublabel: c.equipeNome }))
  const opcoesRegionais = regionais.map(r => ({ valor: r.id, label: r.regional }))

  return (
    <div className="pagina">
      {/* Modal de confirmação de troca de equipe */}
      {dialogTroca && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 28, maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Alterar equipe do colaborador</div>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
              <strong>{dialogTroca.nomeColab}</strong>
            </p>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
              Nova equipe: <strong style={{ color: '#1a56db' }}>{dialogTroca.nomeEquipe}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-primario" onClick={() => confirmarTrocaEquipe(false)}>
                Somente neste lançamento
              </button>
              <button className="btn btn-sucesso" onClick={() => confirmarTrocaEquipe(true)}>
                Salvar permanentemente (atualiza o cadastro)
              </button>
              <button className="btn btn-secundario" onClick={() => setDialogTroca(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pagina-header">
        <h1 className="pagina-titulo">Novo Lançamento de Produção</h1>
        <button className="btn btn-secundario" onClick={() => navegar('/producao')}>← Voltar</button>
      </div>

      {erro && <div className="alerta alerta-erro">{erro}</div>}

      <form onSubmit={salvar}>
        {/* Identificação */}
        <div className="card">
          <div className="card-titulo">Identificação</div>
          <div className="campos-grid">
            <div className="campo-grupo">
              <label className="campo-label">Data da Produção <span className="obrigatorio">*</span></label>
              <input type="date" className={`campo-input${errosCampos.data ? ' erro' : ''}`}
                value={dataProducao} onChange={e => setDataProducao(e.target.value)} required />
              {errosCampos.data && <div className="campo-erro-msg">{errosCampos.data}</div>}
            </div>

            <div className="campo-grupo">
              <label className="campo-label">Contrato <span className="obrigatorio">*</span></label>
              <SelectPesquisavel opcoes={opcoesContratos} valor={contratoId}
                onChange={v => setContratoId(v)} placeholder="Pesquise o contrato..."
                erro={errosCampos.contrato} />
            </div>

            <div className="campo-grupo">
              <label className="campo-label">Tipo de Equipe <span className="obrigatorio">*</span></label>
              <SelectPesquisavel opcoes={opcoesTipos} valor={tipoEquipeId}
                onChange={v => setTipoEquipeId(v)} placeholder="Pesquise o tipo..."
                disabled={!contratoId} erro={errosCampos.tipoEquipe} />
            </div>

          </div>

          {camposRegistro.length > 0 && (
            <>
              <div className="secao-titulo">Dados Adicionais do Registro</div>
              <div className="campos-grid">
                {camposRegistro.map(c => {
                  const nome = c.config_campos.nome
                  if (nome === 'equipe' && !logicaContrato) return (
                    <div key={c.id} className="campo-grupo">
                      <label className="campo-label">Equipe <span className="obrigatorio">*</span></label>
                      <SelectPesquisavel opcoes={opcoesEquipes} valor={equipeId}
                        onChange={handleEquipeChange} placeholder="Pesquise a equipe..."
                        erro={errosCampos.equipe} />
                    </div>
                  )
                  if (nome === 'equipe') return null
                  if (nome === 'obra_id') return (
                    <div key={c.id} className="campo-grupo">
                      <label className="campo-label">Obra</label>
                      <SelectPesquisavel opcoes={opcoesObras} valor={obraId}
                        onChange={v => setObraId(v)} placeholder="Pesquise a obra..."
                        disabled={opcoesObras.length === 0} />
                    </div>
                  )
                  if (nome === 'encarregado_id') return (
                    <div key={c.id} className="campo-grupo">
                      <label className="campo-label">Encarregado</label>
                      <SelectPesquisavel opcoes={opcoesEncarregados} valor={encarregadoId}
                        onChange={v => setEncarregadoId(v)} placeholder="Pesquise o encarregado..."
                        disabled={colaboradores.length === 0} />
                    </div>
                  )
                  if (nome === 'regional_id') return (
                    <div key={c.id} className="campo-grupo">
                      <label className="campo-label">Regional</label>
                      <SelectPesquisavel opcoes={opcoesRegionais} valor={regionalId}
                        onChange={v => setRegionalId(v)} placeholder="Pesquise a regional..." />
                    </div>
                  )
                  return (
                    <CampoDinamico key={c.id} campo={c} valor={metaRegistro[nome]}
                      onChange={alterarMetaRegistro} erro={errosCampos[`reg_${nome}`]} />
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Atividades */}
        {tipoEquipeId && (
          <div className="card">
            <div className="card-titulo">Atividades Executadas</div>
            {itens.map((item, idx) => {
              const opcoesAtividades = atividades.map(a => ({
                valor: a.id,
                label: a.codigo_op ? `[${a.codigo_op}] ${a.DESCRICAO_BASICA_SISTEMA}` : a.DESCRICAO_BASICA_SISTEMA,
              }))
              return (
                <div key={idx} className="atividade-item">
                  <div className="atividade-item-header">
                    <span className="atividade-numero">#{idx + 1}</span>
                    {itens.length > 1 && (
                      <button type="button" className="btn btn-perigo"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => removerAtividade(idx)}>Remover</button>
                    )}
                  </div>
                  <div className="campos-grid">
                    <div className="campo-grupo" style={{ gridColumn: 'span 2' }}>
                      <label className="campo-label">Atividade <span className="obrigatorio">*</span></label>
                      <SelectPesquisavel opcoes={opcoesAtividades} valor={item.atividade_id}
                        onChange={v => alterarItemAtividade(idx, 'atividade_id', v)}
                        placeholder="Pesquise a atividade..."
                        erro={errosCampos[`at_${idx}_atividade`]} />
                    </div>
                    <div className="campo-grupo">
                      <label className="campo-label">Quantidade <span className="obrigatorio">*</span></label>
                      <input type="number" step="0.000001" min="0"
                        className={`campo-input${errosCampos[`at_${idx}_qtd`] ? ' erro' : ''}`}
                        value={item.quantidade}
                        onChange={e => alterarItemAtividade(idx, 'quantidade', e.target.value)} placeholder="0" />
                      {errosCampos[`at_${idx}_qtd`] && <div className="campo-erro-msg">{errosCampos[`at_${idx}_qtd`]}</div>}
                    </div>
                    <div className="campo-grupo">
                      <label className="campo-label">Adicional (R$)</label>
                      <input type="number" step="0.01" min="0" className="campo-input"
                        value={item.adicional}
                        onChange={e => alterarItemAtividade(idx, 'adicional', e.target.value)} placeholder="0.00" />
                    </div>
                    {camposAtividade.map(c => (
                      <CampoDinamico key={c.id} campo={c} valor={item.meta[c.config_campos.nome]}
                        onChange={(nome, valor) => alterarMetaAtividade(idx, nome, valor)}
                        erro={errosCampos[`at_${idx}_${c.config_campos.nome}`]} />
                    ))}
                  </div>
                </div>
              )
            })}
            <button type="button" className="btn btn-secundario" onClick={adicionarAtividade}>
              + Adicionar Atividade
            </button>
          </div>
        )}

        {/* Colaboradores */}
        {colaboradores.length > 0 && (logicaContrato || equipeId) && (
          <div className="card">
            <div className="card-titulo">Colaboradores Presentes</div>

            {logicaContrato ? (
              /* logica=true: adicionar individualmente ou por equipe, com seletor de equipe no dia */
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="campo-label">Adicionar equipe completa</label>
                    <SelectPesquisavel
                      opcoes={equipesContrato.map(e => ({ valor: e.id, label: e.equipe }))}
                      valor={equipeParaAdicionar}
                      onChange={setEquipeParaAdicionar}
                      placeholder="Selecione a equipe..."
                    />
                  </div>
                  <button type="button" className="btn btn-secundario" style={{ flexShrink: 0 }}
                    onClick={adicionarPorEquipe} disabled={!equipeParaAdicionar}>
                    + Adicionar todos
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="campo-label">Adicionar colaborador individual</label>
                    <SelectPesquisavel
                      opcoes={colaboradoresNaoAdicionados.map(c => ({ valor: c.id, label: c.matricula_nome, sublabel: c.equipeNome }))}
                      valor={selectExternoId}
                      onChange={setSelectExternoId}
                      placeholder="Pesquise o colaborador..."
                    />
                  </div>
                  <button type="button" className="btn btn-secundario" style={{ flexShrink: 0 }}
                    onClick={adicionarIndividual} disabled={!selectExternoId}>
                    + Adicionar
                  </button>
                </div>

                {adicionados.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: 13 }}>Nenhum colaborador adicionado.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {adicionados.map(c => (
                      <div key={c.id} style={{ padding: '8px 12px', borderRadius: 6, background: '#f0f9ff', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.matricula_nome}</span>
                        <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', flexShrink: 0 }}>Equipe no dia:</span>
                        <select
                          className="campo-select"
                          style={{ fontSize: 12, padding: '4px 8px', width: 160, flexShrink: 0 }}
                          value={c.overrideEquipeId ?? String(c.equipe_id ?? '')}
                          onChange={e => solicitarTrocaEquipe(c, e.target.value)}
                        >
                          {equipesContrato.map(e => <option key={e.id} value={e.id}>{e.equipe}</option>)}
                        </select>
                        <button type="button" className="btn btn-secundario"
                          style={{ padding: '3px 10px', fontSize: 12, flexShrink: 0 }}
                          onClick={() => removerAdicionado(c.id)}>× Remover</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* logica=false: lista da equipe (todos incluídos, remove quem faltou) + adicionar de outras */
              <>
                <div className="secao-titulo" style={{ marginTop: 0 }}>
                  Equipe: {equipes.find(e => String(e.id) === equipeId)?.equipe || ''}
                </div>

                {presentesList.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>Nenhum colaborador ativo nesta equipe.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {presentesList.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f0f9ff', borderRadius: 6 }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{c.matricula_nome}</span>
                        <button type="button" className="btn btn-secundario"
                          style={{ padding: '3px 10px', fontSize: 12 }}
                          onClick={() => removerPresente(c.id)}>× Remover</button>
                      </div>
                    ))}
                  </div>
                )}

                {adicionados.length > 0 && (
                  <>
                    <div className="secao-titulo">Colaboradores de Outras Equipes</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {adicionados.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f9fafb', borderRadius: 6 }}>
                          <span style={{ flex: 1, fontSize: 13 }}>{c.matricula_nome}</span>
                          <span className="badge badge-cinza">{c.equipeNome}</span>
                          <button type="button" className="btn btn-secundario"
                            style={{ padding: '3px 10px', fontSize: 12 }}
                            onClick={() => removerAdicionado(c.id)}>× Remover</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {colaboradoresDisponiveis.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label className="campo-label">Adicionar de outra equipe</label>
                      <SelectPesquisavel
                        opcoes={colaboradoresDisponiveis.map(c => ({ valor: c.id, label: c.matricula_nome, sublabel: c.equipeNome }))}
                        valor={selectExternoId}
                        onChange={setSelectExternoId}
                        placeholder="Pesquise colaborador..."
                      />
                    </div>
                    <button type="button" className="btn btn-secundario" style={{ flexShrink: 0 }}
                      onClick={adicionarExterno} disabled={!selectExternoId}>
                      + Adicionar
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="form-rodape">
          <button type="button" className="btn btn-secundario" onClick={() => navegar('/producao')}>Cancelar</button>
          <button type="submit" className="btn btn-sucesso" disabled={salvando}>
            {salvando ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Salvando...</> : '✓ Salvar Lançamento'}
          </button>
        </div>
      </form>
    </div>
  )
}
