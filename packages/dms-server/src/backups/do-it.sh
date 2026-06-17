#!/bin/bash

#node=/home/bainek/.nvm/versions/node/v22.16.0/bin/node
node=$(command -v node)
avail_auth_connection_string="-d avail_auth -U postgres -h mercury.availabs.org -p 5435"
dms3_connection_string="-d dms3 -U postgres -h mercury.availabs.org -p 5435"
pg_dump_file="./backup.dump"
aws_info_file="./aws_info.json"
num_to_keep=30

working_directory=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
cd $working_directory

./backup-job.sh "$node" "$dms3_connection_string" "$pg_dump_file" "$aws_info_file" $num_to_keep  >> ./backup-job.log 2>&1