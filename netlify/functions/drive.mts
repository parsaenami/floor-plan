/** Netlify Function serving Google Drive sign-in at /api/drive/*. Set the variables in the site's environment settings. */
import { handleDriveAuth } from '../../server/driveAuth.ts'

export default async (req: Request): Promise<Response> =>
  (await handleDriveAuth(req, {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    SESSION_SECRET: process.env.SESSION_SECRET,
    PUBLIC_URL: process.env.PUBLIC_URL,
  })) ?? new Response('Not found', { status: 404 })

export const config = { path: '/api/drive/*' }
