export const formsConfigFormat = {
    app: "default-app",
    type: "forms-config",
    attributes: [
        {
            key: 'name',
            label: 'Name',
            type: 'text'
        },
        {
            key: 'url',
            label: 'url',
            type: 'text'
        },
        {
            key: 'config',
            label: 'Config',
            prompt: 'Paste full config here.',
            type: 'textarea'
        },
    ]
}