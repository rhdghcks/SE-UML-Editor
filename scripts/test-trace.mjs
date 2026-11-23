#!/usr/bin/env node
// 테스트 실행 결과(JSON)와 기능명세서로 요구사항 추적표를 만든다.
//
// 입력: reports/vitest.json(단위·통합), reports/playwright.json(시스템·인수), docs/FEATURE_SPEC.md
// 출력: reports/test-trace.md, GITHUB_STEP_SUMMARY가 있으면 요약도 추가한다.
// 실패 조건(exit 1): SPEC 태그가 없는 테스트, 기능명세에 없는 SPEC 번호를 쓴 테스트
// 규칙: docs/TESTING.md 3.4
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const readJson = (path) => (existsSync(resolve(ROOT, path)) ? JSON.parse(read(path)) : null);

const LEVELS = ['단위', '통합', '시스템', '인수'];
const SPEC_RE = /SPEC-(\d+\.\d+)/g;
const TC_RE = /TC-[A-Z]+-\d+\.\d+-\d{2}/;

// ── 기능명세: 번호 → 기능명, SRS 요구사항 ──────────────────────────────
function loadSpec() {
  const text = read('docs/FEATURE_SPEC.md');
  const features = new Map();
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // | 영역 | 모듈 | 기능 | 세부기능 | ... → cells[3] = "1.1 Mermaid 코드 작성"
    const match = cells[3]?.match(/^(\d+\.\d+)\s+(.+)$/);
    if (match && !features.has(match[1])) features.set(match[1], { name: match[2], srs: [] });
  }
  // | FR-1 코드 기반 편집 | 1.1 | 또는 | NFR-1 반영 성능 (1초) | 1.1, 3.1 |
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (!/^(?:N?FR|EI)-\d/.test(cells[1] ?? '')) continue;
    const ids = cells[1].match(/(?:N?FR|EI)-\d+/g);
    for (const no of cells[2]?.match(/\d+\.\d+/g) ?? []) features.get(no)?.srs.push(...ids);
  }
  return features;
}

// ── 테스트 결과 수집 ────────────────────────────────────────────────
const STATUS = { passed: '통과', expected: '통과', flaky: '통과(재시도)', failed: '실패', unexpected: '실패' };
const toStatus = (raw) => STATUS[raw] ?? '건너뜀';

function collectVitest(report) {
  if (!report) return [];
  return report.testResults.flatMap((file) => {
    const path = relative(ROOT, file.name);
    const level = path.startsWith('tests/integration/') ? '통합' : '단위';
    return file.assertionResults.map((t) => ({
      level, file: path, title: [...t.ancestorTitles, t.title].join(' › '), status: toStatus(t.status),
    }));
  });
}

function collectPlaywright(report) {
  if (!report) return [];
  const tests = [];
  const walk = (suites, parents) => {
    for (const suite of suites) {
      const names = suite.file === suite.title ? parents : [...parents, suite.title];
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests) {
          const file = spec.file
            .replace(/^tests\/acceptance\/\.features-gen\//, '')
            .replace(/\.spec\.js$/, '');
          tests.push({
            level: t.projectName === 'acceptance' ? '인수' : '시스템',
            file: `${file}:${spec.line}`,
            title: [...names, spec.title].join(' › '),
            tags: spec.tags.join(' '),
            status: toStatus(t.status),
          });
        }
      }
      walk(suite.suites ?? [], names);
    }
  };
  walk(report.suites, []);
  return tests;
}

// ── 분석 ───────────────────────────────────────────────────────────
const features = loadSpec();
const vitest = readJson('reports/vitest.json');
const playwright = readJson('reports/playwright.json');
const tests = [...collectVitest(vitest), ...collectPlaywright(playwright)].map((t) => {
  const text = `${t.title} ${t.tags ?? ''}`;
  return { ...t, specs: [...new Set([...text.matchAll(SPEC_RE)].map((m) => m[1]))], tc: text.match(TC_RE)?.[0] ?? '' };
});
const untagged = tests.filter((t) => t.specs.length === 0);
const unknown = tests.filter((t) => t.specs.some((s) => !features.has(s)));

