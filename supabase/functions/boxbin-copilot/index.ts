import { handler } from '../_shared/copilot-chat.ts';
export { handler };
Deno.serve(req => handler(req));
