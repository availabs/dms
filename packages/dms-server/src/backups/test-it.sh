#!/bin/bash

node=$(command -v node)
avail_auth_connection_string="-d avail_auth -U postgres -h mercury.availabs.org -p 5435"
dms3_connection_string="-d dms3 -U postgres -h mercury.availabs.org -p 5435"
pg_dump_file="./test.dump"
aws_info_file="./aws_info.json"
num_to_keep=3

working_directory=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
cd $working_directory

./test-job.sh "$node" "$dms3_connection_string" "$pg_dump_file" "$aws_info_file" $num_to_keep  >> ./test-job.log 2>&1