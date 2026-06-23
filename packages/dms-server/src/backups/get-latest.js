const {
	getAwsInfo,
	getS3Client,
	getBucketContents,
	getObject
} = require("./S3client-actions.js");

const { BackupRegex, backupSorter } = require("./backup-job.js");

const getLatestBackup = async (s3Client, awsInfo) => {
	const contents = await getBucketContents(s3Client, awsInfo);
	return contents.filter(c => BackupRegex.test(c)).sort((a, b) => backupSorter(b, a)).pop();
}

(async () => {
	const awsInfoFile = process.argv.at(2);
	const filepath = process.argv.at(3);
	const awsInfo = await getAwsInfo(awsInfoFile);
	const s3client = await getS3Client(awsInfo);

console.log("got S3 client for:", awsInfo);

	const latest = await getLatestBackup(s3client, awsInfo);

	if (latest) {
		getObject(s3client, awsInfo, latest, filepath);
	}

})();