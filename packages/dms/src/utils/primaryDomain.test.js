import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { setRootDomain, setDomainAliases } from './hostResolver';
import { resolvePrimaryRedirect } from './primaryDomain';

describe('resolvePrimaryRedirect', () => {
    beforeEach(() => {
        setRootDomain('availabs.com');
        setDomainAliases([
            { subdomain: 'mny', primary: 'devmny.org', aliases: [{ domain: 'devmny.org', status: 'verified' }, { domain: 'mitigateny.org', status: 'verified' }] },
            { subdomain: 'tny', aliases: [{ domain: 'transportny.org', status: 'verified' }] },
        ]);
    });
    afterEach(() => { setRootDomain(''); setDomainAliases([]); });
    const go = (host, pathname = '/', extra = {}) => resolvePrimaryRedirect({ host, pathname, search: '?a=1', hash: '#h', ...extra });

    it('sends the default domain and other aliases to the primary, keeping subdomain and path', () => {
        expect(go('mny.availabs.com', '/x')).toBe('https://devmny.org/x?a=1#h');
        expect(go('albany.mny.availabs.com', '/plan')).toBe('https://albany.devmny.org/plan?a=1#h');
        expect(go('albany.mitigateny.org', '/list')).toBe('https://albany.devmny.org/list?a=1#h');
        expect(go('mny.localhost:5562', '/', { protocol: 'http:' })).toBe(null); // not under availabs.com
    });

    it('serves the primary, tenants without one, the platform root and unknown hosts', () => {
        expect(go('devmny.org')).toBe(null);
        expect(go('albany.devmny.org', '/x')).toBe(null);
        expect(go('tny.availabs.com')).toBe(null);
        expect(go('transportny.org')).toBe(null);
        expect(go('availabs.com')).toBe(null);
        expect(go('elsewhere.org')).toBe(null);
    });

    it('never redirects the admin on the default domain, or /.well-known', () => {
        expect(go('mny.availabs.com', '/list')).toBe(null);
        expect(go('mny.availabs.com', '/list/domains')).toBe(null);
        expect(go('mny.availabs.com', '/listing')).toBe('https://devmny.org/listing?a=1#h');
        expect(go('mny.availabs.com', '/admin/x', { adminPath: 'admin' })).toBe(null);
        expect(go('mny.availabs.com', '/.well-known/acme-challenge/t')).toBe(null);
    });

    it('drops www: to the primary, else to the same alias or default domain', () => {
        expect(go('www.devmny.org', '/x')).toBe('https://devmny.org/x?a=1#h');
        expect(go('www.mitigateny.org')).toBe('https://devmny.org/?a=1#h');
        expect(go('www.mny.availabs.com', '/list')).toBe(null); // the admin on the default domain stays
        expect(go('www.transportny.org', '/x')).toBe('https://transportny.org/x?a=1#h');
        expect(go('www.tny.availabs.com', '/list')).toBe('https://tny.availabs.com/list?a=1#h');
        expect(go('www.availabs.com')).toBe(null); // the platform root: nginx's job
        expect(go('DevMNY.org.')).toBe(null);
        expect(go('www.albany.devmny.org', '/plan')).toBe('https://albany.devmny.org/plan?a=1#h');
        expect(go('www.albany.mny.availabs.com', '/plan')).toBe('https://albany.devmny.org/plan?a=1#h');
        expect(go('www.npmrds.tny.availabs.com')).toBe('https://npmrds.tny.availabs.com/?a=1#h');
        expect(go('wwwx.tny.availabs.com')).toBe(null); // only a whole www label
    });

    it('keeps the port (local rigs)', () => {
        setRootDomain('localhost');
        expect(go('albany.mny.localhost:5562', '/', { protocol: 'http:' })).toBe('http://albany.devmny.org:5562/?a=1#h');
    });
});
