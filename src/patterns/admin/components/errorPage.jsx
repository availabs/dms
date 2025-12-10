import React from 'react';
import UI from "../../../ui";

const ErrorPage = (props) => {
    const {Layout} = UI;
    return (
      <Layout navItems={[]}>
          <div className={theme?.admin?.page?.pageWrapper}>
              <div className={theme?.admin?.page?.pageWrapper2}>
                  <div className={'mx-auto max-w-fit pt-[120px] text-lg'}>
                      Unable to complete your request at the moment. Please try again later.
                  </div>
              </div>
          </div>
      </Layout>
    )
}

export default ErrorPage
