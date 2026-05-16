import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function useCamposDinamicos(contrato_id, tipo_equipe_id, secao) {
  const [campos, setCampos] = useState([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!contrato_id || !tipo_equipe_id || !secao) {
      setCampos([])
      return
    }

    setCarregando(true)
    supabase
      .from('config_campos_contrato')
      .select('*, config_campos(*)')
      .eq('contrato_id', contrato_id)
      .eq('tipo_equipe_id', tipo_equipe_id)
      .eq('secao', secao)
      .order('ordem')
      .then(({ data }) => {
        setCampos(data || [])
        setCarregando(false)
      })
  }, [contrato_id, tipo_equipe_id, secao])

  return { campos, carregando }
}
