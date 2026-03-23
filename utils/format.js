/**
 * 股票代码格式转换工具
 * 支持两种格式的双向转换:
 * - API 格式 (Tushare): 300308.SZ, 600519.SH
 * - DB 格式 (BaoStock): sz.300308, sh.600519
 */

/**
 * 检测股票代码格式
 * @param {string} tsCode 股票代码
 * @returns {'api' | 'db' | 'unknown'} 格式类型
 */
function detectFormat(tsCode) {
  if (!tsCode || typeof tsCode !== 'string') {
    return 'unknown';
  }

  // API 格式: 300308.SZ, 600519.SH
  if (/^\d{6}\.(SZ|SH|BJ)$/i.test(tsCode)) {
    return 'api';
  }

  // DB 格式: sz.300308, sh.600519, bj.430001
  if (/^(sz|sh|bj)\.\d{6}$/i.test(tsCode)) {
    return 'db';
  }

  return 'unknown';
}

/**
 * API 格式转 DB 格式
 * @param {string} apiCode API 格式股票代码 (如 300308.SZ)
 * @returns {string} DB 格式股票代码 (如 sz.300308)
 */
function apiToDb(apiCode) {
  if (!apiCode || typeof apiCode !== 'string') {
    return apiCode;
  }

  const format = detectFormat(apiCode);
  if (format === 'db') {
    return apiCode; // 已经是 DB 格式
  }
  if (format !== 'api') {
    return apiCode; // 未知格式，原样返回
  }

  const [code, market] = apiCode.split('.');
  return `${market.toLowerCase()}.${code}`;
}

/**
 * DB 格式转 API 格式
 * @param {string} dbCode DB 格式股票代码 (如 sz.300308)
 * @returns {string} API 格式股票代码 (如 300308.SZ)
 */
function dbToApi(dbCode) {
  if (!dbCode || typeof dbCode !== 'string') {
    return dbCode;
  }

  const format = detectFormat(dbCode);
  if (format === 'api') {
    return dbCode; // 已经是 API 格式
  }
  if (format !== 'db') {
    return dbCode; // 未知格式，原样返回
  }

  const [market, code] = dbCode.split('.');
  return `${code}.${market.toUpperCase()}`;
}

/**
 * 标准化股票代码为 DB 格式
 * 自动检测输入格式并转换为 DB 格式
 * @param {string} tsCode 任意格式的股票代码
 * @returns {string} DB 格式股票代码
 */
function normalizeToDb(tsCode) {
  const format = detectFormat(tsCode);
  if (format === 'db') {
    return tsCode;
  }
  if (format === 'api') {
    return apiToDb(tsCode);
  }
  return tsCode; // 未知格式，原样返回
}

/**
 * 标准化股票代码为 API 格式
 * 自动检测输入格式并转换为 API 格式
 * @param {string} tsCode 任意格式的股票代码
 * @returns {string} API 格式股票代码
 */
function normalizeToApi(tsCode) {
  const format = detectFormat(tsCode);
  if (format === 'api') {
    return tsCode;
  }
  if (format === 'db') {
    return dbToApi(tsCode);
  }
  return tsCode; // 未知格式，原样返回
}

/**
 * 批量标准化股票代码为 DB 格式
 * @param {string[]} codes 股票代码数组
 * @returns {string[]} DB 格式股票代码数组
 */
function normalizeArrayToDb(codes) {
  if (!Array.isArray(codes)) {
    return [];
  }
  return codes.map(normalizeToDb);
}

/**
 * 批量标准化股票代码为 API 格式
 * @param {string[]} codes 股票代码数组
 * @returns {string[]} API 格式股票代码数组
 */
function normalizeArrayToApi(codes) {
  if (!Array.isArray(codes)) {
    return [];
  }
  return codes.map(normalizeToApi);
}

module.exports = {
  detectFormat,
  apiToDb,
  dbToApi,
  normalizeToDb,
  normalizeToApi,
  normalizeArrayToDb,
  normalizeArrayToApi
};