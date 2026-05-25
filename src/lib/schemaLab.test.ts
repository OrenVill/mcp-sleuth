import { describe, expect, test } from 'vitest';
import {
  buildJsonRpcToolCall,
  generateExampleArgs,
  generateSchemaFormPreview,
  getSchemaLabRows,
  getSchemaLabSummary,
  validateToolSchema,
} from './schemaLab';
import type { ToolDef } from '../types';

const tool: ToolDef = {
  name: 'search_docs',
  description: 'Search project docs',
  inputSchema: {
    type: 'object',
    required: ['query', 'limit'],
    properties: {
      query: {
        type: 'string',
        description: 'Search text',
        default: 'release',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
      },
      mode: {
        type: 'string',
        enum: ['semantic', 'keyword'],
      },
      filters: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
        },
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
      includeArchived: {
        type: 'boolean',
      },
    },
  },
};

describe('schemaLab', () => {
  test('summarizes a tool input schema', () => {
    expect(getSchemaLabSummary(tool)).toEqual({
      rootType: 'object',
      propertyCount: 6,
      requiredCount: 2,
      optionalCount: 4,
      unsupportedRoot: false,
    });
  });

  test('returns parameter rows with required, enum, defaults, and constraints', () => {
    expect(getSchemaLabRows(tool)).toEqual([
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'Search text',
        defaultValue: 'release',
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
      {
        name: 'limit',
        type: 'integer',
        required: true,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: 1,
        maximum: 20,
      },
      {
        name: 'mode',
        type: 'string',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: ['semantic', 'keyword'],
        minimum: undefined,
        maximum: undefined,
      },
      {
        name: 'filters',
        type: 'object',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
      {
        name: 'tags',
        type: 'array',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
      {
        name: 'includeArchived',
        type: 'boolean',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
    ]);
  });

  test('generates deterministic example arguments from supported schema features', () => {
    expect(generateExampleArgs(tool)).toEqual({
      query: 'release',
      limit: 1,
      mode: 'semantic',
      filters: {
        owner: 'string',
      },
      tags: ['string'],
      includeArchived: false,
    });
  });

  test('builds a copyable JSON-RPC tools/call payload', () => {
    expect(buildJsonRpcToolCall(tool)).toEqual({
      method: 'tools/call',
      params: {
        name: 'search_docs',
        arguments: {
          query: 'release',
          limit: 1,
          mode: 'semantic',
          filters: {
            owner: 'string',
          },
          tags: ['string'],
          includeArchived: false,
        },
      },
    });
  });

  test('describes how SchemaForm will render each argument and warns about simplifications', () => {
    const previewTool: ToolDef = {
      name: 'preview_tool',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['semantic', 'keyword'] },
          filters: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
            },
          },
          tags: { type: 'array', items: { type: 'string' } },
          target: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
            ],
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['mode', 'target'],
      },
    };

    expect(generateSchemaFormPreview(previewTool)).toEqual({
      fields: [
        {
          name: 'mode',
          type: 'string',
          required: true,
          control: 'select',
          options: ['semantic', 'keyword'],
          placeholder: undefined,
        },
        {
          name: 'filters',
          type: 'object',
          required: false,
          control: 'json-textarea',
          options: undefined,
          placeholder: '{}',
        },
        {
          name: 'tags',
          type: 'array',
          required: false,
          control: 'json-textarea',
          options: undefined,
          placeholder: '[]',
        },
        {
          name: 'target',
          type: 'string',
          required: true,
          control: 'text',
          options: undefined,
          placeholder: undefined,
        },
        {
          name: 'createdAt',
          type: 'string',
          required: false,
          control: 'text',
          options: undefined,
          placeholder: undefined,
        },
      ],
      exampleArgs: {
        mode: 'semantic',
        filters: { owner: 'string' },
        tags: ['string'],
        target: 'string',
        createdAt: 'string',
      },
      warnings: [
        'Property "filters" is an object and will render as a JSON textarea instead of nested controls.',
        'Property "tags" is an array and will render as a JSON textarea.',
        'Property "target" uses oneOf, which SchemaForm ignores and renders from the base type.',
        'Property "createdAt" declares format "date-time", which SchemaForm does not enforce.',
      ],
    });
  });

  test('reports schema issues without requiring a full JSON Schema validator', () => {
    const badTool: ToolDef = {
      name: 'bad_tool',
      inputSchema: {
        type: 'string',
        required: ['missing'],
        properties: {
          count: { type: 'integerish' },
        },
      },
    };

    expect(validateToolSchema(badTool)).toEqual([
      {
        severity: 'warning',
        message: 'Root input schema type is "string"; MCP tool input schemas are expected to be object-shaped.',
      },
      {
        severity: 'error',
        message: 'Required field "missing" is not defined in properties.',
      },
      {
        severity: 'warning',
        message: 'Property "count" uses unsupported type "integerish"; SchemaForm will render it as text.',
      },
    ]);
  });

  test('treats a property with no type as a string like SchemaForm', () => {
    const noTypeTool: ToolDef = {
      name: 'no_type_tool',
      inputSchema: {
        type: 'object',
        properties: {
          query: {},
        },
      },
    };

    expect(getSchemaLabRows(noTypeTool)).toEqual([
      {
        name: 'query',
        type: 'string',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
    ]);
    expect(generateExampleArgs(noTypeTool)).toEqual({ query: 'string' });
    expect(validateToolSchema(noTypeTool)).toEqual([
      {
        severity: 'info',
        message: 'No obvious schema issues found for the subset supported by MCP Explorer.',
      },
    ]);
  });

  test('uses the first non-null type for nullable type arrays like SchemaForm', () => {
    const nullableTool: ToolDef = {
      name: 'nullable_tool',
      inputSchema: {
        type: 'object',
        properties: {
          count: {
            type: ['null', 'integer'],
            minimum: 1,
          },
        },
      },
    };

    expect(getSchemaLabRows(nullableTool)).toEqual([
      {
        name: 'count',
        type: 'integer',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: 1,
        maximum: undefined,
      },
    ]);
    expect(generateExampleArgs(nullableTool)).toEqual({ count: 1 });
    expect(validateToolSchema(nullableTool)).toEqual([
      {
        severity: 'info',
        message: 'No obvious schema issues found for the subset supported by MCP Explorer.',
      },
    ]);
  });

  test('returns an info issue when no obvious schema issues are found', () => {
    expect(validateToolSchema(tool)).toEqual([
      {
        severity: 'info',
        message: 'No obvious schema issues found for the subset supported by MCP Explorer.',
      },
    ]);
  });
});
