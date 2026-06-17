const {
	getAwsInfo,
	getS3Client,
	getBucketContents,
	deleteObjects
} = require("./S3client-actions.js");

const { BackupRegex } = require("./backup-job.js");

(async () => {
	const awsInfoFile = process.argv.at(2);
	const awsInfo = await getAwsInfo(awsInfoFile);
	const s3client = await getS3Client(awsInfo);

console.log("got S3 client for:", awsInfo);

	const contents = (await getBucketContents(s3client, awsInfo)).filter(c => !c.startsWith("backup_"));

	if (contents.length) {

console.log("Cleaning", contents, "from", awsInfo["AWS_STORAGE_BUCKET"]);

		await deleteObjects(s3client, awsInfo, contents);

		const contentsAfter = (await getBucketContents(s3client, awsInfo)).filter(c => !BackupRegex.test(c));

		if (contentsAfter.length === 0) {
console.log("Bucket", awsInfo["AWS_STORAGE_BUCKET"], "has been cleaned");
		}
		else {
console.log(`Failed to clean bucket", ${ awsInfo["AWS_STORAGE_BUCKET"] }`)
		}
	}
	else {
console.log("Bucket", awsInfo["AWS_STORAGE_BUCKET"], "is already clean");
	}
})();