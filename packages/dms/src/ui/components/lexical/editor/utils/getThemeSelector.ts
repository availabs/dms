import {type EditorThemeClasses} from 'lexical';

export function getThemeSelector(
  getTheme: () => EditorThemeClasses | null | undefined,
  name: keyof EditorThemeClasses,
): string {
  const className = getTheme()?.[name];
  if (typeof className !== 'string' || !className.trim()) {
    return '';
  }
  return className
    .split(/\s+/g)
    .filter((cls) => cls.length > 0)
    .map((cls) => `.${CSS.escape(cls)}`)
    .join('');
}