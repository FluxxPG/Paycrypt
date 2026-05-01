import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../lib/runtime-config";

const buildTargetUrl = (pathParts: string[], search: string) => {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const path = pathParts.map((part) => encodeURIComponent(part)).join("/");
  return `${base}/public/${path}${search || ""}`;
};

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const targetUrl = buildTargetUrl(path, url.search);

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      "user-agent": "Paycrypt-WebProxy/1.0"
    },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    cache: "no-store"
  });

  const contentType = upstream.headers.get("content-type") ?? "application/json";
  const raw = await upstream.text();
  return new NextResponse(raw, {
    status: upstream.status,
    headers: {
      "content-type": contentType
    }
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

