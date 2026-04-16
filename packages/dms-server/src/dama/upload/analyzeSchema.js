/**
 * Per-value CSV schema analyzer ported from legacy DAMA
 * (avail-falcor/dama/routes/data_types/file-upload/analyzeSchema.js).
 *
 * Walks up to 10,000 parsed rows and narrows each column's PG type via a
 * state machine. Outputs the same envelope shape the old DAMA UI expects,
 * so the analysis override pane sees null/nonnull counts and sample values.
 *
 * Type ladder:
 *   null → INT → BIGINT → TEXT (on BIGINT overflow)
 *   null → REAL → DOUBLE PRECISION → NUMERIC (sink for big decimals)
 *   INT + decimal → DOUBLE PRECISION
 *   BIGINT + decimal → NUMERIC
 *   scientific notation → NUMERIC
 *   zero-padded ("036001") → TEXT (FIPS/GEOID heuristic)
 *   column name matches GEOID regex → TEXT from first non-null
 *   any TEXT observation → sticky TEXT forever
 *
 * Date/boolean handling from the original is left commented-out — both were
 * too aggressive in the old system and remain punted.
 */

function valueExceedsNumericRange(v) {
  const [before_decimal_pt = '', after_decimal_pt = ''] = v.split('.');
  return before_decimal_pt.length > 131072 || after_decimal_pt.length > 16383;
}

// GEOID/FIPS-shaped column names — forced to TEXT regardless of values.
const GEOID_REGEX = /^(block|block_?group|tract|county|uza|state)_?(geo)?(id|code)$|^geo_?(id|code)$/i;

/**
 * @param {AsyncIterable<Object> | Iterable<Object>} objIter - rows as plain objects
 * @param {Array} [seedSchemaAnalysis] - prior analysis to continue from
 * @param {Object} [options]
 * @param {number} [options.maxRows=10000] - row cap
 * @returns {Promise<{ objectsCount: number, schemaAnalysis: Array }>}
 */
