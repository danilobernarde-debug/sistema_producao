import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import * as XLSX from 'xlsx'

function excelParaData(serial) {
  const d = new Date(Math.round((Number(serial) - 25569) * 86400000))
  return d.toISOString().split('T')[0]
}

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtData(d) {
  if (!d) return '—'
  const [ano, mes, dia] = d.split('-')
  return `${dia}/${mes}/${ano}`
}

function inicioMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

async function lerMetas(dataInicio, dataFim) {
  const resp = await fetch('/Metas_por_tipo_equipe_id.xlsm')
  const buffer = await resp.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets['Metas']
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
  const mapa = {}
  rows.forEach(row => {
    const id   = row['tipo_equipe_id']
    const data = row['data']
    const meta = row[' meta ']
    if (!id || !data || meta == null || Number(meta) === 0) return
    const dataStr = excelParaData(Number(data))
    if (dataStr < dataInicio || dataStr > dataFim) return
    mapa[id] = (mapa[id] || 0) + Number(meta)
  })
  return mapa
}

function corPerc(perc) {
  if (perc === null) return { texto: '#6b7280', fundo: '#f9fafb' }
  if (perc >= 100)  return { texto: '#16a34a', fundo: '#f0fdf4' }
  if (perc >= 80)   return { texto: '#d97706', fundo: '#fffbeb' }
  return                   { texto: '#dc2626', fundo: '#fef2f2' }
}

