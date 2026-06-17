#!/bin/bash

#node=/home/bainek/.nvm/versions/node/v22.16.0/bin/node
node=$(command -v node)
pg_dump_file=./backup.dump
aws_info_file=./aws_info.json.example
num_to_keep=30

working_directory=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
cd $working_directory

$node log-now.js "Generating PG dump file at:" >> ./backup.log 2>&1
[ENTER YOUR pg_dump COMMAND HERE] > $pg_dump_file

./backup-job.sh "$node" "$pg_dump_file" "$aws_info_file" $num_to_keep >> ./backup.log 2>&1
