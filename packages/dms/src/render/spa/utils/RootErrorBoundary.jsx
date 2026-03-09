import React from 'react'
import { useRouteError } from "react-router";

export default function RootErrorBoundary() {
    const error = useRouteError();
    console.error(error);

    return (
        <div>
            <h1>Oops! Something went wrong.</h1>
            <p>{ error.statusText }</p>
            <p>{ error.message }</p>
      </div>
    );
}