// ── 출력 ───────────────────────────────────────────────────────────
const esc = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
const row = (cells) => `| ${cells.map(esc).join(' | ')} |`;
const mark = (list) => {
  if (!list.length) return '';
  const failed = list.filter((t) => t.status === '실패').length;
  return failed ? `❌ ${list.length - failed}/${list.length}` : `${list.length}`;
};
const commit = process.env.GITHUB_SHA
  ?? (() => { try { return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { return '알 수 없음'; } })();

const summary = [];
summary.push('# 테스트 추적표', '');
summary.push(`> 자동 생성 파일이다. 직접 고치지 말고 \`npm run test:trace\`로 다시 만든다. 생성 시각 ${new Date().toISOString()}, 커밋 \`${commit.slice(0, 7)}\`.`, '');
const missing = [!vitest && '단위·통합(reports/vitest.json)', !playwright && '시스템·인수(reports/playwright.json)'].filter(Boolean);
if (missing.length) summary.push(`> ⚠️ 결과 파일이 없어 빠진 레벨: ${missing.join(', ')}`, '');

summary.push('## 레벨별 결과', '', row(['레벨', '전체', '통과', '실패', '건너뜀']), row(['---', '---:', '---:', '---:', '---:']));
for (const level of LEVELS) {
  const list = tests.filter((t) => t.level === level);
  const count = (s) => list.filter((t) => t.status.startsWith(s)).length;
  summary.push(row([level, list.length, count('통과'), count('실패'), count('건너뜀')]));
}

summary.push('', '## 요구사항별 테스트 수', '', '숫자는 해당 레벨의 테스트 수다. ❌는 실패가 있다는 뜻이고, 빈 칸은 그 레벨에 테스트가 없다는 뜻이다.', '');
summary.push(row(['기능명세', '기능', 'SRS', ...LEVELS, '상태']), row(['---', '---', '---', '---:', '---:', '---:', '---:', '---']));
for (const [no, f] of features) {
  const list = tests.filter((t) => t.specs.includes(no));
  const state = !list.length ? '⚠️ 테스트 없음'
    : list.some((t) => t.status === '실패') ? '❌ 실패 있음'
      : !list.some((t) => t.level === '인수') ? '인수 없음' : '✅';
  summary.push(row([no, f.name, f.srs.join(', '), ...LEVELS.map((l) => mark(list.filter((t) => t.level === l))), state]));
}

const problems = [];
if (untagged.length || unknown.length) {
  problems.push('', '## ❌ 태그 규칙 위반', '', 'docs/TESTING.md 3.4: 모든 테스트는 기능명세에 있는 SPEC 번호를 하나 이상 가져야 한다.', '');
  problems.push(row(['문제', '레벨', '테스트', '파일']), row(['---', '---', '---', '---']));
  for (const t of untagged) problems.push(row(['SPEC 태그 없음', t.level, t.title, t.file]));
  for (const t of unknown) problems.push(row([`없는 번호 ${t.specs.filter((s) => !features.has(s)).join(', ')}`, t.level, t.title, t.file]));
}

const details = ['', '## 테스트 목록', ''];
for (const [no, f] of features) {
  const list = tests.filter((t) => t.specs.includes(no));
  if (!list.length) continue;
  details.push(`<details><summary><b>${no} ${esc(f.name)}</b> — ${list.length}개</summary>`, '');
  details.push(row(['레벨', 'TC ID', '테스트', '결과', '파일']), row(['---', '---', '---', '---', '---']));
  for (const level of LEVELS) {
    for (const t of list.filter((x) => x.level === level)) details.push(row([t.level, t.tc, t.title, t.status, t.file]));
  }
  details.push('', '</details>', '');
}

mkdirSync(resolve(ROOT, 'reports'), { recursive: true });
writeFileSync(resolve(ROOT, 'reports/test-trace.md'), [...summary, ...problems, ...details].join('\n') + '\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [...summary, ...problems].join('\n') + '\n');

console.log(`추적표: reports/test-trace.md (테스트 ${tests.length}개, 요구사항 ${features.size}개)`);
if (problems.length) {
  console.error(`태그 규칙 위반: 태그 없음 ${untagged.length}개, 없는 번호 ${unknown.length}개. reports/test-trace.md 참고`);
  process.exit(1);
}
