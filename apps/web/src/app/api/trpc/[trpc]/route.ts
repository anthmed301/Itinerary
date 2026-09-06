import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createContext } from '@/server/trpc/init'
import { appRouter } from '@/server/trpc/root'

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    // Without the headers the session cookie never reaches getSession and every
    // request looks anonymous.
    createContext: () => createContext({ headers: req.headers }),
  })
}

export { handler as GET, handler as POST }
