let createClient;
try {
  ({ createClient } = require("@clickhouse/client"));
} catch (e) {
  createClient = null;
}

/**
 * ClickHouse adapter for DAMA auxiliary dataset storage.
 *
 * This is a read-focused adapter: the UDA query set builds
 * { query, query_params, format } objects directly and consumes the result
 * via .json() — matching @clickhouse/client's native shape. We deliberately
 * do NOT mimic the { rows } shape of Postgres/SQLite adapters because the
 * CH query set generates CH-native SQL with CH-native parameter binding.
 *
 * ClickHouse is only ever attached to a DAMA pgEnv and is never the host of
 * DMS content or the data_manager metadata tables (sources, views, etc.).
 * Those live in the pgEnv's PostgreSQL. ClickHouse stores only the row data
 * that a view's table_schema / table_name points at.
 */
class ClickHouseAdapter {
  constructor(config) {
    if (!createClient) {
      throw new Error(
        "ClickHouse driver (@clickhouse/client) is not installed. " +
        "Install it with: npm install @clickhouse/client"
      );
    }

    const { host, port = 8123, user, password, database } = config;
    if (!host || !user || !database) {
      throw new Error(
        "ClickHouse config must specify host, user, and database"
      );
    }

    this.type = "clickhouse";
    this.database = database;

    this.client = createClient({
      url: `http://${host}:${port}`,
      username: user,
      password,
      database,
      request_timeout: 1_200_000,
      // Raised 10 -> 24 for the pm3 publish worker, which runs 16 concurrent per-TMC pipelines and
      // would otherwise queue on sockets here rather than in its own pool. This is a CAP, not a
      // preallocation, so it costs nothing when idle. ClickHouse's server-side
      // `max_concurrent_queries` is 100 and is not the constraint.
      max_open_connections: 24,
      // ClickHouse's `keep_alive_timeout` on this host is 3s. The client's default idle socket TTL is
      // 2500ms, which leaves only 500ms of margin — and a socket the server has already closed gives
      // ECONNRESET ("socket hang up") when the client reuses it. Widening the pool above made sockets
      // idle longer and drew exactly that on pm3 task 7160. Halving the TTL gives a comfortable
      // margin; pm3 also retries transient resets, so this reduces the RATE rather than being the
      // only defence.
      keep_alive: { enabled: true, idle_socket_ttl: 1500 },
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 1,
        max_execution_time: 0,
        max_memory_usage: 0,
        mutations_sync: 2,
      },
    });
  }

  getDb() {
    return this.database;
  }

  /**
   * Passthrough to @clickhouse/client's query. The UDA CH query set passes
   * { query, query_params, format } and calls .json() on the result itself.
   */
  query(req) {
    return this.client.query(req);
  }

  exec(req) {
    return this.client.exec(req);
  }

  async end() {
    return this.client.close();
  }
}

module.exports = { ClickHouseAdapter };
