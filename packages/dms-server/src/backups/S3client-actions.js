const { extname } = require("node:path");
const { createReadStream } = require("node:fs");

const {
	S3Client,
	PutObjectCommand,
	ListObjectsV2Command,
	DeleteObjectsCommand
} = require("@aws-sdk/client-s3");

const getAwsInfo = async awsInfoFile => {
	if (extname(awsInfoFile) === ".mjs") {
		const m = await require(awsInfoFile);
		return m.awsInfo || m.default;
	}
	return require(awsInfoFile);
}

const getS3Client = awsInfo => {
	try {
	  return new S3Client({
		  region: awsInfo["AWS_DEFAULT_REGION"],
		  endpoint: awsInfo["AWS_ENDPOINT_URL"],
		  forcePathStyle: true,
		  credentials: {
	      accessKeyId: awsInfo["AWS_ACCESS_KEY_ID"],
	      secretAccessKey: awsInfo["AWS_SECRET_ACCESS_KEY"],
		  }
		});
	}
	catch (e) {
		console.error("There was an error instantiating the S3 client:", e);
		return null;
	}
}

const putObject = async (s3client, awsInfo, filepath, filename) => {
	
  const putObjectParams = {
	  Bucket: awsInfo["AWS_STORAGE_BUCKET"],
	  Key: filename,
	  Body: createReadStream(filepath)
	};

	try {
		const command = new PutObjectCommand(putObjectParams);
		await s3client.send(command);
		return filename;
	}
	catch (e) {
		console.error(`There was an error uploading pg dump file "${ filepath }":`, e);
		return null;
	}
}

const getBucketContents = async (s3client, awsInfo) => {
	try {
		const command = new ListObjectsV2Command({ Bucket: awsInfo["AWS_STORAGE_BUCKET"] });
		const response = await s3client.send(command);
		return response.Contents?.map(c => c.Key) || [];
	}
	catch (e) {
		console.error(`There was an error retrieving the contents of bucket "${ awsInfo["AWS_STORAGE_BUCKET"] }":`, e);
		return [];
	}
}

const deleteObjects = async (s3client, awsInfo, filenames = []) => {

  const deleteObjectsParams = {
	  Bucket: awsInfo["AWS_STORAGE_BUCKET"],
	  Delete: {
	  	Objects: filenames.map(fn => ({ Key: fn }))
	  }
	};

	try {
		const command = new DeleteObjectsCommand(deleteObjectsParams);
		await s3client.send(command);
		return true;
	}
	catch (e) {
		console.error(`There was an error deleting object "${ filename }":`, e);
		return false;
	}
}

module.exports = {
	getAwsInfo,
	getS3Client,
	putObject,
	getBucketContents,
	deleteObjects
}