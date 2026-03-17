import React from "react";

export default function Debug({ source }) {
    return <pre>{JSON.stringify(source, null, 3)}</pre>;
}
