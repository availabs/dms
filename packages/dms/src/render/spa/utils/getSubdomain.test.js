// Which subdomain a host serves. Site hosting relies on these rules too: a laptop opens
// "www.devtny.org.localhost", whose first label must read as it does in production.
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

  test('a production host opened through .localhost keeps its first label', () => {
    expect(getSubdomain('www.devtny.org.localhost:3001')).toBe('www');
    expect(getSubdomain('npmrds.devtny.org.localhost:3001')).toBe('npmrds');
    expect(getSubdomain('albany.hazardmitigation.ny.gov.localhost:3001')).toBe('albany');
  });
});

describe('getBaseHost', () => {
  test('strips the subdomain label', () => {
    expect(getBaseHost('tsmo2.devtny.org')).toBe('devtny.org');
    expect(getBaseHost('npmrds.localhost:5173')).toBe('localhost:5173');
    expect(getBaseHost('devtny.org')).toBe('devtny.org');
  });
});
