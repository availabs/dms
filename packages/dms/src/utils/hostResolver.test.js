import { describe, it, expect, afterEach } from 'vitest';
import { resolveHost, setRootDomain, getRootDomain } from './hostResolver';

afterEach(() => setRootDomain(''));

describe('resolveHost', () => {
    it('is inert without a root domain', () => {
        for (const h of ['mny.availabs.com', 'a.mny.availabs.com', 'npmrds.devtny.org', 'mny.localhost:5173', '1.2.3.4']) {
            expect(resolveHost(h)).toBe(null);
            expect(resolveHost(h, '')).toBe(null);
        }
    });

    it('reads the root, a tenant and a nested pattern subdomain', () => {
        const r = 'availabs.com';
        expect(resolveHost('availabs.com', r)).toEqual({ tenant: '', patternSubdomain: '', tenantHost: 'availabs.com' });
        expect(resolveHost('mny.availabs.com', r)).toEqual({ tenant: 'mny', patternSubdomain: '', tenantHost: 'mny.availabs.com' });
        expect(resolveHost('albany.mny.availabs.com', r)).toEqual({ tenant: 'mny', patternSubdomain: 'albany', tenantHost: 'mny.availabs.com' });
        expect(resolveHost('a.b.mny.availabs.com', r)).toEqual({ tenant: 'mny', patternSubdomain: 'a.b', tenantHost: 'mny.availabs.com' });
    });

    it('keeps the port, ignores case, and reads www as blank', () => {
        expect(resolveHost('Albany.MNY.localhost:5562', 'localhost')).toEqual({ tenant: 'mny', patternSubdomain: 'albany', tenantHost: 'mny.localhost:5562' });
        expect(resolveHost('localhost:5562', 'localhost')).toEqual({ tenant: '', patternSubdomain: '', tenantHost: 'localhost:5562' });
        expect(resolveHost('www.availabs.com', 'availabs.com').tenant).toBe('');
        expect(resolveHost('www.mny.availabs.com', 'availabs.com')).toMatchObject({ tenant: 'mny', patternSubdomain: '' });
    });

    it('returns null for hosts outside the root domain', () => {
        expect(resolveHost('mitigateny.org', 'availabs.com')).toBe(null);
        expect(resolveHost('notavailabs.com', 'availabs.com')).toBe(null);
        expect(resolveHost('127.0.0.1:5700', 'availabs.com')).toBe(null);
    });

    it('uses the registered root domain by default', () => {
        setRootDomain('.Availabs.com:443');
        expect(getRootDomain()).toBe('availabs.com');
        expect(resolveHost('x.tny.availabs.com')).toMatchObject({ tenant: 'tny', patternSubdomain: 'x' });
    });
});

import { legacyFirstLabel, hostTenant, newPatternSubdomain } from './hostResolver';

describe('legacy reading and helpers', () => {
    it('legacyFirstLabel matches the old inline copies', () => {
        expect(legacyFirstLabel('mny.localhost:5562')).toBe('mny');
        expect(legacyFirstLabel('localhost:5173')).toBe('');
        expect(legacyFirstLabel('npmrds.devtny.org')).toBe('npmrds');
        expect(legacyFirstLabel('devtny.org')).toBe('');
        expect(legacyFirstLabel('albany.mny.availabs.com')).toBe('albany');
        expect(legacyFirstLabel('74.50.76.166')).toBe('');
        expect(legacyFirstLabel('')).toBe('');
    });

    it('hostTenant / newPatternSubdomain: legacy without a root domain', () => {
        expect(hostTenant('mny.availabs.com')).toBe('mny');
        expect(hostTenant('albany.mny.availabs.com')).toBe('albany');
        expect(newPatternSubdomain('mny.availabs.com')).toBe('mny');
    });

    it('hostTenant / newPatternSubdomain: with a root domain', () => {
        setRootDomain('availabs.com');
        expect(hostTenant('albany.mny.availabs.com')).toBe('mny');
        expect(hostTenant('availabs.com')).toBe('');
        expect(newPatternSubdomain('mny.availabs.com')).toBe('');
        // outside the root domain the legacy reading still applies
        expect(hostTenant('npmrds.devtny.org')).toBe('npmrds');
        expect(newPatternSubdomain('npmrds.devtny.org')).toBe('npmrds');
    });
});

