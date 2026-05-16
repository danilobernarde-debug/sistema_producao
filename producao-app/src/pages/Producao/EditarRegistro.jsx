import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useCamposDinamicos } from '../../hooks/useCamposDinamicos'
import CampoDinamico from '../../components/CampoDinamico'
import SelectPesquisavel from '../../components/SelectPesquisavel'

export default function EditarRegistro() {
  const { id } = useParams()
  const navegar = useNavigate()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [errosCampos, setErrosCampos] = useState({})

  const [contrato, setContrato] = useState(null)
  const [tiposEquipe, setTiposEquipe] = useState([])
  const [equipes, setEquipes] = useState([])
  const [obras, setObras] = useState([])
  const [atividades, setAtividades] = useState([])
  const [colaboradores, setColaboradores] = useState([])
  const [equipesContrato, setEquipesContrato] = useState([])
  const [regionais, setRegionais] = useState([])

  const [contratoId, setContratoId] = useState('')
  const [tipoEquipeId, setTipoEquipeId] = useState('')
  const [equipeId, setEquipeId] = useState('')
  const [obraId, setObraId] = useState('')
  const [encarregadoId, setEncarregadoId] = useState('')
  const [regionalId, setRegionalId] = useState('')
  const [dataProducao, setDataProducao] = useState('')
  const [metaRegistro, setMetaRegistro] = useState({})
  const [itens, setItens] = useState([])

  // logica=false: lista da equipe (auto-preenchida) + externos adicionados
  const [presentesList, setPresentesList] = useState([])
  const [adicionados, setAdicionados] = useState([])
  const [selectExternoId, setSelectExternoId] = useState('')

  // logica=true: lista de presentes com override de equipe + adição por equipe
  const [equipeParaAdicionar, setEquipeParaAdicionar] = useState('')
  const [dialogTroca, setDialogTroca] = useState(null)

  const { campos: camposRegistro } = useCamposDinamicos(contratoId, tipoEquipeId, 'registro')
  const { campos: camposAtividade } = useCamposDinamicos(contratoId, tipoEquipeId, 'atividade')

  const colaboradoresDisponiveis = colaboradores
    .filter(c => String(c.equipe_id) !== String(equipeId))
    .filter(c => !adicionados.some(a => String(a.id) === String(c.id)))
    .filter(c => !presentesList.some(p => String(p.id) === String(c.id)))

  const colaboradoresNaoAdicionados = colaboradores
    .filter(c => !adicionados.some(a => String(a.id) === String(c.id)))

  useEffect(() => {
    supabase.from('d_regional').select('*').order('regional').then(({ data }) => setRegionais(data || []))
    carregarRegistro()
  }, [id])

  async function carregarRegistro() {
    setCarregando(true)

    const { data: reg } = await supabase
      .from('f_prod_registro').select('*, d_contratos(*)').eq('id', id).single()
    if (!reg) { setCarregando(false); return }

    setContrato(reg.d_contratos)
    setContratoId(String(reg.contrato_id))
    setTipoEquipeId(String(reg.tipo_equipe_id))
    setEquipeId(reg.equipe_id ? String(reg.equipe_id) : '')
    setObraId(reg.obra_id ? String(reg.obra_id) : '')
    setEncarregadoId(reg.encarregado_id ? String(reg.encarregado_id) : '')
    setRegionalId(reg.regional_id ? String(reg.regional_id) : '')

    // Obras do contrato
    supabase.from('d_obras').select('obra, localidade')
      .eq('contrato_id', reg.contrato_id).order('obra')
      .then(({ data }) => setObras(data || []))
    setDataProducao(reg.data_producao)
    setMetaRegistro(reg.metadata_registro || {})

    // Atividades do registro
    const { data: ats } = await supabase.from('f_prod_atividades').select('*').eq('registro_id', id)
    setItens((ats || []).map(a => ({
      id: a.id,
      atividade_id: String(a.atividade_id),
      quantidade: String(a.quantidade),
      adicional: String(a.adicional || ''),
      meta: a.metadata_atividades || {},
    })))

    // f_prod_colaboradores com equipe_id
    const { data: fpc } = await supabase
      .from('f_prod_colaboradores').select('colaborador_id, equipe_id').eq('registro_id', id)

    // Equipes do contrato
    const { data: eqs } = await supabase
      .from('d_equipes').select('tipo_equipe_id, id, equipe, d_tipo_equipe(id, descricao)')
      .eq('contrato_id', reg.contrato_id).eq('is_ativo', true)

    setEquipesContrato(eqs || [])

    const vistos = new Set()
    setTiposEquipe((eqs || [])
      .filter(e => { if (vistos.has(e.tipo_equipe_id)) return false; vistos.add(e.tipo_equipe_id); return true })
      .map(e => e.d_tipo_equipe).filter(Boolean))

    setEquipes((eqs || [])
      .filter(e => String(e.tipo_equipe_id) === String(reg.tipo_equipe_id))
      .map(e => ({ id: e.id, equipe: e.equipe })))

    // Atividades com dois níveis de filtro
    const { data: te } = await supabase
      .from('d_tipo_equipe').select('grupo_atividades').eq('id', reg.tipo_equipe_id).single()
    const grupoAtiv = te?.grupo_atividades
    const referenciaContrato = reg.d_contratos?.referencia_codigo
    const campos = 'id, codigo_op, DESCRICAO_BASICA_SISTEMA, unidade'

    const qJustif = supabase.from('d_atividades').select(campos)
      .eq('referencia_codigo', 'justificativa').order('DESCRICAO_BASICA_SISTEMA')

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
    const vistosAtiv = new Set()
    const unicos = todos.filter(a => { if (vistosAtiv.has(a.id)) return false; vistosAtiv.add(a.id); return true })
    unicos.sort((a, b) => a.DESCRICAO_BASICA_SISTEMA.localeCompare(b.DESCRICAO_BASICA_SISTEMA, 'pt-BR'))
    setAtividades(unicos)

    // Todos colaboradores do contrato
    const eqMap = {}
    const equipeIds = (eqs || []).map(e => { eqMap[e.id] = e.equipe; return e.id })

    if (equipeIds.length > 0) {
      const { data: colabs } = await supabase
        .from('d_colaboradores').select('id, matricula_nome, equipe_id')
        .in('equipe_id', equipeIds).eq('is_ativo', true).order('matricula_nome')

      const equipeIdSel = reg.equipe_id ? String(reg.equipe_id) : ''
      const sorted = [...(colabs || [])].sort((a, b) => {
        const aHome = equipeIdSel && String(a.equipe_id) === equipeIdSel
        const bHome = equipeIdSel && String(b.equipe_id) === equipeIdSel
        return aHome === bHome ? 0 : aHome ? -1 : 1
      })
      const todosColabs = sorted.map(c => ({ ...c, equipeNome: eqMap[c.equipe_id] || '' }))
      setColaboradores(todosColabs)

      // Reconstruir presença a partir do que foi salvo
      if (reg.d_contratos?.logica_contrato) {
        const adics = (fpc || []).map(entrada => {
          const colab = todosColabs.find(c => c.id === entrada.colaborador_id)
          if (!colab) return null
          const overrideEquipeId = String(entrada.equipe_id) !== String(colab.equipe_id)
            ? String(entrada.equipe_id) : null
          return { ...colab, overrideEquipeId }
        }).filter(Boolean)
        setAdicionados(adics)
      } else {
        const listaPres = []
        const externs = []
        ;(fpc || []).forEach(entrada => {
          const colab = todosColabs.find(c => c.id === entrada.colaborador_id)
          if (!colab) return
          if (String(colab.equipe_id) === equipeIdSel) {
            listaPres.push(colab)
          } else {
            externs.push(colab)
          }
        })
        setPresentesList(listaPres)
        setAdicionados(externs)
      }
    }

    setCarregando(false)
  }

  function handleEquipeChange(v) {
    setEquipeId(v)
    setAdicionados([])
    setSelectExternoId('')
    setPresentesList(colaboradores.filter(c => String(c.equipe_id) === String(v)))
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
    if (!dataProducao) erros.data = 'Obrigatório'
    if (!contrato?.logica_contrato && camposRegistro.some(c => c.config_campos.nome === 'equipe') && !equipeId) erros.equipe = 'Obrigatório'
    camposRegistro.forEach(c => {
      if (c.obrigatorio && !metaRegistro[c.config_campos.nome]) erros[`reg_${c.config_campos.nome}`] = 'Obrigatório'
    })
    itens.forEach((it, idx) => {
      if (!it.atividade_id) erros[`at_${idx}_atividade`] = 'Obrigatório'
      if (!it.quantidade || Number(it.quantidade) <= 0) erros[`at_${idx}_qtd`] = 'Informe a quantidade'
      camposAtividade.forEach(c => {
        if (c.obrigatorio && !it.meta[c.config_campos.nome]) erros[`at_${idx}_${c.config_campos.nome}`] = 'Obrigatório'
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
      await supabase.from('f_prod_registro').update({
        data_producao: dataProducao,
        equipe_id: contrato?.logica_contrato ? null : (equipeId ? Number(equipeId) : null),
        encarregado_id: encarregadoId ? Number(encarregadoId) : null,
        regional_id: regionalId ? Number(regionalId) : null,
        obra_id: obraId ? Number(obraId) : null,
        metadata_registro: metaRegistro,
      }).eq('id', id)

      await supabase.from('f_prod_atividades').delete().eq('registro_id', id)
      await supabase.from('f_prod_atividades').insert(itens.map(it => ({
        registro_id: Number(id),
        atividade_id: Number(it.atividade_id),
        quantidade: Number(it.quantidade),
        adicional: it.adicional ? Number(it.adicional) : 0,
        metadata_atividades: it.meta,
      })))

      await supabase.from('f_prod_colaboradores').delete().eq('registro_id', id)

      let presenca = []
      if (contrato?.logica_contrato) {
        presenca = adicionados.map(c => ({
          registro_id: Number(id),
          colaborador_id: Number(c.id),
          equipe_id: c.overrideEquipeId ? Number(c.overrideEquipeId) : (c.equipe_id ? Number(c.equipe_id) : null),
        }))
      } else {
        presenca = [
          ...presentesList.map(c => ({ registro_id: Number(id), colaborador_id: Number(c.id), equipe_id: c.equipe_id ? Number(c.equipe_id) : null })),
          ...adicionados.map(c => ({ registro_id: Number(id), colaborador_id: Number(c.id), equipe_id: c.equipe_id ? Number(c.equipe_id) : null })),
        ]
      }
      if (presenca.length > 0) await supabase.from('f_prod_colaboradores').insert(presenca)

      navegar('/producao')
    } catch (e) {
      setErro(e.message || 'Erro ao salvar.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <div className="loading" style={{ height: '60vh' }}><div className="spinner" /> Carregando registro...</div>
  }

  const logicaContrato = contrato?.logica_contrato
  const opcoesObras = obras.map(o => ({ valor: o.obra, label: o.localidade ? `${o.obra} — ${o.localidade}` : String(o.obra) }))
  const opcoesEquipes = equipes.map(e => ({ valor: e.id, label: e.equipe }))
  const opcoesEncarregados = colaboradores.map(c => ({
    valor: c.id, label: c.matricula_nome,
    sublabel: equipeId && String(c.equipe_id) !== String(equipeId) ? c.equipeNome : undefined,
  }))
  const opcoesRegionais = regionais.map(r => ({ valor: r.id, label: r.regional }))

  return (
    <div className="pagina">
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
        <h1 className="pagina-titulo">Editar Lançamento #{id}</h1>
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
                value={dataProducao} onChange={e => setDataProducao(e.target.value)} />
              {errosCampos.data && <div className="campo-erro-msg">{errosCampos.data}</div>}
            </div>

            <div className="campo-grupo">
              <label className="campo-label">Contrato</label>
              <input type="text" className="campo-input" value={contrato?.descricao || ''} readOnly
                style={{ background: '#f9fafb', cursor: 'not-allowed' }} />
            </div>

            <div className="campo-grupo">
              <label className="campo-label">Tipo de Equipe</label>
              <input type="text" className="campo-input"
                value={tiposEquipe.find(t => String(t.id) === tipoEquipeId)?.descricao || ''} readOnly
                style={{ background: '#f9fafb', cursor: 'not-allowed' }} />
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
                        onChange={v => setEncarregadoId(v)} placeholder="Pesquise o encarregado..." />
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
                      value={item.quantidade} onChange={e => alterarItemAtividade(idx, 'quantidade', e.target.value)} />
                    {errosCampos[`at_${idx}_qtd`] && <div className="campo-erro-msg">{errosCampos[`at_${idx}_qtd`]}</div>}
                  </div>
                  <div className="campo-grupo">
                    <label className="campo-label">Adicional (R$)</label>
                    <input type="number" step="0.01" min="0" className="campo-input"
                      value={item.adicional} onChange={e => alterarItemAtividade(idx, 'adicional', e.target.value)} />
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
          <button type="button" className="btn btn-secundario" onClick={adicionarAtividade}>+ Adicionar Atividade</button>
        </div>

        {/* Colaboradores */}
        {colaboradores.length > 0 && (logicaContrato || equipeId) && (
          <div className="card">
            <div className="card-titulo">Colaboradores Presentes</div>

            {logicaContrato ? (
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
            {salvando ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Salvando...</> : '✓ Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
