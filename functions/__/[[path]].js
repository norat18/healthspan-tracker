// Cloudflare Pages Function: serve Firebase's sign-in handler (/__/auth/*, /__/firebase/*) from this site's own
// address by passing requests through to the Firebase project. Firebase documents this proxy approach for
// sites not hosted on Firebase, so Google sign-in works in browsers that block third-party storage.
const FIREBASE_AUTH_HOST = 'https://healthspantracker.web.app'; // Firebase Hosting site of the same project

export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/__/auth/') && !url.pathname.startsWith('/__/firebase/')) return new Response('Not found', { status: 404 });
  const headers = new Headers(request.headers);
  headers.delete('host');
  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  const upstream = await fetch(FIREBASE_AUTH_HOST + url.pathname + url.search, init);
  return new Response(upstream.body, upstream);
}
