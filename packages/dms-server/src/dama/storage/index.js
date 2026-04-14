/**
 * File storage service — abstraction over local disk and S3-compatible storage.
 *
 * Configuration via environment variables:
 *   DMS_STORAGE_TYPE = 'local' (default) | 's3'
 *   DAMA_SERVER_FILESTORAGE_PATH = local root path (default: var/dama-files)
 *   AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *   AWS_STORAGE_BUCKET, AWS_BUCKET_URL, AWS_DEFAULT_REGION
 */

const path = require('path');
const { createLocalStorage } = require('./local');

const DEFAULT_DATA_DIR = path.join(__dirname, '../../../var/dama-files');

let storage;

const storageType = process.env.DMS_STORAGE_TYPE || 'local';

if (storageType === 's3') {
  try {
    // Verify the SDK is available before creating the backend
    require('@aws-sdk/client-s3');
    const { createS3Storage } = require('./s3');

    storage = createS3Storage({
      endpoint: process.env.AWS_ENDPOINT_URL,
      region: process.env.AWS_DEFAULT_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      bucket: process.env.AWS_STORAGE_BUCKET,
      bucketUrl: process.env.AWS_BUCKET_URL,
    });

    console.log(`[storage] S3 backend — bucket: ${process.env.AWS_STORAGE_BUCKET}`);
  } catch (e) {
    console.warn('[storage] S3 requested but @aws-sdk/client-s3 not installed — falling back to local');
    storage = createLocalStorage(process.env.DAMA_SERVER_FILESTORAGE_PATH || DEFAULT_DATA_DIR);
  }
} else {
  storage = createLocalStorage(process.env.DAMA_SERVER_FILESTORAGE_PATH || DEFAULT_DATA_DIR);
}

module.exports = storage;
