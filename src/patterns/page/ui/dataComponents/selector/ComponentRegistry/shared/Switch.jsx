import React from 'react'

export default function RenderSwitch({ enabled=false, setEnabled, label, size='medium' }) {
    const sizeClassesPill = {
        xs: 'h-2 w-6',
        small: 'h-4 w-8',
        medium: 'h-6 w-11'
    }

    const sizeClassesDot = {
        xs: 'h-1.5 w-1.5 p-1',
        small: 'h-3.5 w-3.5 p-1',
        medium: 'h-4 w-4'
    }

    const translateClasses = {
        true: {
            xs: 'translate-x-3.5',
            small: 'translate-x-4',
            medium: 'translate-x-6'
        },
        false: {
            xs: 'translate-x-0.5',
            small: 'translate-x-0.5',
            medium: 'translate-x-1'
        },
    }

    const roundedClasses = {
        xs: 'rounded-lg',
        small: 'rounded-lg',
        medium: 'rounded-full'
    }

    return (
        <div
            role="switch"
            aria-checked={enabled}
            aria-label={label}
            tabIndex={0}
            onClick={() => setEnabled && setEnabled(!enabled)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEnabled && setEnabled(!enabled);
                }
            }}
            className={`relative inline-flex ${sizeClassesPill[size]} items-center ${roundedClasses[size]} cursor-pointer transition-colors duration-200 ease-in-out ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
        >
            <span className="sr-only">{label}</span>
            <span
                className={`inline-block ${sizeClassesDot[size]} transform rounded-full bg-white transition-transform duration-200 ease-in-out ${translateClasses[enabled][size]}`}
            />
        </div>
    );
}
