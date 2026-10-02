import { loadEnv } from './env';

/**
 * Muss als ERSTER Import von server/index.ts stehen: Module wie projects.ts
 * oder die KI-Anbieter lesen Umgebungsvariablen schon beim Laden.
 */
export const envFiles = loadEnv();
