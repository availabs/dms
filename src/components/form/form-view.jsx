import React, {useState} from 'react';
import {useTheme} from '../../theme';
import {TabPanel} from './TabPanel';
import ViewCard from "../card";

export default function FormEdit({item, updateAttribute, attributes, status, submit, format, ...props}) {

    const theme = useTheme();

    return (
        <div className={theme?.form?.sectionsWrapper}>
            {
                (format?.sections || [])
                    .map(section => (
                        <div className={theme?.form?.sections}>
                            <div className={theme?.form?.tab}>
                                <span className={ `${ section.icon } ${theme?.form?.icon}` }/>
                                <span className={`${theme?.form?.tabTitle}`}> {section.title} </span>
                                <span className={`${theme?.form?.tabSubtitle}`}> {section.subtitle} </span>
                            </div>
                            <ViewCard
                                preferredTheme={theme?.form}
                                key={section?.id}
                                item={item}
                                status={status}
                                attributes={attributes}
                                sectionId={section?.id}
                            />
                        </div>
                    ))
            }

        </div>
    )
}