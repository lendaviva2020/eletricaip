# ELÉTRICAI INDUSTRIAL OS — GATE 3.7
## DOCUMENTO 8: SEGURANÇA, RETENÇÃO E PROTEÇÃO DE DADOS DA OBSERVABILIDADE

---

**Normas:** IEC 62443-4-2, NIST SP 800-82 Rev. 3, LGPD (Lei 13.709/2018)  
**Princípio:** A observabilidade não pode se tornar uma nova superfície de ataque  

---

## 1. MASCARAMENTO E SANITIZAÇÃO DE CREDENCIAIS

Nenhum log, métrica, trace ou evento operacional pode conter credenciais em texto claro. O módulo [`maskSensitiveString`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/error-capture.ts) aplica varredura regex contínua, substituindo:

- URIs de Banco de Dados (`postgres://user:pass@host`) por `[REDACTED_PASSWORD]`.
- Tokens Bearer e chaves de autorização por `[REDACTED_TOKEN]`.
- Assinaturas JWT (`eyJ...`) por tokens ofuscados.
- Senhas, secrets e chaves privadas de certificados mTLS.

---

## 2. ISOLAMENTO MULTI-TENANT & ROW LEVEL SECURITY (RLS)

- Todas as tabelas de observabilidade possuem `tenant_id uuid references public.tenants(id)`.
- As consultas no Supabase utilizam políticas de RLS ativas:
  `using (tenant_id = auth.jwt() ->> 'tenant_id'::uuid or auth.jwt() ->> 'role' = 'PLATFORM_ADMIN')`.
- O isolamento cross-tenant e cross-plant foi validado por testes automatizados (Cenários 33 e 34), impedindo que usuários de uma organização acessem incidentes ou telemetrias de outra.

---

## 3. POLÍTICA DE RETENÇÃO E BACKPRESSURE

1. **Snapshots de Saúde:** Retenção granular de 1 minuto por 7 dias; após 7 dias, agregação horária por 90 dias; expurgo automático após 1 ano.
2. **Incidentes e Transições de Auditoria:** Retenção permanente (imutável) para histórico de conformidade industrial e seguro operacional.
3. **Controle de Cardinalidade:** É expressamente proibido usar identificadores de alta frequência (IDs de amostra, timestamps milissegundos) como labels em métricas agregadas.
4. **Proteção contra Flood:** Limite de 2.000 amostras/segundo por gateway com sinalização ativa de backpressure (`backpressure: true` no ACK de ingestão).
