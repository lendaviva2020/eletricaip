# ADR-006: Edge Gateway Runtime, Protocol Adapters and Store-and-Forward Architecture

## Status
**APROVADO (ACCEPTED)** — 02 de Novembro de 2026

## Contexto
O ElétricAi Industrial OS necessita conectar-se a ativos físicos em redes industriais (OT) de empresas clientes (CLPs, remotas de I/O, medidores de energia, inversores de frequência e sensores).
O sistema SCADA na nuvem não deve e não pode estabelecer conexões TCP arbitrárias diretas para dentro das redes de controle das fábricas (violação grave das normas NIST SP 800-82 Rev. 3 e IEC 62443).
Além disso, quedas de Internet na fábrica não podem interromper a aquisição de dados nem causar perda de registros históricos e alarmes.

## Decisão de Arquitetura

1. **Separação Rígida Cloud vs. Edge:**
   - O **ElétricAi Cloud** gerencia governança, organizações, projetos, canonical equipment, regras de alarmes, historiador consolidado e sinóticos web.
   - O **ElétricAi Edge Gateway** é um daemon independente e autônomo, executado no nível de chão-de-fábrica (on-premise em hardware Linux x86_64 ou ARM64), com ciclo de vida desacoplado do navegador e de serverless.
   - Conexões de dados são de **saída (outbound)** do Gateway para a nuvem via TLS/HTTPS/WSS com autenticação mútua (mTLS ou tokens de estação provisionados). Nenhuma porta de CLP é exposta para a Internet pública.

2. **Stack Tecnológica: TypeScript / Node.js Engine com Compilação Standalone:**
   - Permite reutilização direta e nativa dos tipos e contratos canônicos (`ScadaTagDefinition`, `TagUpdateInput`, `HistoricalSample`, `TagQuality`, `ProtocolDriver`), garantindo impedância zero entre a borda e a nuvem.
   - Amplo ecossistema industrial de bibliotecas homologadas com suporte estrito a binários de rede (OPC UA Parts 2/4/5/8, Modbus TCP MBAP/PDU, MQTT Sparkplug B v1.0).
   - Suporte verificado para Linux x86_64 e Linux ARM64 (Debian, Ubuntu Server, Alpine, Yocto), permitindo execução como serviço `systemd` ou container Docker.

3. **Buffer Local Transacional (SQLite WAL Outbox):**
   - Para o buffer offline de store-and-forward, adota-se um armazenamento transacional relacional ACID (SQLite em modo WAL — Write-Ahead Logging).
   - O SQLite foi escolhido em detrimento de bancos colunares (como DuckDB) porque o buffer de borda atua como uma fila operacional transacional de alta frequência de escrita unitária/lote, com marcação de estado (`PENDING`, `IN_FLIGHT`, `ACKNOWLEDGED`) e necessidade de garantia ACID sob queda súbita de energia da planta.

4. **Regra Fundamental de Segurança Física:**
   - No Gate 3, todos os drivers industriais operam **estritamente em modo READ-ONLY e SUBSCRIBE**.
   - Métodos de escrita física (Write, Modbus FC5/6/15/16, Sparkplug NCMD/DCMD) estão terminantemente desabilitados no núcleo do Gateway.
   - `isPhysicalControlAllowed: false` permanece inalterado.
   - Amostras atrasadas recuperadas após reconexão da Internet são reenviadas de forma idempotente, preservando os timestamps originais de medição (`sourceTimestamp`). Comandos físicos JAMAIS são colocados em fila de replay.

## Consequências
- A aquisição industrial não depende da nuvem para continuar operando.
- Em caso de falha de WAN, os dados permanecem íntegros no disco local do Gateway e são descarregados ordenadamente assim que a conexão se restabelece.
- A segurança cibernética da rede OT é preservada com zonas e conduítes conformes à norma IEC 62443.
