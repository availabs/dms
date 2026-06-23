#!/bin/bash

node=$(command -v node)
pg_dump_file=./backup.dump
aws_info_file=./aws_info.json.example
num_to_keep=30

working_directory=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
cd $working_directory

echo -e "\nStarting new backup job of [DATABASE NAME HERE]"
$node log-now.js "Generating PG dump file at:" >> ./backup.log 2>&1
[ENTER YOUR pg_dump COMMAND HERE] > $pg_dump_file

# backup-job.sh will upload pg_dump_file to S3 storage,
# keeping up to $num_to_keep copies and deleting the oldest
./backup-job.sh "$node" "$pg_dump_file" "$aws_info_file" $num_to_keep >> ./backup.log 2>&1
