import type { RequestHandler } from './$types';

/** For Kubernetes' probes. It doesn't touch the database, so a database outage doesn't restart the pod. */
export const GET: RequestHandler = () => new Response('ok');
