"use strict";

/**
 * Incremental JSON serialiser.
 *
 * `JSON.stringify` must materialise the whole result as one JavaScript string,
 * so any payload over V8's max string length (512 MiB — see
 * `require('buffer').constants.MAX_STRING_LENGTH`) throws
 * `RangeError: Invalid string length`. That is fatal for `res.json()`, which
 * stringifies before it writes anything.
 *
 * `/sync/bootstrap` (routes/sync/sync.js) already dodges this by writing a flat
 * `items` array element by element. A Falcor jsonGraph envelope is a nested
 * object rather than a flat list, so it needs a general walker: this one emits
 * the same bytes `JSON.stringify(value)` would, but flushes to the stream every
 * CHUNK_SIZE characters so no single string gets anywhere near the limit.
 *
 * Matches JSON.stringify semantics: `toJSON()` is honoured, `undefined` /
 * functions / symbols become `null` inside arrays and are omitted as object
 * values, and non-finite numbers become `null`. Key order is insertion order,
 * as JSON.stringify uses. No replacer or spacing — callers here don't use them.
 *
 * Writes are synchronous and ignore backpressure, matching /sync/bootstrap.
 * The stream buffers unflushed chunks as Buffers rather than as one string,
 * which is the point: memory can still grow on a slow client, but it cannot
 * throw.
 */

const CHUNK_SIZE = 1 << 16; // 64 KiB

function isSkippable(v) {
  const t = typeof v;
  return v === undefined || t === "function" || t === "symbol";
}

/**
 * Serialise `value` as JSON into the writable `stream`.
 *
 * @param {import('stream').Writable} stream - destination (e.g. an express res)
 * @param {*} value - value to serialise
 * @returns {number} number of characters written
 */
function writeJson(stream, value) {
  let buf = [];
  let bufLen = 0;
  let total = 0;

  function push(str) {
    buf.push(str);
    bufLen += str.length;
    total += str.length;
    if (bufLen >= CHUNK_SIZE) {
      stream.write(buf.join(""));
      buf = [];
      bufLen = 0;
    }
  }

  function walk(v) {
    if (v !== null && typeof v === "object" && typeof v.toJSON === "function") {
      v = v.toJSON();
    }

    if (v === null) return push("null");

    const t = typeof v;
    if (t === "number") return push(Number.isFinite(v) ? String(v) : "null");
    if (t === "boolean") return push(v ? "true" : "false");
    if (t === "string") return push(JSON.stringify(v));
    if (t === "bigint") {
      // Match JSON.stringify, which refuses to guess a representation.
      throw new TypeError("Do not know how to serialize a BigInt");
    }
    if (isSkippable(v)) return push("null"); // only reachable via the array path

    if (Array.isArray(v)) {
      push("[");
      for (let i = 0; i < v.length; i++) {
        if (i > 0) push(",");
        walk(isSkippable(v[i]) ? null : v[i]);
      }
      return push("]");
    }

    // plain object
    push("{");
    let first = true;
    const keys = Object.keys(v);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const val = v[k];
      if (isSkippable(val)) continue; // JSON.stringify omits these keys
      if (!first) push(",");
      first = false;
      push(JSON.stringify(k));
      push(":");
      walk(val);
    }
    push("}");
  }

  walk(value);

  if (bufLen > 0) stream.write(buf.join(""));
  return total;
}

module.exports = writeJson;
module.exports.writeJson = writeJson;
module.exports.CHUNK_SIZE = CHUNK_SIZE;