module.exports = async function analyzeSchema(objIter, seedSchemaAnalysis = [], options = {}) {
  const { maxRows = 10000 } = options;
  const SAMPLES_LEN = 10;
  const decimalPointRE = /\./;
  const pgIntegerTypes = ['INT', 'BIGINT'];
  const pgDecimalTypes = ['REAL', 'DOUBLE PRECISION', 'NUMERIC'];
  const pgNumericTypes = [...pgIntegerTypes, ...pgDecimalTypes];

  let objectsCount = 0;

  if (seedSchemaAnalysis && seedSchemaAnalysis.some((d) => !d.key)) {
    throw new Error('Invalid seedSchemaAnalysis passed to analyzeSchema.');
  }

  const keyIdxs = seedSchemaAnalysis.reduce((acc, { key }, i) => {
    acc[key] = i;
    return acc;
  }, {});

  const schemaAnalysis = seedSchemaAnalysis.map(({ key, summary = {} }) => ({
    key,
    summary: {
      null: 0,
      nonnull: 0,
      types: {},
      db_type: null,
      ...summary,
    },
  }));

  let i = Object.keys(keyIdxs).length;

  for await (const d of objIter) {
    try {
      ++objectsCount;

      const hadTextualBoolean = new Set();

      for (const k of Object.keys(d)) {
        const seen_k = Number.isFinite(keyIdxs[k]);
        keyIdxs[k] = seen_k ? keyIdxs[k] : i++;

        schemaAnalysis[keyIdxs[k]] = schemaAnalysis[keyIdxs[k]] || {
          key: k,
          summary: {
            null: 0,
            nonnull: 0,
            types: {},
            db_type: null,
          },
        };

        const { summary } = schemaAnalysis[keyIdxs[k]];

        if (!seen_k && GEOID_REGEX.test(k)) {
          summary.db_type = 'TEXT';
        }

        let v;
        if (d[k] instanceof Date) {
          v = d[k].toISOString();
        } else if (typeof d[k] === 'number') {
          v = d[k];
        } else if (d[k] === null || d[k] === undefined) {
          v = null;
        } else {
          v = `${d[k]}`;
        }

        let t = v === null ? null : typeof v;

        if (t === 'string') {
          v = v.trim();
          if (v === '') {
            t = null;
          }
        }

        pgTypeCheck: if (
          t !== null &&
          v !== '' &&
          summary.db_type !== 'TEXT'
        ) {
          pgBooleanTypeCheck: if (
            summary.db_type === null ||
            summary.db_type === 'BOOLEAN'
          ) {
            const n = +v;

            if (Number.isFinite(n)) {
              if (hadTextualBoolean.has(k)) {
                summary.db_type = 'TEXT';
                break pgTypeCheck;
              }
              summary.db_type = 'INT';
              break pgBooleanTypeCheck;
            }

            if (t === 'string') {
              if (hadTextualBoolean.has(k)) {
                summary.db_type = 'TEXT';
                break pgTypeCheck;
              } else if (summary.db_type === null) {
                break pgBooleanTypeCheck;
              }
            }

            summary.db_type = 'TEXT';
          }

          /* Date type detection intentionally disabled — see legacy notes. */

          if (
            summary.db_type === null ||
            pgNumericTypes.includes(summary.db_type)
          ) {
            const s = `${v}`;
            const n = +v;
            const containsDecimalPoint = decimalPointRE.test(s);

            if (!Number.isFinite(n)) {
              summary.db_type = 'TEXT';
              break pgTypeCheck;
            }

            // Scientific notation → NUMERIC (preserve precision)
            if (/e/i.test(s)) {
              summary.db_type = 'NUMERIC';
            }

            // Zero-padded like "036001" → TEXT (likely FIPS/GEOID)
            if (/^0/.test(s) && /[1-9]/.test(s) && !containsDecimalPoint) {
              summary.db_type = 'TEXT';
              break pgTypeCheck;
            }

            if (valueExceedsNumericRange(s)) {
              summary.db_type = 'TEXT';
              break pgTypeCheck;
            }

            if (summary.db_type === 'NUMERIC') {
              break pgTypeCheck;
            }

            sContainsDecimalPt: if (containsDecimalPoint) {
              pgInt2Decimal: if (pgIntegerTypes.includes(summary.db_type)) {
                if (summary.db_type === 'INT') {
                  summary.db_type = 'DOUBLE PRECISION';
                  break pgInt2Decimal;
                }
                if (summary.db_type === 'BIGINT') {
                  summary.db_type = 'NUMERIC';
                  break pgTypeCheck;
                }
              }

              if (summary.db_type === null) {
                summary.db_type = 'REAL';
              }

              if (summary.db_type === 'REAL' && s.length > 7) {
                summary.db_type = 'DOUBLE PRECISION';
              }

              if (summary.db_type === 'DOUBLE PRECISION' && s.length > 16) {
                summary.db_type = 'NUMERIC';
              }

              break pgTypeCheck;
            }

            // No decimal point — integer territory.
            if (
              summary.db_type === 'REAL' ||
              summary.db_type === 'DOUBLE PRECISION'
            ) {
              if (summary.db_type === 'REAL' && s.length > 6) {
                summary.db_type = 'DOUBLE PRECISION';
              }
              if (summary.db_type === 'DOUBLE PRECISION' && s.length > 15) {
                summary.db_type = 'NUMERIC';
              }
              break pgTypeCheck;
            }

            // BIGINT overflow check (BigInt comparison).
            let big_n;
            try {
              big_n = BigInt(v);
            } catch (_) {
              summary.db_type = 'TEXT';
              break pgTypeCheck;
            }
            if (
              big_n < -9223372036854775808n ||
              big_n > 9223372036854775807n
            ) {
              summary.db_type = 'TEXT';
              break pgTypeCheck;
            }

            if (summary.db_type === null) {
              summary.db_type = 'INT';
            }

            if (
              summary.db_type === 'INT' &&
              (n < -2147483648 || n > 2147483647)
            ) {
              summary.db_type = 'BIGINT';
            }

            break pgTypeCheck;
          }

          summary.db_type = 'TEXT';
        }

        // Collect sample values (truncated strings; biased toward many-commas
        // and largest numerics for the legacy UI).
        let sampleV = v;
        if (t === 'string') {
          sampleV = v.slice(0, 32);
        }

        if (t !== null) {
          ++summary.nonnull;

          const typeSummary = (summary.types[t] = summary.types[t] || {
            count: 0,
            samples: [],
          });

          ++typeSummary.count;

          if (
            t === 'string' &&
            /,/.test(sampleV) &&
            !typeSummary.samples.includes(sampleV)
          ) {
            typeSummary.samples.push(sampleV);
            typeSummary.samples.sort(
              (a, b) =>
                `${b}`.replace(/[^,]/g, '').length -
                `${a}`.replace(/[^,]/g, '').length
            );
            typeSummary.samples.length = Math.min(
              typeSummary.samples.length,
              SAMPLES_LEN
            );
          } else if (
            pgNumericTypes.includes(summary.db_type) &&
            !typeSummary.samples.includes(sampleV)
          ) {
            typeSummary.samples.push(sampleV);
            typeSummary.samples.sort((a, b) => +b - +a);
            typeSummary.samples.length = Math.min(
              typeSummary.samples.length,
              SAMPLES_LEN
            );
          } else if (
            typeSummary.samples.length < SAMPLES_LEN &&
            !typeSummary.samples.includes(sampleV)
          ) {
            typeSummary.samples.push(sampleV);
          }
        } else {
          ++summary.null;
        }
      }
    } catch (err) {
      console.error('[analyzeSchema] row error:', err);
    }

    if (objectsCount >= maxRows) {
      break;
    }
  }

  return { objectsCount, schemaAnalysis };
};

module.exports.GEOID_REGEX = GEOID_REGEX;
module.exports.valueExceedsNumericRange = valueExceedsNumericRange;
