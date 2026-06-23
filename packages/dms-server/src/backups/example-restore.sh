#!/bin/bash

aws_info_file=./aws_info.json.example
pg_dump_file=./backup.dump

working_directory=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
cd $working_directory

# restore-latest.sh will download latest backup into the pg_dump_file
./restore-latest.sh "$aws_info_file" "$pg_dump_file"
[ENTER YOUR pg_restore COMMAND HERE] $pg_dump_file
rm $pg_dump_file