// ─── Gerador HTML ─────────────────────────────────────────────────────────────
function gerarHtml({ grupos, dataInicio, dataFim, diasCorridos }) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

  const detalhesSecs = []
  let idx = 0

  const secoes = grupos.map(({ contrato, tipos }) => {
    const tiposHtml = tipos.map(({ tipoNome, totalTipo, meta, perc, equipes }) => {
      const cor = corPerc(perc)
      const percTxt = perc !== null ? `${perc.toFixed(1)}%` : '—'

      const linhas = equipes.map(({ equipeNome, producaoDia, producaoTotal, meta: mE, percEquipe, diasTrabalhados, producaoPorDia, notasDia }) => {
        const corE = corPerc(percEquipe)
        const percTxtE = percEquipe !== null ? `${percEquipe.toFixed(1)}%` : '—'
        const id = `d${idx++}`

        // gerar seção de detalhe
        const dias = [...new Set([...Object.keys(producaoPorDia || {}), ...Object.keys(notasDia || {})])]
          .sort()
          .map(data => ({ data, valor: (producaoPorDia || {})[data] || 0, nota: (notasDia || {})[data] || '' }))
        const total = dias.reduce((s, d) => s + d.valor, 0)
        const percPartDet = mE > 0 ? ` &nbsp;·&nbsp; Meta R$ ${fmt(mE)} &nbsp;·&nbsp; <strong>${(total / mE * 100).toFixed(1)}%</strong>` : ''
        const detRows = dias.map(({ data, valor, nota }) => {
          const notaHtml = nota
            ? `<span style="padding:3px 7px;background:#fffbeb;border-left:3px solid #d97706;border-radius:0 4px 4px 0;display:inline-block">${escH(nota)}</span>`
            : `<span style="color:#d1d5db">—</span>`
          return `<tr>
            <td class="det-td">${fmtData(data)}</td>
            <td class="det-td" style="text-align:right">R$ ${fmt(valor)}</td>
            <td class="det-td-nota">${notaHtml}</td>
          </tr>`
        }).join('')

        detalhesSecs.push(`
        <div id="${id}">
          <div class="header">
            <a href="#topo" class="det-back">&#8592; Voltar ao relatório</a>
            <h1 style="margin-bottom:4px">${escH(equipeNome)}</h1>
            <p style="font-size:13px;opacity:.75">${escH(contrato)} &nbsp;·&nbsp; ${escH(tipoNome)}</p>
          </div>
          <div class="container">
            <div class="det-card">
              <table class="det-table">
                <thead><tr>
                  <th class="det-th" style="text-align:left">Data</th>
                  <th class="det-th" style="text-align:right">Produção</th>
                  <th class="det-th">Observações / Justificativas</th>
                </tr></thead>
                <tbody>${detRows}</tbody>
              </table>
              <div class="det-total"><span><strong>Total período:</strong> R$ ${fmt(total)}${percPartDet}</span></div>
            </div>
          </div>
        </div>`)

        return `<tr style="background:${corE.fundo};color:${corE.texto}">
          <td class="td-eq" style="color:${corE.texto}"><a href="#${id}" style="color:inherit;text-decoration:none;font-weight:600">${escH(equipeNome)} <span style="font-size:10px;opacity:.45">&#8599;</span></a></td>
          <td class="td-r" style="color:${corE.texto}">R$ ${fmt(producaoDia)}</td>
          <td class="td-r" style="color:${corE.texto}">R$ ${fmt(producaoTotal)}</td>
          <td class="td-r" style="color:${corE.texto}">R$ ${fmt(mE)}</td>
          <td class="td-c" style="color:${corE.texto};font-weight:700">${percTxtE}</td>
          <td class="td-c" style="color:${corE.texto}">${diasCorridos}</td>
          <td class="td-c" style="color:${corE.texto}">${diasTrabalhados}</td>
        </tr>`
      }).join('')

      const tabelaHtml = `
      <div style="overflow-x:auto;margin-bottom:12px">
        <table class="tabela-eq">
          <thead><tr>
            <th class="th-eq">Equipe</th>
            <th class="th-r">Prod. dia (${fmtData(dataFim)})</th>
            <th class="th-r">Total período</th>
            <th class="th-r">Meta Período</th>
            <th class="th-c">%</th>
            <th class="th-c">Dias corridos</th>
            <th class="th-c">Dias trabalhados</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`

      const notasHtml = equipes
        .filter(e => e.notas.length > 0)
        .map(({ equipeNome, notas }) => {
          const itens = notas.map(n =>
            `<li><span class="dtag">${fmtData(n.data)}</span>${escH(n.texto || '—')}</li>`
          ).join('')
          return `<div class="nota-equipe"><span class="nota-eq-nome">${escH(equipeNome)}</span><ul class="lista">${itens}</ul></div>`
        }).join('')

      return `
      <div class="tipo-card">
        <div class="tipo-header">
          <span class="tipo-titulo">${escH(tipoNome)}</span>
          <span class="tipo-resumo">Total R$ ${fmt(totalTipo)}${meta > 0 ? ` &nbsp;·&nbsp; Meta R$ ${fmt(meta)} &nbsp;·&nbsp; <span style="color:${cor.texto};font-weight:700">${percTxt}</span>` : ''}</span>
        </div>
        ${tabelaHtml}
        ${notasHtml ? `<div class="notas-section">${notasHtml}</div>` : ''}
      </div>`
    }).join('')

    return `
    <div class="contrato-bloco">
      <div class="contrato-header">${escH(contrato)}</div>
      ${tiposHtml}
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Relatório de Produção ${fmtData(dataInicio)} — ${fmtData(dataFim)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:#f1f5f9;color:#1e2a3b}
  .header{background:linear-gradient(135deg,#1e2a3b,#1a56db);color:#fff;padding:28px 32px}
  .header h1{font-size:20px;font-weight:700;margin-bottom:4px}
  .header p{font-size:13px;opacity:.75}
  .container{max-width:900px;margin:0 auto;padding:24px 20px}
  .legenda{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-bottom:20px;align-items:center}
  .legenda strong{color:#374151}
  .dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px}
  .contrato-bloco{margin-bottom:24px;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .contrato-header{background:#1e2a3b;color:#fff;font-size:14px;font-weight:700;padding:11px 16px;letter-spacing:.03em}
  .tipo-card{background:#f8fafc;border-bottom:2px solid #e2e8f0;padding:12px 16px}
  .tipo-card:last-child{border-bottom:none}
  .tipo-header{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #dbeafe}
  .tipo-titulo{font-size:14px;font-weight:700;color:#1a56db}
  .tipo-resumo{font-size:12px;color:#6b7280}
  .tabela-eq{width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:6px;overflow:hidden}
  .tabela-eq thead{background:#f1f5f9}
  .th-eq{text-align:left;padding:7px 10px;font-weight:600;color:#374151;border-bottom:2px solid #e2e8f0;white-space:nowrap}
  .th-r{text-align:right;padding:7px 10px;font-weight:600;color:#374151;border-bottom:2px solid #e2e8f0;white-space:nowrap}
  .th-c{text-align:center;padding:7px 10px;font-weight:600;color:#374151;border-bottom:2px solid #e2e8f0;white-space:nowrap}
  .td-eq{padding:7px 10px;font-weight:600;border-bottom:1px solid #f3f4f6;white-space:nowrap}
  .td-r{text-align:right;padding:7px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap}
  .td-c{text-align:center;padding:7px 10px;border-bottom:1px solid #f3f4f6}
  .notas-section{display:flex;flex-direction:column;gap:8px;margin-top:4px}
  .nota-equipe{background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px}
  .nota-eq-nome{display:inline-block;font-size:11px;font-weight:700;color:#374151;margin-bottom:6px;background:#f1f5f9;padding:2px 8px;border-radius:10px}
  .lista{list-style:none;display:flex;flex-direction:column;gap:3px;margin-bottom:4px}
  .lista li{font-size:11px;color:#4b5563;padding:4px 8px;background:#fffbeb;border-left:3px solid #d97706;border-radius:0 4px 4px 0}
  .dtag{font-size:10px;font-weight:700;color:#1a56db;margin-right:5px}
  .footer{text-align:center;font-size:12px;color:#94a3b8;padding:20px}
  .det-back{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.15);color:#fff;text-decoration:none;padding:7px 14px;border-radius:6px;font-size:13px;margin-bottom:14px}
  .det-card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:16px}
  .det-table{width:100%;border-collapse:collapse;font-size:12px}
  .det-table thead{background:#f1f5f9}
  .det-th{padding:8px 12px;font-weight:600;color:#374151;border-bottom:2px solid #e2e8f0;white-space:nowrap}
  .det-td{padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#1e2a3b;white-space:nowrap}
  .det-td-nota{padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#4b5563;max-width:400px}
  .det-total{padding:12px 16px;background:#f8fafc;border-top:2px solid #e2e8f0;font-size:13px;display:flex;gap:16px;flex-wrap:wrap}
  @media(max-width:700px){.header{padding:20px}.tipo-header{flex-direction:column}}
  @media print{
    body{background:#fff}
    .container{padding:0}
    .contrato-bloco{box-shadow:none;break-inside:avoid}
    .tipo-card{break-inside:avoid}
    .nota-equipe{break-inside:avoid}
    .footer{display:none}
  }
</style>
</head>
<body>

<div id="topo">
  <div class="header">
    <h1>Relatório de Produção — Meta x Realizado</h1>
    <p>Período: ${fmtData(dataInicio)} a ${fmtData(dataFim)} &nbsp;·&nbsp; Gerado em ${hoje}</p>
  </div>
  <div class="container">
    <div class="legenda">
      <strong>Atingimento da meta:</strong>
      <span><span class="dot" style="background:#16a34a"></span>≥ 100% atingida</span>
      <span><span class="dot" style="background:#d97706"></span>80–99% próximo</span>
      <span><span class="dot" style="background:#dc2626"></span>&lt; 80% abaixo</span>
      <span style="margin-left:auto;font-size:11px;color:#9ca3af;font-style:italic">Toque no nome da equipe para ver produção diária &#8599;</span>
    </div>
    ${secoes}
  </div>
  <div class="footer">Sistema de Produção — Rede Forte &nbsp;·&nbsp; ${hoje}</div>
</div>

${detalhesSecs.join('\n')}

</body>
</html>`
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function RelatorioEquipes() {
  const [contratos, setContratos]     = useState([])
  const [tiposEquipe, setTiposEquipe] = useState([])
  const [equipes, setEquipes]         = useState([])
  const [registros, setRegistros]     = useState([])
  const [viewRows, setViewRows]       = useState([])
  const [metas, setMetas]             = useState({})
  const [carregando, setCarregando]   = useState(false)
  const [gerando, setGerando]         = useState(false)
  const [erroMeta, setErroMeta]       = useState('')

  const [dataInicio, setDataInicio] = useState(inicioMes())
  const [dataFim, setDataFim]       = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao')
      .then(({ data }) => setContratos(data || []))
    supabase.from('d_tipo_equipe').select('id, descricao').order('descricao')
      .then(({ data }) => setTiposEquipe(data || []))
    supabase.from('d_equipes').select('id, sistema_producao').order('sistema_producao')
      .then(({ data }) => setEquipes(data || []))
  }, [])

  useEffect(() => { if (dataInicio && dataFim) buscarDados() }, [dataInicio, dataFim])

  async function buscarDados() {
    setCarregando(true)
    const [resReg, resView, resMetas] = await Promise.all([
      supabase.from('f_prod_registro')
        .select('id, data_producao, contrato_id, tipo_equipe_id, equipe_id, f_prod_atividades(upe, preco_upe, quantidade)')
        .gte('data_producao', dataInicio)
        .lte('data_producao', dataFim)
        .limit(100000),
      supabase.from('view_powerbi_producao')
        .select('registro_id, data_producao, desc_equipe, desc_atividade, justificativa, metadata_registro')
        .gte('data_producao', dataInicio)
        .lte('data_producao', dataFim)
        .limit(100000),
      lerMetas(dataInicio, dataFim).catch(() => {
        setErroMeta('Não foi possível carregar o arquivo de metas.')
        return {}
      }),
    ])
setRegistros(resReg.data || [])
    setViewRows(resView.data || [])
    setMetas(resMetas)
    setCarregando(false)
  }

  const grupos = useMemo(() => {
    const regById = {}
    registros.forEach(r => { regById[r.id] = r })

    function valorReg(r) {
      return (r.f_prod_atividades || []).reduce(
        (s, a) => s + Number(a.upe || 0) * Number(a.preco_upe || 0) * Number(a.quantidade || 0), 0
      )
    }

    // equipe name por registro_id: prioritiza a view, fallback direto em d_equipes
    const equipeById = {}
    equipes.forEach(e => { equipeById[e.id] = e.sistema_producao })

    const equipeByReg = {}
    viewRows.forEach(v => {
      if (v.desc_equipe && !equipeByReg[v.registro_id]) equipeByReg[v.registro_id] = v.desc_equipe
    })
    // fallback para registros que não apareceram na view (ex: produção zero sem atividades)
    registros.forEach(r => {
      if (!equipeByReg[r.id] && r.equipe_id) equipeByReg[r.id] = equipeById[r.equipe_id] || null
    })

    // mapeamento registro_id -> { cid, tid, equipeNome } para TODOS os registros (inclusive produção zero)
    const equipeParaReg = {}
    Object.values(regById).forEach(r => {
      const enome = equipeByReg[r.id]
      if (!enome) return
      equipeParaReg[r.id] = { cid: String(r.contrato_id), tid: String(r.tipo_equipe_id), enome }
    })

    // justificativas por chave cid|tid|equipeNome (inclui registros sem produção)
    const justByEquipe = {}
    viewRows.filter(v => v.justificativa).forEach(v => {
      const eq = equipeParaReg[v.registro_id]
      if (!eq) return
      const k = `${eq.cid}|${eq.tid}|${eq.enome}`
      ;(justByEquipe[k] = justByEquipe[k] || []).push({ data: v.data_producao, texto: v.justificativa })
    })

    // observações por chave cid|tid|equipeNome (uma por registro_id)
    const obsVistos = new Set()
    const obsByEquipe = {}
    viewRows.forEach(v => {
      if (obsVistos.has(v.registro_id)) return
      const obs = v.metadata_registro?.observacoes
      if (!obs || !String(obs).trim()) return
      obsVistos.add(v.registro_id)
      const eq = equipeParaReg[v.registro_id]
      if (!eq) return
      const k = `${eq.cid}|${eq.tid}|${eq.enome}`
      ;(obsByEquipe[k] = obsByEquipe[k] || []).push({ data: v.data_producao, texto: String(obs).trim() })
    })

    // agrupar registros: contrato → tipo → equipe → [registros com produção]
    const tree = {}
    registros.forEach(r => {
      const v = valorReg(r)
      if (v === 0) return
      const cid   = String(r.contrato_id)
      const tid   = String(r.tipo_equipe_id)
      const enome = equipeByReg[r.id]
      if (!enome) return
      if (!tree[cid]) tree[cid] = {}
      if (!tree[cid][tid]) tree[cid][tid] = {}
      if (!tree[cid][tid][enome]) tree[cid][tid][enome] = []
      tree[cid][tid][enome].push(r)
    })

    // incluir equipes que só têm justificativas/observações (sem produção no período)
    const allKeys = new Set([...Object.keys(justByEquipe), ...Object.keys(obsByEquipe)])
    allKeys.forEach(k => {
      const i1 = k.indexOf('|')
      const i2 = k.indexOf('|', i1 + 1)
      const cid   = k.slice(0, i1)
      const tid   = k.slice(i1 + 1, i2)
      const enome = k.slice(i2 + 1)
      if (!tree[cid]) tree[cid] = {}
      if (!tree[cid][tid]) tree[cid][tid] = {}
      if (!tree[cid][tid][enome]) tree[cid][tid][enome] = []
    })

    return Object.entries(tree)
      .sort(([a], [b]) => {
        const na = contratos.find(c => String(c.id) === a)?.descricao || ''
        const nb = contratos.find(c => String(c.id) === b)?.descricao || ''
        return na.localeCompare(nb)
      })
      .map(([cid, tiposObj]) => {
        const contrato = contratos.find(c => String(c.id) === cid)?.descricao || `Contrato ${cid}`

        const tipos = Object.entries(tiposObj)
          .map(([tid, equipesObj]) => {
            const tipoNome = tiposEquipe.find(t => String(t.id) === tid)?.descricao || `Tipo ${tid}`

            const metaPorEquipe = metas[tid] || 0
            const nEquipes = Object.keys(equipesObj).length
            const metaTipo = metaPorEquipe * nEquipes
            const totalTipo = Object.values(equipesObj).reduce((s, regs) =>
              s + regs.reduce((s2, r) => s2 + valorReg(r), 0), 0)
            const meta = metaTipo
            const perc = metaTipo > 0 ? (totalTipo / metaTipo) * 100 : null

            const equipes = Object.entries(equipesObj)
              .map(([equipeNome, regs]) => {
                const dias = [...new Set(regs.map(r => r.data_producao))].sort()
                const diasTrabalhados = dias.length

                const producaoTotal = regs.reduce((s, r) => s + valorReg(r), 0)
                const producaoDia   = regs.filter(r => r.data_producao === dataFim)
                                         .reduce((s, r) => s + valorReg(r), 0)

                // dataDia ainda usado para filtrar justificativas/observações
                const dataDia = dias.at(-1) || null

                const percEquipe = metaPorEquipe > 0 ? (producaoTotal / metaPorEquipe) * 100 : null

                const k = `${cid}|${tid}|${equipeNome}`
                const notasRaw = [
                  ...(justByEquipe[k] || []).filter(j => j.data === dataFim),
                  ...(obsByEquipe[k]  || []).filter(o => o.data === dataFim),
                ]
                // agrupar por data e concatenar textos
                const notasPorData = {}
                notasRaw.forEach(({ data, texto }) => {
                  if (!notasPorData[data]) notasPorData[data] = []
                  if (texto && !notasPorData[data].includes(texto)) notasPorData[data].push(texto)
                })
                const notas = Object.entries(notasPorData)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([data, textos]) => ({ data, texto: textos.join(' · ') }))

                const producaoPorDia = {}
                regs.forEach(r => { producaoPorDia[r.data_producao] = (producaoPorDia[r.data_producao] || 0) + valorReg(r) })

                // notas de todos os dias do período (para a página de detalhe)
                const todasNotasRaw = [
                  ...(justByEquipe[k] || []),
                  ...(obsByEquipe[k]  || []),
                ]
                const _notasPorDia = {}
                todasNotasRaw.forEach(({ data, texto }) => {
                  if (!_notasPorDia[data]) _notasPorDia[data] = []
                  if (texto && !_notasPorDia[data].includes(texto)) _notasPorDia[data].push(texto)
                })
                const notasDia = {}
                Object.entries(_notasPorDia).forEach(([data, textos]) => { notasDia[data] = textos.join(' · ') })

                return { equipeNome, producaoDia, dataDia, producaoTotal, meta: metaPorEquipe, percEquipe, diasTrabalhados, notas, producaoPorDia, notasDia }
              })
              .sort((a, b) => a.equipeNome.localeCompare(b.equipeNome))

            return { tipoNome, totalTipo, meta, perc, equipes }
          })
          .sort((a, b) => a.tipoNome.localeCompare(b.tipoNome))

        return { contratoId: cid, contrato, tipos }
      })
  }, [registros, viewRows, metas, contratos, tiposEquipe, equipes, dataFim])

  function baixarHtml() {
    setGerando(true)
    const html = gerarHtml({ grupos, dataInicio, dataFim, diasCorridos })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `relatorio-producao-${dataInicio}-${dataFim}.html`
    a.click()
    URL.revokeObjectURL(url)
    setGerando(false)
  }

  function abrirPdf() {
    const html = gerarHtml({ grupos, dataInicio, dataFim, diasCorridos })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url, '_blank')
    win.addEventListener('load', () => {
      win.focus()
      win.print()
      URL.revokeObjectURL(url)
    })
  }

  const totalTipos = grupos.reduce((s, g) => s + g.tipos.reduce((s2, t) => s2 + t.equipes.length, 0), 0)
  const diasCorridos = dataInicio && dataFim
    ? Math.round((new Date(dataFim) - new Date(dataInicio)) / 86400000) + 1
    : 0

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Relatório de Produção</h1>
        {carregando && <span style={{ fontSize: 13, color: '#9ca3af' }}>Carregando...</span>}
      </div>

      {erroMeta && (
        <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 6,
          padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{erroMeta}</div>
      )}

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Data início</label>
            <input type="date" className="campo-input" value={dataInicio}
              onChange={e => setDataInicio(e.target.value)} style={{ width: 160 }} />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Data fim</label>
            <input type="date" className="campo-input" value={dataFim}
              onChange={e => setDataFim(e.target.value)} style={{ width: 160 }} />
          </div>
          <button className="btn btn-primario" onClick={baixarHtml}
            disabled={gerando || carregando || totalTipos === 0}
            style={{ alignSelf: 'flex-end' }}>
            {gerando ? 'Gerando...' : '⬇ Baixar HTML'}
          </button>
          <button className="btn btn-secundario" onClick={abrirPdf}
            disabled={carregando || totalTipos === 0}
            style={{ alignSelf: 'flex-end' }}>
            🖨 Salvar PDF
          </button>
        </div>
      </div>

      {/* Prévia */}
      {!carregando && grupos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 40 }}>
          Nenhum dado de produção encontrado no período.
        </div>
      ) : (
        grupos.map(({ contratoId, contrato, tipos }) => (
          <div key={contratoId} className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
            {/* Cabeçalho contrato */}
            <div style={{ background: '#1e2a3b', color: 'white', fontWeight: 700,
              fontSize: 14, padding: '10px 16px', letterSpacing: '.02em' }}>
              {contrato}
            </div>

            {tipos.map(({ tipoNome, totalTipo, meta, perc, equipes }) => {
              const cor = corPerc(perc)
              const percTxt = perc !== null ? `${perc.toFixed(1)}%` : '—'
              const equipesComNotas = equipes.filter(e => e.notas.length > 0)
              return (
                <div key={tipoNome} style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', padding: '12px 16px' }}>
                  {/* Cabeçalho tipo */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 6, marginBottom: 10, paddingBottom: 8, borderBottom: '2px solid #dbeafe' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1a56db' }}>{tipoNome}</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      Total R$ {fmt(totalTipo)}
                      {meta > 0 && <> &nbsp;·&nbsp; Meta R$ {fmt(meta)} &nbsp;·&nbsp;
                        <span style={{ fontWeight: 700, color: cor.texto }}>{percTxt}</span>
                      </>}
                    </span>
                  </div>

                  {/* Tabela de métricas */}
                  <div style={{ overflowX: 'auto', marginBottom: equipesComNotas.length ? 12 : 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: 'white', borderRadius: 6 }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          {['Equipe', `Prod. dia (${fmtData(dataFim)})`,'Total período','Meta Período','%','Dias corridos','Dias trabalhados'].map((h, i) => (
                            <th key={h} style={{ padding: '7px 10px', fontWeight: 600, color: '#374151',
                              borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: 11,
                              textAlign: i === 0 ? 'left' : i < 4 ? 'right' : 'center' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {equipes.map(({ equipeNome, producaoDia, dataDia, producaoTotal, meta: mE, percEquipe, diasTrabalhados }) => {
                          const corE = corPerc(percEquipe)
                          const percTxtE = percEquipe !== null ? `${percEquipe.toFixed(1)}%` : '—'
                          return (
                            <tr key={equipeNome} style={{ borderBottom: '1px solid #f3f4f6', background: corE.fundo }}>
                              <td style={{ padding: '7px 10px', fontWeight: 600, color: corE.texto, whiteSpace: 'nowrap' }}>{equipeNome}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: corE.texto }}>
                                R$ {fmt(producaoDia)}
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: corE.texto }}>R$ {fmt(producaoTotal)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: corE.texto }}>R$ {fmt(mE)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'center', color: corE.texto, fontWeight: 700 }}>{percTxtE}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'center', color: corE.texto }}>{diasCorridos}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'center', color: corE.texto }}>{diasTrabalhados}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Justificativas e observações por equipe */}
                  {equipesComNotas.map(({ equipeNome, notas }) => (
                    <div key={equipeNome} style={{ background: 'white', border: '1px solid #e5e7eb',
                      borderRadius: 6, padding: '8px 12px', marginBottom: 6 }}>
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#374151',
                        background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, marginBottom: 6 }}>
                        {equipeNome}
                      </span>
                      {notas.map((n, i) => (
                        <div key={i} style={{ fontSize: 11, padding: '3px 7px', background: '#fffbeb',
                          borderLeft: '3px solid #d97706', borderRadius: '0 4px 4px 0', marginBottom: 2 }}>
                          <span style={{ fontWeight: 700, color: '#1a56db', marginRight: 5 }}>{fmtData(n.data)}</span>
                          <span style={{ color: '#4b5563' }}>{n.texto}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
