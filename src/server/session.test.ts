import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { parseCookies, encryptSession, decryptSession, isSameOriginPost, checkLoginRateLimit } from './session';
test('malformed cookie does not prevent valid cookie parsing', () => {
  const req = {headers: {cookie: 'bad=%ZZ; good=hello'}} as Request;
  assert.equal(parseCookies(req).good, 'hello');
  assert.equal(parseCookies(req).bad, undefined);
});
test('session encryption round trip and tamper rejection', () => {
  const payload = {registerNumber:'123456',name:'Demo',mode:'mock' as const,exp:Date.now()+60000};
  const token = encryptSession(payload);
  assert.deepEqual(decryptSession(token), payload);
  assert.equal(decryptSession((token[0] === 'A' ? 'B' : 'A') + token.slice(1)), null);
});

test('expired and malformed session payloads are rejected', () => {
  const payload = {registerNumber:'123456',name:'Demo',mode:'mock' as const,exp:Date.now()-1};
  assert.equal(decryptSession(encryptSession(payload)), null);
  assert.equal(decryptSession(encryptSession({...payload, exp:Date.now()+60000, name:undefined} as unknown as typeof payload)), null);
});

 test('session rejects noncanonical token encoding', () => {
  const token = encryptSession({registerNumber:'123456',name:'Demo',mode:'mock',exp:Date.now()+60000});
  assert.equal(decryptSession(token+'='), null);
  assert.equal(decryptSession(token+'!'), null);
});
test('cross-site requests are rejected', () => {
  assert.equal(isSameOriginPost({headers:{host:'example.com',origin:'https://evil.example'}} as Request), false);
  assert.equal(isSameOriginPost({headers:{host:'example.com',origin:'https://example.com','sec-fetch-site':'cross-site'}} as Request), false);
  assert.equal(isSameOriginPost({headers:{host:'example.com',origin:'https://example.com'}} as Request), true);
});
test('login rate limit blocks excess attempts', () => {
  assert.equal(checkLoginRateLimit('test-rate-limit',2), true);
  assert.equal(checkLoginRateLimit('test-rate-limit',2), true);
  assert.equal(checkLoginRateLimit('test-rate-limit',2), false);
});
