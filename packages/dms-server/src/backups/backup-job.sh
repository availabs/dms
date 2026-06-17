#!/bin/bash

node=$1
pg_dump_file=$2
aws_info_file=$3
num_to_keep=$4

echo Using node located at: $node
$node log-now.js "Uploading PG dump file to S3 at:"
$node backup-job.js "$pg_dump_file" "$aws_info_file" $num_to_keep
rm "$pg_dump_file"
$node log-now.js "Completed backup job at:"
