'use strict';

// Config handling (deep merge + token masking) and integration status stubs.
// No live API calls happen here — these are config-ready stubs.

const DEFAULT_CONFIG = {
  slack: { token: '', channel: '' },
  notion: { token: '', databaseId: '' },
  mcpServers: {},
  customAgents: []
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Deep-merge patch into target. Incoming string values containing the mask
// character "•" are ignored so a round-tripped masked config never
// overwrites a real secret.
function deepMerge(target, patch) {
  const out = isPlainObject(target) ? { ...target } : {};
  if (!isPlainObject(patch)) return out;
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'string' && value.includes('•')) continue;
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function maskToken(value) {
  if (!value) return '';
  const s = String(value);
  return '••••' + s.slice(-4);
}

// Return a copy of config with secret token values masked.
function maskConfig(config) {
  const c = JSON.parse(JSON.stringify(config || {}));
  if (isPlainObject(c.slack)) c.slack.token = maskToken(c.slack.token);
  if (isPlainObject(c.notion)) c.notion.token = maskToken(c.notion.token);
  return c;
}

function integrationsStatus(config) {
  const cfg = isPlainObject(config) ? config : {};
  const slack = isPlainObject(cfg.slack) ? cfg.slack : {};
  const notion = isPlainObject(cfg.notion) ? cfg.notion : {};
  const mcpServers = isPlainObject(cfg.mcpServers) ? cfg.mcpServers : {};

  const list = [];

  const slackConfigured = Boolean(slack.token && slack.channel);
  list.push({
    id: 'slack',
    configured: slackConfigured,
    note: slackConfigured
      ? 'Slack config ready (stub — no live API calls yet).'
      : slack.token
        ? 'Add a channel in Settings to finish Slack setup.'
        : 'Add bot token in Settings.'
  });

  const notionConfigured = Boolean(notion.token && notion.databaseId);
  list.push({
    id: 'notion',
    configured: notionConfigured,
    note: notionConfigured
      ? 'Notion config ready (stub — no live API calls yet).'
      : notion.token
        ? 'Add a database ID in Settings to finish Notion setup.'
        : 'Add integration token in Settings.'
  });

  for (const [name, srv] of Object.entries(mcpServers)) {
    const hasCommand = Boolean(isPlainObject(srv) && srv.command);
    list.push({
      id: 'mcp:' + name,
      configured: hasCommand,
      note: hasCommand
        ? 'MCP server configured (command: ' + srv.command + '). Stub — not launched by the OS.'
        : 'Add a command for this MCP server in Settings.'
    });
  }

  return list;
}

module.exports = { DEFAULT_CONFIG, deepMerge, maskConfig, integrationsStatus, isPlainObject };
