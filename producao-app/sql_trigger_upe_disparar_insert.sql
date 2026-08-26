-- ============================================================
-- Faz o trigger_atualizar_upe disparar em INSERT também, não só
-- UPDATE OF atividade_id.
--
-- Definição atual (confirmada pelo usuário via pg_get_triggerdef):
--   CREATE TRIGGER trigger_atualizar_upe
--     AFTER UPDATE OF atividade_id ON public.f_prod_atividades
--     FOR EACH ROW EXECUTE FUNCTION atualizar_upe_f_prod_serv()
--
-- Isso explica por que o backfill saiu com upe=1 (nunca corrigido) e,
-- mais importante, por que um lançamento novo retroativo pelo
-- formulário também não pegaria o preço histórico certo — o trigger
-- simplesmente não roda no momento do INSERT.
--
-- Seguro pra todos os outros contratos/atividades: a função por trás
-- (atualizar_upe_f_prod_serv) só muda de comportamento quando existe
-- preço vigente cadastrado em d_atividades_preco_fixa (hoje, só as 8
-- atividades FIXA do contrato de Faixa/21). Pra qualquer outra
-- atividade, ao disparar em INSERT ela cai no mesmo fallback que já
-- reproduz d_atividades."UPE" — o mesmo valor que o formulário já
-- manda hoje. Sem mudança de comportamento fora do escopo.
-- ============================================================

DROP TRIGGER IF EXISTS trigger_atualizar_upe ON public.f_prod_atividades;

CREATE TRIGGER trigger_atualizar_upe
  AFTER INSERT OR UPDATE OF atividade_id ON public.f_prod_atividades
  FOR EACH ROW EXECUTE FUNCTION atualizar_upe_f_prod_serv();
