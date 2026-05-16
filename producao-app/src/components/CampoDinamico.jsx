import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import SelectPesquisavel from './SelectPesquisavel'

/**
 * Renderiza um campo do formulário baseado no tipo definido em config_campos.
 * Props:
 *   campo      — objeto de config_campos_contrato com config_campos embutido
 *   valor      — valor atual do campo
 *   onChange   — função(nome, valor) chamada ao mudar
 *   erro       — mensagem de erro (opcional)
 */
export default function CampoDinamico({ campo, valor, onChange, erro }) {
  const cfg = campo.config_campos
  const { nome, label, tipo, mascara, tabela_ref, coluna_valor, coluna_label, placeholder } = cfg
  const obrigatorio = campo.obrigatorio

  function emitir(v) {
    onChange(nome, v)
  }

  const classeInput = `campo-input${erro ? ' erro' : ''}`
  const classeSelect = `campo-select${erro ? ' erro' : ''}`

  if (tipo === 'dropdown') {
    return (
      <CampoDropdown
        nome={nome}
        label={label}
        tabela={tabela_ref}
        colunaValor={coluna_valor}
        colunaLabel={coluna_label}
        valor={valor ?? ''}
        obrigatorio={obrigatorio}
        classeSelect={classeSelect}
        erro={erro}
        onChange={emitir}
        placeholder={placeholder}
      />
    )
  }

  if (tipo === 'textarea') {
    return (
      <div className="campo-grupo">
        <label className="campo-label">
          {label} {obrigatorio && <span className="obrigatorio">*</span>}
        </label>
        <textarea
          className={`campo-textarea${erro ? ' erro' : ''}`}
          value={valor ?? ''}
          onChange={e => emitir(e.target.value)}
          placeholder={placeholder || ''}
          required={obrigatorio}
        />
        {erro && <div className="campo-erro-msg">{erro}</div>}
      </div>
    )
  }

  if (tipo === 'checkbox') {
    return (
      <div className="campo-grupo">
        <label className="checkbox-grupo">
          <input
            type="checkbox"
            checked={!!valor}
            onChange={e => emitir(e.target.checked)}
          />
          {label}
        </label>
        {erro && <div className="campo-erro-msg">{erro}</div>}
      </div>
    )
  }

  const tipoHtml = {
    numero: 'number',
    decimal: 'number',
    data: 'date',
    hora: 'time',
    texto: 'text',
    alfanumerico: 'text',
  }[tipo] || 'text'

  const step = tipo === 'decimal' ? '0.000001' : undefined

  return (
    <div className="campo-grupo">
      <label className="campo-label">
        {label} {obrigatorio && <span className="obrigatorio">*</span>}
      </label>
      <input
        type={tipoHtml}
        step={step}
        className={classeInput}
        value={valor ?? ''}
        onChange={e => emitir(e.target.value)}
        placeholder={placeholder || mascara || ''}
        required={obrigatorio}
      />
      {erro && <div className="campo-erro-msg">{erro}</div>}
    </div>
  )
}

function CampoDropdown({ label, tabela, colunaValor, colunaLabel, valor, obrigatorio, erro, onChange, placeholder }) {
  const [opcoes, setOpcoes] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!tabela) return
    supabase
      .from(tabela)
      .select(`${colunaValor}, ${colunaLabel}`)
      .order(colunaLabel)
      .then(({ data }) => {
        setOpcoes((data || []).map(op => ({ valor: op[colunaValor], label: op[colunaLabel] })))
        setCarregando(false)
      })
  }, [tabela, colunaValor, colunaLabel])

  return (
    <div className="campo-grupo">
      <label className="campo-label">
        {label} {obrigatorio && <span className="obrigatorio">*</span>}
      </label>
      <SelectPesquisavel
        opcoes={opcoes}
        valor={valor ?? ''}
        onChange={onChange}
        placeholder={carregando ? 'Carregando...' : (placeholder || `Pesquise ${label}...`)}
        disabled={carregando}
        erro={erro}
      />
    </div>
  )
}
