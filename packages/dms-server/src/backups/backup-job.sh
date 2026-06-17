#!/bin/bash

node=$1
pg_connection_string=$2
pg_dump_file=$3
aws_info_file=$4
num_to_keep=$5

echo -e "\nStarting new backup job"
echo Using node located at: $node
$node log-now.js "Generating PG dump file at:"
pg_dump -F c $pg_connection_string -f "$pg_dump_file"
$node log-now.js "Uploading PG dump file to S3 at:"
$node backup-job.js "$pg_dump_file" "$aws_info_file" $num_to_keep
rm "$pg_dump_file"
$node log-now.js "Completed backup job at:"