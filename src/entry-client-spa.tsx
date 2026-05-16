// Entry client SPA — usado APENAS no build Vercel (vite.vercel.config.ts).
// Não é tocado pelo build Lovable/Cloudflare (que usa o entry SSR do TanStack Start).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
