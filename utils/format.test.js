/**
 * 股票代码格式转换单元测试
 */

const {
  detectFormat,
  apiToDb,
  dbToApi,
  normalizeToDb,
  normalizeToApi,
  normalizeArrayToDb,
  normalizeArrayToApi
} = require('../utils/format');

// 测试计数器
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

function describe(name, fn) {
  console.log(`\n📋 ${name}`);
  fn();
}

// ========== 测试用例 ==========

describe('detectFormat', () => {
  assert(detectFormat('300308.SZ') === 'api', '检测 API 格式 SZ');
  assert(detectFormat('600519.SH') === 'api', '检测 API 格式 SH');
  assert(detectFormat('430001.BJ') === 'api', '检测 API 格式 BJ');
  assert(detectFormat('sz.300308') === 'db', '检测 DB 格式 sz');
  assert(detectFormat('sh.600519') === 'db', '检测 DB 格式 sh');
  assert(detectFormat('bj.430001') === 'db', '检测 DB 格式 bj');
  assert(detectFormat('invalid') === 'unknown', '检测无效格式');
  assert(detectFormat('') === 'unknown', '检测空字符串');
  assert(detectFormat(null) === 'unknown', '检测 null');
  assert(detectFormat(undefined) === 'unknown', '检测 undefined');
  assert(detectFormat(123456) === 'unknown', '检测数字类型');
});

describe('apiToDb', () => {
  assert(apiToDb('300308.SZ') === 'sz.300308', '300308.SZ -> sz.300308');
  assert(apiToDb('600519.SH') === 'sh.600519', '600519.SH -> sh.600519');
  assert(apiToDb('430001.BJ') === 'bj.430001', '430001.BJ -> bj.430001');
  assert(apiToDb('sz.300308') === 'sz.300308', 'DB 格式保持不变');
  assert(apiToDb('invalid') === 'invalid', '无效格式保持不变');
  assert(apiToDb(null) === null, 'null 返回 null');
  assert(apiToDb('') === '', '空字符串返回空字符串');
});

describe('dbToApi', () => {
  assert(dbToApi('sz.300308') === '300308.SZ', 'sz.300308 -> 300308.SZ');
  assert(dbToApi('sh.600519') === '600519.SH', 'sh.600519 -> 600519.SH');
  assert(dbToApi('bj.430001') === '430001.BJ', 'bj.430001 -> 430001.BJ');
  assert(dbToApi('300308.SZ') === '300308.SZ', 'API 格式保持不变');
  assert(dbToApi('invalid') === 'invalid', '无效格式保持不变');
  assert(dbToApi(null) === null, 'null 返回 null');
  assert(dbToApi('') === '', '空字符串返回空字符串');
});

describe('normalizeToDb', () => {
  assert(normalizeToDb('300308.SZ') === 'sz.300308', 'API 格式转 DB 格式');
  assert(normalizeToDb('sz.300308') === 'sz.300308', 'DB 格式保持不变');
  assert(normalizeToDb('invalid') === 'invalid', '无效格式保持不变');
});

describe('normalizeToApi', () => {
  assert(normalizeToApi('sz.300308') === '300308.SZ', 'DB 格式转 API 格式');
  assert(normalizeToApi('300308.SZ') === '300308.SZ', 'API 格式保持不变');
  assert(normalizeToApi('invalid') === 'invalid', '无效格式保持不变');
});

describe('normalizeArrayToDb', () => {
  const result = normalizeArrayToDb(['300308.SZ', '600519.SH', 'sz.000001']);
  assert(result[0] === 'sz.300308', '数组第一项转换正确');
  assert(result[1] === 'sh.600519', '数组第二项转换正确');
  assert(result[2] === 'sz.000001', '数组第三项保持不变');
  assert(normalizeArrayToDb([]).length === 0, '空数组返回空数组');
  assert(normalizeArrayToDb(null).length === 0, 'null 返回空数组');
});

describe('normalizeArrayToApi', () => {
  const result = normalizeArrayToApi(['sz.300308', 'sh.600519', '000001.SZ']);
  assert(result[0] === '300308.SZ', '数组第一项转换正确');
  assert(result[1] === '600519.SH', '数组第二项转换正确');
  assert(result[2] === '000001.SZ', '数组第三项保持不变');
});

describe('双向转换一致性', () => {
  // API -> DB -> API 应该一致
  const apiCodes = ['300308.SZ', '600519.SH', '000001.SZ', '430001.BJ'];
  for (const code of apiCodes) {
    const dbCode = apiToDb(code);
    const backToApi = dbToApi(dbCode);
    assert(backToApi === code, `API->DB->API: ${code} -> ${dbCode} -> ${backToApi}`);
  }

  // DB -> API -> DB 应该一致
  const dbCodes = ['sz.300308', 'sh.600519', 'sz.000001', 'bj.430001'];
  for (const code of dbCodes) {
    const apiCode = dbToApi(code);
    const backToDb = apiToDb(apiCode);
    assert(backToDb === code, `DB->API->DB: ${code} -> ${apiCode} -> ${backToDb}`);
  }
});

// ========== 测试结果 ==========

console.log('\n' + '='.repeat(50));
console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);