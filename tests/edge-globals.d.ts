declare const Deno: {
  upgradeWebSocket(request: Request, options?: { protocol: string }): { socket: WebSocket; response: Response };
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
declare module 'https://esm.sh/@supabase/supabase-js@2.109.0' {
  export const createClient: typeof import('@supabase/supabase-js').createClient;
}
