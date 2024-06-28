import { Link } from "react-router-dom";
import React from 'react'
import { useTheme } from '../theme'
import get from 'lodash/get'

function replaceVars(url, data) {
    var regex = /:(\w+)/g;
    return url.replace(regex, function(match, p1) {
        return data[p1] || ':' + p1;
    });
}

const ColumnTypes = {
	'data': function DataColumn({data, column, className, key}) {
		return <td key={key} className={className}> { get(data, [column.path],'').toString() } </td> 
	},
	'date': function DataColumn({data, column, className, key}) {
		return <td key={key} className={className}> { new Date (data[column.path]).toLocaleString() } </td> 
	},
	'link': function DataColumn({data, column, className, key}) {
		return (
			<td key={key} className={className}>
				<Link to={replaceVars(column.to,data)} > 
					{replaceVars(column.text,data)}
				</Link>
			</td> 
		)
	}
}

function TableColumn ({data,column, className}) {
	let Column = get(ColumnTypes, [column.type], ColumnTypes['data'])
	return <Column data={data} column={column} className={className} />	
}

export default function Table({dataItems=[], attributes={}, options={}}) {
	const theme = useTheme()
	let { columns=[] } = options
	if(columns.length === 0 ) {
		return <div> No columns specified. </div>
	}
	return (
		<div className={''}> 
			<table className={`${theme?.table?.table}`}>
				<thead className={`${theme?.table?.thead}`}>
					<tr>
					{ columns.map((col,i) => <th key={i} className={`${theme?.table?.th}`}>{col.name}</th>) }
					</tr>
				</thead>
				<tbody className={`${theme?.table?.tbody}`}>
				{
					dataItems.map(d =>
						<tr key={d.id}>
						{
							columns.map((col,i) => 
								<TableColumn
									className={`${theme?.table?.td}`}
									key={`${col.name}-${i}`}
									data={d}
									column={col}
								/>)  	
						}
						</tr>
					)
				}	
				</tbody>
			</table>
		</div>
	)	
}