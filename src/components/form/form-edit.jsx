import React, {useState} from 'react';
import { useTheme } from '../../theme';
import { TabPanel }  from './TabPanel';
import get from 'lodash/get';

const RenderCard = ({item, status, attributes, sectionId, updateAttribute, theme}) => {
	return (
		<div key={item.id} className={get(theme,'card.wrapper', '')}>
			{status ? <div>{JSON.stringify(status)}</div> : ''}

			{Object.keys(attributes)
				.filter(attrKey => !sectionId || attributes[attrKey].section === sectionId)
				.map((attrKey,i) => {
					let EditComp = attributes[attrKey].EditComp
					return(
						<div key={`${attrKey}-${i}`} className={get(theme,'card.row', '')}>

							<div className={get(theme,'card.rowHeader', '')}>
								<div className={get(theme,'card.rowLabel', '')}>{attributes[attrKey]?.label || attrKey}</div>
								{attributes[attrKey]?.prompt &&
									<i title={attributes[attrKey]?.prompt} className={get(theme, 'card.infoIcon', 'fad fa-info')} />
								}
							</div>

							<div className={get(theme,'card.rowContent', '')}>
								<EditComp
									key={`${attrKey}-${i}`}
									value={item[attrKey]}
									onChange={(v) => updateAttribute(attrKey, v)}
									{...attributes[attrKey]}
								/>
							</div>
						</div>
					)
				})
			}
			<button onClick={() => submit()}> Save </button>
		</div>
	)
}
export default function EditCard({item, updateAttribute, attributes, sections, status, submit, ...props}) {

	const [activeIndex, setActiveIndex] = useState(sections ? 0 : undefined) ;
	const theme = useTheme();

	return (
		<>
			<TabPanel
				tabs={sections}
				activeIndex={activeIndex}
				setActiveIndex={setActiveIndex}
				theme={theme.form}
				/>
			<RenderCard
				item={item}
				status={status}
				attributes={attributes}
				sectionId={sections?.[activeIndex]?.id}
				updateAttribute={updateAttribute}
				theme={theme}
			/>
		</>
	)
}