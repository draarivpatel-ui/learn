import { describe, expect, test } from 'bun:test';
import worker from '../src/index.js';
import { withSecurityHeaders } from '../src/security-headers.js';

const expected = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; media-src 'self' https:; frame-src 'self' https:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https:",
};
const check = (res) => { for (const [k, v] of Object.entries(expected)) expect(res.headers.get(k)).toBe(v); };

describe('security headers', () => {
  test('the home page carries them', async () => {
    const res = await worker.fetch(new Request('https://learn.flisk.si/'), {});
    expect(res.status).toBe(200);
    check(res);
  });
  test('a 404 carries them', async () => {
    const res = await worker.fetch(new Request('https://learn.flisk.si/nope'), {});
    expect(res.status).toBe(404);
    check(res);
  });
  test('existing values are kept, gaps are filled, none is duplicated', () => {
    const res = withSecurityHeaders(new Response('x', { headers: { 'x-frame-options': 'DENY', 'strict-transport-security': 'max-age=31536000', 'content-security-policy': "default-src 'none'" } }));
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'self'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
  test('a CSP that already has frame-ancestors is left alone', () => {
    const csp = "default-src 'none'; frame-ancestors 'none'";
    expect(withSecurityHeaders(new Response('x', { headers: { 'content-security-policy': csp } })).headers.get('content-security-policy')).toBe(csp);
  });
  test('redirects with immutable headers still work', () => {
    const res = withSecurityHeaders(Response.redirect('https://learn.flisk.si/', 302));
    expect(res.status).toBe(302);
    check(res);
  });
});
