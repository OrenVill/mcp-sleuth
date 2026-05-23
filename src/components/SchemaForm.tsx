import { useState } from 'react';
import type { JsonSchema, JsonSchemaProperty } from '../types';
import { MarkdownPreview } from './MarkdownPreview';

interface Props {
  schema: JsonSchema;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none transition-colors';

function fieldType(prop: JsonSchemaProperty): string {
  if (Array.isArray(prop.type)) {
    return prop.type.find((t) => t !== 'null') ?? 'string';
  }
  return prop.type ?? 'string';
}

interface JsonTextareaProps {
  value: unknown;
  placeholder: string;
  className: string;
  onChange: (value: unknown) => void;
}

function JsonTextarea({ value, placeholder, className, onChange }: JsonTextareaProps) {
  const [raw, setRaw] = useState(() =>
    value === undefined ? '' : JSON.stringify(value, null, 2)
  );

  const displayValue = raw;

  return (
    <textarea
      rows={4}
      value={displayValue}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        if (next === '') {
          onChange(undefined);
          return;
        }
        try {
          onChange(JSON.parse(next));
        } catch {
          /* invalid JSON in progress — keep raw text, don't push to parent */
        }
      }}
    />
  );
}

export function SchemaForm({ schema, values, onChange }: Props) {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const keys = Object.keys(properties);

  if (keys.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic">
        This tool takes no arguments.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {keys.map((key) => {
        const prop = properties[key]!;
        const t = fieldType(prop);
        const isRequired = required.has(key);
        const value = values[key];

        return (
          <div key={key}>
            <label className="flex items-baseline gap-2 mb-1.5">
              <span className="font-mono text-xs text-zinc-100">{key}</span>
              {isRequired && (
                <span className="text-[10px] uppercase tracking-wide text-rose-400/90 font-semibold">
                  required
                </span>
              )}
              <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-600">
                {t}
              </span>
            </label>
            {prop.description && (
              <div className="mb-1.5">
                <MarkdownPreview source={prop.description} className="md-preview-compact" />
              </div>
            )}
            {prop.enum ? (
              <select
                value={(value as string) ?? ''}
                onChange={(e) => onChange(key, e.target.value || undefined)}
                className={inputClass}
              >
                <option value="">— choose —</option>
                {(prop.enum as unknown[]).map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </option>
                ))}
              </select>
            ) : t === 'boolean' ? (
              <select
                value={value === undefined ? '' : value ? 'true' : 'false'}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange(key, v === '' ? undefined : v === 'true');
                }}
                className={inputClass}
              >
                <option value="">— unset —</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : t === 'number' || t === 'integer' ? (
              <input
                type="number"
                value={value === undefined || value === null ? '' : String(value)}
                step={t === 'integer' ? 1 : 'any'}
                min={prop.minimum}
                max={prop.maximum}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') return onChange(key, undefined);
                  const num = t === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
                  onChange(key, Number.isNaN(num) ? undefined : num);
                }}
                className={inputClass}
              />
            ) : t === 'object' || t === 'array' ? (
              <JsonTextarea
                value={value}
                placeholder={t === 'array' ? '[]' : '{}'}
                className={`${inputClass} font-mono`}
                onChange={(v) => onChange(key, v)}
              />
            ) : (
              <input
                type="text"
                value={(value as string) ?? ''}
                onChange={(e) =>
                  onChange(key, e.target.value === '' ? undefined : e.target.value)
                }
                className={inputClass}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
