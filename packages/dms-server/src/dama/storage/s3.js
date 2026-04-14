/**
 * S3-compatible storage backend.
 * Works with AWS S3, MinIO, Cloudflare R2, etc.
 * Requires @aws-sdk/client-s3 (optional dependency).
 */

function createS3Storage(config) {
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
  } = require('@aws-sdk/client-s3');

  const {
    endpoint,    // AWS_ENDPOINT_URL
    region,      // AWS_DEFAULT_REGION
    accessKeyId, // AWS_ACCESS_KEY_ID
    secretAccessKey, // AWS_SECRET_ACCESS_KEY
    bucket,      // AWS_STORAGE_BUCKET
    bucketUrl,   // AWS_BUCKET_URL (for public URL generation)
  } = config;

  const client = new S3Client({
    region: region || 'us-east-1',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    type: 's3',
    dataDir: null, // No local root in S3 mode

    async write(relativePath, data) {
      const params = {
        Bucket: bucket,
        Key: relativePath,
        Body: data,
      };
      await client.send(new PutObjectCommand(params));
    },

    async read(relativePath) {
      const result = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: relativePath,
      }));
      return result.Body;
    },

    async remove(relativePath) {
      // S3 has no directories — list all objects with prefix and batch delete
      const listed = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: relativePath,
      }));

      if (listed.Contents && listed.Contents.length > 0) {
        await client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: listed.Contents.map(obj => ({ Key: obj.Key })),
          },
        }));
      }

      // Also try deleting the exact key (in case it's a single file, not a prefix)
      try {
        await client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: relativePath,
        }));
      } catch (e) {
        // Ignore — may not exist as exact key
      }
    },

    getUrl(relativePath) {
      if (bucketUrl) {
        return `${bucketUrl.replace(/\/$/, '')}/${relativePath}`;
      }
      if (endpoint) {
        return `${endpoint.replace(/\/$/, '')}/${bucket}/${relativePath}`;
      }
      return `https://${bucket}.s3.${region || 'us-east-1'}.amazonaws.com/${relativePath}`;
    },

    async exists(relativePath) {
      try {
        await client.send(new HeadObjectCommand({
          Bucket: bucket,
          Key: relativePath,
        }));
        return true;
      } catch (e) {
        if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
          return false;
        }
        throw e;
      }
    },
  };
}

module.exports = { createS3Storage };
