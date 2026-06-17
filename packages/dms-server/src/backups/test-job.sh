#!/bin/bash

node=$1
pg_connection_string=$2
test_file=$3
aws_info_file=$4
num_to_keep=$5

echo -e "\nStarting new test job"
echo Using node located at: $node
$node log-now.js "Generating test file at:"
# pg_dump -F c $pg_connection_string -f "$test_file"
cat /proc/cpuinfo > "$test_file"
$node log-now.js "Uploading test file to S3 at:"
$node backup-job.js "$test_file" "$aws_info_file" $num_to_keep
rm "$test_file"
$node log-now.js "Completed test job at:"