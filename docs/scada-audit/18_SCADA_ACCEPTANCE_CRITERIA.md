# 18 — Critérios de aceite

A evolução é considerada bem-sucedida quando cada item abaixo for demonstrado com teste automatizado ou evidência registrada.

## Dados

1. Nenhum valor numérico exibido no SCADA de cliente sem origem (`simulação`, `iot`, `edge`) visível no faceplate. Teste-guarda no padrão de `real-data-integrity.test.ts`.
2. Tag sem fonte aparece como "sem fonte" com qualidade `NOT_CONNECTED`, nunca com valor.
3. Status de comunicação reflete a frota Edge real; gateway desligado gera alarme de comunicação em até 2 ciclos de varredura.
4. Projeto de cliente aberto direto em `/scada` mostra os equipamentos do diagrama salvo.
5. Memória da aba estável após 4 h com 200 tags a 1 Hz (sem crescimento contínuo do buffer).

## Fonte única

6. Um mesmo tag tem o mesmo valor, qualidade e origem no SCADA, no editor HMI, no modo Alarmes e no CCM.
7. Existe um único serviço de alarmes por projeto.

## Alarmes (ISA-18.2)

8. Nenhum alarme criado sem configuração do usuário.
9. Alarmes, reconhecimentos, shelving e fora de serviço persistem e sobrevivem ao recarregar.
10. Indicadores de desempenho de alarme calculados a partir do `alarm_history`.

## Histórico

11. Amostras gravadas com origem; consulta de 24 h agregada em menos de 2 s para 1 tag.
12. Lote de ingestão acima do máximo é recusado.

## Segurança

13. Forçar tag exige papel engineer+ e motivo, e gera auditoria persistida verificável pela cadeia de hash.
14. Teste-guarda de que nenhum caminho do SCADA, do CCM ou da IA escreve em equipamento (`IS_PHYSICAL_CONTROL_ALLOWED` constante `false`).
15. Testes de isolamento: usuário de outra empresa não lê histórico, alarmes nem auditoria.

## IA assistiva

16. Toda resposta separa fato, correlação, hipótese e verificação, e cita a origem.
17. Sem dados suficientes, a IA declara a limitação em vez de supor.
18. Consome créditos e respeita limites existentes; não tem ferramenta de escrita.

## Interface

19. Hierarquia ISA-101 navegável: visão geral → área → faceplate → diagnóstico; tendência a 1 clique de cada variável.
20. Nenhuma versão inventada ou selo de conformidade não verificado na interface.
