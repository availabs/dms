// Which subdomain a host serves. Netlify's own addresses ("<site>.netlify.app" and deploy
// previews "<id>--<site>.netlify.app") must serve the root site: their first label names the
// Netlify site, not a DMS subdomain. Before, every root-bound pattern 404'd on them.
// planning: src/dms/planning/tasks/current/netlify-app-hosts-are-root.md
import { describe, expect, test } from 'vitest';
import { getSubdomain } from './index';
import { getBaseHost } from '../../../utils/subdomainPath';

describe('getSubdomain', () => {
  test('production hosts: the first of three or more labels', () => {
    expect(getSubdomain('www.devtny.org')).toBe('www');
    expect(getSubdomain('tsmo2.devtny.org')).toBe('tsmo2');
    expect(getSubdomain('TSMO2.devtny.org')).toBe('tsmo2');
    expect(getSubdomain('devtny.org')).toBe(false);
  });

  test('localhost counts as a one-label domain; the port is ignored', () => {
    expect(getSubdomain('www.localhost:5173')).toBe('www');
    expect(getSubdomain('npmrds.localhost:5173')).toBe('npmrds');
    expect(getSubdomain('localhost:3001')).toBe(false);
  });

  test('a bare IPv4 host has no subdomain', () => {
    expect(getSubdomain('74.50.76.166')).toBe(false);
    expect(getSubdomain('74.50.76.166:8080')).toBe(false);
  });

  test('*.netlify.app hosts serve the root site', () => {
    expect(getSubdomain('avail-dms-qa-test.netlify.app')).toBe(false);
    expect(getSubdomain('6ad255f063360337c704f7bc--avail-dms-qa-test.netlify.app')).toBe(false);
    expect(getSubdomain('6ad255f063360337c704f7bc--avail-dms-qa-test.netlify.app:443')).toBe(false);
  });
});

describe('getBaseHost', () => {
  test('strips the subdomain label', () => {
    expect(getBaseHost('tsmo2.devtny.org')).toBe('devtny.org');
    expect(getBaseHost('npmrds.localhost:5173')).toBe('localhost:5173');
    expect(getBaseHost('devtny.org')).toBe('devtny.org');
  });

  test('a *.netlify.app host has nothing to strip', () => {
    expect(getBaseHost('6ad255f063360337c704f7bc--avail-dms-qa-test.netlify.app')).toBe('6ad255f063360337c704f7bc--avail-dms-qa-test.netlify.app');
  });
});
