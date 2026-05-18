export const config = {
  runtime: "edge",
};

type WorkerModule = {
  default: {
    fetch: (
      request: Request,
      env?: Record<string, string | undefined>,
      ctx?: { waitUntil?: (promise: Promise<unknown>) => void },
    ) => Promise<Response> | Response;
  };
};

function getUpstreamUrl(request: Request): URL {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api\/render/, "") || "/";
  return url;
}

export default async function handler(request: Request): Promise<Response> {
  const worker = (await import("../../dist/server/index.js")) as WorkerModule;
  const upstreamUrl = getUpstreamUrl(request);
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  const waitUntilQueue: Promise<unknown>[] = [];

  const response = await worker.default.fetch(upstreamRequest, process.env, {
    waitUntil(promise) {
      waitUntilQueue.push(Promise.resolve(promise));
    },
  });

  if (waitUntilQueue.length > 0) {
    void Promise.allSettled(waitUntilQueue);
  }

  return response;
}
