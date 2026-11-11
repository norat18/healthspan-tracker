// Cloudflare Pages Function: mirror the whole site from Firebase Hosting.
// healthspantracker.pages.dev serves exactly what https://healthspantracker.web.app serves (pages, app files,
// security headers and the /__/auth sign-in handler), so the two addresses can never drift apart and only
// Firebase needs deploying.
const ORIGIN = 'https://healthspantracker.web.app';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete('host');
  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  const upstream = await fetch(ORIGIN + url.pathname + url.search, init);
  const res = new Response(upstream.body, upstream);
  // Keep redirects on this address.
  const loc = res.headers.get('location');
  if (loc && loc.startsWith(ORIGIN)) res.headers.set('location', loc.slice(ORIGIN.length) || '/');
  return res;
}