import { setDomainAliases, primaryDomainOf, isAliasCandidate, aliasDomainProblem, normalizeAliasDomain } from './hostResolver';

describe('domain aliases', () => {
    afterEach(() => setDomainAliases([]));
    const tenants = [
        { subdomain: 'mny', primary: 'devmny.org', aliases: [{ domain: 'devmny.org', status: 'verified' }, { domain: 'mitigateny.org', status: 'pending' }] },
        { subdomain: 'tny', aliases: [{ domain: 'transportny.org', status: 'verified' }, { domain: 'npmrds.transportny.org', status: 'verified' }] },
        { subdomain: 'zz', aliases: [{ domain: 'devmny.org', status: 'verified' }] }, // a second claim never wins
    ];

    it('reads a verified alias and its subdomains as the tenant', () => {
        setDomainAliases(tenants);
        const r = 'availabs.com';
        expect(resolveHost('devmny.org', r)).toEqual({ tenant: 'mny', patternSubdomain: '', tenantHost: 'devmny.org', alias: 'devmny.org' });
        expect(resolveHost('Albany.DevMNY.org:8080', r)).toEqual({ tenant: 'mny', patternSubdomain: 'albany', tenantHost: 'devmny.org:8080', alias: 'devmny.org' });
        expect(resolveHost('www.devmny.org', r)).toMatchObject({ tenant: 'mny', patternSubdomain: '' });
        // the longest alias wins
        expect(resolveHost('npmrds.transportny.org', r)).toMatchObject({ tenant: 'tny', patternSubdomain: '', alias: 'npmrds.transportny.org' });
        expect(resolveHost('x.transportny.org', r)).toMatchObject({ tenant: 'tny', patternSubdomain: 'x', alias: 'transportny.org' });
    });

    it('never serves an unverified alias, a lookalike, or without a root domain', () => {
        setDomainAliases(tenants);
        expect(resolveHost('mitigateny.org', 'availabs.com')).toBe(null);
        expect(resolveHost('notdevmny.org', 'availabs.com')).toBe(null);
        expect(resolveHost('devmny.org', '')).toBe(null);
        // root-domain hosts are unchanged
        expect(resolveHost('albany.mny.availabs.com', 'availabs.com')).toEqual({ tenant: 'mny', patternSubdomain: 'albany', tenantHost: 'mny.availabs.com' });
    });

    it('primary is a verified alias of that tenant, or nothing', () => {
        setDomainAliases([...tenants, { subdomain: 'q', primary: 'mitigateny.org' }]);
        expect(primaryDomainOf('mny')).toBe('devmny.org');
        expect(primaryDomainOf('tny')).toBe('');
        expect(primaryDomainOf('q')).toBe('');
    });

    it('alias candidates', () => {
        setRootDomain('availabs.com');
        expect(isAliasCandidate('devmny.org')).toBe(true);
        expect(isAliasCandidate('a.devmny.org:443')).toBe(true);
        for (const h of ['availabs.com', 'mny.availabs.com', 'mny.localhost:5562', 'localhost', '127.0.0.1:5562']) expect(isAliasCandidate(h)).toBe(false);
        setRootDomain('');
        expect(isAliasCandidate('devmny.org')).toBe(false);
    });

    it('validates a domain to add', () => {
        expect(normalizeAliasDomain(' https://DevMNY.org/x ')).toBe('devmny.org');
        expect(aliasDomainProblem('devmny.org', 'availabs.com')).toBe('');
        expect(aliasDomainProblem('sub.devmny.org', 'availabs.com')).toBe('');
        expect(aliasDomainProblem('', 'availabs.com')).toMatch(/Enter/);
        expect(aliasDomainProblem('nodot', 'availabs.com')).toMatch(/valid/);
        expect(aliasDomainProblem('-bad.org', 'availabs.com')).toMatch(/valid/);
        expect(aliasDomainProblem('1.2.3.4', 'availabs.com')).toMatch(/IP/);
        expect(aliasDomainProblem('www.devmny.org', 'availabs.com')).toMatch(/www/);
        expect(aliasDomainProblem('x.availabs.com', 'availabs.com')).toMatch(/hub/);
        expect(aliasDomainProblem('a.localhost', 'availabs.com')).toMatch(/public/);
    });
});
