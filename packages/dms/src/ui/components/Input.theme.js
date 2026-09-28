export const inputTheme = {
  input: 'w-full font-sans text-sm text-[var(--t-ink)] bg-[var(--t-panel)] border border-[var(--t-rule-strong)] rounded-md px-3 py-2.5 placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] focus:outline-none focus:border-[var(--t-cobalt)] focus:ring-1 focus:ring-[var(--t-cobalt)] aria-invalid:border-[var(--t-brick)] disabled:opacity-50 transition-colors duration-150',
  inputContainer: 'flex-1 relative w-full',
  textarea: 'w-full font-sans text-sm text-[var(--t-ink)] bg-[var(--t-panel)] border border-[var(--t-rule-strong)] rounded-md px-3 py-2.5 placeholder:text-[var(--t-pencil)] hover:border-[var(--t-graphite)] focus:outline-none focus:border-[var(--t-cobalt)] focus:ring-1 focus:ring-[var(--t-cobalt)] resize-y min-h-[6rem] transition-colors duration-150',
  confirmButtonContainer: 'absolute right-0 top-0 bottom-0 hidden group-hover:flex items-center gap-1 pr-1',
  editButton: 'p-1 text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',
  cancelButton:'p-1 text-[var(--t-pencil)] hover:text-[var(--t-brick)] cursor-pointer',
  confirmButton:'p-1 text-[var(--t-go)] hover:text-[var(--t-ink)] cursor-pointer'

}

export const docs = {
  doc_name: 'example 1',
  type: 'text',
  placeholder: 'Please Enter value...'
}
