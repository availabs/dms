import { describe, it, expect } from 'vitest';
import { getPatternMounts, mountsForSubdomain } from './patternMounts';

const subs = (pattern, sub) => mountsForSubdomain(pattern, sub).map(m => `${m.subdomain ?? ''}:${m.base_url}:${m.navPrefix}`);

describe('mountsForSubdomain', () => {
    it('matches the primary mount on its own subdomain only', () => {
        const p = { subdomain: 'county', base_url: '/plan' };
        expect(subs(p, 'county')).toEqual(['county:/plan:']);
        expect(subs(p, '')).toEqual([]);
        expect(subs(p, 'other')).toEqual([]);
    });

    it('treats an empty primary subdomain as the root domain', () => {
        const p = { subdomain: '', base_url: '/' };
        expect(subs(p, '')).toEqual([':/:']);
        expect(subs(p, 'county')).toEqual([]);
    });

    it("answers everywhere for '*'", () => {
        const p = { subdomain: '*', base_url: '/docs' };
        expect(subs(p, '')).toEqual(['*:/docs:']);
        expect(subs(p, 'county')).toEqual(['*:/docs:']);
    });

    it('aliases www on a location (not on the primary) to the root domain, with its navPrefix', () => {
        const p = { subdomain: 'freightatlas2', base_url: '/freight_data',
            locations: JSON.stringify([{ subdomain: 'www', base_url: '/fa/freight_data' }]) };
        expect(subs(p, '')).toEqual(['www:/fa/freight_data:/fa']);
        expect(subs(p, 'freightatlas2')).toEqual(['freightatlas2:/freight_data:']);
        expect(subs({ subdomain: 'www', base_url: '/' }, '')).toEqual([]);
    });

    it('drops invalid and duplicate locations', () => {
        const p = { subdomain: 'a', base_url: '/x/', locations: [null, 'bad', {}, { subdomain: 'a', base_url: 'x' }, { subdomain: 'b', base_url: '/y' }] };
        expect(getPatternMounts(p).map(m => `${m.subdomain}:${m.base_url}`)).toEqual(['a:/x/', 'b:/y']);
    });
});
