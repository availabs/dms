import { createCommand } from 'lexical';

// Command accepts an object with url and target
export const TOGGLE_LINK_COMMAND = createCommand<{ url: string | null; target?: string }>();
