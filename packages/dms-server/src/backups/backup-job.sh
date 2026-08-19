#!/bin/bash

node=$1
pg_dump_file=$2
aws_info_file=$3
num_to_keep=$4

echo Using node located at: $node
$node log-now.js "Uploading PG dump file to S3 at:"
if $node backup-job.js "$pg_dump_file" "$aws_info_file" $num_to_keep; then
	rm "$pg_dump_file"
	status=0
else
	echo "Backup job failed; preserving local dump file: $pg_dump_file"
	status=1
fi
$node log-now.js "Completed backup job at:"
exit $status
