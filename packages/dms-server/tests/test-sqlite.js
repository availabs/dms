/**
 * Simple test script for SQLite compatibility
 */

const { getDb } = require('#db/index.js');

async function testSqlite() {
  console.log('Testing SQLite compatibility...\n');

  try {
    // Get database connection
    const db = getDb('dms-sqlite');
    const dbType = db.type;
    console.log(`Database type: ${dbType}`);
    console.log(`Database path: ${db.getDb()}\n`);

    // Wait for initialization to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test basic queries
    console.log('Testing basic queries...');

    // Insert test data
    const insertResult = await db.query(`
      INSERT INTO data_items (app, type, data)
      VALUES (?, ?, ?)
      RETURNING id, app, type, data
    `, ['test-app', 'test-type', JSON.stringify({ title: 'Test Item' })]);

    console.log('Insert result:', insertResult.rows);

    if (insertResult.rows.length > 0) {
      const id = insertResult.rows[0].id;

      // Select test data
      const selectResult = await db.query(`
        SELECT * FROM data_items WHERE id = ?
      `, [id]);
      console.log('Select result:', selectResult.rows);

      // Update test data
      const updateResult = await db.query(`
        UPDATE data_items
        SET data = json_patch(COALESCE(data, '{}'), ?)
        WHERE id = ?
        RETURNING id, app, type, data
      `, [JSON.stringify({ title: 'Updated Test Item' }), id]);
      console.log('Update result:', updateResult.rows);

      // Delete test data
      const deleteResult = await db.query(`
        DELETE FROM data_items WHERE id = ?
      `, [id]);
      console.log('Delete result: rowCount =', deleteResult.rowCount);
    }

    console.log('\nSQLite tests passed!');

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSqlite().then(() => {
  console.log('\nAll tests completed.');
  process.exit(0);
}).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
