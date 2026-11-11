// Gate 4.3 Security Hardened: host header injection protection (trustForwardedHost disabled).
// route: /.well-known/oauth-protected-resource
// emitted to: src/routes/[.well-known]/oauth-protected-resource.ts

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackOAuthProtectedResourceMetadataHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../../lib/mcp/index";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      ANY: createTanStackOAuthProtectedResourceMetadataHandler(mcp, {
        resourcePath: "/mcp",
        metadataPath: "/.well-known/oauth-protected-resource",
        trustForwardedHost: false,
        forwardedHostTrustedByPlatform: false,
        trustForwardedProto: false,
      }),
    },
  },
});
