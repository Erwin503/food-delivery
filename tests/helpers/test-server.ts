import { Server } from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../../src/app';

export interface TestServerContext {
  server: Server;
  baseUrl: string;
}

export async function startTestServer(): Promise<TestServerContext> {
  const app = createApp();

  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address() as AddressInfo;

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

export async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
