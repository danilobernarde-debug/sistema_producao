import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import SelectPesquisavel from './SelectPesquisavel'

// 9 = dígito, a/A = letra, * = letra ou número, demais = literal
function aplicarMascara(entrada, mascara) {
  const chars = entrada.replace(/[^a-zA-Z0-9]/g, '')
  let resultado = ''
  let ci = 0
  for (let mi = 0; mi < mascara.length; mi++) {
    if (ci >= chars.length) break
    const m = mascara[mi]
    const c = chars[ci]
    if (m === '9') {
      if (/\d/.test(c)) { resultado += c; ci++ } else break
    } else if (m === 'a' || m === 'A') {
      if (/[a-zA-Z]/.test(c)) { resultado += c.toUpperCase(); ci++ } else break
    } else if (m === '*') {
      resultado += c.toUpperCase(); ci++
    } else {
      resultado += m
      if (c === m) ci++
    }
  }
  return resultado
}

function InputComMascara({ mascara, valor, onChange, className, placeholder, required }) {
  function handleChange(e) {
    onChange(aplicarMascara(e.target.value, mascara))
  }
  return (
    <input
      type="text"
      value={valor ?? ''}
      onChange={handleChange}
      className={className}
      placeholder={placeholder || mascara}
      required={required}
      maxLength={mascara.length}
    />
  )
}

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
  if (!cfg) return null
  const { nome, label, tipo, mascara, tabela_ref, coluna_valor, coluna_label, placeholder } = cfg
  const obrigatorio = campo.obrigatorio

  function emitir(v) {
    onChange(nome, v)
  }

  const classeInput = `campo-input${erro ? ' erro' : ''}`
  const classeSelect = `campo-select${erro ? ' erro' : ''}`

  if (tipo === 'select') {
    const opcoesList = (cfg.opcoes || '').split(',').map(o => o.trim()).filter(Boolean)
    return (
      <div className="campo-grupo">
        <label className="campo-label">
          {label} {obrigatorio && <span className="obrigatorio">*</span>}
        </label>
        <select
          className={classeSelect}
          value={valor ?? ''}
          onChange={e => emitir(e.target.value)}
          required={obrigatorio}
        >
          <option value="">Selecione...</option>
          {opcoesList.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
        {erro && <div className="campo-erro-msg">{erro}</div>}
      </div>
    )
  }

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

  // quando há máscara, usa sempre type=text (masks não funcionam com type=number/date)
  const tipoHtml = mascara ? 'text' : ({
    numero: 'number',
    decimal: 'number',
    data: 'date',
    hora: 'time',
    texto: 'text',
    alfanumerico: 'text',
  }[tipo] || 'text')

  const step = !mascara && tipo === 'decimal' ? '0.000001' : undefined

  return (
    <div className="campo-grupo">
      <label className="campo-label">
        {label} {obrigatorio && <span className="obrigatorio">*</span>}
      </label>
      {mascara ? (
        <InputComMascara
          mascara={mascara}
          valor={valor ?? ''}
          onChange={emitir}
          className={classeInput}
          placeholder={placeholder || mascara}
          required={obrigatorio}
        />
      ) : (
        <input
          type={tipoHtml}
          step={step}
          className={classeInput}
          value={valor ?? ''}
          onChange={e => emitir(e.target.value)}
          placeholder={placeholder || ''}
          required={obrigatorio}
        />
      )}
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
