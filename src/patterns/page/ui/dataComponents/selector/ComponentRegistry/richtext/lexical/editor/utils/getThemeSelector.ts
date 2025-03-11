import {EditorThemeClasses} from 'lexical';
import invariant from './invariant';

export function getThemeSelector(
  getTheme: () => EditorThemeClasses | null | undefined,
  name: keyof EditorThemeClasses,
): string {
  const className = getTheme()?.[name];
  invariant(
    typeof className === 'string',
    'getThemeClass: required theme property %s not defined',
    String(name),
  );
  return className
    .split(/\s+/g)
    .map((cls) => `.${cls}`)
    .join();
}