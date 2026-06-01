import { useState, useRef, useEffect } from 'react'

export default function BotaoCoordsMap({ lat, lng, label }) {
  const [local, setLocal] = useState('')
  const timerRef = useRef(null)

  function buscar() {
    if (!lat || !lng) return
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
      headers: { 'Accept-Language': 'pt-BR' }
    })
      .then(r => r.json())
      .then(d => {
        const addr = d.address || {}
        const cidade = addr.city || addr.town || addr.village || addr.municipality || ''
        const estado = addr.state || ''
        setLocal([cidade, estado].filter(Boolean).join(' / '))
      })
      .catch(() => {})
  }

  // busca 1s após coordenadas pararem de mudar (cobre saída do campo)
  useEffect(() => {
    setLocal('')
    if (!lat || !lng) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(buscar, 1000)
    return () => clearTimeout(timerRef.current)
  }, [lat, lng])

  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-secundario"
      style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      onMouseEnter={buscar}
    >
      📍 {local ? `${local} — ` : ''}{label}
    </a>
  )
}
