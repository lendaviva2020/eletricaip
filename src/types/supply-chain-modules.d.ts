declare module "js-yaml" {
  export interface LoadOptions {
    filename?: string;
    onWarning?: (warning: Error) => void;
    json?: boolean;
  }
  export function load(str: string, opts?: LoadOptions): unknown;
  export function dump(obj: unknown, opts?: Record<string, unknown>): string;
}

declare module "proxy-addr" {
  import type { IncomingMessage } from "node:http";
  type TrustFunction = (addr: string, i: number) => boolean;
  function proxyaddr(
    req: Pick<IncomingMessage, "headers"> & { connection: { remoteAddress?: string } },
    trust: TrustFunction | string | string[],
  ): string;
  namespace proxyaddr {
    function all(
      req: Pick<IncomingMessage, "headers"> & { connection: { remoteAddress?: string } },
      trust?: TrustFunction | string | string[],
    ): string[];
    function compile(val: string | string[]): TrustFunction;
  }
  export = proxyaddr;
}
