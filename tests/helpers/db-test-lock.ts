import { Knex } from 'knex';
import { seed } from '../../seeds/01_demo_data';

let dbTestQueue = Promise.resolve();
let releaseCurrentDbTest: (() => void) | null = null;

export const lockAndSeedDb = async (knex: Knex): Promise<void> => {
  let releaseLock!: () => void;
  const previous = dbTestQueue;

  dbTestQueue = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  await previous;
  releaseCurrentDbTest = releaseLock;

  try {
    await seed(knex);
  } catch (error) {
    releaseDbTestLock();
    throw error;
  }
};

export const releaseDbTestLock = (): void => {
  const releaseLock = releaseCurrentDbTest;
  releaseCurrentDbTest = null;
  releaseLock?.();
};
