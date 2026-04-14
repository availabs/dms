/**
 * Storage service tests — local backend.
 * S3 tests skipped if @aws-sdk/client-s3 not installed.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=== Storage Service Tests ===\n');

  // Use a temp directory for testing so we don't pollute the real data dir
  const testDir = path.join(os.tmpdir(), `dms-storage-test-${Date.now()}`);

  // --- Local backend ---

  console.log('  --- Local backend ---');

  const { createLocalStorage } = require('../src/dama/storage/local');
  const local = createLocalStorage(testDir);

  await test('write + exists (Buffer)', async () => {
    await local.write('test/hello.txt', Buffer.from('hello world'));
    const exists = await local.exists('test/hello.txt');
    assert(exists, 'file should exist after write');
  });

  await test('read returns correct content', async () => {
    const stream = await local.read('test/hello.txt');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const content = Buffer.concat(chunks).toString();
    assert(content === 'hello world', `content should be 'hello world', got '${content}'`);
  });

  await test('write with stream', async () => {
    const { Readable } = require('stream');
    const readable = Readable.from(['stream ', 'content']);
    await local.write('test/streamed.txt', readable);
    const exists = await local.exists('test/streamed.txt');
    assert(exists, 'streamed file should exist');

    const stream = await local.read('test/streamed.txt');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert(Buffer.concat(chunks).toString() === 'stream content', 'stream content should match');
  });

  await test('getUrl returns /files/ prefix', async () => {
    const url = local.getUrl('test/hello.txt');
    assert(url === '/files/test/hello.txt', `url should be /files/test/hello.txt, got ${url}`);
  });

  await test('exists returns false for missing file', async () => {
    const exists = await local.exists('nonexistent/file.txt');
    assert(!exists, 'should not exist');
  });

  await test('remove deletes a file', async () => {
    await local.write('test/removeme.txt', Buffer.from('bye'));
    assert(await local.exists('test/removeme.txt'), 'should exist before remove');
    await local.remove('test/removeme.txt');
    assert(!(await local.exists('test/removeme.txt')), 'should not exist after remove');
  });

  await test('remove deletes a directory recursively', async () => {
    await local.write('test/dir/a.txt', Buffer.from('a'));
    await local.write('test/dir/b.txt', Buffer.from('b'));
    await local.write('test/dir/sub/c.txt', Buffer.from('c'));
    assert(await local.exists('test/dir/sub/c.txt'), 'nested file should exist');

    await local.remove('test/dir');
    assert(!(await local.exists('test/dir/a.txt')), 'a.txt should be gone');
    assert(!(await local.exists('test/dir/sub/c.txt')), 'c.txt should be gone');
  });

  await test('read throws for missing file', async () => {
    let threw = false;
    try {
      await local.read('nonexistent.txt');
    } catch (e) {
      threw = true;
    }
    assert(threw, 'should throw for missing file');
  });

  await test('write creates nested directories', async () => {
    await local.write('deep/nested/path/file.txt', Buffer.from('deep'));
    assert(await local.exists('deep/nested/path/file.txt'), 'deeply nested file should exist');
  });

  // --- Storage facade ---

  console.log('\n  --- Storage facade ---');

  const storage = require('../src/dama/storage');

  await test('facade exports correct API', async () => {
    assert(typeof storage.write === 'function', 'write should be a function');
    assert(typeof storage.read === 'function', 'read should be a function');
    assert(typeof storage.remove === 'function', 'remove should be a function');
    assert(typeof storage.getUrl === 'function', 'getUrl should be a function');
    assert(typeof storage.exists === 'function', 'exists should be a function');
    assert(storage.type === 'local' || storage.type === 's3', `type should be local or s3, got ${storage.type}`);
    assert(typeof storage.dataDir === 'string' || storage.dataDir === null, 'dataDir should be string or null');
  });

  await test('facade write + read round-trip', async () => {
    const testKey = `test-facade-${Date.now()}.txt`;
    await storage.write(testKey, Buffer.from('facade test'));
    const stream = await storage.read(testKey);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert(Buffer.concat(chunks).toString() === 'facade test', 'content should match');
    await storage.remove(testKey);
  });

  // --- Sharp detection ---

  console.log('\n  --- Sharp detection ---');

  const { sharpAvailable, getSharp } = require('../src/dama/upload/sharp');

  await test('sharpAvailable is boolean', async () => {
    assert(typeof sharpAvailable === 'boolean', `should be boolean, got ${typeof sharpAvailable}`);
  });

  await test('getSharp throws when unavailable', async () => {
    if (sharpAvailable) {
      console.log('    (Sharp is available, skipping throw test)');
      return;
    }
    let threw = false;
    try { getSharp(); } catch (e) { threw = true; }
    assert(threw, 'should throw when Sharp not installed');
  });

  // Cleanup test directory
  fs.rmSync(testDir, { recursive: true, force: true });

  // --- Summary ---

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
