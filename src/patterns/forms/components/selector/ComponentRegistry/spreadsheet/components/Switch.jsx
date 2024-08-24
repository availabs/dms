export default function RenderSwitch({ enabled, setEnabled, label, size='medium' }) {
    const sizeClassesPill = {
        small: 'h-4 w-9',
        medium: 'h-6 w-11'
    }

    const sizeClassesDot = {
        small: 'h-3 w-3',
        medium: 'h-4 w-4'
    }

    const translateClasses = {
        true: {
            small: 'translate-x-5',
            medium: 'translate-x-6'
        },
        false: {
            small: 'translate-x-1',
            medium: 'translate-x-1'
        },
    }
    return (
        <div
            role="switch"
            aria-checked={enabled}
            tabIndex={0}
            onClick={() => !enabled}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    return !enabled;
                }
            }}
            className={`relative inline-flex ${sizeClassesPill[size]} items-center rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
        >
            <span className="sr-only">{label}</span>
            <span
                className={`inline-block ${sizeClassesDot[size]} transform rounded-full bg-white transition-transform duration-200 ease-in-out ${translateClasses[enabled][size]}`}
            />
        </div>
    );
}
