import * as XLSX from 'xlsx'

export const CHUNK = 500

export function expandirMetadata(rows) {
  return rows.map(row => {
    const { metadata_registro, metadata_atividades, ...resto } = row
    const metaReg = metadata_registro  && typeof metadata_registro  === 'object' ? metadata_registro  : {}
    const metaAct = metadata_atividades && typeof metadata_atividades === 'object' ? metadata_atividades : {}
    return { ...resto, ...metaReg, ...metaAct }
  })
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

function isoToExcelSerial(str) {
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - EXCEL_EPOCH) / 86400000
}

export function exportarXLSX(dados, colunas, nomeArquivo) {
  const dateCols = new Set()
  for (const col of colunas) {
    for (const row of dados.slice(0, 20)) {
      if (typeof row[col] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row[col])) {
        dateCols.add(col); break
      }
    }
  }

  const linhas = dados.map(row => {
    const obj = {}
    colunas.forEach(col => {
      const val = row[col] ?? ''
      if (dateCols.has(col) && typeof val === 'string') {
        const serial = isoToExcelSerial(val)
        obj[col] = serial !== null ? serial : val
      } else {
        obj[col] = val
      }
    })
    return obj
  })

  const ws = XLSX.utils.json_to_sheet(linhas)

  if (ws['!ref']) {
    const range = XLSX.utils.decode_range(ws['!ref'])
    const dateColIdx = []
    for (let C = range.s.c; C <= range.e.c; C++) {
      const h = ws[XLSX.utils.encode_cell({ r: 0, c: C })]
      if (h && dateCols.has(String(h.v))) dateColIdx.push(C)
    }
    for (let R = 1; R <= range.e.r; R++) {
      for (const C of dateColIdx) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
        if (cell && cell.t === 'n') cell.z = 'dd/mm/yyyy'
      }
    }
  }

  ws['!cols'] = colunas.map(col => {
    const maxLen = Math.max(
      col.length,
      ...dados.slice(0, 200).map(row => String(row[col] ?? '').length)
    )
    return { wch: Math.min(maxLen + 2, 60) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  XLSX.writeFile(wb, `${nomeArquivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
