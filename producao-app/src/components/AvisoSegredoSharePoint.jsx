import { useAuth } from '../hooks/useAuth'

// O segredo do app Azure "Sistema Produção Anexos" (login do sistema no SharePoint) vence nesta data.
// Ao renovar: criar novo segredo no Entra, atualizar MS_CLIENT_SECRET na Vercel (+ redeploy) e trocar a data abaixo.
const SEGREDO_EXPIRA = '2028-11-20'
const AVISAR_DIAS = 30

export default function AvisoSegredoSharePoint() {
  const { perfil } = useAuth()
  if (!['Super Admin', 'Admin'].includes(perfil?.d_auth_roles?.name)) return null

  const dias = Math.ceil((new Date(`${SEGREDO_EXPIRA}T23:59:59-03:00`) - Date.now()) / 86400000)
  if (dias > AVISAR_DIAS) return null

  const vencido = dias < 0
  return (
    <div style={{
      background: vencido ? '#fef2f2' : '#fffbeb', border: `1px solid ${vencido ? '#fca5a5' : '#fcd34d'}`,
      color: vencido ? '#991b1b' : '#92400e', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14,
    }}>
      <strong>⚠️ {vencido ? 'O segredo do SharePoint venceu' : `O segredo do SharePoint vence em ${dias} dia(s)`}.</strong>{' '}
      {vencido ? 'Os anexos novos e o carregamento dos anexos do SharePoint estão parados. ' : ''}
      Renove em Entra → Registros de aplicativo → Sistema Produção Anexos → Certificados e segredos,
      atualize MS_CLIENT_SECRET na Vercel (com redeploy) e avise o Danilo.
    </div>
  )
}
