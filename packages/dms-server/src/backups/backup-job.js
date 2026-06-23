const {
	getAwsInfo,
	getS3Client,
	putObject,
	getBucketContents,
	deleteObjects
} = require("./S3client-actions");

const putBackup = (s3client, awsInfo, pgDumpFile) => {

	const now = new Date();

	const year = now.getFullYear();
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const date = now.getDate().toString().padStart(2, "0");
	const hour = now.getHours().toString().padStart(2, "0");
	const minutes = now.getMinutes().toString().padStart(2, "0");
	const seconds = now.getSeconds().toString().padStart(2, "0");

	const filename = `backup_${ year }-${ month }-${ date }_${ hour }:${ minutes }:${ seconds }`;

	return putObject(s3client, awsInfo, pgDumpFile, filename);
}

const BackupRegex = /^backup_(\d{4})-(\d{2})-(\d{2})_(\d{2}):(\d{2}):(\d{2})$/;
const getBackupDate = fn => {
	const [, Y, M, D, h, m, s] = BackupRegex.exec(fn);
	return parseInt(`${ Y }${ M }${ D }${ h }${ m }${ s }`);
}
const backupSorter = (a, b) => {
	return getBackupDate(b) - getBackupDate(a);
}
const getBackups = async (s3client, awsInfo) => {
	const contents = await getBucketContents(s3client, awsInfo);
	return contents.filter(c => BackupRegex.test(c)).sort(backupSorter);
}

if (require.main === module) {
	(async () => {
		const pgDumpFile = process.argv.at(2);
		const awsInfoFile = process.argv.at(3);
		const numToKeep = +(process.argv.at(4) || "30");

		const awsInfo = await getAwsInfo(awsInfoFile);

		const s3client = await getS3Client(awsInfo);

		const filename = await putBackup(s3client, awsInfo, pgDumpFile);
	console.log("PG dump file uploaded to S3 storage as:", filename);

		const backups = await getBackups(s3client, awsInfo);

		if (backups.length > numToKeep) {
			await deleteObjects(s3client, awsInfo, backups.slice(numToKeep));
		}
	})();
}

module.exports = { BackupRegex, backupSorter }