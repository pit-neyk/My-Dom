import { describe, expect, test } from 'vitest';
import { fillTemplate } from '../../src/lib/template.js';

describe('fillTemplate', () => {
  test('replaces all placeholders with provided values', () => {
    const template = 'Hello {{name}}, your unit is {{unit}}. {{name}} is active.';
    const result = fillTemplate(template, { name: 'Alex', unit: 14 });

    expect(result).toBe('Hello Alex, your unit is 14. Alex is active.');
  });

  test('converts null and undefined values to empty strings', () => {
    const template = 'Owner: {{owner}}, Contact: {{contact}}';
    const result = fillTemplate(template, { owner: null, contact: undefined });

    expect(result).toBe('Owner: , Contact: ');
  });

  test('keeps unknown placeholders unchanged', () => {
    const template = 'Hello {{name}}, balance: {{balance}}';
    const result = fillTemplate(template, { name: 'Mira' });

    expect(result).toBe('Hello Mira, balance: {{balance}}');
  });
});
