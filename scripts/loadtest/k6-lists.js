// Full end-to-end load test of the standard list endpoints (run against STAGING).
// Requires an authenticated session cookie. Usage:
//   BASE=https://staging.example COOKIE="sb-...=..." k6 run k6-lists.js
// Tune VUs/duration via --vus / --duration. Validates p95 < 500ms on list/search.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE;
const COOKIE = __ENV.COOKIE;
export const options = {
  scenarios: {
    lists: { executor: 'ramping-vus', startVUs: 0,
      stages: [{ duration: '1m', target: 50 }, { duration: '3m', target: 50 }, { duration: '1m', target: 0 }] },
  },
  thresholds: { http_req_duration: ['p(95)<500'], http_req_failed: ['rate<0.01'] },
};
const paths = [
  '/customers', '/customers?page=2', '/customers?q=Customer+1', '/customers?segment=&page=5',
  '/products', '/products?q=Product', '/suppliers', '/inventory', '/sales/invoices', '/approvals',
];
export default function () {
  const p = paths[Math.floor(Math.random() * paths.length)];
  const res = http.get(`${BASE}${p}`, { headers: { Cookie: COOKIE } });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
