export function extractUriTemplateVars(template: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of template.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function fillUriTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => values[name] ?? '');
}
