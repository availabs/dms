/**
 * Local disk storage backend.
 * Files stored under a configurable root directory (dataDir).
 * Served via Express static middleware at /files/.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pipeline } = require('stream/promises');

function createLocalStorage(dataDir) {
  // Ensure root exists
  fs.mkdirSync(dataDir, { recursive: true });

  return {
    type: 'local',
    dataDir,

    async write(relativePath, data) {
      const fullPath = path.join(dataDir, relativePath);
      await fsp.mkdir(path.dirname(fullPath), { recursive: true });

      if (Buffer.isBuffer(data) || typeof data === 'string') {
        await fsp.writeFile(fullPath, data);
      } else {
        // Readable stream
        const ws = fs.createWriteStream(fullPath);
        await pipeline(data, ws);
      }
    },

    async read(relativePath) {
      const fullPath = path.join(dataDir, relativePath);
      // Check existence first for a clear error
      await fsp.access(fullPath, fs.constants.F_OK);
      return fs.createReadStream(fullPath);
    },

    async remove(relativePath) {
      const fullPath = path.join(dataDir, relativePath);
      await fsp.rm(fullPath, { recursive: true, force: true });
    },

    getUrl(relativePath) {
      return `/files/${relativePath}`;
    },

    async exists(relativePath) {
      try {
        await fsp.access(path.join(dataDir, relativePath), fs.constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

module.exports = { createLocalStorage };
