import React, {useState} from 'react';
import {useTheme} from '../../theme';
import {TabPanel} from './TabPanel';
import EditCard from "../edit";

export default function FormEdit({item, updateAttribute, attributes, status, submit, format, ...props}) {

    const [activeIndex, setActiveIndex] = useState(format?.sections ? 0 : undefined);
    const theme = useTheme();

    return (
        <>
            <TabPanel
                tabs={format?.sections}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                theme={theme.form}
            />
            <EditCard
                item={item}
                status={status}
                attributes={attributes}
                sectionId={format?.sections?.[activeIndex]?.id}
                updateAttribute={updateAttribute}
                submit={submit}
				next={() => setActiveIndex(activeIndex + 1)} // continue
				nextDisabled={activeIndex === format?.sections?.length - 1}
				prev={() => setActiveIndex(activeIndex - 1)} // back
				prevDisabled={activeIndex === 0}
            />
        </>
    )
}