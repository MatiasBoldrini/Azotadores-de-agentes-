import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/agent/operation.mjs';

const projectHost = 'siteforge-eight-wine.vercel.app';
const upstreamUrl = 'https://api.openai.com/v1/responses';
const firewallUrl = `https://${projectHost}/.well-known/vercel/rate-limit-api/siteforge-operation`;
const valid = {
  understood: true, name: 'Charge and call', note: '',
  steps: [{need: 'sun', hours: 24, label: 'Charge'}, {need: 'earth', hours: 0.5, label: 'Call Earth'}],
};

function modelResponse(raw, status = 'completed') {
  const content = [{type: 'output_text', text: JSON.stringify(raw)}];
  return Response.json({status, output: [{type: 'message', content}]});
}

function post(text = 'cargar un día y llamar media hora a la Tierra') {
  return handler.fetch(new Request('https://other.example/api/agent/operation', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-real-ip': '192.0.2.17', host: 'other.example'},
    body: JSON.stringify({text}),
  }));
}

function environment(t, key = 'fake-api-key') {
  const values = {
    OPENAI_API_KEY: key, OPENAI_MODEL: '', NODE_ENV: 'production',
    VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: projectHost,
  };
  for (const [name, value] of Object.entries(values)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
}

test('Vercel agent stays offline without the key', async t => {
  environment(t, '');
  const fetch = t.mock.method(globalThis, 'fetch', () => assert.fail('No outbound request expected'));
  assert.equal((await post()).status, 503);
  assert.equal(fetch.mock.callCount(), 0);
});

test('Vercel checks the configured firewall before calling OpenAI', async t => {
  environment(t);
  t.mock.method(globalThis, 'fetch', (url, options) => {
    if (url === firewallUrl) {
      assert.match(options.headers.get('x-vercel-rate-limit-key'), /^192\.0\.2\.17-/);
      return new Response(null, {status: 204});
    }
    assert.equal(url, upstreamUrl);
    assert.equal(options.headers.Authorization, 'Bearer fake-api-key');
    const body = JSON.parse(options.body);
    assert.equal(body.input, 'cargar un día y llamar media hora a la Tierra');
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.max_output_tokens, 512);
    return modelResponse(valid);
  });
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {
    understood: true, operation: {name: valid.name, steps: valid.steps},
    note: '', source: 'openai', model: 'gpt-6-luna',
  });
});

test('Vercel fails closed for missing, denied or unreachable firewall rules', async t => {
  environment(t);
  for (const [status, expected] of [[404, 503], [503, 503], [429, 429], [403, 429]]) {
    const fetch = t.mock.method(globalThis, 'fetch', (url) => {
      assert.equal(url, firewallUrl);
      return new Response(null, {status});
    });
    assert.equal((await post()).status, expected);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test('Vercel rejects invalid requests before the firewall and rejects incompatible model durations', async t => {
  environment(t);
  const fetch = t.mock.method(globalThis, 'fetch', (url) => url === firewallUrl
    ? new Response(null, {status: 204})
    : modelResponse({...valid, steps: [{need: 'sun', hours: 0.75, label: 'Charge'}]}));
  for (const text of ['', ' ', 'a'.repeat(501)]) assert.equal((await post(text)).status, 422);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal((await post()).status, 502);
  assert.equal(fetch.mock.callCount(), 2);
});
