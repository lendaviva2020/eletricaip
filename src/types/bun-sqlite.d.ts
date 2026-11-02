// Ambient type declarations for bun:sqlite
declare module "bun:sqlite" {
  export interface Statement<T = unknown> {
    all(...params: unknown[]): T[];
    get(...params: unknown[]): T | null;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    values(...params: unknown[]): unknown[][];
    finalize(): void;
  }

  export class Database {
    constructor(
      filename?: string,
      options?:
        | number
        | {
            readonly?: boolean;
            create?: boolean;
            readwrite?: boolean;
            strict?: boolean;
          },
    );
    run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    query<T = unknown>(sql: string): Statement<T>;
    exec(sql: string): void;
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
    close(throwOnError?: boolean): void;
  }
}
