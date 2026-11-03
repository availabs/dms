import { describe, it, expect } from 'vitest';
import { tagFalcorRequests, withPatternParam, withAppParam } from './authedFetch';

describe('withPatternParam', () => {
    it('appends dms_pattern with ? or &', () => {
        expect(withPatternParam('/x', { app: 'a', id: 5 })).toBe('/x?dms_pattern=a%2F5');
        expect(withPatternParam('/x?y=1', { app: 'a', id: 5 })).toBe('/x?y=1&dms_pattern=a%2F5');
        expect(withPatternParam('/x', null)).toBe('/x');
    });
});

describe('tagFalcorRequests', () => {
    it('tags every request URL and keeps the source\'s own hook', () => {
        class Source { onBeforeRequest(config) { config.headers.Authorization = 'tok'; } }
        const falcor = { _source: new Source() };
        tagFalcorRequests(falcor, { app: 'a', id: 5 });
        const config = { url: '/graph?paths=x&method=get', headers: {} };
        falcor._source.onBeforeRequest(config);
        expect(config.url).toBe('/graph?paths=x&method=get&dms_pattern=a%2F5&dms_app=a');
        expect(config.headers.Authorization).toBe('tok');
    });
    it('leaves the model alone with neither a usable pattern nor an app', () => {
        class Source { onBeforeRequest() {} }
        const falcor = { _source: new Source() };
        tagFalcorRequests(falcor, { app: 'a', id: null }, null);
        expect(Object.prototype.hasOwnProperty.call(falcor._source, 'onBeforeRequest')).toBe(false);
    });
    it('a pattern that names no pattern row (the page pattern) still names its site', () => {
        class Source { onBeforeRequest() {} }
        const falcor = { _source: new Source() };
        tagFalcorRequests(falcor, null, 'my site');
        const config = { url: '/graph?paths=x' };
        falcor._source.onBeforeRequest(config);
        expect(config.url).toBe('/graph?paths=x&dms_app=my%20site');
        expect(withAppParam('/x', '')).toBe('/x');
    });
});
