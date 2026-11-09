-- Relatório "Colaboradores por Equipe": a consulta direta em f_prod_colaboradores
-- estourava statement_timeout (8s do role authenticated) por causa do RLS avaliado
-- linha a linha. Esta função faz a checagem de acesso uma vez só (mesmo critério de
-- fn_prod_relatorio_colaboradores) e bloqueia o perfil Encarregado.

CREATE OR REPLACE FUNCTION public.fn_prod_colaboradores_equipe(
  p_inicio date,
  p_fim date,
  p_contrato_id smallint DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  registro_id bigint,
  colaborador_id bigint,
  equipe_id integer,
  data_producao date,
  contrato_id smallint,
  registro_equipe_id integer,
  matricula smallint,
  nome text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.registro_id, c.colaborador_id, c.equipe_id,
         r.data_producao, r.contrato_id, r.equipe_id,
         k.matricula, k.nome::text
    FROM f_prod_registro r
    JOIN f_prod_colaboradores c ON c.registro_id = r.id
    LEFT JOIN d_colaboradores k ON k.id = c.colaborador_id
   WHERE r.data_producao >= p_inicio
     AND r.data_producao <= p_fim
     AND (p_contrato_id IS NULL OR r.contrato_id = p_contrato_id)
     AND NOT fn_prod_eh_encarregado()
     AND (
       EXISTS (SELECT 1 FROM d_auth_user u JOIN d_auth_roles ro ON ro.id = u.role_id
                WHERE u.uuid = auth.uid() AND ro.name IN ('Admin', 'Super Admin'))
       OR r.contrato_id IN (SELECT ac.contrato_id FROM d_auth_contratos ac WHERE ac.user_uuid = auth.uid())
     )
   ORDER BY c.id
   LIMIT p_limit OFFSET p_offset;
$function$;

REVOKE ALL ON FUNCTION public.fn_prod_colaboradores_equipe(date, date, smallint, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_prod_colaboradores_equipe(date, date, smallint, integer, integer) TO authenticated;
