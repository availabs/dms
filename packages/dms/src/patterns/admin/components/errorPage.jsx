import React from 'react';

import { ThemeContext } from '../../../ui/useTheme';
import { errorPageTheme } from './errorPage.theme'

const ErrorPage = (props) => {
    const {UI, theme} = React.useContext(ThemeContext)
    const {Layout} = UI;
    const t = { ...errorPageTheme, ...(theme?.admin?.errorPage || {}) }
    return (
      <Layout navItems={[]}>
          <div className={theme?.admin?.page?.pageWrapper}>
              <div className={theme?.admin?.page?.pageWrapper2}>
                  <div className={t.content}>
                      Unable to complete your request at the moment. Please try again later.
                  </div>
              </div>
          </div>
      </Layout>
    )
}

export default ErrorPage
