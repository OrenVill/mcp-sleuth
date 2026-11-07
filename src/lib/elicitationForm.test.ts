import { describe, expect, it } from 'vitest';
import { elicitationInitialValues, elicitationRequestedSchema } from './elicitationForm';

describe('elicitationForm', () => {
  it('extracts requestedSchema from elicitation params', () => {
    const schema = {
      type: 'object' as const,
      properties: { confirm: { type: 'boolean' as const } },
      required: ['confirm'],
    };
    expect(
      elicitationRequestedSchema({
        message: 'Proceed?',
        requestedSchema: schema,
      }),
    ).toEqual(schema);
  });

  it('returns null when schema is absent', () => {
    expect(elicitationRequestedSchema({ message: 'x' })).toBeNull();
  });

  it('builds initial values from defaults', () => {
    expect(
      elicitationInitialValues({
        type: 'object',
        properties: {
          confirm: { type: 'boolean', default: false },
          label: { type: 'string' },
        },
      }),
    ).toEqual({ confirm: false });
  });
});
