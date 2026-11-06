export type DevToolsTab =
  | 'protocol'
  | 'reverse'
  | 'replay'
  | 'schema'
  | 'permission'
  | 'injection'
  | 'journal'
  | 'readiness'
  | 'contract';

/** Group id for floating Dev Tools shells opened from the Tools menu. */
export type DevToolsGroupId = 'traffic' | 'testing' | 'trust';

export const TAB_GROUP_META: Record<
  DevToolsGroupId,
  { heading: string; description: string; menuTestId: string; stackLabel: string }
> = {
  traffic: {
    heading: 'Traffic',
    description: 'Live protocol timeline and inbound server traffic.',
    menuTestId: 'open-dev-tools-traffic',
    stackLabel: 'Traffic',
  },
  testing: {
    heading: 'Testing',
    description: 'Replay calls, inspect schemas, and compare contract drift.',
    menuTestId: 'open-dev-tools-testing',
    stackLabel: 'Testing',
  },
  trust: {
    heading: 'Trust & risk',
    description: 'Static audits, injection scan, journal, and readiness score.',
    menuTestId: 'open-dev-tools-trust',
    stackLabel: 'Trust & risk',
  },
};

/** Full sidebar structure — panel `label` strings stay stable for Playwright. */
export const TAB_GROUPS: Array<{
  id: DevToolsGroupId;
  heading: string;
  description: string;
  items: Array<{ id: DevToolsTab; label: string }>;
}> = [
  {
    id: 'traffic',
    ...TAB_GROUP_META.traffic,
    items: [
      { id: 'protocol', label: 'Protocol Inspector' },
      { id: 'reverse', label: 'Server Requests' },
    ],
  },
  {
    id: 'testing',
    ...TAB_GROUP_META.testing,
    items: [
      { id: 'replay', label: 'Replay Suites' },
      { id: 'schema', label: 'Schema Lab' },
      { id: 'contract', label: 'Contract Drift' },
    ],
  },
  {
    id: 'trust',
    ...TAB_GROUP_META.trust,
    items: [
      { id: 'permission', label: 'Permission Surface' },
      { id: 'injection', label: 'Prompt Injection' },
      { id: 'journal', label: 'Observation Journal' },
      { id: 'readiness', label: 'Agent Readiness' },
    ],
  },
];

export function tabToDevToolsGroup(tab: DevToolsTab): DevToolsGroupId {
  for (const g of TAB_GROUPS) {
    if (g.items.some((i) => i.id === tab)) return g.id;
  }
  return 'traffic';
}
