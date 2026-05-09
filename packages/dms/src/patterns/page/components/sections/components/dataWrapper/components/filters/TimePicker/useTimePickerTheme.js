import { useContext } from 'react';
import { ThemeContext, getComponentTheme } from '../../../../../../../../../ui/useTheme';
import { timePickerTheme } from './timePicker.theme';

/**
 * Shared TimePicker theme lookup. Spreads the local default first so that
 * mounting the picker outside a context with the page-pattern theme (e.g.
 * a one-off settings dialog) still produces sensible classes.
 */
export const useTimePickerTheme = () => {
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    return { ...timePickerTheme, ...getComponentTheme(themeFromContext, 'timePicker') };
};
