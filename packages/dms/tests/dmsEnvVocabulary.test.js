/**
 * The dmsEnv declares what may be done to the sources beneath it — and nothing about itself.
 *
 * Phase 1/2 of planning/tasks/current/row-auth-uda-unify-api.md. A source's type is
 * `{env}|{name}:source`, so the env is its ancestor and the datasets pattern is not. Moving the
 * source/view formats under `dmsEnvFormat` is what lets a source reach its vocabulary by the
 * ordinary leaf → root walk instead of through a chain manufactured to reach a pattern sideways.
 *
 * Run: npx vitest run packages/dms/tests/dmsEnvVocabulary.test.js
 */
import { describe, it, expect } from "vitest";
import { deriveDmsEnvVocabulary } from "../src/patterns/deriveAuthVocabulary.js";
import { dmsEnvFormat } from "../src/patterns/admin/admin.format.js";
import { source, view } from "../src/patterns/dmsEnv.format.js";

const vocab = deriveDmsEnvVocabulary(dmsEnvFormat);
const verbs = (vocab.descendants || []).map(e => e.value);

describe("the dmsEnv's derived vocabulary", () => {
  it("declares the source verbs as DESCENDANTS — they govern what is under the env", () => {
    expect(verbs).toEqual(expect.arrayContaining([
      'view-source', 'update-source', 'edit-source-data',
      'create-view', 'delete-source', 'edit-source-permissions',
    ]));
  });

  it("grants NOTHING about the env itself — an empty `self` is the declaration", () => {
    // deriveAuthVocabulary omits empty scopes, so an absent `self` IS "no self verbs".
    expect(vocab.self).toBeUndefined();
  });

  it("keeps the capabilities non-conferring: they gate an action, not row access", () => {
    for (const v of ['download-source', 'manage-downloads', 'view-source-api']) {
      const entry = (vocab.descendants || []).find(e => e.value === v);
      expect(entry, `${v} should be declared`).toBeTruthy();
      expect(entry.implies, `${v} must confer nothing structurally`).toEqual([]);
    }
  });

  it("never admits the wildcard — `*` is an editor affordance, not a verb", () => {
    expect(verbs).not.toContain('*');
  });

  it("carries `view-source` as THE read verb", () => {
    const e = (vocab.descendants || []).find(x => x.value === 'view-source');
    expect(e.implies).toContain('read');
  });
});

describe("the formats the env owns", () => {
  it("declares sources as a real child, not a json blob", () => {
    const attr = dmsEnvFormat.attributes.find(a => a.key === 'sources');
    expect(attr.type).toBe('dms-format');
  });

  it("registers the source format, so the derivation can walk to views", () => {
    expect(dmsEnvFormat.registerFormats).toContain(source);
    expect(source.registerFormats).toContain(view);
  });

  it("can represent an EXTERNAL env, which is how both populations share one vocabulary", () => {
    expect(dmsEnvFormat.attributes.some(a => a.key === 'pgEnv')).toBe(true);
  });

  it("declares its own grants with an empty domain — said in data, not in the decider", () => {
    const attr = dmsEnvFormat.attributes.find(a => a.key === 'authPermissions');
    expect(attr).toBeTruthy();
    expect(attr.permissionDomain).toEqual([]);
  });
});
