#!/bin/bash

aws_info_file=$1
pg_dump_file=$2

node=$(command -v node)

echo Using node located at: $node
$node get-latest.js "$aws_info_file" "$pg_dump_file"