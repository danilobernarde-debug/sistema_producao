// Anexos do registro de produção (fotos/PDF/planilhas) — guardados no SharePoint via /api/anexos-*.
import { supabase } from '../supabaseClient'

const LADO_MAX = 1600 // px do maior lado
const QUALIDADE = 0.8

// 'imagem' | 'pdf' | 'outro' — pelo tipo gravado ou, na falta, pela extensão
export function tipoAnexo(a) {
  const tipo = a.tipo || a.type || ''
  const nome = a.nome || a.name || ''
  if (tipo.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(nome)) return 'imagem'
  if (tipo === 'application/pdf' || /\.pdf$/i.test(nome)) return 'pdf'
  return 'outro'
}

// anexo do SharePoint = fullpath 'sharepoint/...' (a coluna url de f_prod_arquivos é gerada e só vale para o Storage antigo)
export const ehSharePoint = a => (a.fullpath || '').startsWith('sharepoint/')

export function dataHoraBr(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

export function tamanhoBr(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// reduz a foto do celular (vários MB) para ~300-600 KB em JPEG, que cabe no limite da função
export async function reduzirFoto(arquivo) {
  const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', QUALIDADE))
  if (!blob) throw new Error('Não foi possível processar a foto')
  return blob
}

async function chamarApi(caminho) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(caminho, { headers: { Authorization: `Bearer ${session?.access_token}` } })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.erro || `Falha ao carregar os anexos (${r.status})`)
  }
  return r.json()
}

// anexos do registro, com link de leitura de cada um: [{ id, nome, tipo, url, link, quando }]
export function listarAnexosRegistro(registroId) {
  return chamarApi(`/api/anexos-fotos?registro=${registroId}`)
}

// links de leitura do SharePoint valem ~1 h; guarda 40 min para não repetir a chamada ao navegar nas pastas
const cacheLinks = new Map() // id -> { url, ate }
const VALIDADE_LINK_MS = 40 * 60 * 1000

// Recebe linhas de f_prod_arquivos (id, url, fullpath...) e devolve Map id -> url de leitura.
// Anexos antigos usam a url do Storage; os do SharePoint pedem o link temporário à API (em lotes de 50).
export async function linksDosArquivos(linhas) {
  const mapa = new Map()
  const pedir = []
  for (const a of linhas) {
    if (!ehSharePoint(a)) { mapa.set(a.id, a.url); continue }
    const c = cacheLinks.get(a.id)
    if (c && c.ate > Date.now()) mapa.set(a.id, c.url)
    else pedir.push(a.id)
  }
  for (let i = 0; i < pedir.length; i += 50) {
    const lote = pedir.slice(i, i + 50)
    try {
      const resp = await chamarApi(`/api/anexos-fotos?arquivos=${lote.join(',')}`)
      for (const r of resp) {
        mapa.set(r.id, r.url)
        if (r.url) cacheLinks.set(r.id, { url: r.url, ate: Date.now() + VALIDADE_LINK_MS })
      }
    } catch { /* sem link: o anexo aparece como indisponível */ }
  }
  return mapa
}

export const MAX_ARQUIVO = 50 * 1024 * 1024
const MAX_ENVIO_DIRETO = 4 * 1024 * 1024 - 1024 // a função da Vercel aceita corpo de até ~4,5 MB
const TAM_PARTE = 320 * 1024 * 12 // partes do upload grande: múltiplo de 320 KiB (exigência do SharePoint)
const TIPOS_REDUZIVEIS = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']

async function chamarUpload(caminho, opcoes = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(caminho, { ...opcoes, headers: { Authorization: `Bearer ${session?.access_token}`, ...opcoes.headers } })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.erro || `Falha no envio (${r.status})`)
  }
  return r.json()
}

// Envia um anexo (foto, PDF, planilha...) do lançamento para o SharePoint e registra em f_prod_arquivos.
// Foto é reduzida para JPEG antes; arquivo acima de ~4 MB vai em partes, direto ao SharePoint.
export async function enviarAnexoRegistro(registroId, arquivo) {
  let corpo = arquivo
  let nome = arquivo.name || 'arquivo'
  let tipo = arquivo.type || 'application/octet-stream'
  if (TIPOS_REDUZIVEIS.includes(tipo)) {
    try {
      corpo = await reduzirFoto(arquivo)
      nome = nome.replace(/\.[^.]+$/, '') + '.jpg'
      tipo = 'image/jpeg'
    } catch { /* não deu para reduzir: envia o original */ }
  }
  if (corpo.size > MAX_ARQUIVO) throw new Error(`"${arquivo.name}" passa de ${MAX_ARQUIVO / 1024 / 1024} MB`)

  const base = `/api/anexos-upload?registro=${registroId}&nome=${encodeURIComponent(nome)}`
  if (corpo.size <= MAX_ENVIO_DIRETO) {
    return chamarUpload(base, { method: 'POST', headers: { 'Content-Type': tipo }, body: corpo })
  }

  const { uploadUrl } = await chamarUpload(`${base}&sessao=1`, { method: 'POST' })
  let item = null
  for (let de = 0; de < corpo.size; de += TAM_PARTE) {
    const parte = corpo.slice(de, Math.min(de + TAM_PARTE, corpo.size))
    // o uploadUrl já vem autorizado: não leva o token da Produção
    const r = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${de}-${de + parte.size - 1}/${corpo.size}` },
      body: parte,
    })
    if (!r.ok && r.status !== 202) throw new Error(`Falha ao enviar "${nome}" ao SharePoint (${r.status})`)
    if (r.status === 200 || r.status === 201) item = await r.json()
  }
  if (!item?.name) throw new Error(`O envio de "${nome}" não foi concluído`)
  return chamarUpload(`${base.replace(/nome=[^&]*/, `nome=${encodeURIComponent(item.name)}`)}&concluir=1&tipo=${encodeURIComponent(tipo)}`, { method: 'POST' })
}

// apaga o anexo (arquivo no SharePoint + linha em f_prod_arquivos)
export function excluirAnexo(arquivoId) {
  return chamarUpload(`/api/anexos-upload?arquivo=${arquivoId}`, { method: 'DELETE' })
}
