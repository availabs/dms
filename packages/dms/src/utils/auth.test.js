// Which group a user menu shows (rankUserGroups): the group that gives access on this pattern, with
// the pattern's grants already resolved for the subdomain.
import { describe, expect, test } from 'vitest';
import { rankUserGroups, resolveSubdomainAuthPermissions } from './auth';

const user = (groups, levels = {}) => ({
  groups,
  meta: groups.map(g => ({ group: g, authLevel: levels[g] ?? 0 })),
});

describe('rankUserGroups', () => {
  test('a group granted only on one subdomain leads there, not on the root', () => {
    const raw = JSON.stringify({
      '*': JSON.stringify({ groups: { Editors: ['edit-page'] } }),
      songs: JSON.stringify({ groups: { Editors: ['edit-page'], Songwriters: ['edit-page', 'publish-page'] } }),
    });
    const u = user(['Editors', 'Songwriters']);
    expect(rankUserGroups({ user: u, authPermissions: resolveSubdomainAuthPermissions(raw, 'songs') })[0]).toBe('Songwriters');
    expect(rankUserGroups({ user: u, authPermissions: resolveSubdomainAuthPermissions(raw, '') })[0]).toBe('Editors');
  });

  test('* beats more permissions; more permissions beat fewer; ties go by name', () => {
    const authPermissions = { groups: { B: ['*'], A: ['edit-page', 'publish-page'], C: ['edit-page'], D: ['edit-page'] } };
    expect(rankUserGroups({ user: user(['D', 'C', 'A', 'B']), authPermissions })).toEqual(['B', 'A', 'C', 'D']);
  });

  test('${app} Admin, then level, break a tie in grants', () => {
    const authPermissions = { groups: { 'site Admin': ['*'], Z: ['*'], Y: ['*'] } };
    expect(rankUserGroups({ user: user(['Z', 'site Admin']), authPermissions, app: 'site' })[0]).toBe('site Admin');
    expect(rankUserGroups({ user: user(['Y', 'Z'], { Z: 5 }), authPermissions })[0]).toBe('Z');
  });

  test('public is never shown; groups with no grant here follow, by level then name', () => {
    const authPermissions = { groups: { public: ['view-page'], Viewers: ['view-page'] } };
    expect(rankUserGroups({ user: user(['public', 'Big', 'Viewers', 'Alpha'], { Big: 10 }), authPermissions }))
      .toEqual(['Viewers', 'Big', 'Alpha']);
  });

  test('access through a direct user grant, or an open pattern: the highest-level group', () => {
    const u = { id: 7, ...user(['Low', 'High'], { High: 5 }) };
    expect(rankUserGroups({ user: u, authPermissions: { users: { 7: ['*'] } } })[0]).toBe('High');
    expect(rankUserGroups({ user: u })[0]).toBe('High');
  });

  test('no groups, or only public: nothing to show', () => {
    expect(rankUserGroups({ user: { groups: ['public'] } })).toEqual([]);
    expect(rankUserGroups({ user: undefined })).toEqual([]);
  });
});
