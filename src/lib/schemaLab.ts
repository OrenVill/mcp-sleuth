import type { JsonSchemaProperty, ToolDef } from '../types';

const SUPPORTED_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array']);
const NO_ISSUES_MESSAGE = 'No obvious schema issues found for the subset supported by MCP Explorer.';

export interface SchemaLabSummary {
  rootType: string;
  propertyCount: number;
  requiredCount: number;
  optionalCount: number;
  unsupportedRoot: boolean;
}

export interface SchemaLabRow {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  enumValues?: unknown[];
  minimum?: number;
  maximum?: number;
}

export interface SchemaLabIssue {
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export function getSchemaLabSummary(tool: ToolDef): SchemaLabSummary {
  const properties = tool.inputSchema.properties ?? {};
  const required = tool.inputSchema.required ?? [];
  const rootType = getRootSchemaType(tool.inputSchema);

  return {
    rootType,
    propertyCount: Object.keys(properties).length,
    requiredCount: required.length,
    optionalCount: Math.max(Object.keys(properties).length - required.length, 0),
    unsupportedRoot: rootType !== 'object',
  };
}

export function getSchemaLabRows(tool: ToolDef): SchemaLabRow[] {
  const required = new Set(tool.inputSchema.required ?? []);

  return Object.entries(tool.inputSchema.properties ?? {}).map(([name, property]) => ({
    name,
    type: getPropertySchemaType(property),
    required: required.has(name),
    description: property.description,
    defaultValue: property.default,
    enumValues: property.enum,
    minimum: property.minimum,
    maximum: property.maximum,
  }));
}

export function generateExampleArgs(tool: ToolDef): Record<string, unknown> {
  return generateObjectExample(tool.inputSchema.properties ?? {});
}

export function buildJsonRpcToolCall(tool: ToolDef): {
  method: 'tools/call';
  params: { name: string; arguments: Record<string, unknown> };
} {
  return {
    method: 'tools/call',
    params: {
      name: tool.name,
      arguments: generateExampleArgs(tool),
    },
  };
}

export function validateToolSchema(tool: ToolDef): SchemaLabIssue[] {
  const issues: SchemaLabIssue[] = [];
  const rootType = getRootSchemaType(tool.inputSchema);
  const properties = tool.inputSchema.properties ?? {};

  if (rootType !== 'object') {
    issues.push({
      severity: 'warning',
      message: `Root input schema type is "${rootType}"; MCP tool input schemas are expected to be object-shaped.`,
    });
  }

  for (const field of tool.inputSchema.required ?? []) {
    if (!(field in properties)) {
      issues.push({
        severity: 'error',
        message: `Required field "${field}" is not defined in properties.`,
      });
    }
  }

  for (const [name, property] of Object.entries(properties)) {
    const type = getPropertySchemaType(property);

    if (!SUPPORTED_TYPES.has(type)) {
      issues.push({
        severity: 'warning',
        message: `Property "${name}" uses unsupported type "${type}"; SchemaForm will render it as text.`,
      });
    }
  }

  if (issues.length === 0) {
    return [{ severity: 'info', message: NO_ISSUES_MESSAGE }];
  }

  return issues;
}

function generateObjectExample(properties: Record<string, JsonSchemaProperty>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).map(([name, property]) => [name, generatePropertyExample(property)]),
  );
}

function generatePropertyExample(property: JsonSchemaProperty): unknown {
  if (Object.prototype.hasOwnProperty.call(property, 'default')) {
    return property.default;
  }

  if (property.enum && property.enum.length > 0) {
    return property.enum[0];
  }

  switch (getPropertySchemaType(property)) {
    case 'number':
    case 'integer':
      return property.minimum ?? 0;
    case 'boolean':
      return false;
    case 'object':
      return generateObjectExample(property.properties ?? {});
    case 'array':
      return [property.items ? generatePropertyExample(property.items) : 'string'];
    case 'string':
    default:
      return 'string';
  }
}

function getRootSchemaType(schema: { type?: string | string[] }): string {
  return getSchemaType(schema, 'object');
}

function getPropertySchemaType(schema: { type?: string | string[] }): string {
  return getSchemaType(schema, 'string');
}

function getSchemaType(schema: { type?: string | string[] }, defaultType: string): string {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type) => type !== 'null') ?? defaultType;
  }

  return schema.type ?? defaultType;
}
