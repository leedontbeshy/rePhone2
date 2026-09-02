// This probe runs inside the internal-only Compose network. It intentionally
// prints only named PASS results and never response bodies or credentials.
const api = 'http://api:4000';
const web = 'http://web:3000';

await expectStatus('API live', `${api}/health/live`, 200);
await expectStatus('API ready', `${api}/health/ready`, 200);
await expectStatus('Public catalog', `${api}/api/v1/products?page=1&pageSize=1`, 200);
await expectStatus('Anonymous account denied', `${api}/api/v1/account`, 401);

await jsonRequest('Register customer', `${api}/api/v1/auth/register`, 201, {
  method: 'POST',
  body: {
    email: required('SMOKE_CUSTOMER_EMAIL'),
    password: required('SMOKE_CUSTOMER_PASSWORD'),
    fullName: 'Khách hàng Production Smoke',
    phone: '0910000000',
  },
});
const customerToken = await login(
  required('SMOKE_CUSTOMER_EMAIL'),
  required('SMOKE_CUSTOMER_PASSWORD'),
);
await expectStatus('Customer account', `${api}/api/v1/account`, 200, customerToken);
await expectStatus(
  'Customer backoffice denied',
  `${api}/api/v1/backoffice/overview`,
  403,
  customerToken,
);

const adminToken = await login(required('SMOKE_ADMIN_EMAIL'), required('SMOKE_ADMIN_PASSWORD'));
await expectStatus('Admin overview', `${api}/api/v1/backoffice/overview`, 200, adminToken);
await expectStatus(
  'Admin system health',
  `${api}/api/v1/backoffice/system/health`,
  200,
  adminToken,
);

await expectStatus('Web health', `${web}/api/health`, 204);
for (const route of ['/', '/login', '/account', '/backoffice']) {
  await expectStatus(`Web route ${route}`, `${web}${route}`, 200);
}

process.stdout.write('Production smoke probes passed.\n');

async function login(email, password) {
  const payload = await jsonRequest('Login', `${api}/api/v1/auth/login`, 200, {
    method: 'POST',
    body: { email, password },
  });
  const token = payload?.data?.accessToken;
  if (typeof token !== 'string' || token.length < 20) throw new Error('Login token is missing');
  return token;
}

async function expectStatus(name, url, expectedStatus, token) {
  const response = await fetchWithTimeout(url, {
    headers: token === undefined ? undefined : { authorization: `Bearer ${token}` },
    redirect: 'manual',
  });
  if (response.status !== expectedStatus) {
    throw new Error(
      `${name} returned ${String(response.status)}; expected ${String(expectedStatus)}`,
    );
  }
  process.stdout.write(`${name}: PASS\n`);
}

async function jsonRequest(name, url, expectedStatus, options) {
  const response = await fetchWithTimeout(url, {
    method: options.method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options.body),
    redirect: 'manual',
  });
  if (response.status !== expectedStatus) {
    throw new Error(
      `${name} returned ${String(response.status)}; expected ${String(expectedStatus)}`,
    );
  }
  const payload = await response.json();
  process.stdout.write(`${name}: PASS\n`);
  return payload;
}

function fetchWithTimeout(url, options) {
  return globalThis.fetch(url, {
    ...options,
    signal: globalThis.AbortSignal.timeout(10_000),
  });
}

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} is required`);
  return value;
}
