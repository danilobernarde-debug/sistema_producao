// Fotos do registro de produção -> SharePoint (via /api/anexos-upload).
import { supabase } from '../supabaseClient'

const LADO_MAX = 1600 // px do maior lado
const QUALIDADE = 0.8

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

// anexos do registro, com link de leitura de cada um: [{ id, nome, tipo, url, link, quando }]
export async function listarAnexosRegistro(registroId) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(`/api/anexos-fotos?registro=${registroId}`, {
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.erro || `Falha ao carregar as fotos (${r.status})`)
  }
  return r.json()
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
