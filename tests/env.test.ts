import { describe, expect, it } from 'vitest';
import { parseEnv } from '../server/env';

describe('.env-Parser', () => {
  it('versteht BOM, Anführungszeichen, export, Kommentare und Windows-Zeilenenden', () => {
    delete process.env.VF_TEST_A;
    delete process.env.VF_TEST_B;
    delete process.env.VF_TEST_C;
    parseEnv('﻿VF_TEST_A=abc123\r\n# Kommentar\r\nexport VF_TEST_B="mit leer zeichen"\r\nVF_TEST_C = xyz # Notiz\r\n');
    expect(process.env.VF_TEST_A).toBe('abc123');
    expect(process.env.VF_TEST_B).toBe('mit leer zeichen');
    expect(process.env.VF_TEST_C).toBe('xyz');
  });

  it('überschreibt keine bereits gesetzten Variablen', () => {
    process.env.VF_TEST_D = 'gesetzt';
    parseEnv('VF_TEST_D=neu');
    expect(process.env.VF_TEST_D).toBe('gesetzt');
  });
});
