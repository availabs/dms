const {
	getAwsInfo,
	getS3Client,
	getBucketContents
} = require("./S3client-actions.js");

(async () => {
	const awsInfoFile = process.argv.at(2);
	const awsInfo = await getAwsInfo(awsInfoFile);
	const s3client = await getS3Client(awsInfo);

console.log("got S3 client for:", awsInfo);

	const contents = await getBucketContents(s3client, awsInfo);

	if (contents.length) {
console.log("Contents of bucket:", awsInfo["AWS_STORAGE_BUCKET"]);
console.log(JSON.stringify(contents, null, 2));
	}
	else {
console.log("Bucket", awsInfo["AWS_STORAGE_BUCKET"], "is empty")
	}

})();