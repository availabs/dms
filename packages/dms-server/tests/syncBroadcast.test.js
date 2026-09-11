/**
 * WebSocket broadcast — dataset-row payloads must not go out on the wire.
 *
 * The pull path (/sync/bootstrap, /sync/delta) has always excluded split-table
 * (`:data`) types: they live in their own tables and are fetched on demand.
 * The push path shipped them in full — 7.7 MB per write for
 * `jurisdictions|1346450:data`, 3,306 writes in 30 days — serialized once
 * before any per-client filtering, so a single app subscriber was enough to
 * pay for it. See sync-ws-broadcast-split-row-payload.md.
 */
import { describe, it, expect } from 'vitest';
import { stripSplitRowData } from '../src/routes/sync/ws.js';

const msgFor = (type, action = 'U', data = '{"big":"payload"}') => ({
  type: 'change', revision: 949545, action,
  item: { id: 1346450, app: 'mitigat-ny-prod', type, ...(data === undefined ? {} : { data }) },
});

describe('stripSplitRowData', () => {
  it('drops the payload from a dataset-row change and marks it', () => {
    const out = stripSplitRowData(msgFor('jurisdictions|1346450:data'));
    expect(out.item).not.toHaveProperty('data');
    expect(out.item.dataOmitted).toBe(true);
  });

  it('keeps everything a client needs to act on the notification', () => {
    const out = stripSplitRowData(msgFor('jurisdictions|1346450:data'));
    expect(out.type).toBe('change');
    expect(out.revision).toBe(949545);
    expect(out.action).toBe('U');
    expect(out.item.id).toBe(1346450);
    expect(out.item.app).toBe('mitigat-ny-prod');
    expect(out.item.type).toBe('jurisdictions|1346450:data');
  });

  it('leaves an ordinary type completely untouched', () => {
    const msg = msgFor('mitigateny_sullivan|component');
    const out = stripSplitRowData(msg);
    expect(out).toBe(msg); // same reference — no copy, no allocation
    expect(JSON.stringify(out)).toBe(JSON.stringify(msg));
  });

  it('strips the legacy split-type form too', () => {
    // No ':data' suffix — only the broad isSplitType catches it.
    const out = stripSplitRowData(msgFor('traffic_counts-1'));
    expect(out.item).not.toHaveProperty('data');
    expect(out.item.dataOmitted).toBe(true);
  });

  it('leaves a delete alone (it never carried data)', () => {
    const msg = { type: 'change', revision: 5, action: 'D',
      item: { id: 1, app: 'a', type: 'jurisdictions|1346450:data' } };
    expect(stripSplitRowData(msg)).toBe(msg);
    expect(stripSplitRowData(msg).item.dataOmitted).toBeUndefined();
  });

  it('does not choke on a message with no item', () => {
    const msg = { type: 'change', revision: 5, action: 'U' };
    expect(stripSplitRowData(msg)).toBe(msg);
    expect(stripSplitRowData(null)).toBe(null);
  });

  it('actually removes the bytes', () => {
    const big = 'x'.repeat(200000);
    const before = JSON.stringify(msgFor('jurisdictions|1346450:data', 'U', big)).length;
    const after = JSON.stringify(stripSplitRowData(msgFor('jurisdictions|1346450:data', 'U', big))).length;
    expect(before).toBeGreaterThan(200000);
    expect(after).toBeLessThan(200);
  });
});
