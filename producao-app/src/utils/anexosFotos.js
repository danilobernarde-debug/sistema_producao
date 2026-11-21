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

export async function enviarFotoRegistro(registroId, blob) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(`/api/anexos-upload?registro=${registroId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'image/jpeg' },
    body: blob,
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.erro || `Falha ao enviar a foto (${r.status})`)
  }
  return r.json()
}
