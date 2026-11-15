import {isIP} from 'node:net';
import {checkRateLimit} from '@vercel/firewall';
import contract from '../../siteforge/agent_contract.json' with {type: 'json'};

const properties = contract.schema.properties;
const stepProperties = properties.steps.items.properties;

function json(body, status = 200, headers = {}) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store', ...headers}});
}

function error(status, detail, headers) {
  return json({detail}, status, headers);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textWithin(value, limit) {
  return typeof value === 'string' && [...value].length <= limit;
}

function validStep(step) {
  const hours = stepProperties.hours;
  return isRecord(step) && Object.keys(step).length === 3
    && stepProperties.need.enum.includes(step.need)
    && typeof step.hours === 'number'
    && step.hours >= hours.minimum && step.hours <= hours.maximum
    && step.hours % hours.multipleOf === 0
    && textWithin(step.label, stepProperties.label.maxLength) && step.label.trim();
}

function interpret(raw, model) {
  if (!isRecord(raw) || Object.keys(raw).length !== 4
    || typeof raw.understood !== 'boolean' || !textWithin(raw.name, properties.name.maxLength)
    || !textWithin(raw.note, properties.note.maxLength) || !Array.isArray(raw.steps)
    || raw.steps.length > properties.steps.maxItems
    || !raw.steps.every(validStep)) {
    throw new Error('Invalid operation');
  }
  const validOperation = raw.understood ? raw.steps.length > 0 && raw.name.trim()
    : raw.steps.length === 0 && raw.name === '';
  if (!validOperation) throw new Error('Invalid operation');
  const operation = raw.understood ? {name: raw.name, steps: raw.steps} : null;
  return {understood: raw.understood, operation, note: raw.note, source: 'openai', model};
}

async function checkFirewall(request) {
  // Use the project hostname from Vercel, so a caller cannot change where the SDK sends the check.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const ip = request.headers.get('x-real-ip');
  if (process.env.VERCEL_ENV !== 'production' || process.env.NODE_ENV !== 'production'
    || !host || !ip || !isIP(ip)) {
    return {error: 'unavailable'};
  }
  const headers = new Headers({host, 'x-real-ip': ip, 'x-forwarded-for': ip});
  return checkRateLimit('siteforge-operation', {headers, timeout: 2000});
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return error(405, 'Use POST.', {Allow: 'POST'});
    const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (type !== 'application/json') return error(415, 'Send application/json.');
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return error(503, 'The language agent is not configured on this server.');

    let input;
    try {
      input = await request.json();
    } catch {
      return error(422, 'Send an operation description.');
    }
    if (!isRecord(input) || Object.keys(input).length !== 1
      || !textWithin(input.text, contract.requestMaxLength) || !input.text.trim()) {
      return error(422, 'Send an operation description of up to 500 characters.');
    }

    try {
      const limit = await checkFirewall(request);
      if (limit.rateLimited) return error(429, 'The language agent is temporarily rate limited.');
      if (limit.error || limit.rateLimited !== false) {
        return error(503, 'The language agent protection is unavailable.');
      }
    } catch {
      return error(503, 'The language agent protection is unavailable.');
    }

    const model = process.env.OPENAI_MODEL?.trim() || contract.model;
    const payload = {
      model,
      instructions: contract.instructions.join('\n'),
      input: input.text.trim(),
      max_output_tokens: contract.maxOutputTokens,
      store: false,
      text: {format: {type: 'json_schema', name: 'planned_operation', strict: true, schema: contract.schema}},
    };
    if (model === contract.model) payload.reasoning = {effort: 'none'};

    try {
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (upstream.status === 429) return error(429, 'The language agent is temporarily rate limited.');
      if (!upstream.ok) return error(502, 'Language agent request failed.');
      const result = await upstream.json();
      if (result.status !== 'completed') return error(502, 'The language agent response was incomplete.');
      const content = result.output.filter(item => item.type === 'message').flatMap(item => item.content);
      if (content.some(block => block.type === 'refusal')) return error(422, 'The language agent declined this request.');
      const texts = content.filter(block => block.type === 'output_text');
      if (texts.length !== 1 || typeof texts[0].text !== 'string') throw new Error('Expected one structured output');
      return json(interpret(JSON.parse(texts[0].text), model));
    } catch {
      return error(502, 'The language agent returned an invalid response or could not be reached.');
    }
  },
};
