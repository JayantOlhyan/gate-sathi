import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { runSeed } from './seed';

async function main() {
  const dir = './.mongo-data';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log('Starting local embedded MongoDB on port 27017...');
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbPath: dir,
    },
  });

  console.log('MongoDB running at:', mongod.getUri());
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/gatesathi';

  try {
    console.log('Ensuring pilot school, users and students are seeded...');
    await runSeed();
    await mongoose.disconnect();
  } catch (err) {
    console.warn('Seed status:', err);
  }

  console.log('\n======================================================');
  console.log('GateSathi Local Server Starting on http://localhost:3000');
  console.log('======================================================');
  console.log('Login credentials:');
  console.log('  Guard:       9999999992 / Password@123');
  console.log('  Principal:   9999999991 / Password@123');
  console.log('  Super Admin: 9999999990 / Password@123');
  console.log('  OTP Test:    000000 (Mock Mode Active)');
  console.log('======================================================\n');

  const nextProcess = spawn('npx', ['next', 'dev', '-p', '3000'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/gatesathi',
    },
  });

  const cleanup = async () => {
    console.log('\nStopping servers...');
    nextProcess.kill('SIGINT');
    await mongod.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(err => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
